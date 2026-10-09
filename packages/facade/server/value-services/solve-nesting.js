// The nesting service's V -> V boundary (SPEC §8 s species, §21): pure
// value in (job items + the sheet as values), value out (layouts and a
// summary). The handler resolves no entities — the graph reads sheet
// dimensions off the material through the field projection, and design
// geometry arrives as job-item values through the declared
// `nesting-polygons` projection. This module is the pack's value-services
// seam: the architecture guard rejects instance/files imports here.
//
// Invoked as a command handler (server/core/commands): the payload is the
// command envelope `{ entities, parameters, auth }`; the declared parameter
// sockets (`items`, `sheetWidth`, `sheetHeight`, `space`, `sheetCount`)
// arrive on `parameters`.
import { createError } from 'h3';
import {
  buildValueWorkerRequest,
  enrichNestingResult,
  summarizeNestingResult
} from '../nesting/projections.js';

async function callNestingWorker(request) {
  const url = process.env.NESTING_WORKER_URL || 'http://nesting-worker:8000/nest';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request)
  });
  if (!response.ok) {
    const body = await response.text();
    throw createError({ statusCode: 502, message: `Nesting worker failed: ${body || response.statusText}` });
  }
  return await response.json();
}

export async function solveNestingValue({ parameters = {} } = {}) {
  const { items, sheetWidth, sheetHeight, space, sheetCount } = parameters || {};
  if (!Array.isArray(items) || !items.length) {
    throw createError({ statusCode: 400, message: 'Nesting input requires items (job geometry)' });
  }
  for (const [index, item] of items.entries()) {
    if (!item || !Array.isArray(item.polygonParts) || !item.polygonParts.length) {
      throw createError({ statusCode: 400, message: `Item ${index} requires polygonParts geometry` });
    }
    item.count = Math.max(1, Math.trunc(Number(item.count) || 1));
  }

  const params = {
    width: Number(sheetWidth),
    height: Number(sheetHeight),
    space: Number(space ?? 3),
    sheetCount: Math.max(1, Math.trunc(Number(sheetCount ?? 1) || 1))
  };
  for (const key of ['width', 'height', 'space', 'sheetCount']) {
    if (!(Number(params[key]) > 0)) {
      throw createError({ statusCode: 400, message: `Nesting params require a positive ${key}` });
    }
  }

  const request = buildValueWorkerRequest(items, params);
  const result = enrichNestingResult(await callNestingWorker(request), request);
  if (result.status === 'error') {
    throw createError({ statusCode: 500, message: result.message || 'Nesting worker failed' });
  }
  return {
    layouts: result.layouts || result.data?.layouts || [],
    summary: summarizeNestingResult(result, request.params)
  };
}
