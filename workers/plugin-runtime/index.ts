import {
  PLUGIN_RUNTIME_WORKER_TYPE,
  PLUGIN_RUNTIME_MAX_EXECUTION_MS,
  PLUGIN_RUNTIME_MAX_MEMORY_MB
} from '../../shared/plugin-runtime.js';

const BOOTSTRAP_SOURCE = `const request = JSON.parse(await Deno.readTextFile(Deno.args[0]));
const encoder = new TextEncoder();
const stdout = Deno.stdout.writable.getWriter();
const pending = new Map();
let callSequence = 0;
const controller = new AbortController();

console.log = console.error.bind(console);
console.info = console.error.bind(console);
console.debug = console.error.bind(console);

async function send(message) {
  await stdout.write(encoder.encode(JSON.stringify(message) + '\\n'));
}

let responseReader = null;
async function readResponses() {
  responseReader = Deno.stdin.readable.pipeThrough(new TextDecoderStream()).getReader();
  const reader = responseReader;
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.type === 'cancel' && !controller.signal.aborted) {
        const error = new Error(message.reason || 'Managed plugin execution was cancelled');
        error.name = 'AbortError';
        error.code = 'PLUGIN_EXECUTION_ABORTED';
        controller.abort(error);
      }
      if (message.type !== 'capability-result') continue;
      const deferred = pending.get(message.callId);
      if (!deferred) continue;
      if (message.error) deferred.reject(new Error(message.error.message || 'Host capability failed'));
      else deferred.resolve(message.value);
    }
  }
}

const moduleUrl = new URL('./' + request.runtimeEntry, import.meta.url);
try {
  const module = await import(moduleUrl.href);
  const createRuntime = module.createRuntime || module.default;
  if (typeof createRuntime !== 'function') throw new Error('Runtime module must export createRuntime');
  const runtime = await createRuntime();
  if (typeof runtime?.execute !== 'function') throw new Error('Runtime must provide execute(operationId, input, context)');
  const responseLoop = readResponses();
  const capabilities = {
    call(name, input) {
      if (controller.signal.aborted) {
        return Promise.reject(controller.signal.reason || Object.assign(new Error('Managed plugin execution was cancelled'), {
          name: 'AbortError',
          code: 'PLUGIN_EXECUTION_ABORTED'
        }));
      }
      const callId = 'cap-' + (++callSequence);
      return new Promise((resolve, reject) => {
        const cleanup = () => controller.signal.removeEventListener('abort', onAbort);
        const settle = (handler, value) => {
          if (!pending.has(callId)) return;
          pending.delete(callId);
          cleanup();
          handler(value);
        };
        const onAbort = () => settle(reject, controller.signal.reason || new Error('Managed plugin execution was cancelled'));
        pending.set(callId, {
          resolve: value => settle(resolve, value),
          reject: error => settle(reject, error)
        });
        controller.signal.addEventListener('abort', onAbort, { once: true });
        void send({ type: 'capability', callId, name, input }).catch(error => settle(reject, error));
      });
    }
  };
  try {
    const value = await runtime.execute(request.operationId, request.input, {
      capabilities,
      signal: controller.signal
    });
    await responseReader?.cancel();
    await responseLoop.catch(() => {});
    await send({ type: 'result', value: value === undefined ? null : value });
    await stdout.close();
    Deno.exit(0);
  } catch (error) {
    await responseReader?.cancel();
    await responseLoop.catch(() => {});
    await send({ type: 'error', error: { message: error?.message || String(error) } });
    await stdout.close();
    Deno.exit(1);
  }
} catch (error) {
  await send({ type: 'error', error: { message: error?.message || String(error) } });
  await stdout.close();
  Deno.exit(1);
}`;

const appUrl = (Deno.env.get('PERIGRAM_APP_URL') || 'http://app:3000').replace(/\/+$/, '');
const workerToken = Deno.env.get('WORKER_TOKEN') || '';
const workerId = Deno.env.get('PLUGIN_RUNTIME_WORKER_ID') || 'managed-runtime-1';
const pollIntervalMs = Number(Deno.env.get('PLUGIN_RUNTIME_POLL_MS') || 1500);

if (!workerToken) throw new Error('WORKER_TOKEN is required');

