async function liveavatar(pathname) {
  const key = process.env.LIVEAVATAR_API_KEY;
  if (!key) throw new Error('Missing LIVEAVATAR_API_KEY');
  const r = await fetch(`https://api.liveavatar.com${pathname}`, { headers: { 'X-API-KEY': key } });
  if (!r.ok) throw new Error(`LiveAvatar ${r.status}`);
  return r.json();
}
async function fetchAll(endpoint) {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    const data = await liveavatar(`${endpoint}?page=${page}&limit=100`);
    const results = data?.data?.results || [];
    all.push(...results);
    const total = data?.data?.total || all.length;
    if (all.length >= total || results.length === 0) break;
  }
  return all;
}
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method not allowed' });
  try {
    const [customAvatars, publicAvatars] = await Promise.all([
      fetchAll('/v1/avatars').then(a => a.map(x => ({ ...x, is_custom: true }))).catch(() => []),
      fetchAll('/v1/avatars/public').then(a => a.map(x => ({ ...x, is_custom: false, is_expired: false }))).catch(() => [])
    ]);
    return res.status(200).json({ customAvatars, publicAvatars });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, customAvatars: [], publicAvatars: [] });
  }
};
