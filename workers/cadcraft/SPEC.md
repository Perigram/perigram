# SPEC: CadCraft shared 2D CAD plugin

```yaml
doc_id: CADCRAFT-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-11-26
updated: 2026-11-26
```

## Purpose and ownership

CadCraft is an independently installable plugin that owns Perigram's
shared interactive 2D CAD runtime and editor integration. It packages
and serves the pinned upstream CadCraft browser edition
(getcadcraft/cadcraft, Apache-2.0), the Perigram embedding host, the
public host contract, and the standalone general-purpose CAD editor.

CadCraft is a reusable editor capability, not a fabrication or technical
drawing domain. Its consumers use the public host contract through the
platform's existing plugin dependency/module proxy. It is not owned by
Tech Drawing, Facade, or the platform app, and must not be copied into
consumer plugin assets.

The cross-plugin ownership rule is recorded briefly in the root
`SPEC.md`. This file owns CadCraft's plugin responsibilities and
acceptance contract. Consumer-specific migration and domain semantics
belong in their owning plugin specs, especially
[Facade SPEC](../facade/SPEC.md).

## Dependency direction and installation

- `cadcraft` has no dependency on Facade, Tech Drawing, or other
  domain plugins.
- `tech-drawing` declares CadCraft as a direct dependency because its
  DXF editor and CAD-backed workflows consume the host.
- `facade` declares CadCraft as a direct dependency because both its
  cassette/profile designer and sheet-design editor consume the host.
  A transitive dependency through Tech Drawing is not sufficient.
- Other consumers declare CadCraft directly whenever their own modules
  import or mount its public API.
- Consumers import only versioned public modules served by the installed
  CadCraft plugin, using the existing `plugin:<id><path>` module
  dependency syntax and declared plugin dependency. No filesystem
  reach-through, private vendor path, copied runtime, global singleton,
  or alternate plugin-to-plugin import mechanism is permitted.

The platform plugin dependency resolver remains responsible for
installation ordering, version compatibility, install snapshots,
upgrade planning, and preventing removal while required dependents
remain installed. CadCraft does not implement its own dependency
manager. The exact dependency declaration fields and module paths must
follow the current plugin listing schema; this SPEC does not invent a
parallel manifest format.

## What CadCraft owns

CadCraft owns:

- The pinned upstream browser distribution, assets, provenance,
  Apache-2.0 license notices, and reproducible update/build procedure.
- One canonical Perigram embedding host and its iframe/runtime transport.
- The versioned public host API and its compatibility tests.
- Generic CAD document lifecycle and the standalone editor surface.
- Generic CAD interaction exposed by the upstream engine: camera and
  navigation, entity creation/editing/deletion, selection and hit
  testing, drafting tools, snapping, ortho, generic layers, dimensions
  and annotations, transactions and native undo/redo where supported.
- Translation between the public Perigram host API and the upstream
  CadCraft runtime.
- Capability negotiation and explicit reporting of unsupported
  upstream or host features.
- CAD-specific editor composition: canvas, CAD tool palette,
  properties/inspector, layer controls and drafting affordances.

CadCraft does not own:

- The platform's canonical geometry types, units, coordinate
  conventions, geometry serialization, file storage, access control,
  plugin lifecycle, or generic workspace shell.
- Format parsing/writing merely because the editor can display a format.
  Format adapters retain their existing format/plugin ownership.
- Facade's cassette, sheet, placement, fabrication, nesting, clearance,
  cut-plan or production semantics.
- Tech Drawing's drawing standards, templates, marker/spot vocabulary,
  or technical-drawing workflows.
- A second geometry kernel or a general-purpose geometry algorithm
  library that belongs in the geometry architecture.

## Public embedding host contract

The host is the only supported Perigram integration point. It hides
upstream implementation details, iframe mechanics, message transport,
and asset paths from consumers. The public API is versioned and must
negotiate capabilities explicitly.

At minimum, the contract covers:

1. **Lifecycle:** mount, configure, resize, suspend/resume, readiness,
   error reporting, cancellation, and deterministic disposal.
2. **Document:** create/open, seed, replace, serialize, inspect dirty
   state, and hand off import/export requests.
3. **Entities:** create, update, delete, enumerate, and resolve stable
   entity identities without exposing private engine internals.
4. **Selection:** select, clear, query, subscribe to changes, and
   perform hit testing in document coordinates.
5. **View:** camera state, fit-to-content, zoom, pan, and conversion
   between screen, canvas and document coordinates.
6. **Layers:** list, create, rename, reorder, show/hide, lock/unlock,
   and style layers to the extent supported by the engine.
7. **Drafting:** configure snapping, ortho and construction aids; expose
   native drawing commands and supported dimensions/annotations.
8. **Transactions:** begin/commit/rollback, undo/redo, and change
   notifications with clear transaction boundaries.
9. **Modes:** read-only mode and capability-aware command availability.
10. **Host integration:** theme/font configuration, authorized file
    hand-off, focus/keyboard ownership, and safe cleanup.

The API must distinguish upstream-native capabilities, Perigram host
capabilities, and capabilities supplied by format adapters. Unsupported
features are explicit; consumers must not silently recreate them using
parallel renderers or undocumented upstream APIs. API compatibility is
tested against the pinned upstream version and every supported consumer.

The host is not a persistence or authorization bypass. Saving, file
access, and record mutations continue through existing platform and
consumer-owned authorized boundaries. No surface receives direct
database access through CadCraft.

## Standalone CAD editor

CadCraft supplies a usable generic 2D CAD editor that works when
CadCraft alone is installed. It must not require Facade or Tech Drawing.

The editor supports:

