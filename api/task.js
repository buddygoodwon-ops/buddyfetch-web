module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  const task = String(req.body?.task || '').trim();
  res.status(200).json({ ok: true, status: 'queued-vercel-placeholder', task, message: 'Task captured in the Vercel MVP. OpenClaw execution bridge is next.' });
};
