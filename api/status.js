module.exports = async (req, res) => {
  res.status(200).json({
    ok: true,
    app: 'BuddyFetch / Talking Dog App MVP',
    elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && (process.env.ELEVENLABS_VOICE_ID || process.env.BUDDY_ELEVENLABS_VOICE_ID)),
    liveavatar: 'available-if-credits',
    fallback: 'browser-speech-and-old-dog-shell',
    facts: [
      'This is the Talking Dog App, not Chatwoot.',
      'Tonight priority: working BuddyFetch on Vercel.',
      'LiveAvatar is blocked if HeyGen/LiveAvatar credits are empty; fallback app still works.'
    ]
  });
};
