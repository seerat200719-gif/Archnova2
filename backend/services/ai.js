// Provider layer. Keeps provider-specific code out of controllers. Add providers by returning {configured, complete()}.
const { ApiError } = require('../middleware/error');
function createAi(env, fetchImpl = fetch) {
  if (env.aiProvider !== 'anthropic' || !env.aiKey) return { configured: false, provider: env.aiProvider, complete: async () => { throw new ApiError(503, 'ai_not_configured', 'AI is not configured. Set ANTHROPIC_API_KEY (and optionally AI_MODEL) in .env. See README.'); } };
  return {
    configured: true, provider: 'anthropic', model: env.aiModel,
    async complete(system, user, { maxTokens = 4000 } = {}) {
      let last;
      for (let attempt = 0; attempt < 3; attempt++) { // bounded retries on 429/5xx/timeouts
        try {
          const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
            method: 'POST', signal: AbortSignal.timeout(env.aiTimeoutMs),
            headers: { 'content-type': 'application/json', 'x-api-key': env.aiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: env.aiModel, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
          });
          if (r.ok) { const j = await r.json(); return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join(''); }
          last = r.status; if (r.status !== 429 && r.status < 500) break;
        } catch (e) { last = e.name; }
        await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
      }
      throw new ApiError(502, 'ai_provider_error', `AI provider request failed (${last})`);
    },
  };
}
module.exports = { createAi };
