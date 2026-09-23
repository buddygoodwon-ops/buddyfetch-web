// /api/tools/web-search — VAPI custom-tool webhook (Glenn 9/22: "Get Web Search working with VAPI agents")
// Accepts { query } → multi-engine fallback (DDG html → DDG lite → Bing → Google News RSS), NO API keys.
// Auth: ?key=<WEBSEARCH_TOOL_SECRET> (Vercel env). Env: WEBSEARCH_TOOL_SECRET.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

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

  const debug = [];
  try {
    // Engine 1+2: DuckDuckGo (POST form bypasses datacenter-IP 403 on GET)
    for (const [label, url] of [
      ['ddg-html', 'https://html.duckduckgo.com/html/'],
      ['ddg-lite', 'https://lite.duckduckgo.com/lite/'],
    ]) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Accept-Language': 'en-US,en;q=0.9',
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: 'https://duckduckgo.com/',
          },
          body: 'q=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(15000),
        });
        const html = await r.text();
        const results = label === 'ddg-html' ? parseDdgHtml(html) : parseDdgLite(html);
        debug.push(label + ':' + r.status + '/' + results.length);
        if (results.length >= 3) return send(res, query, results, toolCallId, debug);
      } catch (e) {
        debug.push(label + ':ERR ' + String(e && e.message ? e.message : e).slice(0, 60));
      }
    }

    // Engine 3: Bing scrape
    try {
      const r = await fetch('https://www.bing.com/search?q=' + encodeURIComponent(query) + '&count=10&setlang=en', {
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(15000),
      });
      const html = await r.text();
      const results = parseBing(html);
      debug.push('bing:' + r.status + '/' + results.length);
      if (results.length >= 1) return send(res, query, results, toolCallId, debug);
    } catch (e) {
      debug.push('bing:ERR ' + String(e && e.message ? e.message : e).slice(0, 60));
    }

    // Engine 4: Google News RSS (great for current events / rates / news)
    try {
      const r = await fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en', {
        headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000),
      });
      const xml = await r.text();
      const results = parseRss(xml);
      debug.push('gnrss:' + r.status + '/' + results.length);
      if (results.length >= 1) return send(res, query, results, toolCallId, debug);
    } catch (e) {
      debug.push('gnrss:ERR ' + String(e && e.message ? e.message : e).slice(0, 60));
    }

    return res.status(200).json({
      results: [{ toolCallId, result: `Web search found nothing for "${query}" (engines: ${debug.join(', ')}). Try rephrasing.` }],
    });
  } catch (e) {
    return res.status(200).json({ results: [{ toolCallId, result: `ERROR: web search failed: ${e && e.message ? e.message : String(e)}` }] });
  }
}

function send(res, query, results, toolCallId, debug) {
  const trimmed = results.slice(0, 8);
  return res.status(200).json({
    ok: true,
    query,
    count: trimmed.length,
    results: trimmed,
    summary: trimmed.map((r2, i) => `${i + 1}. ${r2.title} — ${r2.snippet} (${r2.url})`).join('\n'),
    _debug: debug.join(' | '),
  });
}

// html.duckduckgo.com: <a class="result__a" href="...">Title</a> + result__snippet blocks
function parseDdgHtml(html) {
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 10) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&"]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//.test(url)) continue;
    const title = stripTags(m[2]).slice(0, 200);
    const tail = html.slice(re.lastIndex, re.lastIndex + 1500);
    const sm = tail.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    const snippet = sm ? stripTags(sm[1]).slice(0, 300) : '';
    out.push({ title, url, snippet });
  }
  return out;
}

// lite.duckduckgo.com: <a class="result-link" href="..."> + table rows
function parseDdgLite(html) {
  const out = [];
  const re = /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 10) {
    let url = m[1];
    const uddg = url.match(/uddg=([^&"]+)/);
    if (uddg) url = decodeURIComponent(uddg[1]);
    if (!/^https?:\/\//.test(url)) continue;
    out.push({ title: stripTags(m[2]).slice(0, 200), url, snippet: '' });
  }
  return out;
}

// Bing: <li class="b_algo"> ... <h2><a href="URL">Title</a></h2> ... <p>snippet</p>
function parseBing(html) {
  const out = [];
  const blocks = html.split('<li class="b_algo"');
  for (let i = 1; i < blocks.length && out.length < 10; i++) {
    const blk = blocks[i];
    const a = blk.match(/<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    let url = a[1];
    if (!/^https?:\/\//.test(url)) continue;
    const p = blk.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    out.push({ title: stripTags(a[2]).slice(0, 200), url, snippet: p ? stripTags(p[1]).slice(0, 300) : '' });
  }
  return out;
}

// Google News RSS: <item><title>..</title><link>..</link><pubDate>..</pubDate></item>
function parseRss(xml) {
  const out = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const it of items.slice(0, 10)) {
    const t = it.match(/<title>([\s\S]*?)<\/title>/);
    const l = it.match(/<link>([\s\S]*?)<\/link>/);
    const d = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (t && l) out.push({ title: stripTags(t[1]).slice(0, 200), url: l[1].trim(), snippet: d ? stripTags(d[1]) : '' });
  }
  return out;
}

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}