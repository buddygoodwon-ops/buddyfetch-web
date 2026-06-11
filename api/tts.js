module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method not allowed' });
  const text = String(req.body?.text || '').slice(0, 1200);
  const key = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || process.env.BUDDY_ELEVENLABS_VOICE_ID;
  if (!key || !voiceId) {
    return res.status(501).json({ ok: false, fallback: 'browser-speech', error: 'Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID/BUDDY_ELEVENLABS_VOICE_ID' });
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true }
      })
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
    const arrayBuffer = await r.arrayBuffer();
    res.setHeader('content-type', 'audio/mpeg');
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    res.status(502).json({ ok: false, fallback: 'browser-speech', error: e.message });
  }
};

