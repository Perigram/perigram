// Browser-runtime layer check (TESTING layer 3) — vitest wrapper: the
// harness itself runs as a plain node process (runtime-worker-check.mjs)
// because vitest's nested-worker channel mangles child-to-parent object
// payloads; a clean parent process carries the protocol whole. The check
// materializes the shipped package, boots it through the platform's real
// plugin Worker, and executes primitive → boolean → tessellate through
// the vendored wasm kernel. The real-Chromium leg stays blocked from this
// worktree.
import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const pluginRoot = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

describe('cad-occt shipped module graph in a Worker thread', () => {
  it('boots through the platform plugin Worker and executes primitive → boolean → tessellate through the vendored kernel', async () => {
    const { stdout } = await run(process.execPath, [resolve(pluginRoot, 'runtime-worker-check.mjs')], {
      cwd: pluginRoot,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024
    });
    expect(stdout).toMatch(/runtime-worker-check: platform worker booted the shipped graph; cut solid tessellated to \d+ faces/);
  }, 150_000);
});
