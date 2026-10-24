# CONTAINER: Documents Plugin Executor

The documents domain as a third-party plugin (SPEC §Plugin marketplace):
the generic media/office file types (image, PDF, markdown, CSV, XLSX,
DOCX), their editor surfaces, the table projections, and the CSV
composition. The platform carries zero documents code: projections
compute here as pure payload decompositions, editors ship as the
plugin's surface modules, and the types ride the generic instance
machinery from the install snapshot.

- Listing: `workers/documents/listing.json` — types with
  service-resolved projections (`resolve: { service:
  'plugin.documents.<svc>' }` — endpoint mode), the four services,
  editor bindings, and the text-document starter construct (markdown
  stays visible-by-default through the default installs).
- Services (`services.js`, endpoint mode): `table-rows`/`table-cells`
  (payload → first sheet as header-keyed / positional row records),
  `text` (payload → string), `csv-text` (rows → CSV text, the wireable
  composition twin the process palette serves).
- Editor surfaces (contract 3 — the capability mount): the markdown
  editor (`surfaces/text-editor.mjs`, milkdown/crepe with every engine
  chrome disabled — remote saves reconcile through the host's
  record-change bridge) and the csv editor (`surfaces/csv-editor.mjs`,
  cell-edit DataTable). Mermaid fences preview as diagrams in the
  markdown editor through the host-provided `renderMarkdown` (the
  single pele home): blocks open diagram-only, crepe's Edit toggle or a
  click on the diagram flips to the CodeMirror source with the diagram
  kept live beside it, and fences that do not parse stay plain source
  blocks. The milkdown/codemirror families and xlsx are declared
  vendored dependencies — the split vendor build keeps one prosemirror
  class identity across the subpath bundles; rebuild with
  `perigram-plugin vendor --listing listing.json`. The crepe theme and
  the editor voice css are static assets under `assets/`, injected as
  links relative to the module URL. The theme css is built by the fence
  below — crepe's own theme files @import bare npm paths
  (`@milkdown/kit/...`) that no browser can resolve, so the served css
  is one esbuild bundle over the enabled features (Latex/AI/toolbar
  chrome stays off, keeping KaTeX's fonts out):

  ```
  C=node_modules/@milkdown/crepe/lib/theme/common
  printf '@import "%s/prosemirror.css";\n@import "%s/reset.css";\n@import "%s/table.css";\n@import "%s/code-mirror.css";\n@import "%s/list-item.css";\n@import "%s/image-block.css";\n' $C $C $C $C $C $C > /tmp/crepe-entry.css
  npx esbuild --bundle /tmp/crepe-entry.css --outfile=assets/vendor/crepe-theme.css
  ```

Runs from the repo mount (compose `documents-executor`, port 8791) —
nothing here imports platform code.

## Publish, install, migrate

- Deploy + seed: `node server/scripts/seed-plugin-catalog.js`;
  organizations install explicitly from the Plugins section.
- Existing orgs: `server/scripts/migrate-documents-pack-to-plugin.js`
  rewrites `documents.csvText` service nodes to
  `plugin.documents.csv-text` (type ids unchanged). Restart the app
  after — per-org declaration caches rebuild on boot.
- Upgrades apply through the
  [plugins feature](../../server/features/plugins/README.md)
  (diff preview plus migration steps).

Parent: [workers README](../README.md). Platform consumer:
[plugins feature](../../server/features/plugins/README.md).
