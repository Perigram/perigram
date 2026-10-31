# SPEC: Facade fabrication domain

```yaml
doc_id: FACADE-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-28
updated: 2026-10-28
```

Desired state of the facade fabrication domain: its type family,
cassette and profile authoring, nesting, and the sheet-design editor.
The marketplace contract (listings, installs, connectors, surfaces) is
the root SPEC.md §20; the domain law lives here, in the plugin.

Owner decision (2026-10-28, facade domain model — template, design,
instance): the fabrication flow runs over a six-type family, and every
hop is composed from declared constructs, relations, and the generic
instance machinery — the plugin declares the family, the organization
composes the flow in its process definitions, and nothing in the chain
is a bespoke route or a hardcoded UI action.

Owner decision (2026-10-11, cassette is a file type): a cassette is a file
type, full stop — the record's content is the payload document, and
everything that operates over cassettes belongs to the plugin. There is no
PARAMETRIC/STANDARD distinction and no `templateType` field; parameters are
set in the editor and live inside the document, never on the record; the
create form never prompts document internals (file creates follow the
creation-protocol law in §4). The read-side preview channel
(thumbnail, card preview, geometry preview) is a plugin-delivered module
under the surface contract: the platform mounts it in its preview slots
over a read-only data-only mount (`{ record, payload }`), and the card
chrome stays the platform's InstanceCard.

## Profiles and the cassette designer

Owner decision (2026-10-13): the cassette profile sketch is drawn on a
real CAD engine, not a bespoke sketch widget. The facade plugin's profile
sketch editor embeds the MIT-licensed MLightCAD browser CAD engine
(cad-simple-viewer, vendored as a self-contained executor asset) with
real drawing commands, object snaps, and engine undo; drawn entity
records normalize into the OCCS profile sketch through the engine's one
normalization path (tangent corner arcs become fillet modifiers, other
arcs flatten, circles become holes). DXF only: the open-source DWG
parser is GPL LibreDWG and the alternative is commercial, so DWG stays
out of the plugin and DXF remains the pipeline's exchange format.

Owner decision (2026-10-14): profile sketches go parametric through the
OCCS expression layer, not an embedded constraint solver (owner pick
2026-10-15: expressions). Sketch geometry (vertex coordinates, hole
centers and diameters, fillet radii, parameter values, sweep) binds to
the profile's parameter table through the same expression evaluator the
cassette tree already uses; instantiating a profile with different
parameter values evaluates one deterministic geometry — parametric
blocks by dimension table. A profile is authored closed or open; an open
profile's first and last vertices are its break points: the editor marks
them as helpers, the OCCS section carries them (type `polyline`), and the
composite chain splices into the host face's contour where the profile
lands — the designer draws the stitched boundary and the evaluated
layerData carries the composite into production redraw on
`contour.cassette_face`. External solver
runtimes (SolveSpace to WASM and kin) stay out: GPL or commercial
licensing (the LibreDWG precedent), megabyte-scale browser payloads for
a dimension-table domain, and no constraint-authoring UX this platform
owns. The sketch model's reserved `constraints` field homes a future
purpose-built geometric pass if one is ever accepted; heavy solve
compute, if ever truly needed, belongs behind the executor's service
seam, never in the browser bundle.

Owner additions (2026-10-15): the profile parameter table starts empty —
parameters are added when a sketch needs them, nothing is pre-seeded; on
a cassette, instance parameter values may be cassette expressions over
the cassette's global parameters (the globals join the evaluation scope
but never bake into the profile's stored table). A closed profile
carries one basis anchor — a vertex picked on the canvas (modal Basis
pick, datum mark shown) that is the profile's placement origin when
inserted into a cassette; extraction preserves anchors as model state.
Open shapes carry no anchor construct: their references are the sketch
origin (zero, marked) and the chain's end point. Arc-flattened chord
points are geometry, not authored corners (the editor collapses their
runs). Dimensions are automatic derived annotations over the editor
canvas — one linear dimension per authored edge, display-only, tracking
pan and zoom, never stored.

