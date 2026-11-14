// Vercel serverless function: fetches the KSAN TAF from aviationweather.gov
// so the page can load it from its own address (no browser CORS problems).
module.exports = async (req, res) => {
  try {
    const r = await fetch('https://aviationweather.gov/api/data/taf?ids=KSAN&format=json', {
      headers: { 'User-Agent': 'ksan-kite-forecast' }
    });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(r.ok ? 200 : 502).send(body);
  } catch (e) {
    res.status(502).json({ error: 'upstream unavailable' });
  }
};
