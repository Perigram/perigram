# Vendored three.js runtime

The folded-preview surface module's 3D viewport runs on a vendored
three.js build (from the app's pinned `three` dependency) so the plugin
serves its own rendering runtime — the browser module resolves it by
relative URL against the executor's static tree. `OrbitControls.js` is
rewritten to import the sibling `three.module.js` instead of the bare
`three` specifier. App-side `three` consumers (the read-side preview
family) keep the npm package until that family migrates; this copy tracks
the app's version on re-vendor.
