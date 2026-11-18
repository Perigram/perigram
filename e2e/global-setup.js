import { request } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  E2E_AUTH_STATE,
  E2E_BASE_URL,
  E2E_REGISTER_ON_LOGIN_FAILURE,
  E2E_USER_EMAIL,
  E2E_USER_NAME,
  E2E_USER_PASSWORD
} from './config.js';

// Each run gets a unique identity so consecutive runs never share database
// state: a fresh registration provisions a fresh organization with the full
// template process, roles, and the owner role assignment. Set E2E_USER_EMAIL
// explicitly to pin a reused identity.
const RUN_EMAIL = process.env.E2E_USER_EMAIL
  || `e2e-${Date.now().toString(36)}@perigram.local`;

export default async function globalSetup() {
  const context = await request.newContext({ baseURL: E2E_BASE_URL });

  try {
    const health = await context.get('/api/auth/me', { failOnStatusCode: false });
    if (![200, 401].includes(health.status())) {
      throw new Error(`App responded with ${health.status()} from /api/auth/me`);
    }

    // A fresh identity is provisioned through registration first: the dev
    // error renderer turns a 401 POST into a 500, so probing login cannot
    // distinguish a missing account from a server failure.
    if (E2E_REGISTER_ON_LOGIN_FAILURE) {
      await registerE2eUser(context, RUN_EMAIL);
    } else {
      const login = await loginRequest(context, RUN_EMAIL);
      if (!login.ok()) {
        const body = await safeResponseText(login);
        throw new Error(`E2E login failed (${login.status()}). Check E2E_USER_EMAIL/E2E_USER_PASSWORD/E2E_ORG_ID. ${body}`);
      }
    }

    await mkdir(dirname(E2E_AUTH_STATE), { recursive: true });
    await context.storageState({ path: E2E_AUTH_STATE });
  } catch (error) {
    throw new Error([
      `Playwright E2E setup failed for ${E2E_BASE_URL}.`,
      'Start the Perigram dev/compose stack first and provide valid E2E_USER_EMAIL/E2E_USER_PASSWORD.',
      error.message
    ].join(' '));
  } finally {
    await context.dispose();
  }
}

async function loginRequest(context, email) {
  return await context.post('/api/auth/login', {
    data: {
      email,
      password: E2E_USER_PASSWORD
    },
    failOnStatusCode: false
  });
}

async function registerE2eUser(context, email) {
  const response = await context.post('/api/auth/register', {
    data: {
      email,
      password: E2E_USER_PASSWORD,
      name: E2E_USER_NAME
    },
    failOnStatusCode: false
  });

  if (!response.ok() && response.status() !== 409) {
    const body = await safeResponseText(response);
    throw new Error(`E2E registration failed (${response.status}). ${body}`);
  }

  // Registration creates the account only: sign in and create the suite's
  // organization through the authenticated organizations API - the same
  // boundary the profile page uses - so the owner membership and empty
  // starter process land on the session the suite switches to.
  const login = await loginRequest(context, email);
  if (!login.ok()) {
    const body = await safeResponseText(login);
    throw new Error(`E2E login after registration failed (${login.status}). ${body}`);
  }

  const org = await context.post('/api/organizations', {
    data: { name: 'E2E Contracting', email }
  });
  if (!org.ok() && org.status() !== 409) {
    const body = await safeResponseText(org);
    throw new Error(`E2E organization creation failed (${org.status}). ${body}`);
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