- Creating and opening a generic drawing document.
- A native CAD canvas with camera/navigation controls.
- Generic entity selection, editing, deletion and contextual properties.
- The generic drawing commands supported by the pinned engine.
- Layer management and layer-aware visibility/locking.
- Supported snapping, ortho and drafting aids.
- Supported dimensions and annotations.
- Undo/redo, dirty state, and explicit save/close behavior.
- Import/export hand-off to declared format capabilities.
- Read-only mode consistent with platform grants.
- Keyboard and pointer interaction, focus management, and deterministic
  disposal/re-mount behavior.

The editor uses the platform's existing workspace/editor shell,
navigation, persistence and design-system components. CadCraft owns the
CAD canvas and CAD-specific controls only; it does not create another
application shell, generic file browser, settings framework, or generic
editor framework. The standalone editor is not merely a demo canvas:
its document lifecycle and save boundary must be real and testable.

## DXF and other formats

DXF is a first-class interchange workflow in the CAD editor, but CadCraft
is not automatically the owner of the DXF parser or writer. It invokes
the canonical DXF format capability already established by the geometry
and format-plugin architecture. The adapter owns format fidelity,
entity coverage, metadata preservation, units and coordinate conversion;
CadCraft owns the editor hand-off and user-facing import/export flow.

The DXF adapter contract must report supported entities and known
limitations, including treatment of layers, blocks, dimensions, text,
attributes, units, coordinate systems, external references and
unsupported entities. Import should preserve native metadata and
unsupported content where feasible. Export must report omissions or
approximations. Lossless round-trip claims require fixture-backed
evidence. CadCraft must not silently discard format-native data when
opening, editing or exporting a drawing.

Inventory existing DXF parsers, writers, extractors and editor-specific
helpers before consolidation. Select one canonical implementation per
responsibility and remove duplicate copies only after consumer workflows
and fixture coverage migrate. Tech Drawing may continue to own
technical-drawing-specific template and placement semantics. Facade may
retain a domain-specific fabrication exporter where it emits production
semantics that the generic DXF adapter cannot represent; ordinary
document interchange must use the canonical format capability.

DWG remains out of scope under the existing root owner decision. This
plugin must not add a DWG parser, writer, SDK, converter or runtime
dependency. A future proposal requires a separate explicit decision
covering licensing, browser/server execution, conversion infrastructure,
fidelity, unsupported content and operational cost. DXF support does
not imply DWG support.

## Consumer integration boundaries

### Tech Drawing

Tech Drawing consumes the public CadCraft host for its CAD-backed
editors. It continues to own its sketch and technical-drawing types,
drawing standards, templates, marker/spot semantics, and
format-specific workflows. It does not own the upstream CadCraft
distribution or host implementation. Its editor-specific tools and
domain data are layered through public host capabilities, not private
engine internals.

### Facade

Facade consumes the same public host for its cassette/profile designer
and sheet-design editor. Facade owns the semantic fabrication model and
projects it into CAD entities. CAD edits that affect fabrication state
must pass through Facade's typed domain commands and validation; the
CAD document is not the source of truth for sheet, cassette or placement
relationships. The detailed migration, preserved behavior, projection
boundary and undo/redo requirements are specified in
[Facade SPEC](../facade/SPEC.md).

## Delivery sequence

1. **Inventory:** identify the exact upstream version, license,
   provenance, asset/build process, host features, current consumers,
   duplicate runtime copies, and DXF format implementations. Capture
   behavior fixtures for existing CAD-backed editors.
2. **Extract:** create the independent CadCraft plugin, move the
   distribution and host into its ownership, define public modules and
   API versioning, and remove Tech Drawing's ownership of the runtime.
3. **Compatibility:** migrate Tech Drawing to the public dependency and
   prove its DXF editor and sketch workflows still operate.
4. **Standalone editor:** deliver the generic editor, document lifecycle,
   save/dirty state, read-only mode, and DXF hand-off; prove it works
   without domain plugins.
5. **Facade migration:** migrate both Facade CAD surfaces, with its own
   domain behavior fixtures and projection/command adapter.
6. **Consolidation:** consolidate DXF infrastructure after inventory,
   preserving domain-specific fabrication export only where justified.
7. **Retirement:** remove private vendor copies, obsolete host adapters,
   and compatibility shims after all consumers have migrated.

Each stage is independently testable. Extraction, consumer migration,
and format consolidation must not be combined into one opaque rewrite.

## Acceptance criteria

- CadCraft is an independently installable plugin with no domain-plugin
  dependency.
- The upstream distribution and Perigram host have exactly one owner
  and one canonical served copy.
- The host API is versioned, documented, capability-aware, and covered
  by compatibility tests.
- Tech Drawing and Facade declare direct CadCraft dependencies and
  consume only public modules.
- The standalone editor works with CadCraft installed alone and uses
  real platform document persistence and authorization boundaries.
- The editor provides native CAD interaction, layers, drafting aids,
  properties, undo/redo, dirty/save state and read-only behavior to the
  extent supported by declared capabilities.
- DXF import/export is integrated through the canonical format
  capability with explicit coverage and fidelity reporting.
- DWG support and dependencies remain absent.
- No consumer carries a private CadCraft distribution or duplicate
  generic CAD renderer.
- Consumer domain semantics remain in their owning plugins and are
  testable without mounting the CadCraft editor.
- Licensing, accessibility, error handling, cancellation, focus,
  keyboard ownership and deterministic cleanup are tested.

## Non-goals

This SPEC does not authorize a new geometry kernel, a second plugin
dependency mechanism, a CadCraft-owned DXF parser by default, DWG
support, moving domain semantics into the editor, or replacing the
platform's workspace, persistence, authorization or design system.
Reuse existing platform contracts and extend them only when a
demonstrated integration requirement cannot be met.
