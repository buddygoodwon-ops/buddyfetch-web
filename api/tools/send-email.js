// /api/tools/send-email — VAPI custom-tool webhook.
// VAPI POSTs { to_email, subject, message, from_name?, from_phone? } during Kate's calls.
// Sends via Microsoft Graph (Clawdbot-Graph app, client_credentials) FROM buddy@birdrockfunding.com.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'send-email', alive: true });

  const { to_email, subject, message, from_name, from_phone } = req.body || {};
  if (!to_email || !message) {
    return res.status(400).json({ results: [{ toolCallId: (req.body && req.body.toolCallId) || 'unknown', result: 'ERROR: to_email and message are required' }] });
  }

  const tenant = process.env.GRAPH_TENANT_ID || 'ff512847-76c2-4475-aefe-6acbb481489b';
  const clientId = process.env.GRAPH_CLIENT_ID || '3381d5c0-a71d-40c3-9c9c-0a238dd8fafe';
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!clientSecret) {
    return res.status(500).json({ results: [{ toolCallId: (req.body && req.body.toolCallId) || 'unknown', result: 'ERROR: email service not configured' }] });
  }

  try {
    const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('no token: ' + JSON.stringify(tokenData).slice(0, 200));

    const sender = process.env.GRAPH_SENDER || 'buddy@birdrockfunding.com';
    const subj = subject || 'Follow-up from Kate Trulove - BBR Realty';
    const prefix = from_name || from_phone ? `Follow-up for ${from_name || ''}${from_phone ? ' (' + from_phone + ')' : ''}:\n\n` : '';
    const emailBody = { message: { subject: subj, body: { contentType: 'Text', content: prefix + message }, toRecipients: [{ emailAddress: { address: to_email } }] }, saveToSentItems: true };
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tokenData.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    });
    if (!sendRes.ok) throw new Error('Graph send failed ' + sendRes.status + ': ' + (await sendRes.text()).slice(0, 200));

    const toolCallId = (req.body && req.body.toolCallId) || (req.body && req.body.tool_call_id) || 'unknown';
    return res.status(200).json({ results: [{ toolCallId, result: 'SUCCESS: email sent to ' + to_email }] });
  } catch (e) {
    const toolCallId = (req.body && req.body.toolCallId) || 'unknown';
    return res.status(200).json({ results: [{ toolCallId, result: 'ERROR: ' + (e.message || String(e)).slice(0, 300) }] });
  }
}
