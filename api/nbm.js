// Vercel serverless function: reads the NOAA National Blend of Models (NBM) "NBS" station bulletin
// (3-hourly, out to 72 hours) for one airport. This is the same kind of data usairnet shows.
// Returns JSON in friendly units: deg F, knots, degrees, percent, feet, miles.
const HDR = /^\W*([A-Z0-9]{3,5})\s+NBM\s+V\S+\s+NB[A-Z]\s+GUIDANCE\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2})(\d{2})\s+UTC/i;

async function grab(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'ksan-kite-forecast' } }); }
  catch (e) { clearTimeout(t); return null; }
  // note: timer is left to expire with the stream; cleared by cancel/finish below
}

function rowValues(line) {
  const start = line[0] === ' ' ? 5 : 4;
  const data = line.slice(start).replace(/\r/g, '');
  const out = [], end = data.replace(/\s+$/, '').length;
  for (let i = 0; i < end; i += 3) {
    const s = data.slice(i, i + 3).trim();
    if (s === '') { out.push(null); continue; }
    const n = parseInt(s, 10);
    out.push(Number.isFinite(n) ? n : null);
  }
  return out;
}

function parseBlock(lines) {
  const h = HDR.exec(lines[0]);
  if (!h) return null;
  const cycle = Date.UTC(+h[4], +h[2] - 1, +h[3], +h[5], +h[6]);
  const rows = {};
  for (const ln of lines.slice(1)) {
    if (!ln.trim()) continue;
    const label = (ln[0] === ' ' ? ln.slice(1, 5) : ln.slice(0, 4)).trim();
    if (!/^[A-Z][A-Z0-9\/]{1,3}$/.test(label)) continue;
    if (rows[label]) continue; // first occurrence only
    rows[label] = rowValues(ln);
  }
  if (!rows.FHR || !rows.TMP) return null;
  const miss = v => (v == null || v === 999 || v === -99 || v === 998) ? null : v;
  const times = rows.FHR.map(f => (f == null ? null : cycle + f * 3600e3));
  const n = times.length;
  const pick = (k, f) => Array.from({ length: n }, (_, i) => { const v = rows[k] ? miss(rows[k][i]) : null; return v == null ? null : f(v); });
  const hundreds = v => (v === -88 || v === 888) ? -1 : v * 100; // -1 = unlimited
  return {
    issued: new Date(cycle).toISOString(),
    times,
    tmp: pick('TMP', v => v),
    dpt: pick('DPT', v => v),
    sky: pick('SKY', v => v),
    wdr: pick('WDR', v => (v === 0 ? 0 : v * 10)),
    wsp: pick('WSP', v => v),
    gst: pick('GST', v => v),
    cig: pick('CIG', hundreds),
    lcb: pick('LCB', hundreds),
    vis: pick('VIS', v => (v >= 100 ? 10 : Math.round(v) / 10))
  };
}

async function findBlock(url, id) {
  const r = await grab(url, 25000);
  if (!r || !r.ok || !r.body) return { status: r ? r.status : 0, lines: null };
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', collecting = false, out = [];
  for (;;) {
    const { done, value } = await reader.read();
    buf += done ? dec.decode() : dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = done ? '' : lines.pop();
    for (let ln of lines) {
      ln = ln.replace(/\r$/, '');
      const m = HDR.exec(ln);
      if (m) {
        if (collecting) { try { await reader.cancel(); } catch (e) {} return { status: 200, lines: out }; }
        if (m[1].toUpperCase() === id) { collecting = true; out.push(ln); }
        continue;
      }
      if (collecting) out.push(ln);
    }
    if (done) break;
  }
  return { status: 200, lines: collecting ? out : null };
}

async function handler(req, res) {
  try {
    const id = String((req.query && req.query.ids) || '').toUpperCase();
    if (req.query && req.query.debug) {
      const t = new Date(Date.now() - 3 * 3600e3);
      const ymd = t.toISOString().slice(0, 10).replace(/-/g, ''), hh = String(t.getUTCHours()).padStart(2, '0');
      const out = {};
      for (const base of ['https://noaa-nbm-grib2-pds.s3.amazonaws.com/', 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/']) {
        const u = base + `blend.${ymd}/${hh}/text/blend_nbstx.t${hh}z`;
        try {
          const r = await grab(u, 20000);
          if (!r || !r.ok) { out[u] = 'HTTP ' + (r ? r.status : 'none'); continue; }
          const rd = r.body.getReader(), dec = new TextDecoder();
          let buf = '', n = 0;
          while (n < 400000) { const { done, value } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); n = buf.length; }
          try { await rd.cancel(); } catch (e) {}
          const L = buf.split('\n');
          out[u] = { head: L.slice(0, 12), withId: L.filter(x => x.includes(id)).slice(0, 5), headers: L.filter(x => /GUIDANCE/.test(x)).slice(0, 6) };
        } catch (e) { out[u] = 'error ' + e.message; }
      }
      return res.status(200).json(out);
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    const now = Date.now();
    let sawFile = false;
    for (let k = 1; k <= 7; k++) {
      const t = new Date(now - k * 3600e3);
      const ymd = t.toISOString().slice(0, 10).replace(/-/g, ''), hh = String(t.getUTCHours()).padStart(2, '0');
      const path = `blend.${ymd}/${hh}/text/blend_nbstx.t${hh}z`;
      for (const base of ['https://noaa-nbm-grib2-pds.s3.amazonaws.com/', 'https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/']) {
        const { status, lines } = await findBlock(base + path, id);
        if (status !== 200) continue;
        sawFile = true;
        if (!lines) return res.status(404).json({ error: 'station not in NBM' });
        const data = parseBlock(lines);
        if (!data) return res.status(502).json({ error: 'unrecognized bulletin format' });
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
        return res.status(200).json(Object.assign({ station: id }, data));
      }
    }
    res.status(502).json({ error: sawFile ? 'no usable bulletin' : 'NBM files unavailable' });
  } catch (e) {
    res.status(502).json({ error: 'upstream unavailable' });
  }
}
module.exports = handler;
module.exports.parseBlock = parseBlock;
