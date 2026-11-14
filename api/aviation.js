// Vercel serverless function: fetches an airport TAF from aviationweather.gov
// so the page can load it from its own address (no browser CORS problems).
module.exports = async (req, res) => {
  try {
    const id = String((req.query && req.query.ids) || 'KSAN').toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    const r = await fetch('https://aviationweather.gov/api/data/taf?ids=' + id + '&format=json', {
      headers: { 'User-Agent': 'ksan-kite-forecast' }
    });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(r.ok ? 200 : 502).send(body || '[]');
  } catch (e) {
    res.status(502).json({ error: 'upstream unavailable' });
  }
};
