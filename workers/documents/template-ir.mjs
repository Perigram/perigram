// Pure Markdown template substitution shared by browser and managed runtimes.
const TOKEN = /\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;

export function substitute(text, scope = {}) {
  return String(text ?? '').replace(TOKEN, (raw, key) => (
    scope[key] === undefined || scope[key] === null ? raw : String(scope[key])
  ));
}

export function fillMarkdown(templateText, values = {}) {
  return substitute(String(templateText ?? ''), values);
}

export function templateTokenKeys(...texts) {
  const keys = new Set();
  for (const text of texts) {
    TOKEN.lastIndex = 0;
    for (const match of String(text ?? '').matchAll(TOKEN)) keys.add(match[1]);
  }
  return [...keys];
}
