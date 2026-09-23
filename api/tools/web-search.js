// /api/tools/web-search — VAPI custom-tool webhook (Glenn 9/22: "Get Web Search working with VAPI agents")
// Accepts { query } → DuckDuckGo HTML search (NO API key needed) → top results {title, url, snippet}
// Auth: ?key=<WEBSEARCH_TOOL_SECRET> (Vercel env). Env: WEBSEARCH_TOOL_SECRET.
const DDG_ENDPOINTS = [
  (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && !req.query.query) {
    return res.status(200).json({ ok: true, service: 'web-search', alive: true });
  }

  const key = req.query.key || '';
  if (!process.env.WEBSEARCH_TOOL_SECRET || key !== process.env.WEBSEARCH_TOOL_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const b = req.body || {};
  const query = (req.query.query || b.query || '').trim();
  const toolCallId = b.toolCallId || 'unknown';

  if (!query || query.length < 2) {
    return res.status(400).json({ results: [{ toolCallId, result: 'ERROR: a search query is required' }] });
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

  try {
    let results = [];
    let lastErr = '';
    for (const makeUrl of DDG_ENDPOINTS) {
      try {
        const r = await fetch(makeUrl(query), {
          headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
          signal: AbortSignal.timeout(15000),
        });
        if (!r.ok) { lastErr = `ddg ${r.status}`; continue; }
        const html = await r.text();
        results = parseDdg(html);
        if (results.length > 0) break;
      } catch (e) {
        lastErr = String(e && e.message ? e.message : e);
      }
    }

    if (!results.length) {
      return res.status(200).json({
        results: [{ toolCallId, result: `Web search returned no results (${lastErr || 'parsed 0'}). Try rephrasing the query.` }],
      });
    }

    return res.status(200).json({
      ok: true,
      query,
      count: results.length,
      results,
      // flat text block the voice agent can speak from
      summary: results.map((r2, i) => `${i + 1}. ${r2.title} — ${r2.snippet} (${r2.url})`).join('\n'),
    });
  } catch (e) {
    return res.status(200).json({ results: [{ toolCallId, result: `ERROR: web search failed: ${e && e.message ? e.message : String(e)}` }] });
  }
}

// Parse DuckDuckGo HTML results (html.duckduckgo.com + lite fallback)
function parseDdg(html) {
  const out = [];
  // html.duckduckgo.com: <a rel="nofollow" class="result__a" href="...">Title</a>
  // hrefs are direct or //duckduckgo.com/l/?uddg=<encoded>
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&"]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!url.startsWith('http')) continue;
    const title = stripTags(m[2]).slice(0, 200);
    // snippet: following result__snippet block
    const tail = html.slice(re.lastIndex, re.lastIndex + 1200);
    const sm = tail.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = sm ? stripTags(sm[1]).slice(0, 300) : '';
    out.push({ title, url, snippet });
  }
  // lite fallback: rows with result-link
  if (!out.length) {
    const re2 = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m2;
    while ((m2 = re2.exec(html)) && out.length < 8) {
      let url = m2[1];
      const uddg = url.match(/uddg=([^&"]+)/);
      if (uddg) url = decodeURIComponent(uddg[1]);
      if (!url.startsWith('http')) continue;
      out.push({ title: stripTags(m2[2]).slice(0, 200), url, snippet: '' });
    }
  }
  return out;
}

function stripTags(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}