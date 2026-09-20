// Class identity: the authored NAME is the mutable label; the registry id
// is an opaque, stable, randomly generated identifier (kebab-safe for the
// registry). It never derives from the name — renaming is always a pure
// label change with zero coupling to identity.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateTypeId() {
  let body = '';
  for (let index = 0; index < 10; index += 1) {
    body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `t-${body}`;
}
