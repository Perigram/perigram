/**
 * System Settings Service
 */

import * as repository from './repository.js';

// Default system settings
const DEFAULTS = {
  NESTING_LAYER_CODE: '1_3_UNFOLD_BOUNDARY'  // Which layer standard code to use for nesting
};

export async function get(key) {
  const value = await repository.getSetting(key);
  return value ?? DEFAULTS[key] ?? null;
}

export async function set(key, value) {
  return await repository.setSetting(key, value);
}

export async function getAll() {
  const settings = await repository.getAllSettings();
  // Merge with defaults
  return { ...DEFAULTS, ...settings };
}

export async function getNestingLayerCode() {
  return await get('NESTING_LAYER_CODE');
}
