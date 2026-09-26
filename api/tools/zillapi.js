// /api/tools/zillapi — VAPI custom-tool webhook (Glenn 9/22: "get this API working with ZillAPI").
// Accepts { address } (full street incl. city/state/ZIP) or { url } (Zillow listing URL).
// Calls https://api.zillapi.com directly with the native zk_ key (NO Zapier middleman).
// Env (Vercel production): ZILLAPI_API_KEY (native zk_ key), ZILLAPI_TOOL_SECRET (shared secret for ?key=).
const ZILLAPI_BASE = 'https://api.zillapi.com';

// Compact projection so the voice agent isn't drowned in 300 fields
const FIELDS = [
  'zpid', 'address', 'price', 'zestimate', 'rentZestimate',
  'bedrooms', 'bathrooms', 'livingArea', 'lotSize', 'yearBuilt', 'homeType',
  'lastSoldPrice', 'taxAssessedValue', 'county',
].join(',');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && !req.query.address && !req.query.url) {
    return res.status(200).json({ ok: true, service: 'zillapi', alive: true });
  }

  const key = req.query.key || '';
  if (!process.env.ZILLAPI_TOOL_SECRET || key !== process.env.ZILLAPI_TOOL_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (!process.env.ZILLAPI_API_KEY) {
    return res.status(500).json({ error: 'zillapi key not configured' });
  }

  const b = req.body || {};
  const address = req.query.address || b.address || '';
  const zillowUrl = req.query.url || b.url || '';
  const status = req.query.status || b.status;
  const toolCallId = b.toolCallId || 'unknown';

  try {
    let target;
    if (zillowUrl) {
      const q = new URLSearchParams({ url: zillowUrl, fields: FIELDS });
      if (status) q.set('status', status);
      target = `https://api.zillapi.com/v1/properties/by-url?${q}`;
    } else if (address && String(address).length >= 6) {
      const q = new URLSearchParams({ address: String(address), fields: FIELDS });
      if (status) q.set('status', status);
      target = `https://api.zillapi.com/v1/properties/by-address?${q}`;
    } else {
      return res.status(400).json({ results: [{ toolCallId, result: 'ERROR: full property address (street, city, state, ZIP) or Zillow URL is required' }] });
    }

    const r = await fetch(target, {
      headers: { Authorization: `Bearer ${process.env.ZILLAPI_API_KEY}` },
      signal: AbortSignal.timeout(25000),
    });
    const raw = await r.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}

    if (!r.ok || !data || data.error) {
      const msg = `Zillapi lookup failed (${r.status}): ${JSON.stringify((data && data.error) || String(raw).slice(0, 200))}`;
      return res.status(200).json({ results: [{ toolCallId, result: msg }] });
    }

    const d = (data.data && !Array.isArray(data.data)) ? data.data : (data.data || data);
    const spoken = {
      address: d.address ? `${d.address.streetAddress}, ${d.address.city}, ${d.address.state} ${d.address.zipcode}` : address,
      price: d.price ?? null,
      zestimate: d.zestimate ?? null,
      rentZestimate: d.rentZestimate ?? null,
      beds: d.bedrooms, baths: d.bathrooms, sqft: d.livingArea,
      lotSize: d.lotSize, yearBuilt: d.yearBuilt, homeType: d.homeType,
      lastSoldPrice: d.lastSoldPrice, taxAssessedValue: d.taxAssessedValue,
      zpid: d.zpid, county: d.county,
    };
    return res.status(200).json({ ok: true, property: spoken, raw: d });
  } catch (e) {
    return res.status(200).json({ results: [{ toolCallId, result: `ERROR: zillapi fetch failed: ${e && e.message ? e.message : String(e)}` }] });
  }
}