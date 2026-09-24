// Designer identity minting. Class identity: the authored NAME is the
// mutable label; the registry id is an opaque, stable, randomly generated
// identifier (kebab-safe for the registry). It never derives from the name —
// renaming is always a pure label change with zero coupling to identity.
//
// Canvas identity: every id the designer mints at runtime (graph nodes,
// edges, services, sockets, stations) comes from `mintId` — time prefix +
// monotonic counter + random suffix, collision-proof within a session
// (counter) and across sessions (time + random). A bare `Date.now()` id
// collides on same-millisecond drops.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateTypeId() {
  let body = '';
  for (let index = 0; index < 10; index += 1) {
    body += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `t-${body}`;
}

let mintCounter = 0;

export function mintId(prefix = 'id') {
  mintCounter += 1;
  const random = Math.floor(Math.random() * 0xffff).toString(36);
  return `${prefix}_${Date.now().toString(36)}${mintCounter.toString(36)}${random}`;
}
