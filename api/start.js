// Vercel serverless: mint LiveKit token + create room with the avatar agent attached.
// Replaces the local token server hop so the public page never needs localhost access.
import crypto from 'crypto';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

function hs256Jwt(payload, secret) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const LIVEKIT_URL = process.env.LIVEKIT_URL;
    const KEY = process.env.LIVEKIT_API_KEY;
    const SECRET = process.env.LIVEKIT_API_SECRET;
    const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'ilendgirl-agent';
    if (!LIVEKIT_URL || !KEY || !SECRET) {
      res.status(500).json({ error: 'LiveKit env not configured on server' });
      return;
    }

    const u = new URL(req.url, 'http://x');
    const room = u.searchParams.get('room') || ('kate-' + Date.now().toString(36));
    const participant = (u.searchParams.get('participant') || 'visitor').slice(0, 64);

    // Admin token for RoomService
    const now = Math.floor(Date.now() / 1000);
    const adminJwt = hs256Jwt({
      iss: KEY, sub: 'api', jti: 'api', nbf: now - 10, exp: now + 600,
      video: { roomCreate: true, roomAdmin: true, roomList: true, room: room, agent: true },
    }, SECRET);

    // Create the room with the agent attached
    const roomService = LIVEKIT_URL.replace('wss://', 'https://').replace('ws://', 'http://').replace(/\/$/, '');
    try {
      const cr = await fetch(`${roomService}/twirp/livekit.RoomService/CreateRoom`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: room }),
        signal: AbortSignal.timeout(10000),
      });
      if (!cr.ok) {
        const t = await cr.text();
        res.status(500).json({ error: 'CreateRoom failed', detail: t.slice(0, 300) });
        return;
      }
    } catch (e) {
      res.status(500).json({ error: 'CreateRoom error', detail: String(e).slice(0, 300) });
      return;
    }

    // Explicit agent dispatch (CreateRoom-embedded agents no longer triggers jobs)
    try {
      const ad = await fetch(`${roomService}/twirp/livekit.AgentDispatchService/CreateDispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ room, agent_name: AGENT_NAME }),
        signal: AbortSignal.timeout(10000),
      });
      if (!ad.ok) {
        const t = await ad.text();
        res.status(500).json({ error: 'AgentDispatch failed', detail: t.slice(0, 300) });
        return;
      }
    } catch (e) {
      res.status(500).json({ error: 'AgentDispatch error', detail: String(e).slice(0, 300) });
      return;
    }

    // Participant token
    const token = hs256Jwt({
      iss: KEY, sub: participant, jti: participant, nbf: now - 10, exp: now + 21600,
      name: participant,
      video: { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true },
    }, SECRET);

    res.status(200).json({ token, url: LIVEKIT_URL, room, agent: AGENT_NAME });
  } catch (e) {
    res.status(500).json({ error: String(e).slice(0, 400) });
  }
}