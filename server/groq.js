const BASE = 'https://api.groq.com/openai/v1';
const MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
// Each Groq model has its own per-minute token budget; the backup takes over when the main one is used up.
const BACKUP_MODEL = () => process.env.GROQ_BACKUP_MODEL || 'openai/gpt-oss-20b';
const STT_MODEL = () => process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo';

export const isMock = () => process.env.GROQ_MOCK === '1';
export const hasKey = () => !!process.env.GROQ_API_KEY || isMock();

export class AIError extends Error {
  constructor(message, status, retryAfter) { super(message); this.status = status || 502; this.retryAfter = retryAfter || 0; }
}

function headers() {
  if (!process.env.GROQ_API_KEY) throw new AIError('GROQ_API_KEY is not set on the server. Add it to .env and restart.', 503);
  return { Authorization: 'Bearer ' + process.env.GROQ_API_KEY };
}

async function call(path, init, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch {}
      if (res.status === 401) throw new AIError('Groq rejected the API key. Check GROQ_API_KEY in .env.', 503);
      if (res.status === 429) throw new AIError('Jo needs a short break (the free Groq plan allows only so much per minute). Try again in a few seconds.', 429, Number(res.headers.get('retry-after')) || 5);
      throw new AIError('Groq error ' + res.status + (detail ? ': ' + detail : ''));
    }
    return await res.json();
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e.name === 'AbortError') throw new AIError('The AI took too long to answer. Try again.', 504);
    throw new AIError('Could not reach Groq: ' + e.message);
  } finally { clearTimeout(t); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Chat completion that must return a JSON object. Retries once on bad JSON; on a rate limit it
   switches to the backup model or waits briefly. */
export async function chatJSON(system, user, { temperature = 0.6, maxTokens = 1200, timeoutMs = 25000, reasoning = 'low' } = {}) {
  const models = [...new Set([MODEL(), BACKUP_MODEL()])];
  let lastErr, mi = 0, waited = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const model = models[mi];
    // Reasoning models think before answering, and that thinking counts toward max_tokens.
    const reasoner = /gpt-oss|qwen3/.test(model);
    let data;
    try {
      data = await call('/chat/completions', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: attempt ? 0.3 : temperature,
          max_tokens: reasoner ? maxTokens + (reasoning === 'low' ? 600 : 1500) : maxTokens,
          ...(/gpt-oss/.test(model) ? { reasoning_effort: reasoning } : {}),
          ...(/qwen3/.test(model) ? { reasoning_format: 'hidden' } : {}),
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
        })
      }, timeoutMs);
    } catch (e) {
      if (e.status !== 429) throw e;
      lastErr = e;
      if (mi + 1 < models.length) { mi++; continue; }          // try the other model's budget first
      if (waited || e.retryAfter > 12) throw e;
      waited = true; mi = 0; await sleep(e.retryAfter * 1000); continue;
    }
    const text = data.choices?.[0]?.message?.content || ''; if (process.env.DEBUG_AI) console.log('[AI', model, data.usage?.total_tokens, ']', text);
    try { return JSON.parse(text); } catch (e) { lastErr = e; }
  }
  if (lastErr instanceof AIError) throw lastErr;
  throw new AIError('The AI returned an unreadable answer. Try again. (' + (lastErr?.message || '') + ')');
}

/* Speech to text with Whisper. `audio` is a Buffer, `mime` the recorder's content type. */
export async function transcribe(audio, mime, prompt) {
  const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mime || 'audio/webm' }), 'speech.' + ext);
  form.append('model', STT_MODEL());
  form.append('language', 'en');
  form.append('response_format', 'json');
  form.append('temperature', '0');
  // A short prompt with the scene's vocabulary helps Whisper spell menu words and names.
  if (prompt) form.append('prompt', prompt.slice(0, 600));
  const data = await call('/audio/transcriptions', { method: 'POST', headers: headers(), body: form }, 30000);
  return (data.text || '').trim();
}
