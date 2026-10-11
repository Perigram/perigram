# Clipper2 Vendor Runtime

`clipper2z.js` and `clipper2z.wasm` are copied from
`clipper2-wasm@0.4.0/dist/es`.

Cassette Designer v2 loads these files as static public assets so Vite does not
need to resolve `clipper2-wasm` package imports during browser import analysis.
Keep the JavaScript and WASM files on the same upstream version.
