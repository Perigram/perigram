import * as repository from './repository.js';

export async function findExecutedKey(key) {
  if (!key) return null;
  return repository.findByKey(key);
}

export async function registerExecutedKey({ key, userId = null, method, url } = {}) {
  if (!key) return;
  return repository.registerKey({ key, userId, method, url });
}
