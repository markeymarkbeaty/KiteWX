// Vercel serverless function: fetches model cloud/visibility data from Open-Meteo
// so the page can load it from its own address (avoids browser blocking/CORS issues).
module.exports = async (req, res) => {
  try {
    const lat = parseFloat(req.query && req.query.lat), lon = parseFloat(req.query && req.query.lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return res.status(400).json({ error: 'bad coordinates' });
    }
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat.toFixed(4) + '&longitude=' + lon.toFixed(4) +
      '&hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,temperature_2m,dew_point_2m' +
      '&temperature_unit=fahrenheit&forecast_days=5&timezone=GMT';
    const r = await fetch(url, { headers: { 'User-Agent': 'ksan-kite-forecast' } });
    const body = await r.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
    res.status(r.ok ? 200 : 502).send(body || '{}');
  } catch (e) {
    res.status(502).json({ error: 'upstream unavailable' });
  }
};
