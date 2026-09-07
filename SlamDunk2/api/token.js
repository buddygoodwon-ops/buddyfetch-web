// LiveKit Server SDK token generation endpoint
// Uses require('livekit-server-sdk') to generate JWT tokens for LiveKit connections

const { AccessToken } = require('livekit-server-sdk');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Allow': 'GET' });
    return res.end('Method Not Allowed');
  }

  const LIVEKIT_API_KEY = '***';
  const LIVEKIT_API_SECRET = 'kxhsBX83XZon3LPv2AJxEtOhJKxHfq05ewBZhqQOqJY';
  const IDENTITY = 'agent_f1c18ca648d1c23c';

  try {
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: IDENTITY,
      ttl: '2h'
    });
    
    token.addGrant({
      roomJoin: true,
      room: 'buddyfetch-room',
      canPublish: true,
      canSubscribe: true,
      agent: IDENTITY
    });
    
    const JWT = await token.toJwt();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: JWT,
      url: 'wss://buddyfetch-xrm1c4hk.livekit.cloud'
    }));
    
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Token generation failed', details: error.message }));
  }
};