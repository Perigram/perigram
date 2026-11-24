# Server Maintenance Scripts

One-shot migrations, seeds, and repair helpers. Most migrations are dry-run
by default and persist only with `--apply` (or `APPLY=1` where noted).
Scripts run outside Nuxt resolution: import paths are filesystem-relative
or package aliases.

Parent: [server](../README.md).

## Seeds

The plugin-catalog seeder is `seed-plugin-catalog.js`: it publishes the
deployment's built-in listings from their `workers/<plugin>/listing.json`
sources into `plugin_catalog` (validated by the SDK contract, marked
`builtin`, retract-refused). Run it as a deploy step on fresh environments.
Idempotent; it first validates every listing and resolves every declared
JavaScript runtime entrypoint, engine entry, surface module, and
dependency vendor module plus their transitive, statically discoverable
relative imports and the engine's declared staged assets
(`prepareListingRelease` in `lib/plugin-runtime-assets.js`), then writes
the complete catalog
set. A missing runtime, surface, or dependency source therefore aborts
before any listing
is updated. The seed image must
include the full `workers/documents` and `workers/facade` source trees because
their runtime entrypoints import package-relative modules outside `runtime/`,
and both other built-in listing files. Re-running refreshes pinned versions
and uploads runtime assets into the catalog asset bucket. Keep runtime imports
literal and package-relative: first-party runtime entries refuse non-literal
dynamic imports (engine entry graphs stage by declaration, so their wheels may
import from staged bytes), and declared dependency bundles (vendored
third-party graphs) collect through the static relative-import walk alone.

The only other live seeder is `seed-palette-colors.js`: it upserts the
tech-drawing `color` type's system catalogue as SPEC §3 documents
(`organizationId: null` rows in the per-class `files` collection), by
`code`, never touching org shadow rows. Dry-run by default; `--apply`
persists.

## Migrations