Owner additions (2026-10-14, profile editor anchor and drafting review):
the profile canvas always marks the sketch origin (zero, zero) — an
empty sketch shows the origin datum, no mark waits for drawn geometry.
An open profile carries two anchors: its first and last vertices, the
same vertices that break the host contour; the canvas marks both as
datums beside the origin. A profile is one connected chain by law:
when drawn or imported entities hold pieces no chain joins, extraction
records them on the sketch model as an `unchained` count and the save
gate refuses until the stray geometry is connected or erased — the
editor never silently keeps the longest chain and never auto-connects
with lines. Vertex coordinates and fillet radii are edited only through
a canvas popup over the selected corner (click near it with the Select
tool; Escape or clicking away closes it); the always-visible vertex
chips row is gone, and parameter and hole authoring rows stay. The
editor owns its drafting assists on the vendored engine: it asserts the
default object-snap mask (endpoint, midpoint, center, quadrant,
intersection, nearest) on mount, so per-origin persisted engine settings
cannot disable snapping; the Tangent toggle rides on top of that mask.

Owner declarations (2026-10-15, profiles in production): the layer
standards the plugin ships are the full registry of record — the
production layer names and their parametric suffixes included (milling
tool diameter on the outer cut, hole diameter, fold angle), exactly as
the pre-plugin seeding carried them — and every production surface the
plugin emits (DXF export, nesting redraw, baked layerData) names its
layers through that table, never through bare layer codes. Profile
workpieces must produce their full production effect in the cassette:
their arrangement (edge arrays — edge binding, margins from the edge
ends, count/spacing) places them, and their cut geometry lands on the
correct layers. An open profile positions by array settings only: its
two anchors snap directly onto the host face's dashed edge points —
there is no perpendicular offset for open shapes — and the host contour
rips at those points, embedding the profile chain into the contour as
the break. The Basis toggle applies to closed profiles only; on an open
sketch it is disabled, never a silent no-op.

Owner declarations (2026-10-15, profiles are terminal): an edge carrying
an arranged profile is the end of the face — the profile consumes the
edge, nothing grows from it and nothing attaches to it; the + face-grow
affordance never appears there. Profile workpieces carry no geometry of
their own: they modify face geometry, and every consumer of the face —
the 2D drawing, the folded 3D, the evaluated production data — sees the
same modified geometry. A closed profile section
arranged on an edge places by the array settings and cuts the host face
where it intersects, an open profile stitches its chain into the host
contour, and the section layer carries section views only. Instance
parameters on a profile workpiece drive only the identifiers its sketch
references — a numeric sketch (drawn or imported without bindings) has
no driving parameters and shows none.

Owner declaration (2026-10-16, profiles never ride folds): a fold edge —
an edge where a face bends to another — never carries a profile. The
attachment edge chooser offers only the face's arrangeable edges (folds
and profile-arranged edges excluded), and an arrangement authored on a
fold is refused by evaluation (a visible refusal, never a splice into
the bend line). Clearing the profile canvas starts the blank authoring
session: the parameter table empties with the canvas, so one session's
parameters never ride the next hand-drawn profile.

