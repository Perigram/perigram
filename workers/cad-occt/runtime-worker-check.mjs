// Browser-runtime layer check to the degree a host browser allows
// (TESTING layer 3): the platform's real plugin Worker
// (composables/plugin-runtime.worker.js) boots the SHIPPED cad-occt module
// graph inside a Node Worker thread. The fixture materializes the package
// exactly as the platform stages it — the runtime, the listing, and the
// vendor scope — with the bare dependency names resolving to the vendor
// bundles through fixture node_modules shims, the module-proxy and
// import-map analogue. Proof: the graph loads with nothing reaching an
// npm package (every bare name resolves inside the package scope) and
// operations execute through the vendored wasm kernel. The real-Chromium
// leg runs through the deployed stack's runtime browser smoke and stays
// blocked from this worktree.
//
// Runs as a plain node script (vitest's nested-worker channel mangles
// child-to-parent object payloads; a clean parent process carries them
// whole): node workers/cad-occt/runtime-worker-check.mjs — exit 0 with a
// summary line, exit 1 with the failure.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import listing from './listing.json' with { type: 'json' };

const pluginRoot = dirname(fileURLToPath(import.meta.url));

function materializePackage() {
  const fixture = resolve('/tmp/opencode', `cad-occt-package-${process.pid}-${Date.now()}`);
  cpSync(join(pluginRoot, 'runtime'), join(fixture, 'runtime'), { recursive: true });
  cpSync(join(pluginRoot, 'assets'), join(fixture, 'assets'), { recursive: true });
  writeFileSync(join(fixture, 'listing.json'), JSON.stringify(listing));

  // The platform's two resolution seams, one per target: the browser
  // module proxy rewrites a declared bare name to the plugin's vendor
  // scope; the managed Deno child maps it there. The shim mirrors both.
  const modules = join(fixture, 'node_modules');
  for (const [name, file] of [
    ['brepjs', 'assets/vendor/brepjs.mjs'],
    ['occt-wasm', 'assets/vendor/occt-wasm.mjs']
  ]) {
    const scope = join(modules, name);
    mkdirSync(scope, { recursive: true });
    writeFileSync(join(scope, 'package.json'), `${JSON.stringify({ name, type: 'module', main: 'index.mjs' }, null, 2)}\n`);
    writeFileSync(join(scope, 'index.mjs'), `export * from '../../${file}';\n`);
  }
  return fixture;
}

class PlatformPluginWorker {
  constructor(fixture) {
    // Node's worker_threads lack the browser worker globals; the shim
    // forwards parentPort messages onto the same self.onmessage contract
    // the browser worker speaks, then loads the real platform worker
    // module (the engine-demo spec's proven shape).
    const workerDir = join(fixture, 'worker');
    mkdirSync(workerDir, { recursive: true });
    cpSync(resolve(pluginRoot, '../../shared/plugin-runtime.js'), join(workerDir, 'plugin-runtime.js'));
    const source = readFileSync(resolve(pluginRoot, '../../composables/plugin-runtime.worker.js'), 'utf8')
      .replace("'#shared/plugin-runtime.js'", "'./plugin-runtime.js'");
    writeFileSync(join(workerDir, 'plugin-runtime.worker.mjs'), source);
    const shim = `
const { parentPort } = await import('node:worker_threads');
globalThis.self = {
  postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
  onmessage: null
};
parentPort.on('message', message => self.onmessage?.({ data: message }));
await import(${JSON.stringify(pathToFileURL(join(workerDir, 'plugin-runtime.worker.mjs')).href)});
`;
    const shimPath = join(workerDir, 'worker-shim.mjs');
    writeFileSync(shimPath, shim);

    this.fixture = fixture;
    this.worker = new Worker(shimPath, { execArgv: [] });
    this.pending = new Map();
    this.ready = new Promise((resolveReady, rejectReady) => {
      this.worker.on('message', message => this.route(message, { resolveReady, rejectReady }));
      this.worker.on('error', event => rejectReady(new Error(event?.message || 'Worker failed')));
    });
    this.worker.postMessage({ type: 'initialize', entryUrl: pathToFileURL(join(fixture, 'runtime/cad-occt.mjs')).href });
  }

  route(message, bootstrap) {
    if (message?.type === 'ready') {
      bootstrap.resolveReady(message.providers);
      return;
    }
    if (message?.type === 'runtime-error') {
      bootstrap.rejectReady(new Error(message.error?.message || 'Runtime failed to initialize'));
      this.drain();
      return;
    }
    const request = this.pending.get(message?.invocationId);
    if (!request) return;
    this.pending.delete(message.invocationId);
    if (message.type === 'result-error') request.reject(new Error(message.error?.message || 'Worker operation failed'));
    else if (message.type === 'result') request.resolve(message.value?.value ?? message.value);
  }

  drain() {
    for (const request of this.pending.values()) request.reject(new Error('Worker disposed'));
    this.pending.clear();
  }

  invoke(operationId, inputs) {
    const invocationId = `invoke-${operationId}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(invocationId, { resolve: resolvePromise, reject: rejectPromise });
      this.worker.postMessage({
        type: 'invoke',
        invocationId,
        operationId,
        input: { mode: 'preview', nodeId: `n-${operationId}`, inputs, config: {} }
      });
    });
  }

  async dispose() {
    this.drain();
    await this.worker.terminate();
    rmSync(this.fixture, { recursive: true, force: true });
  }
}

async function main() {
  const host = new PlatformPluginWorker(materializePackage());
  try {
    const providers = await host.ready;
    if (providers?.length !== 1 || providers[0]?.provider !== 'plugin.cad-occt') {
      throw new Error(`Unexpected provider contribution: ${JSON.stringify(providers?.map(item => item.provider))}`);
    }
    if (providers[0].definitions.length !== 13) {
      throw new Error(`Expected 13 node definitions, got ${providers[0].definitions.length}`);
    }

    const plate = await host.invoke('make-box', { width: 30, depth: 20, height: 10 });
    const tool = await host.invoke('make-cylinder', { radius: 4, height: 15, at: { x: 15, y: 10, z: -2 } });
    const drilled = await host.invoke('cut-shapes', { base: plate, tool });
    const mesh = await host.invoke('tessellate-shape', { shape: drilled });

    if (!plate?.brep || !drilled?.brep) throw new Error('Shape wire values carry no BREP form');
    if (mesh?.representation !== 'perigram.scene-3d') throw new Error(`Unexpected mesh value: ${mesh?.representation}`);
    if (!(mesh.faces.length > 100) || mesh.normals?.length !== mesh.vertices.length) {
      throw new Error(`Unexpected mesh density: ${mesh.faces.length} faces`);
    }
    console.log(`runtime-worker-check: platform worker booted the shipped graph; cut solid tessellated to ${mesh.faces.length} faces through the vendored occt kernel`);
  } finally {
    await host.dispose();
  }
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(error => {
    console.error(`runtime-worker-check: ${error?.message || error}`);
    process.exit(1);
  });
}
