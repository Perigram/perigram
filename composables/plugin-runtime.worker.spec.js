import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

const workerModule = fileURLToPath(new URL('./plugin-runtime.worker.js', import.meta.url));

function writeFixture(directory) {
  const runtime = join(directory, 'runtime.mjs');
  writeFileSync(runtime, `
let retainedResult = null;
let retainedInput = null;
export function createRuntime() {
  return {
    async execute(operationId, input) {
      if (operationId === 'make-result') {
        const value = new Float32Array(20000);
        value[0] = 7;
        retainedResult = value.buffer;
        return { value };
      }
      if (operationId === 'echo-input') {
        retainedInput = input.buffer;
        return { value: input };
      }
      if (operationId === 'result-state') {
        return { detached: retainedResult?.byteLength === 0 };
      }
      if (operationId === 'input-state') {
        return { detached: retainedInput?.byteLength === 0 };
      }
      throw new Error('Unknown operation ' + operationId);
    }
  };
}
`);
  const shim = join(directory, 'worker-shim.mjs');
  writeFileSync(shim, `
const { parentPort } = await import('node:worker_threads');
globalThis.self = {
  postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
  onmessage: null
};
parentPort.on('message', message => self.onmessage?.({ data: message }));
await import(${JSON.stringify(pathToFileURL(workerModule).href)});
`);
  return { runtime: pathToFileURL(runtime).href, shim };
}

function callWorker(worker, message) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      worker.off('message', onMessage);
      reject(error);
    };
    const onMessage = data => {
      worker.off('error', onError);
      resolve(data);
    };
    worker.once('message', onMessage);
    worker.once('error', onError);
    worker.postMessage(message);
    setTimeout(() => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      reject(new Error('Worker call timed out'));
    }, 10000).unref?.();
  });
}

describe('plugin runtime worker buffer transfer', () => {
  let scratch;
  let fixture;
  let worker;
  let sequence = 0;

  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'plugin-runtime-'));
    fixture = writeFixture(scratch);
    worker = new Worker(fixture.shim, { execArgv: [] });
    const ready = await callWorker(worker, { type: 'initialize', entryUrl: fixture.runtime });
    expect(ready.type).toBe('ready');
  });

  afterAll(async () => {
    await worker?.terminate();
    rmSync(scratch, { recursive: true, force: true });
  });

  function invoke(operationId, input) {
    return callWorker(worker, {
      type: 'invoke',
      invocationId: `inv-${++sequence}`,
      operationId,
      input
    });
  }

  it('transfers owned result buffers out of the worker', async () => {
    const result = await invoke('make-result', {});
    expect(result.type).toBe('result');
    expect(result.value.value).toBeInstanceOf(Float32Array);
    expect(result.value.value).toHaveLength(20000);
    expect(result.value.value[0]).toBe(7);

    const state = await invoke('result-state', {});
    expect(state.value).toEqual({ detached: true });
  });

  it('keeps invocation input buffers owned by the caller', async () => {
    const input = new Float32Array(20000);
    input[0] = 11;
    const result = await invoke('echo-input', input);
    expect(result.value.value[0]).toBe(11);

    const state = await invoke('input-state', {});
    expect(state.value).toEqual({ detached: false });
  });
});