Owner declaration (2026-10-16, chips read cassette variables): a placed
profile's parameter chips are the same expression fields every other
expression point rides (token panel over the cassette's variables), not
a bespoke input row. A chip value naming a cassette variable reads that
variable — live, following the cassette's own parameter edits — and the
raw expression stays stored (globals never bake into a profile's
table); binding a field to an identifier the cassette defines never
mints a profile-local parameter.

Owner declaration (2026-10-16, parameter names rename in place;
inner shadows outer): every parameter name — a cassette global or a
profile parameter — renames in place, and the rename refactors every
reference (whole identifiers, never substrings; a fold angle's deg
suffix survives). A profile-local parameter shadows a same-named
cassette variable: the local binding wins, the global is only the
outer scope.

Owner decision (2026-10-17, profile library): profiles are reusable
across cassettes through a plugin-declared `profile` library type
(class `item`, plain fields: name, kind, process, sketch). Library
records are authored only from the cassette designer's profile dialog —
Save to library writes the authored truth (kind, process, prepared
sketch) as an org record; there is no standalone profile editor and no
creation of profiles outside a cassette design session. Attaching from
the library is a snapshot copy into the dialog draft: the workpiece's
`profileSnapshot` stays the renderer's geometry source and the cassette
document remains self-contained — no live references from a cassette to
library records, and a later library edit never silently rewrites
cassettes. The library rides the generic instance machinery end to end
(records host capability in, generic instance transport out); no
framework feature serves it. The add-profile affordance is a picker
(owner direction 2026-10-17): library instances listed with previews
(the evaluated sketch section, rendered by the plugin's bound preview
surface in platform slots and as thumbnails in the designer's picker)
beside a create-new entry that opens the blank dialog draft; picking an
instance places it directly.

Owner decision (2026-10-17, library edit workflow): editing a profile
placed from the library is LOCAL — the workpiece's snapshot changes,
the library record and every other cassette are untouched (the snapshot
law; provenance rides the workpiece's `profileTemplateId`). The
explicit choice lives in the dialog: Save keeps edits local; when the
draft carries a library origin (placed from the library or loaded into
the draft from it), Update library rewrites that record's authored
truth (kind, process, prepared sketch — the record keeps its name);
without an origin, Save to library creates a new record. A library
rewrite never reaches already-placed workpieces — re-picking from the
library is the refresh path.

Owner decision (2026-10-17, hardware library): hardware gets the
profile library workflow — a plugin-declared `hardware` library type
(class `item`, plain fields: name, family, productionMode, parameters;
write access inherits the cassette grant like profiles). Hardware is a
catalog domain, never a sketch: the create flow is a parameter form
over the OCCS hardware catalog (`occs/hardware.js` owns the families,
their default parameter tables, and the hanger production modes) —
family, mode for hanger clips, and the family's parameters, prefilled
from catalog defaults. Library records are authored only from the
designer's hardware dialog; picking one places the workpiece directly
(a snapshot copy of family, mode, and parameters). Placed hardware
workpieces edit their parameters in place on the nested row, the same
law as profile instance chips.

Owner decision (2026-10-17, library access inherits the cassette grant):
the profile library is completely coupled to cassettes, so its write
access inherits cassette access — if a member may write cassettes, they
may write library profiles; no per-type grant row exists for it. The
mechanism is declarative and generic, never domain-coupled in platform
code: a listing type may carry `access: { inherits: <typeId> }` naming
another type the same plugin declares, and the generic instance write
transports (create/PATCH) authorize the delegating type's records by
the parent's compiled grant (one hop, no chains; an unresolvable parent
refuses fail-closed). Reads stay org-scoped as everywhere. The facade
listing binds `profile` → `cassette`; other plugins may bind their own
support types the same way.

Owner declarations (2026-10-15, profile parameter rows, array spacing,
authoring fields — owner review round 10): the parameters a profile
workpiece's row shows drive its geometry — editing one re-evaluates the
profile; a profile added with no template and no authored sketch is the
parametric default hanger, its row carries that template's own W/H/R/D/L
table from the first render, and the profile dialog drafts a new profile
on the same template. Array spacing is the gap between adjacent copies:
zero butts them together, and a spacing rule places the copies that fit
rather than stretching them across the edge; a count the span cannot hold
is the refusal. Authoring fields — the vertex popup's coordinates and
fillet radius, the parameter and hole rows, and the workpiece row's
instance-parameter chips — commit the text on blur or Enter, never per
keystroke: a keystroke-committed value normalizes under the caret (`''`
becomes 0, `42.` becomes 42) and adopt-on-bind mints a parameter from a
half-typed identifier.

Owner decision (2026-10-15, engine integration law): the profile editor
integrates the CAD engine under a one-way truth rule — the sketch model
is the single truth, the canvas its render and input surface. Extraction
merges back instead of replacing: a corner whose extracted position
matches its authored evaluation keeps the authored id, expressions, and
fillet radius, so drawing, importing, or undoing never destroys
parametric authoring. The toolbar reflects the engine's command
lifecycle (commandWillStart/commandEnded) — buttons stick only while
their command runs; starting another tool cancels the running one. The
surface owns Escape routing (the engine's own handling needs focus
inside its container): Escape closes the vertex popup, cancels the
active command, and clears the selection, regardless of focus.

Owner decision (2026-10-17, command input toggle): the profile editor's
chrome stays the dialog's — the engine's command line stays hidden by
default — but the toolbar carries a toggle that reveals it on demand:
the engine CLI is the one complete desktop surface for typed prompt
entry (a bare length as direct distance toward the cursor, `dist<angle`
polar, `@x,y` relative), and the editor asserts it off on mount so every
session starts with the clean chrome.

Owner decision (2026-10-17, profile editor draft and chrome): the
profile dialog drafts blank — an empty canvas and an empty parameter
table, no seeded geometry (the parametric hanger template stays the
renderer's fallback for sketch-less workpieces, never the dialog's
starting draft); the dialog's window-level controls (name, kind,
process, library pick, save actions) collapse into one compact row
instead of stacked bands; and the editor's own operations render as an
icon toolbar (open-source CAD glyphs, PrimeVue Toolbar) instead of
wrapped text buttons. The editor's layout is space-first: the
parameter/holes strip sits above the canvas, the tool toolbar floats
inside the canvas over the drawing, and the dialog stands near-viewport
height so the canvas takes everything left.

Owner decision (2026-10-18, profile shape model; pathfinder-ops
amendment 2026-10-19): a profile sketch is a list of parametric shapes evaluated
on the edge axis. Any number of shapes may exist in one profile; the
profile-level open/closed distinction is retired — closure is a chain
shape's own state. Shape kinds: circle, rectangle, and chain (drawn on
the canvas or imported); every authoring field is an expression over
the parameter table (distances from the basis axis, radii,
width/height, rotation). Each shape carries an explicit
boolean operation applied to the FACE — add (the footprint unites
into the face, extending it), subtract (the footprint cuts from the
face), construction (excluded; an imported drawing lands as
construction). The face after the profile is `(base face ∪ adds) −
subtracts`. The zero vertical axis stays the placement basis and the
parameter origin. The axis is the
placement basis: placed into a cassette, the axis lands on the
attachment edge (snap + offsets) with +X on the
edge's inward normal, toward the host face — authored distances from
the axis ride along as drawn. Fillets are
non-destructive: they live as modifiers on their shape — per-corner on
rectangles, per-vertex on chains — and stay editable after application
(position and radius). Profiles are closed operand sets: an open
chain alone never saves, and the open-profile embedding path carries
no new authoring (stored legacy documents keep their read path until
the one-shot migration retires them).
Stored profiles — library records and cassette documents — cross into
the shape model through a one-shot migration script; chain sketches
become chain shapes, holes become subtract circles, and a closed
sketch's basis anchor becomes the axis (the chain is translated so the
anchor vertex sits on it). The editor shows the authored model the way
the cassette editor shows its dimensions: every primitive field is a
dimension annotation on the canvas, labeled by its parameter expression
where one is bound (measured numbers otherwise), and set directly in
place — typing in the dimension commits the field. Selection is the
CAD engine's entity pick; a single selected shape opens its popup
(op, rotation, fillet radii) at the click point. The editor overlays
the resolved section as the one strong figure over the editable
primitives — the section hatched with a solid
outline — so the boolean result reads at a
glance; the zero axis renders as a solid basis line. Rectangle
extraction canonicalizes corner order (counter-clockwise from the
leftmost corner), so the draw direction leaves the stored settings
unchanged.

