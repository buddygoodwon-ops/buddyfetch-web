// /api/tools/send-email — VAPI custom-tool webhook.
// Accepts VAPI schema { to, subject, body } or { to_email, subject, message }.
// Sends via Microsoft Graph (Clawdbot-Graph app, client_credentials) FROM buddy@birdrockfunding.com.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'send-email', alive: true });

  const b = req.body || {};
  const toEmail = b.to_email || b.to || '';
  const msg = b.message || b.body || '';
  const subject = b.subject || 'Follow-up from Kate Trulove - BBR Realty';
  const toolCallId = b.toolCallId || b.tool_call_id || 'unknown';

  if (!toEmail || !msg) {
    return res.status(400).json({ results: [{ toolCallId, result: 'ERROR: recipient (to) and message (body) are required' }] });
  }

  const tenant = process.env.GRAPH_TENANT_ID || 'ff512847-76c2-4475-aefe-6acbb481489b';
  const clientId = process.env.GRAPH_CLIENT_ID || '3381d5c0-a71d-40c3-9c9c-0a238dd8fafe';
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;

  if (!clientSecret) {
    return res.status(500).json({ results: [{ toolCallId, result: 'ERROR: email service not configured' }] });
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
    const emailBody = {
      message: {
        subject: subject,
        body: { contentType: 'Text', content: msg },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
      saveToSentItems: true,
    };
    const sendRes = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tokenData.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailBody),
    });
    if (!sendRes.ok) throw new Error('Graph send failed ' + sendRes.status + ': ' + (await sendRes.text()).slice(0, 200));
    return res.status(200).json({ results: [{ toolCallId, result: 'SUCCESS: email sent to ' + toEmail }] });
  } catch (e) {
    return res.status(200).json({ results: [{ toolCallId, result: 'ERROR: ' + (e.message || String(e)).slice(0, 300) }] });
  }
}
