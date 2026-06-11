module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });

  const url = process.env.OPENCLAW_BASE_URL;
  const token = process.env.OPENCLAW_API_KEY;
  const model = process.env.OPENCLAW_MODEL || 'openclaw/buddy';
  const modelOverride = req.query?.model || req.body?.model;
  const sessionKey = req.query?.sessionKey || 'buddyfetch-web';

  const rawMessage = String(req.body?.message || '').trim();
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const messages = Array.isArray(req.body?.messages) && req.body.messages.length
    ? req.body.messages
    : [
        { role: 'system', content: 'You are BuddyFetch, a funny old-dog AI helper. Be concise, useful, and action-first.' },
        { role: 'user', content: `${rawMessage || 'Attachment uploaded.'}${attachments.length ? `\n\nAttachments: ${attachments.map(a => `${a.name || 'file'} (${a.type || a.kind || 'upload'})`).join(', ')}` : ''}` }
      ];

  if (!url || !token) {
    const fallback = rawMessage
      ? `I fetched your message: "${rawMessage}". Backend keys are not configured yet, but the site buttons and upload flow are working.`
      : `Upload received. Backend keys are not configured yet, but the site buttons and upload flow are working.`;
    return res.status(200).json({ ok: true, reply: fallback, fallback: true });
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
      body: JSON.stringify({
        model: modelOverride || model,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(200).json({ ok: true, reply: `I heard you, but my fetch line hit OpenClaw API ${response.status}. Buttons are working; backend says: ${errorBody.slice(0, 220)}`, backendError: true });
    }

    const data = await response.json();
    const reply = data.reply || data.message || data.body || data.choices?.[0]?.message?.content || 'Fetched. What should I chase next?';
    res.status(200).json({ ok: true, reply, raw: data });
  } catch (error) {
    console.error('Error calling OpenClaw API:', error);
    res.status(200).json({ ok: true, reply: `I hit a fetch snag: ${error.message}. Buttons are working; backend needs service access.`, backendError: true });
  }
};