Owner declaration (2026-10-19, the drawing is sacred): nothing
breaks the drawing, ever. A mid-edit or invalid expression holds the
last good evaluation on the canvas — geometry, dimensions, hatch,
panel, and editors stay live so the text can be fixed in place — and
the authored model survives every extraction roundtrip whole:
parametric shapes stay parametric, bindings keep their expressions,
raw text stays stored as typed. Error states speak through messages
beside the work; they never clear the canvas, replace authored
geometry, or gate editing. A placed profile's editor opens on the
workpiece's derived table (instance values over the snapshot's), so
editing edits what that workpiece renders.

Owner decision (2026-10-19, profile drawing; ordered-sequence
amendment, same day): the fold is an ordered CSG sequence — each
shape applies to the face in authored list order, so a later add
refills an earlier cut; the shape list's order is semantic and the
editor reorders it. The editor hatches the FACE: the material
half (flippable) folded through the profile's ops — adds extend the
hatch past the axis, subtracts punch it empty — while drawn primitives
stay bare lines beneath it: hatch and strong outline are what goes to
the cassette, bare lines are what is authored. The editor, the
production entity stream, and the nesting evaluation ride the same
region fold.
Owner direction (2026-10-19, authoring): a dragged shape keeps its
parameter bindings — a moved field bound to a bare parameter edits that
parameter, compound expressions and numerics carry the drawn value.
Selection strokes the shape's footprint dashed on the canvas.

