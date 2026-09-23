# TODO

## Process Designer nodes

- [ ] Nodes in node editor follow several completely different UI conventions. Need to unify (aligned with latted cts
  type, keep socket visual contract)
- [ ] Inline editing looks awful as today. 
- [ ] Need some sugar or UX-level adoption, and some fixes, actually:
  - [ ] Probably "instant" should be recorded when it's instance's field is initiated? 
  - [ ] And, need a literal that bears current time, to display things like "5 days left"? 
  - [ ] And, need to REMOVE FUCKING BOWELS FROM UI! I don't want to ever see stuff like "Child: Field name Instant must be lowerCamelCase". Field name is public, for user plane, and field ID can be named as you want, any fucking case, but better short UUID. 
- [ ] Migrations don't work currently. See many errors (Child: breaking change to Child (t-uth93vgdab) without a covering declared migration (retype-field anythin requires a retype-field step)), non-actionable popups, etc.

## CTS Type system

- [ ] Types hierarchy isn't preserved correctly, either on compile or in contract generator. I don't
  see actual correct types/instances nesting, I rather see a mess in an app. (instances don't seem
  to accumulate child instances, or current UI doesn't respect it, idk)

## Decided 2026-09-23 (render contract session)

The `render` facet is DELETED from the type grammar. Naming is vocabulary,
not rendering; arrangement is derived or station-side; summary content is
computed data (process nodes / aggregates), not curated field lists; nothing
anywhere is keyed by type name.

- [x] CTS grammar: top-level `name` on types (the only user-plane Landed ffcdd9d7/6682fff9 (merged ffd09741).
  identifier); field dictionary keys `label`, `display`; closed field flags
  `identifier: true` (exactly one per type, zero legal — records then title
  "Unnamed") and `depiction: true` (at most one). `render` facet and its
  keys (identityField, label, icon, listLayout, sortKey, groups; descriptor
  `surfaces`/`priority`) removed.
- [x] Compile derives display policy (`renderPolicyFor` shrinks): glyph by Landed ffcdd9d7; sections derive by field base, states display on states facet.
  class with top-level override, preview from payload traits, sections
  derived from field bases (quantities→dimensions, refs→relations,
  strings/enums→summary, long text→notes); per-state label/severity/icon
  moves to the states facet.
- [x] Opaque-id law: no `startCase(id)` fallbacks anywhere (cts render.js, Landed: bundle serves name/labels; boundary adoption for stored declarations; org without name renders Unnamed.
  ui-mapping fieldLabel); org authoring captures name/label at design time;
  absence renders "Unnamed", never an id; no case validation in user plane.
- [x] Groups die everywhere: legacy `cncInstanceFieldGroups`, Landed fd6b98c1: legacy tables deleted (artifactTemplate master-data rows only survivor, documented), per-key overrides and rename maps gone.
  `cncInstanceSurfaceContracts`, `INSTANCE_KEY_BY_TYPE`, per-key
  `synthesizedGroups` overrides (queue/catalog/geometryCapture/warehouse/
  nestingRun), `PREFERRED_IDENTITY_KEYS`.
- [x] One resolver per fact: `titleFor` / `iconFor` / `factsFor`; delete Landed fd6b98c1: titleFor/iconFor in shared/ui-mapping, factsFor in instance-display-contract; three identity resolvers, PREFERRED_IDENTITY_KEYS, INSTANCE_UI dead.
  `instanceIdentity`, `instanceIdentityLabel`, compiled IDENTITY_POLICY,
  `INSTANCE_UI`, `generated-labels` fallbacks.
- [x] Bundle consumers change in the SAME cut (bundle is a contract, not a Landed ffd09741+fd6b98c1.
  cache): ui-mapping, instance-display-contract, generated components.
- [x] Packs updated (framework, cnc, tech-drawing, documents): `name`, Landed ffcdd9d7.
  field labels/flags, groups deleted; stored org declarations
  adopt-and-delete at load.
- [x] Editor bindings stay as the binding/registry/join shape; add guards: Landed 7c31cac1: validateEditorBindings (unknown/duplicate), non-file class guard at composePackEditors, served editor list default.
  unknown surface id, duplicate binding, non-file class binding, and
  consume the served editor list instead of app-side pack recomposition.
- [x] Docs first: SPEC §4/§7 + cts README in the same `neo:` commit. Landed 6682fff9 + consumer READMEs d76d5b42/5bdbc487.

## Decided 2026-09-23 (screen inference edges)

- [x] Zero inferred stations → no creation entry: KEEP (delta-only law); Landed cbe9a641/7ca105b7: empty state + roles-tab pointer, no create verb.
  Screens tab gets an explanatory empty state pointing at grants. The
  create verb does not return.
- [x] One authored screen suppressing BOTH inferred list and detail for its Landed cbe9a641: suppression per station kind; non-station templates keep both-suppress (legacy pinned).
  role+feature is a BUG: suppress per station kind
  (`roleId:typeId:templateKind`) in `inferScreensFromRoleGrants`
  existingKeys (compiler-core.js).

## Open questions

- [ ] States vs entity-era statuses: type states carry grammar + display,
  but per-state evidence (description/attachments/snapshots), location
  facts (`status.lifecycle.data.location`), and transition notes still live
  in process `stateDefinition` records / legacy status-block shapes — two
  homes for per-state facts. Consolidate in phase 7's stamp-vocabulary cut?
- [ ] Shared lifecycle vocabulary across types: wait for a real need;
  generalizing the `archivable` class facet is the first candidate shape.
- [ ] Phase 7 (tracked in TODO-crystallization.md): artifact entity vs
  file-type instances; `status` block vs `states.main`. Sequencing agreed:
  stamp vocabulary first, then artifact migration by flow
  (uploads→proofs→chat); `generateAttachment`/`convertArtifact` declared as
  conversions; cut the overload, no bridges.
- [ ] Phase 8 (tracked in TODO-crystallization.md): substrate decision
  agreed — pack declaration payload becomes seeded data (same format as
  org exports; serves OUT-GAP-IN), pack mount (services) stays code. After
  phase 7. Byte-stable round-trip needs canonical serialization + opaque
  ids + idempotent normalize-at-boundary.
- [ ] Phase 4 remainder (tracked in TODO-crystallization.md): empty
  inspector sections; palette discoverability (greyed + one-line unlock).
- [ ] Designer authoring slice owed by the render cut: name/identifier/
  depiction authoring in the inspector (replaces the obsolete
  `render.groups` authoring UI stop-line).
- [ ] `specs.*` legacy field-access keys: die at the §3 stored-shape cut;
  do not grow the alias mechanism.
- [x] Pre-existing failing spec `packages/domain-cnc/src/relationships.spec.js` Landed f6ccff0e: tables trimmed to surviving types; spec committed green.
  (2 failures): root cause verified — 7a12e840 removed entity rows but
  `cncContainment`/`cncRelations` still reference them. Fix: trim tables to
  surviving types or delete tables + spec together.