console.log(`managed plugin runtime ${workerId} polling ${appUrl}`);

while (true) {
  try {
    const run = await claimNext();
    if (!run) {
      await delay(pollIntervalMs);
      continue;
    }
    console.log(`claimed ${run.taskId} run ${run._id}`);
    await executeRun(run);
  } catch (error) {
    console.error(`managed runtime loop failed: ${error?.message || error}`);
    await delay(pollIntervalMs);
  }
}

async function claimNext() {
  const response = await fetch(`${appUrl}/api/tasks/claim`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({ workerType: PLUGIN_RUNTIME_WORKER_TYPE, workerId })
  });
  if (!response.ok) throw new Error(await response.text() || `Claim failed: ${response.status}`);
  return (await response.json())?.run || null;
}

async function executeRun(run) {
  const claimToken = run.claimToken;
  let childControl = null;
  let heartbeatError = null;
  const heartbeat = setInterval(async () => {
    try {
      await postJson(`/api/tasks/${run._id}/heartbeat`, { claimToken });
    } catch (error) {
      heartbeatError = error;
      try { childControl?.cancel('Task claim was lost or cancelled'); } catch {}
    }
  }, 5_000);

  try {
    const packageResponse = await fetch(
      `${appUrl}/api/tasks/${run._id}/plugin-package?claimToken=${encodeURIComponent(claimToken)}`,
      { headers: workerHeaders(false) }
    );
    if (!packageResponse.ok) throw new Error(await packageResponse.text() || `Package read failed: ${packageResponse.status}`);
    const packageData = (await packageResponse.json()).package;
    const execution = await executeIsolated(packageData, run, control => {
      childControl = control;
      if (heartbeatError) control.cancel('Task claim was lost or cancelled');
    });
    if (heartbeatError) throw heartbeatError;
    await postJson(`/api/tasks/${run._id}/complete`, {
      claimToken,
      result: {
        output: execution.value === undefined ? null : execution.value,
        capabilityEvidence: execution.capabilityEvidence
      }
    });
    console.log(`completed ${run.taskId} run ${run._id}`);
  } catch (error) {
    try {
      await postJson(`/api/tasks/${run._id}/fail`, { claimToken, message: error?.message || String(error) });
    } catch (failError) {
      console.error(`could not mark ${run._id} failed: ${failError?.message || failError}`);
    }
    console.error(`run ${run._id} failed: ${error?.message || error}`);
  } finally {
    clearInterval(heartbeat);
    try { childControl?.kill(); } catch {}
  }
}