Owner direction (2026-10-19, evening — primitives panel): the
primitive listing is a panel inside the editor canvas — a real list,
one row per shape in the workpieces-tree anatomy (kind glyph, kind
name, the op as a state tag), rows in the authored CSG sequence —
drawing and import order, the sequence being the evaluation — so
hidden three-state cycling controls are gone. Selecting a row
expands it into the shape's settings in the same tree: the
move-earlier/move-later controls, the segmented
Add/Subtract/Construction control (every option's tooltip naming the
face as the target), the shape's whole authoring table — sizes,
position, rotation, fillet radii — as wrapping expression inputs, and
the row's delete action; a repeat click collapses it. The op has one
home at a time: the collapsed row shows its state tag, the selected
row shows the control. Primitives are
atomic: deleting one — through the row or by erasing any of its
entities on the canvas — removes the whole shape, and a partially
erased rect or circle never degrades into loose lines. Placing a
library record whose
sketch carries no participating shape refuses with the authoring
message — the parametric default hanger stands in only for
sketch-less workpieces, and authored-but-empty snapshots never place
template geometry. Production outputs carry the folded boolean result
only: the drawing's inner-cut layer, the evaluated data stream, the
folded cutouts, and the document's face shapes read the result's
rings — operand primitives consumed by the result (overlapping or
nested cuts dissolving into merged rings) never draw on the cassette.

Owner review (2026-10-18, profile editor readout): the parameter table
lives in the strip above the canvas — its one home, visible with no
selection. Clicking a primitive — face, edge, or cutout — opens its
popup; a repeat click on the same spot cycles to the shape beneath.
The canvas carries exactly two surface states, hatch and empty: the
resolved section hatches — the one hatch — with holes staying empty
and everything outside the section empty. Stacked dimensions chain
outward on their baseline and every dimension line carries arrowheads.

Owner review (2026-10-19, profile items and bindings): a placed
profile's workpiece row carries the profile's whole parameter table.
A moved shape keeps its authored expressions on every field whose value
survived the move — position fields go numeric, sizes and fillet radii
keep their bindings.

Owner review (2026-10-18, profile editor popup chrome): the popup and
every floating authoring field carry the theme's surface background
and border. The primitive popup lays out as one compact panel: header
(kind, construction toggle), then one row with rotation and the fillet
radii.
Authoring fields size to their content so their values stay visible.
Typing a number into a dimension labeled by a bare parameter commits
to that parameter — every field bound to it follows; a local field
edit touches its own primitive only, and primitives bound to the same
position expression share one dimension for it. Erasing a shape and
undoing the erase revives the shape with its parameter bindings, and
shape ids stay unique through every merge. A shape's boolean operation is a
segmented Add/Subtract/Construction control; each option's tooltip
names the face as the target. A refused profile save states its
reason beside the Save action.

