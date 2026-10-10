const { ApiError } = require('../middleware/error');
const cache = new Map(), TTL = 600000, MAX = 200, Q = /^[\p{L}\p{N} ,'\-]{2,80}$/u;
const https = u => { try { const p = new URL(u); return p.protocol === 'https:' ? p.href : ''; } catch { return ''; } };
async function search(q, { key, fetchImpl = fetch }) {
  q = String(q || '').trim(); if (!Q.test(q)) throw new ApiError(400, 'invalid_query', 'Query must be 2-80 letters, numbers, spaces, commas, apostrophes or hyphens');
  if (!key) throw new ApiError(503, 'not_configured', 'Live search is not configured. Set SERPAPI_API_KEY in .env.');
  const hit = cache.get(q.toLowerCase()); if (hit && Date.now() - hit.t < TTL) return hit.v;
  const u = new URL('https://serpapi.com/search.json'); u.search = new URLSearchParams({ engine: 'google_images', q, hl: 'en', api_key: key });
  let r; try { r = await fetchImpl(u, { signal: AbortSignal.timeout(10000) }); } catch { throw new ApiError(502, 'search_failed', 'Search provider unreachable'); }
  if (!r.ok) throw new ApiError(502, 'search_failed', `Search provider returned ${r.status}`);
  const d = await r.json();
  // Fields documented for SerpApi Google Images: images_results[].title / thumbnail / source / link
  const v = (d.images_results || []).slice(0, 12).map(x => ({ title: String(x.title || '').slice(0, 140), thumbnail: https(x.thumbnail), source: String(x.source || '').slice(0, 80), link: https(x.link) })).filter(x => x.title);
  if (cache.size >= MAX) cache.delete(cache.keys().next().value);
  cache.set(q.toLowerCase(), { t: Date.now(), v }); return v;
}
module.exports = { search, _cache: cache };
