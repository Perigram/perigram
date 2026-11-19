import { describe, expect, it } from 'vitest';
import { useGraphDocumentSession } from './useGraphDocumentSession.js';
import {
  PARITY_PROVIDER,
  PARITY_EXPECTED_OUTPUTS,
  PARITY_INPUT_BINDINGS,
  parityDoubleDefinition,
  parityDoubleExecutor,
  parityGraphDocument
} from '~/test-data/graph-target-parity.js';

// SPEC §30.13 convergence proof point 7 — browser target. Browser evaluation
// resolves pinned Use Graph subgraphs from the session's graph catalog
// (current payloads) and cannot execute server-only managed operations;
// parity is asserted over canonical documents whose operations declare both
// targets (see the fixture's documented limitation).

describe('graph execution target parity (browser)', () => {
  it('evaluates the shared parity fixture to the shared expected outputs', async () => {
    const session = useGraphDocumentSession({
      t: key => key,
      providers: [{
        provider: PARITY_PROVIDER,
        definitions: [parityDoubleDefinition()],
        execute: parityDoubleExecutor
      }]
    });
    session.loadDocument(parityGraphDocument());
    session.setGraphInputBinding({ portId: 'value', value: PARITY_INPUT_BINDINGS.value });

    const result = await session.refreshPreview();

    expect(session.previewError.value).toBe('');
    expect(result.outputs).toEqual(PARITY_EXPECTED_OUTPUTS);
    expect(session.executionRecord.value).toMatchObject({ status: 'succeeded', profile: 'procedural-preview' });
  });
});