Owner decision (2026-10-17, assembly tree layout): the designer's
workpiece tree keeps every workpiece top-level — sheets and hardware
never nest under another workpiece. A profile workpiece renders once, as
a child of the workpiece its attachment relation targets; every other
relation (fold joints, hardware attachments) renders as a relation row
under its workpiece. No workpiece is ever hidden by nesting.

Owner decision (2026-10-17, attachment authoring): the add-attachment
control opens a workpiece→face picker — the target workpiece and the
binding face are chosen explicitly, no click-armed connect mode.
Attachment settings are per source kind, with no delete in the editor
(the panel relation row owns removal): profiles attach on the
edge-array pattern by default and carry placement, array, and mirror
controls (no face side); hardware carries face-side placement with
snap or array (no mirror) and may bind edges a profile already
occupies; workpiece attachments edit symmetric host and self sections
— face, side, basis snap, and both offsets per section (rotation in
self) — with no mirror, driver, or joint type; the self side flips the
sheet against the host side and both offset pairs place in their own
face frames in 2D and folded 3D alike.
Snap points and array bindings are computed from the raw authored
face, never from the profile-merged boundary.

## Sheet design and the plugin end state

Owner decision (2026-10-19, sheet-design editor interactions): the
sheet-design editor runs the operational-designer lanes chrome — palette
(cassette picker, layout margin, layer visibility rows) and inspector
(selected placement facts, else the sheet summary). A cassette record
carries its evaluated geometry fields on every designer save, so the
picker adds any authored cassette from the record wire (one placement per
extracted polygon, swept to the first free position); a placement grabs
by face; drag snaps magnetically with the margin row feeding both the
part gap and the sheet-edge offset; drag, rotate, and add gate on sheet
containment plus non-overlap, and a placement already in violation stays
draggable so it can be pulled out; the selection's action dial anchors
at the placement and carries open cassette, rotate, and delete; clicking
empty canvas clears the selection. Opening a placed cassette is host
navigation: the surface asks through the mount's workspace-open channel
(surface contract 4), and the workspace owns the tab.

Owner decision (2026-10-28, multi-sheet canvas, second pass): the
sheet-design editor edits several sheet-design records on one canvas,
added explicitly — the opened record beside sheets the user adds from
the sheet-design picker or as all siblings at once. The canvas is one
drawing surface with mouse-grade navigation: wheel zoom toward the
cursor, drag-to-pan, fit-to-set. A placement dragged onto another sheet
moves between records, the drop re-clamping into the target sheet's
free sweep; every edited record commits its own patch on save. Selecting
a placement or a sheet shows its instance in the inspector — the
cassette-design record behind a placement beside its placement facts,
the sheet-design record behind a sheet beside its summary. Record
creation and deletion stay in the workspace's record machinery; the
construct and remove mount transports stay retired.

Owner decision (2026-10-29, the working set is the lineage family): the
multi-sheet working set derives from data, never a pool: the opened
record's family is the sheets sharing its lineage parents under the
declared containment's keys, and that family joins the canvas beside the
opened record. The sheet-design picker is the explicit add channel —
any org sheet, picked one at a time, family members offered first —
and the add-all button covers the family alone; nothing mass-adds the
org pool. The parent is
whatever entity type the organization's declarations compose — the
generic containment contract decides, the plugin hardcodes none. The
canvas arranges the family as a wrapped rack; a sheet moves by its
label band and rotates a quarter turn about its center, placements ride
in sheet-local frames.

Owner decision (2026-10-29, layer-standard pens): a layer standard's
org pen rides its `defaultPen` relation on the wire; a standard whose
pen does not resolve keeps the OCCS base pen for its code, and the OCCS
base itself styles every registry-covered code — an org shadow never
silences the base.

