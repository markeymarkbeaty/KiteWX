// Vercel serverless function: swell/wave forecast from Open-Meteo Marine for a few spots.
// Usage: /api/marine?lat=32.7,32.8&lon=-117.2,-117.3
async function grab(url, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'ksan-kite-forecast' } }); }
  finally { clearTimeout(t); }
}
module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const lats = String(q.lat || '').split(',').map(Number), lons = String(q.lon || '').split(',').map(Number);
    if (!lats.length || lats.length > 6 || lats.length !== lons.length ||
        lats.some(v => !isFinite(v) || Math.abs(v) > 90) || lons.some(v => !isFinite(v) || Math.abs(v) > 180)) {
      return res.status(400).json({ error: 'bad coordinates' });
    }
    const tz = /^[A-Za-z_]+\/[A-Za-z_\/]+$/.test(String(q.tz || '')) ? q.tz : 'America/Los_Angeles';
    const url = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + lats.map(v => v.toFixed(4)).join(',') +
      '&longitude=' + lons.map(v => v.toFixed(4)).join(',') +
      '&hourly=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction' +
      '&length_unit=imperial&forecast_days=7&timezone=' + encodeURIComponent(tz);
    let r = null;
    for (let i = 0; i < 2 && !(r && r.ok); i++) { try { r = await grab(url, 4500); } catch (e) { r = null; } }
    if (!r) return res.status(502).json({ error: 'upstream unavailable' });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', r.ok ? 's-maxage=3600, stale-while-revalidate=21600' : 'no-store');
    res.status(r.ok ? 200 : 502).send(body || '{}');
  } catch (e) { res.status(502).json({ error: 'upstream unavailable' }); }
};