async function executeIsolated(packageData, run, setChild) {
  if (packageData.runtime?.language !== 'javascript') throw new Error('Managed server runtime currently supports JavaScript packages');
  const directory = await Deno.makeTempDir({ prefix: 'perigram-plugin-' });
  try {
    for (const asset of packageData.assets || []) {
      const path = String(asset.path || '');
      if (!path || path.startsWith('/') || path.split('/').includes('..') || path.includes('\\')) {
        throw new Error(`Unsafe package asset path: ${path}`);
      }
      const destination = `${directory}/${path}`;
      await Deno.mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
      await Deno.writeFile(destination, decodeBase64(asset.base64));
    }

    const runtimeEntry = String(packageData.runtime.entry || '').replace(/^\//, '');
    if (!runtimeEntry) throw new Error('Managed runtime entry is missing');
    const imports = {};
    for (const dependency of packageData.dependencies || []) {
      if (!dependency?.name || !dependency?.module) continue;
      const modulePath = String(dependency.module).replace(/^\//, '');
      if (modulePath.split('/').includes('..')) throw new Error(`Unsafe dependency path: ${modulePath}`);
      imports[String(dependency.name)] = `./${modulePath}`;
    }
    await Deno.writeTextFile(`${directory}/deno.json`, JSON.stringify({ imports }));
    await Deno.writeTextFile(`${directory}/request.json`, JSON.stringify({
      runtimeEntry,
      operationId: packageData.operationId,
      input: packageData.input
    }));
    await Deno.writeTextFile(`${directory}/bootstrap.js`, BOOTSTRAP_SOURCE);

    const child = new Deno.Command(Deno.execPath(), {
      args: [
        `--v8-flags=--max-old-space-size=${PLUGIN_RUNTIME_MAX_MEMORY_MB}`,
        'run',
        '--no-prompt',
        `--allow-read=${directory}`,
        `--config=${directory}/deno.json`,
        `${directory}/bootstrap.js`,
        `${directory}/request.json`
      ],
      cwd: directory,
      clearEnv: true,
      env: {},
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped'
    }).spawn();
    setChild(child);

    const stdin = child.stdin.getWriter();
    const stderrPromise = new Response(child.stderr).text();
    const reader = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let resultMessage = null;
    const capabilityEvidence = [];
    let timedOut = false;
    let killTimer = null;
    const executionController = new AbortController();
    const cancel = reason => {
      if (killTimer) return;
      executionController.abort(new Error(reason || 'Managed plugin execution was cancelled'));
      void stdin.write(new TextEncoder().encode(JSON.stringify({ type: 'cancel', reason }) + '\n')).catch(() => {});
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000);
    };
    const timeout = setTimeout(() => { timedOut = true; cancel('Managed plugin execution deadline exceeded'); }, PLUGIN_RUNTIME_MAX_EXECUTION_MS);
    setChild({ cancel, kill() { try { child.kill('SIGKILL'); } catch {} } });

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const message = parseMessage(line);
          if (!message) continue;
          if (message.type === 'capability') {
            try {
              const value = await callCapability(run, message.name, message.input, executionController.signal);
              capabilityEvidence.push({
                name: String(message.name || ''),
                input: capabilityInputEvidence(message.name, message.input),
                ...(String(message.name || '') === 'files.read'
                  ? { organizationId: value?.organizationId ?? null }
                  : {}),
                ...(value?.readSet ? { readSet: value.readSet } : {}),
                ...(value?.contentHash ? { contentHash: String(value.contentHash) } : {})
              });
              await stdin.write(new TextEncoder().encode(JSON.stringify({ type: 'capability-result', callId: message.callId, value }) + '\n'));
            } catch (error) {
              await stdin.write(new TextEncoder().encode(JSON.stringify({
                type: 'capability-result',
                callId: message.callId,
                error: { message: error?.message || String(error) }
              }) + '\n'));
            }
          } else if (message.type === 'result') {
            resultMessage = message;
          } else if (message.type === 'error') {
            throw new Error(message.error?.message || 'Plugin runtime execution failed');
          }
        }
      }
      if (buffer.trim()) {
        const message = parseMessage(buffer);
        if (message?.type === 'result') resultMessage = message;
        if (message?.type === 'error') throw new Error(message.error?.message || 'Plugin runtime execution failed');
      }
      const status = await child.status;
      const stderr = await stderrPromise;
      if (timedOut) throw new Error('Managed plugin execution deadline exceeded');
      if (status.code !== 0) throw new Error(stderr.trim() || `Plugin runtime exited with code ${status.code}`);
      if (!resultMessage) throw new Error('Plugin runtime exited without a result');
      return { value: resultMessage.value, capabilityEvidence };
    } finally {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      try { stdin.close(); } catch {}
    }
  } finally {
    await Deno.remove(directory, { recursive: true }).catch(() => {});
  }
}

function capabilityInputEvidence(name, input = {}) {
  if (name === 'files.read') return { fileId: String(input?.fileId || '') };
  if (name === 'organization.instances.read' || name === 'organization.instances.query') {
    return {
      typeId: String(input?.typeId || ''),
      ...(input?.instanceId ? { instanceId: String(input.instanceId) } : {}),
      ...(input?.projection ? { projection: input.projection } : {})
    };
  }
  return {};
}

async function callCapability(run, name, input, signal) {
  const response = await fetch(`${appUrl}/api/tasks/${run._id}/plugin-capability`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify({ claimToken: run.claimToken, name, input }),
    signal
  });
  if (!response.ok) throw new Error(await response.text() || `Capability ${name} failed: ${response.status}`);
  return await response.json();
}

async function postJson(path, body) {
  const response = await fetch(`${appUrl}${path}`, {
    method: 'POST',
    headers: workerHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text() || `Request failed: ${response.status}`);
  return await response.json();
}

function workerHeaders(json = true) {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    'x-worker-token': workerToken
  };
}

function parseMessage(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function decodeBase64(value) {
  const binary = atob(String(value || ''));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