Owner decision (2026-10-29, the inspector runs on instance tiles): the
editor's record surfaces are the platform's instance tile — the
working-set sheets and the record behind a selection render as tiles,
the working-set tile
selectable (click activates the sheet on canvas) with its active
marking; the working-set remove rides the row's trailing end (the
chip-removable convention). Lineage renders per record (owner
direction 2026-10-30): the working set groups by parent map — each
distinct lineage is a group, its chain heading its sheets, the opened
record's group first; lineage-less sheets form an unchained group. The
active sheet's placed cassette
designs render as the actual instance tiles beside the sheet tile
(owner direction 2026-10-30) — placement geometry (position, rotation)
reads on the canvas, and the inspector carries no hand-rolled fact
rows. Pickers
pick-to-add: choosing a sheet from the sheet picker joins the working
set, choosing a cassette design places it on the active sheet.

End state for the facade plugin: the cassette designer and the sheet-design
editor mount from the plugin, their app-side registrations and components
are deleted, the read-side cassette previews follow the same delivery path,
and the OCCS engine single-homes in the plugin — no facade presentation code
remains in the app.

The sheet-design editor owns its save-time layout recompute client-side
(the cassette-designer precedent); DXF exports ride generateAttachment
through the plugin's export binding (owner decision 2026-10-10).

- `cassette-template` (file) — the authored parametric template; the
  record's content is the payload document (the 2026-10-11 law). The
  `cassette` id renames to it.
- `cassette-design` (file) — baked geometry. One template produces many
  designs; a design refers to one or zero templates through a nullable
  `template` ref (a DXF-imported design carries none; the `source` ref
  is the import path).
- Owner decision (2026-10-31, DXF import): the upload create takes the
  DXF file and immediately maps its source layers to the OCCS layer
  vocabulary; the mapping is the create form's declared `mapping` input,
  the record stores it beside the extracted geometry, and `cut.outer`
  is the one required target. Template and source stay off the upload
  form. Template-based creation is the separate `render` construct.
- `cassette-instance` (item) — the digital twin of a physical cassette.
  It refers to one or zero cassette designs — a twin may be a bare
  record — and one design is referred by many twins.
- `sheet-design` (file) — a set of cassette designs placed on sheet
  geometry; one design may be placed multiple times in one sheet design,
  and a sheet design is reusable, applied many times. Placements are a
  declared relation to cassette-design (`onRemove: detach`, one ref per
  placement) beside the frozen self-contained geometry snapshot (the
  §24 app-canon law); provenance rides the refs with revision pins. The
  record carries its `compositionKey`: the sheet shape and the
  placement design-key multiset.
- `sheet-cut-plan` (item) — a sheet design applied to an exact sheet: it
  refers to one sheet design and to the sheet instance it cuts, and
  carries no geometry of its own.
- `sheet-instance` (item) — the digital twin of a physical sheet: a
  plain record, referred by many.

Nesting produces the sheet designs with quantities: the solve's input
items are cassette-design geometries keyed by their cassette-design
refs — a placement without its design ref refuses — and its output
groups the resulting sheets by composition, joining sheets that cut the
same designs the same way into one sheet design carrying the group's
count. Composition is the sheet shape and the multiset of placement
design keys; placement order, rotation, and translation are the
solver's arrangement. A supplied `designKey` names the cassette-design
composition; absent one, the design reference is the key. An item's
count is its physical cassette quantity: an organization's queue entry
holds one design beside that count, and its process expands the count
into cassette-instance children before nesting.

Owner decision (2026-10-31, composition is sheet-design identity): a
flow matches a solved layout against stored sheet designs by
`compositionKey` and reuses the matching record; construction happens
only for a composition no stored design carries. One sheet design
therefore stands behind many `sheet-cut-plan` records, one per exact
`sheet-instance`, and one cassette design stands behind many
`cassette-instance` records. The nesting item's count is its physical
cassette quantity. The sheet-design editor splits a stack into another
sheet design and moves one cut plan onto the copy.

The family declares no states and no transitions: state vocabularies are
process-graph authoring (CTS SPEC §7) — an organization authors cassette
and sheet lifecycles in its process definitions.
