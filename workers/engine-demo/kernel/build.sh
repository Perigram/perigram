#!/bin/sh
# Rebuild the demo engine's WASM kernel and runtime manifest in place.
set -e
cd "$(dirname "$0")/.."
rustc --target wasm32-unknown-unknown --crate-type=cdylib \
  -C opt-level=z -C strip=symbols \
  -o runtime/kernel.wasm kernel/lib.rs
node --input-type=module -e '
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
const digest = path => `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
const manifest = {
  assets: [
    { path: "/runtime/kernel.wasm", sha256: digest("runtime/kernel.wasm") },
    { path: "/runtime/ops-shapes.mjs", sha256: digest("runtime/ops-shapes.mjs") }
  ]
};
writeFileSync("runtime/manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
'
echo "runtime/kernel.wasm and runtime/manifest.json rebuilt"