| Script | When to run | What it does |
|---|---|---|
| `migrate-plugin-assets-to-organization-storage.js` | Adopting organization-owned plugin packages (SPEC §20) | Materializes every installed pin's exact catalog release into its organization-owned asset bucket, verifies the copied bytes against manifest digests and all declared entrypoints, then records the install marker. Idempotent; run from the updated app container after the organization-owned reader is deployed. A pin whose catalog release is absent is logged and skipped; a corrupt copy remains unmarked and fails deployment. |
| `migrate-documents-pack-to-plugin.js` | Adopting the documents plugin | Publishes the built-in listing, installs it per org as a platform-managed package (organization-owned assets materialize at install or through the storage migration), rewrites `documents.csvText` service nodes to `plugin.documents.csv-text`, and clears stale platform executor origins. A legacy pin or a pin whose package copy misses a declared entrypoint adopts the current release; a complete package keeps its pin. Idempotent; restart the app after. |
| `station-documents-types.js` | Repair | Stations the documents pack starter constructs into org processes as an additive ACTIVE definition through the real definition API. `--dry-run`; `--org <id> ...` limits scope. |
| `author-org-sheet-machine.js` | Nesting vocabulary repair | Defines the org `sheet` and `machine` types, adds the nesting attempt's `sheet`/`machine` relations, wires the attempt's dimensions and tool diameter into the nesting solve instead of manual prompts, keeps the solve action runnable after a run, projects every cassette design so entries may reference library designs, joins the entry's stored design id (`fields.design`, the construct scalarize law) to the projection's `designId`, and normalizes queue-entry rows (typed-ref designs and `{ value }` counts back to the stored spellings). Dry-run by default; `--org <id> --apply` persists through the definition API. |
| `retire-nesting-sheet-count.js` | Repair | Strips the retired `sheetCount` parameter from installed facade nesting-solve snapshots; sheet stock is evaluated from the items. Re-activate the organization's process definitions afterwards. Dry-run by default; `--org <id> --apply` persists. |
| `migrate-overlay-child-keys.js` | Repair | Rewrites stored overlay order entries carrying the retired `children:<lineageKey>` key to the unique `children:<lineageKey>:<typeId>` form (the section key grammar; the child type resolves from the parent's compiled detail screen). Idempotent; an unresolved edge keeps its stored entry (composition drops it and declared sections append). Dry-run by default; `--apply` persists. |
| `migrate-facade-pack-to-plugin.js` | Adopting the facade plugin | Publishes the built-in listing, installs it per org with the deployment's `FACADE_EXECUTOR_URL` as a platform-managed provider origin, and rewrites `nesting.solve` service nodes to `plugin.facade.nesting-solve`. Idempotent; restart the app after. |
| `migrate-facade-cassette-surface.js` | Adopting the Facade cassette clean-save surface | Publishes the built-in listing and moves v48–v50 installs to the current v51 pin, whose declaration layer is identical; organization package assets re-materialize from the catalog release. Older pins keep their snapshot for the explicit upgrade flow. Idempotent; restart the app after. |
| `migrate-nesting-browser-runtime.js` | Adopting the Nesting graph operation | Publishes the built-in listing and moves every existing Nesting install to its current pin, whose runtime and `nesting-solve` service declare browser and server execution. Idempotent; restart the app after. |
| `migrate-tech-drawing-pack-to-plugin.js` | Adopting the tech-drawing plugin | Publishes the built-in listing and installs it for every organization (type ids unchanged; the pack's code mount is gone). Idempotent; the install's surface origin refreshes. |
| `migrate-tech-drawing-instances.js` | Adopting the tech-drawing pack instance store | Moves legacy pen/layer-standard rows into §3 pack instances (ids preserved), carrying the `defaultPen` relation. Dry-run; `--apply` persists. |
| `migrate-profile-sketches-to-shapes.js` | Profile shape model | Rewrites stored profile library records and cassette payload documents into the shape model (chains become chain shapes, holes subtract circles, basis anchors become the axis; stale cached sections drop). Idempotent — shape-model sketches skip. Dry-run; `--apply` persists. |
| `migrate-profile-parameter-tables.js` | Two profile parameter tables | Moves each stored profile workpiece's instance table out of its authored sketch into `profileSnapshot.instance`, drops the retired `profileSnapshot.parameters` mirror and the workpiece-level `parameters`, and re-points the document definition's table at the instance values. Values an earlier dialog save folded into the authored table stay there. Idempotent. Dry-run; `--apply` persists. |
| `migrate-profile-ops-to-sequence.js` | Adopting the ordered CSG sequence | Resequences grouped-law profile sketches (adds in stored order, then subtracts, then construction) in profile records and cassette payload documents so stored profiles evaluate identically under authored sequence. Idempotent. Dry-run; `--apply` persists. |
| `migrate-instance-tenancy.js` | Adopting the SPEC §3 tenancy slot | Backfills top-level `organizationId` from `lineage.organizationId` and strips the legacy lineage key. Dry-run; `--apply` persists. |
| `migrate-llm-settings-profiles.js` | Adopting named model profiles | Rewrites the retired single-provider `data.settings.llm` shape into `{ profiles: { default: … }, routes: { chat: 'default' } }`; orgs already on profiles skip. Run once. |
| `migrate-cts-state-trees.js` | Adopting recursive state machines | One-way CTS declaration migration from flat state axes to recursive state trees. Dry-run; `--apply` persists. |
| `migrate-flat-state-vocabulary.js` | Adopting the flat state vocabulary | Strips `states`/`transitions` from stored declarations, rewrites persisted transition records, flattens instance `states: {main}` into one `state` string. Dry-run; `--apply` persists. |
| `backfill-state-changed-at.js` | Adopting the deadline clock | Stamps `stateChangedAt` (last status event, else `updatedAt`) on flat instance docs that predate the slot. Dry-run; `--apply` persists. |
| `backfill-instance-revisions.js` | Adopting per-instance data revisions | Assigns baseline revision `1` to typed per-class instances whose revision token is absent or invalid. Dry-run; `--apply` persists. Production deployment runs it after the updated app starts. |
| `backfill-cassette-design-names.js` | Adopting construction-derived design names | Names stored cassette designs from their template and parameter values, their imported DXF file name, or their baked bounds. `--replace-placeholders` also replaces single-character and punctuation-only names. Idempotent. Dry-run; `--apply` persists. |
| `migrate-sheet-designs-to-instances.js` | Adopting the §13 sheet-design store | Moves `sheet_designs` block documents into the per-class `files` collection as §3 documents (ids preserved) and removes the legacy rows; specs/summary re-derive on the next layout update. Supports `--dry-run`. |
| `migrate-sheet-preview-pens.js` | Repair | Rebakes stored sheet-design geometry previews with the layer standards' pens verbatim. Idempotent. |
| `migrate-sheet-material-in-tree.js` | Adopting in-tree-only sheet-material vocabulary | Converts the stored definition's registry typeRef into an in-tree class with its fields, strips the id from org declarations' children edges, deletes the org-registry declarations, and deletes rejected seed definitions that reference the id with no authored tree. Dry-run; `--apply` persists. |
| `purge-dead-definition-gestures.js` | Removing dead authoring gestures | Deletes construct records whose only graph edges are binds wires (dropped, type-bound, never wired) and typeRefs that bind only those constructs — record, canvas node, and binds edges. Dry-run; `--apply` persists. |
| `migrate-process-state-declarations.js` | Adopting state-parent derivation | Derives stable state parent ids and axes from declaration edges in stored process drafts/actives. Dry-run; `--apply` persists. |
| `migrate-process-definitions-typeid.js` | Adopting the typeId vocabulary | Rewrites legacy `entityType`-family keys and templates into `typeId`-vocabulary equivalents in stored process definitions. `APPLY=1` writes. |
| `migrate-process-legacy-bridges.js` | One-time legacy bridge cleanup | Removes retired legacy bridge records from stored process definitions. |
| `migrate-v4-drafts-native.js` | Retiring the v4 execution tier | Rewrites stored drafts' retired executable kinds to the current species per the SPEC §14 kind table (dry-run default, `--apply` persists); records with no faithful mapping are reported for re-authoring. |
| `retire-process-runs.js` | Retiring durable process runs | Drops the retired `execution_*` collections; `command_runs` and `task_runs` remain the audit trail. Run once. |
| `migrate-process-definition-draft-names.js` | Repair | Collapses repeated trailing `draft` suffixes in process names. `APPLY=1` writes. |
| `migrate-process-role-memberships.js` | Role membership moves | Migrates role membership data to the current contract. |
| `migrate-process-transition-role-access.js` | Separating process-role transition authority | Removes compiled workflow `access.permissions` from transitions that already carry `processRoleIds`. Dry-run; `--apply` persists. |
| `migrate-retire-custom-bots.js` | Adopting the organization AI over created bots | Deletes custom bot members with their subscriptions, role assignments, and group participants; strips the retired `tokenHash`/`profile` marker fields from the remaining bots; removes subscription rows of removed group rooms. Run once. |
| `migrate-organization-owner-admins.js` | Tenant safety | Marks one active membership per organization as `owner: true` and materializes permanent org/user admin recovery grants. Idempotent. |
| `migrate-legacy-owner-memberships.js` | Owner recovery single read | Flags every active membership carrying the legacy dual-admin permission shape (`organizations:admin` + `users:admin`, no `owner` flag) as `owner: true`; permissions are left untouched. Idempotent. |
| `migrate-call-channels-to-groups.js` | Adopting unified support groups | Migrates the retired livekit `call_channels` collection into support `chat_groups` and drops it. Dry-run; `--apply` persists. |
| `migrate-cutkit-extensions-to-perigram.js` | CutKit → Perigram rename | Renames persisted `extensions.cutkit` authoring keys to `extensions.perigram` at any document depth in every non-system collection, and inside GridFS file contents (JSON documents rewritten under their original id; binary files are skipped). Supports `--dry-run`. |
| `migrate-support-attachments.js` | Adopting multi-attachment chat messages | Rewrites each `supportMessages` document's singular `attachment` object into the `attachments` array contract, stamping `bucket: 'uploads'` so legacy voice/recording blobs keep resolving after new uploads moved to the `files` bucket. Dry-run; `--apply` persists. |
| `migrate-support-transcripts.js` | Adopting private per-user transcripts | Rewrites each legacy public transcript (text in the message body plus the descriptor's `transcription` marker) into per-viewer `supportTranscripts` documents for the message's participants, clearing the body and marker. Dry-run; `--apply` persists. |
| `migrate-instance-revisions-source-keys.js` | Adopting the `data.source` revision keys | Rewrites stored `entity_revisions` documents carrying legacy `data.typeId`/`data.instanceId` onto `data.source.{type,id}` and drops the legacy keys. Idempotent. Dry-run; `--apply` persists. |
| `migrate-lifecycle-status-vocabulary.js` | Adopting explicit lifecycle states | Backfills invitation `status` from `isActive`/`usedAt`/`revokedAt` and drops the flag; collapses duplicate active workflow overrides and archives `DRAFT` rows; backfills upload-session statuses and process-definition migration axes; backfills legacy membership status as `active`; removes rejected memberships with their organization role assignments; strips the retired account `isActive` flag. Idempotent. Dry-run; `--apply` persists. |
| `migrate-process-event-status.js` | Adopting explicit process-event delivery states | Backfills `status` (`pending` or `dispatched`), `attempts`, and `lastError` on stored `process_events` rows. Idempotent. Dry-run; `--apply` persists. |
| `migrate-artifact-family-retirement.js` | Retiring the artifact family | Strips the retired `attachmentKinds`/`conversions` grammar from plugin catalog listings and install snapshots, rewrites export kinds to the declared vocabulary (`LAYOUT_DXF` → `dxf`), drops the `artifacts`/`artifact_templates` collections with their revisions, status history, workflow overrides, GridFS buckets, and artifact-linked chat refs. Idempotent. Dry-run; `--apply` persists. |

## Related

- [scripts/README.md](../../scripts/README.md) — root guard/tooling scripts.
- [server/features/instances/README.md](../features/instances/README.md) — the §3 instance store migrations target.
