const DEFAULT_CHAT_MODEL = 'qwen3:4b';

export function getOllamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL || null,
    chatModel: process.env.CONFIG_BOT_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    timeoutMs: Number(process.env.CONFIG_BOT_OLLAMA_TIMEOUT_MS || 2500)
  };
}

export async function askOllama(messages, options = {}) {
  const config = { ...getOllamaConfig(), ...options };
  if (!config.baseUrl || process.env.CONFIG_BOT_DISABLE_OLLAMA === 'true') return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.chatModel,
        messages,
        stream: false,
        options: { temperature: 0.2 }
      }),
      signal: controller.signal
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.message?.content || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
