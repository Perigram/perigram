# Server Maintenance Scripts

One-shot migrations, seeds, and repair helpers. Most migrations are dry-run
by default and persist only with `--apply` (or `APPLY=1` where noted).
Scripts run outside Nuxt resolution: import paths are filesystem-relative
or package aliases.

## Seeds

The plugin-catalog seeder is `seed-plugin-catalog.js`: it publishes the
deployment's built-in listings from their `workers/<plugin>/listing.json`
sources into `plugin_catalog` (validated by the SDK contract, marked
`builtin`, retract-refused). Run it as a deploy step on fresh environments
— `installDefaultPlugins` logs loudly when a default plugin is missing
from the catalog. Idempotent; re-running refreshes the pinned versions.

The only other live seeder is `seed-palette-colors.js`: it upserts the
tech-drawing `color` type's system catalogue as SPEC §3 documents
(`organizationId: null` rows in the per-class `files` collection), by
`code`, never touching org shadow rows. Dry-run by default; `--apply`
persists.

The legacy v24 seed cluster (system pens, layer standards, tools,
machines, `seed-all`, the OCCS layer registry, `assign-default-pens`) is
deleted: those features wrote legacy collections the runtime no longer
reads. Tech-drawing catalogue instances migrate into §3 documents through
`migrate-tech-drawing-instances.js`.

## Migrations

| Script | When to run | What it does |
|---|---|---|
| `migrate-tech-drawing-pack-to-plugin.js` | Adopting the tech-drawing plugin | Publishes the built-in listing and installs it for every organization (type ids unchanged; the pack's code mount is gone). Idempotent. |
| `migrate-tech-drawing-instances.js` | Adopting the tech-drawing pack instance store | Moves legacy pen/layer-standard rows into §3 pack instances (ids preserved), carrying the `defaultPen` relation. Dry-run; `--apply` persists. |
| `migrate-cassette-instances.js` | Adopting the §13 cassette store | Moves legacy `cassettes`-collection documents into the per-class `files` collection (ids preserved); inline OCCS definitions upload to the payload bucket. The legacy collection is left for the operator to drop. Dry-run; `--apply` persists. |
| `migrate-instance-tenancy.js` | Adopting the SPEC §3 tenancy slot | Backfills top-level `organizationId` from `lineage.organizationId` and strips the legacy lineage key. Dry-run; `--apply` persists. |
| `migrate-instance-revisions.js` | Adopting geometry revisions | Creates or reuses `entity_revisions` records for cassette templates' current geometry scope and writes `data.revisions.geometry` pointers back. |
| `migrate-artifact-file-revisions.js` | Adopting retained artifact file revisions | Backfills artifact current-file revisions and scoped pointers. Dry-run; `--apply` persists. |
| `migrate-artifact-sources.js` | Adopting artifact source refs | Backfills source relations for existing artifacts and cassette upload records so file provenance flows through canonical entity refs. |
| `migrate-cts-state-trees.js` | Adopting recursive state machines | One-way CTS declaration migration from flat state axes to recursive state trees. Dry-run; `--apply` persists. |
| `migrate-flat-state-vocabulary.js` | Adopting the flat state vocabulary | Strips `states`/`transitions` from stored declarations, rewrites persisted transition records, flattens instance `states: {main}` into one `state` string. Dry-run; `--apply` persists. |
| `backfill-state-changed-at.js` | Adopting the deadline clock | Stamps `stateChangedAt` (last status event, else `updatedAt`) on flat instance docs that predate the slot. Dry-run; `--apply` persists. |
| `migrate-sheet-material-in-tree.js` | Adopting in-tree-only sheet-material vocabulary | Converts the stored definition's registry typeRef into an in-tree class with its fields, strips the id from org declarations' children edges, deletes the org-registry declarations, and deletes rejected seed definitions that reference the id with no authored tree. Dry-run; `--apply` persists. |
| `purge-dead-definition-gestures.js` | Removing dead authoring gestures | Deletes construct records whose only graph edges are binds wires (dropped, type-bound, never wired) and typeRefs that bind only those constructs — record, canvas node, and binds edges. Dry-run; `--apply` persists. |
| `migrate-process-state-declarations.js` | Adopting state-parent derivation | Derives stable state parent ids and axes from declaration edges in stored process drafts/actives. Dry-run; `--apply` persists. |
| `migrate-process-definitions-typeid.js` | Adopting the typeId vocabulary | Rewrites legacy `entityType`-family keys and templates into `typeId`-vocabulary equivalents in stored process definitions. `APPLY=1` writes. |
| `migrate-process-legacy-bridges.js` | One-time legacy bridge cleanup | Removes retired legacy bridge records from stored process definitions. |
| `migrate-v4-drafts-native.js` | Retiring the v4 execution tier | Rewrites stored drafts' retired executable kinds to the current species per the SPEC §20 kind table (dry-run default, `--apply` persists); records with no faithful mapping are reported for re-authoring. |
| `migrate-process-definition-draft-names.js` | Repair | Collapses repeated trailing `draft` suffixes in process names. `APPLY=1` writes. |
| `migrate-process-role-memberships.js` | Role membership moves | Migrates role membership data to the current contract. |
| `migrate-process-transition-role-access.js` | Separating process-role transition authority | Removes compiled workflow `access.permissions` from transitions that already carry `processRoleIds`. Dry-run; `--apply` persists. |
| `migrate-organization-owner-admins.js` | Tenant safety | Marks one active membership per organization as `owner: true` and materializes permanent org/user admin recovery grants. Idempotent. |
| `migrate-call-channels-to-groups.js` | Adopting unified support groups | Migrates the retired livekit `call_channels` collection into support `chat_groups` and drops it. Dry-run; `--apply` persists. |
| `migrate-cutkit-extensions-to-perigram.js` | CutKit → Perigram rename | Renames persisted `extensions.cutkit` authoring keys to `extensions.perigram` at any document depth in every non-system collection, and inside GridFS file contents (JSON documents rewritten under their original id; binary files are skipped). Supports `--dry-run`. |
| `migrate-support-attachments.js` | Adopting multi-attachment chat messages | Rewrites each `supportMessages` document's singular `attachment` object into the `attachments` array contract, stamping `bucket: 'uploads'` so legacy voice/recording blobs keep resolving after new uploads moved to the `files` bucket. Dry-run; `--apply` persists. |
| `migrate-support-transcripts.js` | Adopting private per-user transcripts | Rewrites each legacy public transcript (text in the message body plus the descriptor's `transcription` marker) into per-viewer `supportTranscripts` documents for the message's participants, clearing the body and marker. Dry-run; `--apply` persists. |

## Retired

The queue-era migration set (nesting provenance, queue nesting contracts,
sheet-design compositions, entity-reference contracts, process producer
identities, update actions, strip-status provenance, command output
statuses, public-system-data marking, profile-template fillets, batch
renames) is deleted: their concerns died with the legacy domain, and the
orphaned specs went with them. The framework manifest
(`npm run framework:manifest`) is the guard that keeps the surviving
contract surface honest.

## Related

- [scripts/README.md](../../scripts/README.md) — root guard/tooling scripts.
- [server/features/instances/README.md](../features/instances/README.md) — the §3 instance store migrations target.
