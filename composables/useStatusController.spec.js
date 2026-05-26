import { describe, expect, it } from 'vitest';
import { getStatusEndpoint, STATUS_TRANSITION_ENDPOINT } from './useStatusController.js';

describe('useStatusController endpoint resolution', () => {
  it('routes all status transitions through the canonical status API', () => {
    expect(getStatusEndpoint()).toBe(STATUS_TRANSITION_ENDPOINT);
  });
});
