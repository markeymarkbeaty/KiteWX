// Vercel serverless function: looks up an airport (name + coordinates) by ICAO code.
module.exports = async (req, res) => {
  try {
    const id = String((req.query && req.query.ids) || '').toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(id)) return res.status(400).json({ error: 'bad id' });
    const r = await fetch('https://aviationweather.gov/api/data/airport?ids=' + id + '&format=json', {
      headers: { 'User-Agent': 'ksan-kite-forecast' }
    });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(r.ok ? 200 : 502).send(body || '[]');
  } catch (e) {
    res.status(502).json({ error: 'upstream unavailable' });
  }
};
