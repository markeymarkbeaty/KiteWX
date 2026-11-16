// Vercel serverless function: NOAA tide predictions (CO-OPS).
// Usage: /api/tides?station=9410230&begin=20261116&end=20261122&interval=hilo   (interval: hilo or h)
async function grab(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'ksan-kite-forecast' } }); }
  finally { clearTimeout(t); }
}
module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const station = String(q.station || ''), begin = String(q.begin || ''), end = String(q.end || '');
    const interval = q.interval === 'h' ? 'h' : 'hilo';
    if (!/^\d{7}$/.test(station) || !/^\d{8}$/.test(begin) || !/^\d{8}$/.test(end)) {
      return res.status(400).json({ error: 'bad request' });
    }
    const url = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=ksan_kite_forecast' +
      '&begin_date=' + begin + '&end_date=' + end + '&datum=MLLW&station=' + station +
      '&time_zone=lst_ldt&interval=' + interval + '&units=english&format=json';
    let r = null;
    for (let i = 0; i < 2 && !(r && r.ok); i++) { try { r = await grab(url, 5000); } catch (e) { r = null; } }
    if (!r) return res.status(502).json({ error: 'upstream unavailable' });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', r.ok ? 's-maxage=21600, stale-while-revalidate=86400' : 'no-store');
    res.status(r.ok ? 200 : 502).send(body || '{}');
  } catch (e) { res.status(502).json({ error: 'upstream unavailable' }); }
};
