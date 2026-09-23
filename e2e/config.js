export const E2E_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
export const E2E_AUTH_STATE = process.env.E2E_AUTH_STATE || '.playwright/.auth/user.json';
export const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL || 'e2e@perigram.local';
export const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD || 'e2e-password';
export const E2E_USER_NAME = process.env.E2E_USER_NAME || 'Perigram E2E User';
export const E2E_ORG_ID = process.env.E2E_ORG_ID || 'org-demo-acme';
export const E2E_REGISTER_ON_LOGIN_FAILURE = process.env.E2E_REGISTER_ON_LOGIN_FAILURE !== 'false';
export const E2E_PREFIX = process.env.E2E_PREFIX || `e2e-${Date.now()}`;
