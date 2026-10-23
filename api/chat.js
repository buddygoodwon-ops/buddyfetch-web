export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  // 2026-10-22 - Text Buddy feature on the Fetch Mode page.
  // Primary path: buddy-skill bridge /ask (public Cloudflare tunnel -> local
  // OpenClaw gateway, model openclaw/buddy). Accepts full message history so
  // the chat keeps context. Legacy direct-OpenClaw env path still honored
  // (OPENCLAW_BASE_URL + OPENCLAW_API_KEY) for local/dev use.
  const url = process.env.OPENCLAW_BASE_URL;
  const token = process.env.OPENCLAW_API_KEY;
  const model = process.env.OPENCLAW_MODEL || 'openclaw/buddyfetch';
  const modelOverride = req.query?.model || req.body?.model;
  const sessionKey = String(req.query?.sessionKey || 'buddyfetch-web').slice(0, 64);

  const rawMessage = String(req.body?.message || '').trim();
  const history = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const BRIDGE_URL = process.env.BUDDY_BRIDGE_URL || 'https://buddy-skill.buddyfetch.ai/ask';
  const BRIDGE_KEY = process.env.BUDDY_BRIDGE_KEY || 'buddy_f524007ee573d54b8db5ea10b9a7b006';

  if (!rawMessage && !history.length) {
    return res.status(200).json({ ok: true, reply: 'Type something and I will fetch it.' });
  }

  const messages = history.length
    ? history.slice(-14).map((m) => ({ role: ['system', 'assistant', 'user'].includes(m.role) ? m.role : 'user', content: String(m.content || '').slice(0, 4000) }))
    : [{ role: 'user', content: rawMessage }];

  try {
    // ---- Primary: buddy-skill bridge /ask (works from anywhere, real Buddy brain)
    const r = await fetch(`${BRIDGE_URL}?key=${encodeURIComponent(BRIDGE_KEY)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, user: `buddyfetch-web:${sessionKey}`, mode: 'sync', model }),
      signal: AbortSignal.timeout(55000),
    });
    if (r.ok) {
      const data = await r.json();
      const answer = data.answer || data.reply || '';
      if (data.ok && answer) return res.status(200).json({ ok: true, reply: answer });
      return res.status(200).json({ ok: true, reply: `My fetch line hiccuped (${data.error || 'no answer'}). Try again or hit voice mode.`, backendError: true });
    }
    if (!url || !token) {
      return res.status(200).json({ ok: true, reply: `My fetch line hit bridge HTTP ${r.status}. Try again shortly, or use Start Fetch Mode (voice).`, backendError: true });
    }
    // ---- Fallback: direct OpenClaw gateway (local dev only)
  } catch (error) {
    if (!url || !token) {
      return res.status(200).json({ ok: true, reply: `I hit a fetch snag: ${error.message}. Try again or use Start Fetch Mode (voice).`, backendError: true });
    }
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-openclaw-session-key': sessionKey,
        'x-openclaw-message-channel': 'buddyfetch-web',
        ...(modelOverride && { 'x-openclaw-model': modelOverride }),
      },
      body: JSON.stringify({ model: modelOverride || model, messages, stream: false }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(200).json({ ok: true, reply: `I heard you, but my fetch line hit OpenClaw API ${response.status}. Says: ${errorBody.slice(0, 220)}`, backendError: true });
    }

    const data = await response.json();
    const reply = data.reply || data.message || data.body || data.choices?.[0]?.message?.content || 'Fetched. What should I chase next?';
    res.status(200).json({ ok: true, reply, raw: data });
  } catch (error) {
    console.error('Error calling OpenClaw API:', error);
    res.status(200).json({ ok: true, reply: `I hit a fetch snag: ${error.message}. Backend needs service access.`, backendError: true });
  }
};

export const maxDuration = 60;
