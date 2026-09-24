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

  ### Agent Notes (2026-09-24)

  Engine loop verified live against a throwaway org type: the breaking
  retype is refused with the plan payload (`error.data.data.plan`,
  `changes[].severity/kind`) the steps dialog consumes; declaring the
  `migrate: [{ kind: 'retype-field', field, via: <CEL AST> }]` step on
  the next declaration is accepted and the stored instance reads back
  migrated. The designer dialog → declare → retry walk is still
  unconfirmed in a browser session.

## CTS Type system

- [ ] Types hierarchy isn't preserved correctly, either on compile or in contract generator. I don't
  see actual correct types/instances nesting, I rather see a mess in an app. (instances don't seem to
  accumulate child instances, or current UI doesn't respect it, idk)

  ### Agent Notes (2026-09-24)

  Verified in the browser: a parent detail's child region lists only the
  parent's children (client-side scope filter over the loaded pool), and
  children created from the parent detail now preselect the parent in the
  create dialog's lineage picker, so created children stamp their lineage
  and accumulate in the region. Unparented children were the actual bug.
  Child rows still read "Unnamed" when the child type declares no
  identifier field — a declaration gap, not a nesting defect.

## Open questions from the crystallization conversations (2026-09-23)

> NOTHING below is decided. Candidate designs were discussed and rejected or left
> unaccepted — do not treat any prior proposal (field roles, type-level identifier
> pointer, render.title/render.* facets, semantic-fact lists, tier/precedence
> models, "mechanism" framings) as agreed. These are open questions, stated bare.

- [ ] Where does a record's display title in generated UI come from once the
  hardcoded name-fallback lists (`name→slug→uid` and its component-level twins)
  are deleted? Requirements raised: derived from paper; no hardcoded field-name
  lists in code; one home per fact. UNRESOLVED.
- [ ] Is there a layer that allows tweaking render contracts in paper — without
  slop (vocabulary that grows per UI aspect) and without hardcoding? Only point
  actually agreed: no paper key may be named after a screen element. Everything
  else — homes, mechanism, authoring surface — UNRESOLVED.
- [ ] What exactly belongs in a type declaration vs a screen/station record vs
  code, for display concerns (title, field groups, icons, preview)? Note:
  `render.groups` currently lives ON type declarations (phase 6) — correct home
  or misfiled? UNRESOLVED.
- [ ] Type glyph / record thumbnail / payload preview: two hardcoded icon
  registries exist today (utils/README warns to "keep them in sync"). Where
  should this live and how is it declared? UNRESOLVED.
- [ ] If several types ever need a SHARED lifecycle vocabulary (same state names,
  same meaning — states are type-scoped homonyms by design), where does it live?
  Nothing built; open until a real need appears.
- [ ] A process with zero inferred stations has no screen-creation entry at all
  (delta-only authoring), and one authored screen suppresses BOTH the inferred
  list and detail station for its role+feature. Both acceptable? UNRESOLVED.
- [ ] Phase 7 (tracked in TODO-crystallization.md): artifact entity vs file-type
  instances; `status` block vs `states.main` — the dual worlds. Open.
- [ ] Phase 8 (tracked in TODO-crystallization.md): export/import org
  declarations as diffable pack; whether pack substrate should become authored
  data instead of code. Open.
- [ ] Phase 4 remainder (tracked in TODO-crystallization.md): empty inspector
  sections; palette discoverability for unbindable entries. Open.
- [ ] Pre-existing failing spec (parallel sessions, unfixed):
  `packages/domain-cnc/src/relationships.spec.js` — 2 failures.



