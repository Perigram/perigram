// The assistant wake gate (agent-bots README): `@` plus the assistant's
// name, case-insensitive, ending at a word boundary. The server decides
// wakes; the composer predicts the same gate for the model select.
export function assistantMentioned(text, assistantName) {
  const source = String(text || '');
  const name = String(assistantName || '').trim();
  if (!source || !name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(source);
}
