// The liveavatar token generation endpoint is essential for connecting the frontend
// to the LiveAvatar service, allowing for real-time avatar rendering and interaction.
// It handles avatar selection, voice configuration, and session management.

// Configuration for the LiveAvatar API endpoint and authentication.
const LIVEAVATAR_API_URL = process.env.LIVEAVATAR_API_URL || 'https://api.liveavatar.com';
const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;

// Helper function to make authenticated requests to the LiveAvatar API.
async function liveavatarApi(pathname, options = {}) {
  if (!LIVEAVATAR_API_KEY) {
    throw new Error('LIVEAVATAR_API_KEY not configured.');
  }

  const response = await fetch(`${LIVEAVATAR_API_URL}${pathname}`, {
    ...options,
    headers: {
      'X-API-KEY': LIVEAVATAR_API_KEY,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    // If JSON parsing fails, return the raw text.
    data = text;
  }

  if (!response.ok) {
    const errorMsg = data?.data?.[0]?.message || data?.message || JSON.stringify(data);
    const error = new Error(`LiveAvatar API error: ${response.status} - ${errorMsg}`);
    error.status = response.status;
    throw error;
  }

  return data;
}

// Map user-friendly names to LiveAvatar's internal avatar IDs.
// This helps in providing a simpler interface for selecting avatars.
const AVATAR_NAME_TO_ID_MAP = {
  'Elenora Fitness Coach': '7299c55d-1f45-482d-915c-e5efdc9dd266',
  'Business Coach': '9b1cc5d6-2391-45c3-8d09-d3a60e6ec352',
  'Friendly Presenter': '8868c66c-88f1-4584-a64c-a07269407440',
  'Old Dog Buddy': '4613e4ea-f25f-4531-8eac-746a32246014', // BuddyFetch's dog avatar
};

// Default avatar ID to use if none is specified or found.
const DEFAULT_AVATAR_ID = AVATAR_NAME_TO_ID_MAP['Old Dog Buddy'];

// List all available avatars from the LiveAvatar API.
async function listAvailableAvatars() {
  try {
    const response = await liveavatarApi('/v1/avatars');
    return response?.data?.avatars || [];
  } catch (e) {
    console.error('Failed to fetch available avatars:', e);
    return []; // Return empty array on error
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  const body = req.body || {};
  let avatarId = body.avatarId;
  let avatar_persona = { language: 'en' };

  // Resolve avatar ID from friendly name if provided.
  if (body.avatarName) {
    avatarId = AVATAR_NAME_TO_ID_MAP[body.avatarName] || avatarId;
    // If friendly name isn't in map, use it as a persona name if no ID is found.
    if (!avatarId) {
        avatar_persona.name = body.avatarName;
    }
  }
  
  // Default to Buddy's dog avatar if no specific ID or name is resolved.
  if (!avatarId && !body.avatarName) {
      avatarId = DEFAULT_AVATAR_ID;
  }

  // Set voice properties if provided.
  if (body.voiceId) avatar_persona.voice_id = body.voiceId;
  if (body.voiceName) avatar_persona.voice_name = body.voiceName;

  try {
    // Request a session token from LiveAvatar API.
    const data = await liveavatarApi('/v1/sessions/token', {
      method: 'POST',
      body: JSON.stringify({
        mode: process.env.LIVEAVATAR_MODE || 'LITE', // Use LITE mode by default.
        avatar_id: avatarId,
        avatar_persona,
        is_sandbox: false,
      }),
    });
    
    return res.status(200).json({
        session_token: data?.data?.session_token,
        session_id: data?.data?.session_id,
        avatarId: avatarId,
        voiceId: avatar_persona.voice_id || null,
        voiceName: avatar_persona.voice_name || null,
        mode: process.env.LIVEAVATAR_MODE || 'LITE',
    });
  } catch (e) {
    console.error('Error getting LiveAvatar token:', e);
    return res.status(e.status || 500).json({
        ok: false,
        error: e.message,
        avatarId: avatarId,
        voiceId: avatar_persona.voice_id || null,
        voiceName: avatar_persona.voice_name || null,
        mode: process.env.LIVEAVATAR_MODE || 'LITE',
    });
  }
};