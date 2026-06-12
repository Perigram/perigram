import { request } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  E2E_AUTH_STATE,
  E2E_BASE_URL,
  E2E_ORG_ID,
  E2E_REGISTER_ON_LOGIN_FAILURE,
  E2E_USER_EMAIL,
  E2E_USER_NAME,
  E2E_USER_PASSWORD
} from './config.js';

export default async function globalSetup() {
  const context = await request.newContext({ baseURL: E2E_BASE_URL });

  try {
    const health = await context.get('/api/auth/me', { failOnStatusCode: false });
    if (![200, 401].includes(health.status())) {
      throw new Error(`App responded with ${health.status()} from /api/auth/me`);
    }

    let login = await loginRequest(context);

    if (login.status() === 401 && E2E_REGISTER_ON_LOGIN_FAILURE) {
      await registerE2eUser(context);
      login = await loginRequest(context);
    }

    if (!login.ok()) {
      const body = await safeResponseText(login);
      throw new Error(`E2E login failed (${login.status()}). Check E2E_USER_EMAIL/E2E_USER_PASSWORD and E2E_ORG_ID. ${body}`);
    }

    await mkdir(dirname(E2E_AUTH_STATE), { recursive: true });
    await context.storageState({ path: E2E_AUTH_STATE });
  } catch (error) {
    throw new Error([
      `Playwright E2E setup failed for ${E2E_BASE_URL}.`,
      'Start the CutKit dev/compose stack first and provide valid E2E_USER_EMAIL/E2E_USER_PASSWORD.',
      error.message
    ].join(' '));
  } finally {
    await context.dispose();
  }
}

async function loginRequest(context) {
  return await context.post('/api/auth/login', {
    data: {
      email: E2E_USER_EMAIL,
      password: E2E_USER_PASSWORD
    },
    failOnStatusCode: false
  });
}

async function registerE2eUser(context) {
  const response = await context.post('/api/auth/register', {
    data: {
      email: E2E_USER_EMAIL,
      password: E2E_USER_PASSWORD,
      name: E2E_USER_NAME,
      organizationId: E2E_ORG_ID,
      role: 'ContractorAdmin'
    },
    failOnStatusCode: false
  });

  if (!response.ok() && response.status() !== 409) {
    const body = await safeResponseText(response);
    throw new Error(`E2E registration failed (${response.status()}). ${body}`);
  }
}

async function safeResponseText(response) {
  try {
    const text = await response.text();
    return text ? text.slice(0, 500) : '';
  } catch {
    return '';
  }
}
