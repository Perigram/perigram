# CONTAINER: Documents Plugin Executor

The documents domain as a third-party plugin (SPEC §Plugin marketplace,
owner decision 2026-10-17 — the last mounted pack retired into this
listing): the generic media/office file types (image, PDF, markdown,
CSV, XLSX, DOCX), their editor surfaces, the table projections, and the
CSV composition. The platform carries zero documents code: projections
compute here as pure payload decompositions, editors ship as the
plugin's surface modules, and the types ride the generic instance
machinery from the install snapshot.

- Listing: `workers/documents/listing.json` — types with
  service-resolved projections (`resolve: { service:
  'plugin.documents.<svc>' }` — endpoint mode, the DXF-extraction
  precedent), the four services, editor bindings, and the
  text-document starter construct (markdown stays visible-by-default
  through the default installs).
- Services (`services.js`, endpoint mode): `table-rows`/`table-cells`
  (payload → first sheet as header-keyed / positional row records),
  `text` (payload → string), `csv-text` (rows → CSV text, the wireable
  composition twin the process palette serves).
- Editor surfaces (contract 3 — the capability mount): the markdown
  editor (`surfaces/text-editor.mjs`, milkdown/crepe with every engine
  chrome disabled — remote saves reconcile through the host's
  record-change bridge) and the csv editor (`surfaces/csv-editor.mjs`,
  cell-edit DataTable). The milkdown/codemirror families and xlsx are
  declared vendored dependencies — the split vendor build keeps one
  prosemirror class identity across the subpath bundles; rebuild with
  `perigram-plugin vendor --listing listing.json`. The crepe theme and
  the editor voice css are static assets under `assets/`, injected as
  links relative to the module URL. The theme css is BUILT, never
  hand-copied — crepe's own theme files @import bare npm paths
  (`@milkdown/kit/...`) that no browser can resolve, so the served css
  must be one esbuild-bundled file over the enabled features (prosemirror,
  reset, table, code-mirror, list-item, image-block — Latex/AI/toolbar
  chrome stay off, keeping KaTeX's fonts out):

  ```
  C=node_modules/@milkdown/crepe/lib/theme/common
  printf '@import "%s/prosemirror.css";\n@import "%s/reset.css";\n@import "%s/table.css";\n@import "%s/code-mirror.css";\n@import "%s/list-item.css";\n@import "%s/image-block.css";\n' $C $C $C $C $C $C > /tmp/crepe-entry.css
  npx esbuild --bundle /tmp/crepe-entry.css --outfile=assets/vendor/crepe-theme.css
  ```

Runs from the repo mount (compose `documents-executor`, port 8791) —
nothing here imports platform code.

## Publish, install, migrate

- Deploy + seed: `node server/scripts/seed-plugin-catalog.js`; new
  organizations install by default (`organizations/default-plugins.js`,
  endpoints pre-wired from `DOCUMENTS_EXECUTOR_URL`).
- Existing orgs: `server/scripts/migrate-documents-pack-to-plugin.js`
  installs the listing per organization and rewrites stored process
  definitions' `documents.csvText` service nodes to
  `plugin.documents.csv-text` (type ids unchanged; the pack's code mount
  is gone, so no disablement is written). Restart the app after —
  per-org declaration caches rebuild on boot.
- Deploys bump `version` and re-publish — installed organizations then
  see the available-version tag and upgrade through the Plugins page.

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
