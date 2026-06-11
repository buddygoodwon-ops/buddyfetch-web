module.exports = {
  fetch: async (req, res) => {
    const url = process.env.OPENCLAW_BASE_URL;
    const token = process.env.OPENCLAW_API_KEY;
    const model = process.env.OPENCLAW_MODEL || 'openclaw/buddy';
    const modelOverride = req.query.model || req.body.model;
    const sessionKey = req.query.sessionKey || 'buddyfetch-web';

    if (!url) return res.status(503).json({ ok: false, error: 'OPENCLAW_BASE_URL not configured' });
    if (!token) return res.status(503).json({ ok: false, error: 'OPENCLAW_API_KEY not configured' });

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
          messages: req.body.messages,
          stream: req.body.stream || false,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return res.status(response.status).json({ ok: false, error: `OpenClaw API error: ${response.status} - ${errorBody}`, status: response.status });
      }

      if (req.body.stream) {
        res.setHeader('content-type', 'text/event-stream');
        res.setHeader('cache-control', 'no-cache');
        res.setHeader('connection', 'keep-alive');
        response.body.pipe(res);
      } else {
        const data = await response.json();
        res.status(200).json(data);
      }
    } catch (error) {
      console.error('Error calling OpenClaw API:', error);
      res.status(500).json({ ok: false, error: `Failed to fetch from OpenClaw API: ${error.message}` });
    }
  },
};