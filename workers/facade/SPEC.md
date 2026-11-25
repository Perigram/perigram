# SPEC: Facade fabrication domain

```yaml
doc_id: FACADE-SPEC-001
classification: reference
status: active
owner: product-owner
created: 2026-10-28
updated: 2026-11-02
```

Desired state of the facade fabrication domain: its type family,
cassette and profile authoring, sheet-design editor, and production export.
Generic polygon nesting is owned by the independently installable Nesting plugin.
Facade adapts OCCS workpiece geometry to Nesting's generic source-part contract
and consumes its layouts; it does not own the solver, worker transport, or
generic nesting operations.
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
chrome stays the platform's InstanceCard. Owner direction (2026-11-06,
preview rendering): previews render in-place as lightweight SVG — the
plugin's tree renderer owns the cassette drawing and the platform's DXF
parser owns DXF payloads; the CAD engine mounts in editors.

## Profiles and the cassette designer

Owner decision (2026-10-13): the cassette profile sketch is drawn on a
real CAD engine, not a bespoke sketch widget. Owner decision
(2026-11-01): the facade plugin's profile sketch editor embeds the
Apache-2.0 CadCraft browser edition (getcadcraft/cadcraft, vendored as a
self-contained executor asset) with real drawing commands, object snaps,
and the sketch's own undo history; drawn entity records normalize into
the OCCS profile sketch through the engine's one normalization path
(tangent corner arcs become fillet modifiers, other arcs flatten, circles
become holes). DXF remains the pipeline's exchange format.

Owner direction (2026-11-01, native profile annotations): the profile
canvas draws its derived annotations — every dimension, the face hatch
and outline, the zero axis, and the origin datum — as CadCraft entities
on derived layers, so the drawing's renderer paints them with the
geometry through every pan and zoom. The decoration layer stays locked
and unpickable; the dimension layer is editable. Dimension labels are
the native dimension text; clicking a primitive dimension's label opens
its authored expression field in place, and typing commits it.
Selection is the engine's native selection. The surface chrome is the
host dialog's: the embedded edition's toolbars, panels, hint card,
first-run tour and dialogs stay out of the surface; its command line
appears only through the editor's own toggle.

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
ends, count/step/gap/span rules) places them, and their cut geometry
lands on the correct layers. An open profile positions by array settings only: its
two anchors snap directly onto the host face's dashed edge points —
there is no perpendicular offset for open shapes — and the host contour
rips at those points, embedding the profile chain into the contour as
the break. The Basis toggle applies to closed profiles only; on an open
sketch it is disabled, never a silent no-op.

Owner decision (2026-11-02, faces shard edges; owner update 2026-11-03,
profiles use the whole edge): child faces share a host edge as intervals.
A child face carries `edgeStart` and its width in `defaultLength`, both
expressions over the cassette's parameters. Free shards exclude child
faces alone; profiles reserve no edge interval. The canvas shows one +
handle per free shard; a face's own base edge is its parent connection
and carries no +. A child face's span stays authored node parameters
(`edgeStart`, `defaultLength`); the face details carry the role and the shape
actions. The clicked
shard is authoritative — the new face lands on that interval, never the
whole edge. A face placement that would overlap another face refuses,
and the refusal reads on the canvas. An open profile places by its array
settings across the whole host edge, and several open profiles may share
that edge. A closed profile footprint leaves the edge intervals free.
A fold sits on the child's owned interval, never on the whole host edge.
Profile workpieces carry no geometry of their own: they
modify face geometry, and every consumer of the face — the 2D drawing,
the folded 3D, the evaluated production data — sees the same modified
geometry. A closed profile section arranged on an edge places by the
array settings and cuts the host face where it intersects, an open
profile stitches its chain into the host contour, and the section layer
carries section views only. Instance parameters on a profile workpiece
drive only the identifiers its sketch references — a numeric sketch
(drawn or imported without bindings) has no driving parameters and shows
none.

Owner declaration (2026-10-16, fold intervals; 2026-11-02): a fold owns
the child face's interval on the host edge. A closed profile footprint
may cross that interval and cut the host; its bend route keeps the
authored edge geometry. An open profile arranges only on an edge without
a fold; evaluation surfaces the refusal and preserves the bend line. A
profile may share the rest of the host edge with faces and open
profiles. The attachment edge chooser offers the face's arrangeable
edges (folds excluded). Clearing the profile canvas starts the blank
authoring session: the parameter table empties with the canvas, so one
session's parameters never ride the next hand-drawn profile.

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
cassette variable inside the sketch's authored expressions; a placement
override resolves in the cassette scope first (2026-11-04).

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

Owner decision (2026-11-02, library edit workflow): editing a profile
placed from the library is LOCAL — the workpiece's snapshot changes, the
library record and every other cassette are untouched (the snapshot law;
provenance rides the workpiece's `profileTemplateId`). The explicit
choices live in the dialog's compact row: Save keeps the workpiece edit
local; with a library origin (placed from the library or loaded into the
draft from it), Save to library rewrites that record's name, kind,
process, and prepared sketch, Save as creates a new record from the draft
and makes it the draft's origin, and Delete removes the origin record;
an origin-less draft creates its first record through Save to library.
The dialog remains the one library authoring surface. A library rewrite
or delete leaves already-placed workpieces on their snapshots — re-picking
from the library is the refresh path.

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
on the same template. A gap rule is the clearance between adjacent copy
footprints: zero butts them together, and the rule places the copies that
fit rather than stretching them across the edge. A count distributes whole
copies between the margins; a single count keeps its anchor on the edge
binding, so an authored tab may straddle the edge; a count the span cannot
hold refuses. Authoring fields — the vertex popup's coordinates and
fillet radius, the parameter and hole rows, and the workpiece row's
instance-parameter chips — commit the text on blur or Enter, never per
keystroke: a keystroke-committed value normalizes under the caret (`''`
becomes 0, `42.` becomes 42) and adopt-on-bind mints a parameter from a
half-typed identifier.

Owner declaration (2026-11-04, attachment array definition): placement
has three modes — point, edge array, and face array. Every array is one
versioned definition on the relation: `space` (`edge` or `face`), `kind`
(`linear`, `grid`, or `radial`), binding, frame rotation and mirrors, two
axes, stagger, polar, item transform, suppression, and clipping.
Each axis carries a rule — `count`, `step`, `gap`, or `span` — plus its
count, pitch, clearance, authored span, and start/end offsets. `count`
distributes whole copies across the available span; `step` packs copies at
a fixed anchor pitch; `gap` packs copies at a fixed edge-to-edge clearance;
`span` places the requested count across an authored span. A rule that
cannot fit refuses.
An edge array is `space: edge`, `kind: linear`: its X axis runs along the
host edge, its start/end offsets are the two edge margins, its normal
offset moves the copies off the edge, and the copy footprint participates
in the span. A single count anchors on the binding so an authored tab may
straddle the edge. A face array is `space: face`, `kind: grid` or
`radial`: grid axes carry the same four rules, offsets are clearance from
the face outline to each copy footprint, stagger shifts alternating
rows/columns, and frame rotation/mirror transform the grid. Radial arrays
carry center offsets, rings, copies per ring, base radius, ring spacing,
start angle, and sweep. Item orientation is fixed, grid-aligned, radial,
or tangent; item rotation and mirrors apply to every copy.
Copy keys are stable across edits (`row:column`, `ring:index`, or the
linear index), so suppression names a copy directly. Anchors outside the
authored contour are clipped or dropped. An array that places no copy, or
whose rule cannot fit, refuses and reports through the attachment
diagnostics; the production document refuses the same placements.
Open profiles keep edge placement; point and face arrays refuse for them.
Edge bindings are start, center, and end; point anchors (origin and
corners) belong to point placement alone. The editor shows the array
anchor when at least one axis uses an anchored rule; a count that fills the
span has no anchor. The editor derives its array fields from the
definition; open profiles carry edge-array controls. Stored flat pattern
shapes normalize into the definition on read.

Owner decision (2026-10-15, engine integration law): the profile editor
integrates the CAD engine under a one-way truth rule — the sketch model
is the single truth, the canvas its render and input surface. Extraction
merges back instead of replacing: a corner whose extracted position
matches its authored evaluation keeps the authored id, expressions, and
fillet radius, so drawing, importing, or undoing never destroys
parametric authoring. The tool buttons reflect the engine's command
lifecycle (commandWillStart/commandEnded) — buttons stick only while
their command runs; starting another tool cancels the running one. The
surface owns Escape routing (the engine's own handling needs focus
inside its container): Escape closes the vertex popup, cancels the
active command, and clears the selection, regardless of focus.

Owner decision (2026-10-17, command input toggle): the profile editor's
chrome stays the dialog's — the engine's command line stays hidden by
default — but the tools palette carries a toggle that reveals it on demand:
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
instead of stacked bands; and the editor's drawing operations render as
icon buttons (open-source CAD glyphs) in the designer's left palette, with
the canvas commands (undo, redo, zoom, fit, DXF import, clear) in the
designer dock. The editor's layout is space-first: the
parameter/holes strip sits above the canvas and the canvas takes everything
left.

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
the cassette editor shows its dimensions: a primitive's width, height,
center, and diameter are dimension annotations on the canvas, labeled by
their parameter expression where one is bound (measured numbers
otherwise), and set directly in place — typing in the dimension commits
the field. Rotation and fillet radii ride the shape's expanded panel row
and the corner popup. Selection is the CAD engine's entity pick; a single
selected shape expands its row in the primitives panel. The editor overlays
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
geometry, or gate editing. A placed profile's editor edits and
evaluates the authored sketch alone; the workpiece's instance overrides
stay on the cassette and never enter the editor. A dimension typed on a
field bound to an authored bare identifier commits that authored row. A
field bound to a surrounding-scope identifier keeps reading that scope;
typing a value there makes that field local, and the editor never mints
a profile row for the global.

Owner decision (2026-10-19, profile drawing; ordered-sequence
amendment, same day): the fold is an ordered CSG sequence — each
shape applies to the face in authored list order, so a later add
refills an earlier cut; the shape list's order is semantic and the
editor reorders it. The editor hatches the FACE: the placed parent face
folded through the profile's ops — adds extend the hatch, subtracts
punch it empty — while drawn primitives stay bare lines beneath it:
hatch and strong outline are what goes to the cassette, bare lines are
what is authored. The zero axis spans the placed parent face's extent.
The editor's parameter table carries the placed instance values while it
edits in place, and a library save writes those parameters as concrete
values. The editor, the production entity stream, and the nesting
evaluation ride the same region fold.
Owner direction (2026-10-19, authoring): a dragged shape keeps its
parameter bindings — a moved field bound to an authored bare identifier
edits that row, compound expressions and numerics carry the drawn value,
and a surrounding-scope identifier stays in its own table. Selection is
the CAD engine's native selection.

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
selection. Clicking a primitive — face, edge, or cutout — selects it and
expands its row in the primitives panel; a repeat click on the same spot
cycles to the shape beneath.
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
Typing a number into a dimension labeled by a bare identifier commits
to that authored row and every field bound to it follows; a field bound
to a surrounding-scope identifier keeps reading the scope, a local field
edit touches its own primitive only, and
primitives bound to the same position expression share one dimension
for it. Erasing a shape and
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
edge-array pattern by default and carry point, edge-array, and
face-array placement plus mirror controls (no face side); hardware
carries face-side placement with point, edge array, or face array (no
mirror) and may bind edges a profile already occupies; workpiece attachments edit symmetric host and self sections
— face, side, basis snap, and both offsets per section (rotation in
self) — with no mirror, driver, or joint type; the self side flips the
sheet against the host side and both offset pairs place in their own
face frames in 2D and folded 3D alike.
Snap points and array bindings are computed from the raw authored
face, never from the profile-merged boundary.

Owner decision (2026-11-01, two parameter tables): a profile workpiece
carries its authored table and its instance table apart. The authored
table is the sketch's own rows (`profileSnapshot.sketch.parameters`), the
table the profile dialog edits and the library record stores. The instance
table (`profileSnapshot.instance`) holds the values a placed workpiece
overrides, edited through the placement fields — each
field shows the stored expression and its derived value. The profile
editor never receives this table: it edits and evaluates the authored
sketch alone, and saving a profile preserves the workpiece's instance
rows untouched. The derived table — authored rows with the instance
values on top — is the render evaluation scope; the save gate and the
profile editor evaluate authored rows. A row whose name the surrounding
cassette scope defines and which the sketch does not author lives in the
scope alone — it never enters the instance table. An authored row may
shadow a same-named global and keeps its override; an unreferenced
authored scope-named row prunes. A saved
sketch keeps the authored table; a saved workpiece keeps its instance
table; neither table is folded into the other.

Owner direction (2026-11-04, instance expressions read the cassette): a
placement override is a cassette-level expression. A name the cassette
defines resolves to the cassette's value even when the sketch authors a
same-named row; the sketch's rows are the fallback for names the
cassette does not define, and a field naming its own key reads that
outer value. Authored shape expressions keep the sketch's inner rows
over the cassette scope.

Owner direction (2026-11-04, one parameter law for sketches): a face
sketch carries the same two tables as a profile workpiece. The authored
table is the sketch's own (`node.sketch.parameters`, edited in the face
editor); the instance table (`node.instance`) holds the values a placed
face overrides. The derived table — authored rows with the instance
values on top — is the render evaluation scope; the face editor edits
and evaluates the authored sketch with the placed values folded into its
view, and saving preserves overrides whose rows the sketch does not
author. The selected face's details carry its parameter fields beside
the placement controls, so a placed face's inner parameters are edited
on the cassette like a placed profile's. Scope-named rows stay in the
cassette's table. Renaming a global rewrites face instance rows and
sketch bindings.

Owner direction (2026-11-04, shared canvas navigation): the cassette
assembly canvas follows CadCraft's mouse law — wheel zooms at the cursor,
middle or right drag pans, and a middle double-click refits — so
assembly, profile, and face editing share one navigation contract.

Owner direction (2026-11-05, natural selection and exit): the cassette
canvas selects whatever is clicked — a face, fold, or profile of any
workpiece — and the selection follows the click into that workpiece. In
the sketch editors Escape sheds one layer at a time — the open field,
the selected corner, the selected shape — and a bare Escape leaves the
edit back on the cassette.

Owner direction (2026-11-02, profile management on the canvas): a placed
profile is a canvas object. Its placed section geometry carries the
profile hit area, so a click selects the profile and the panel under the
assembly tree carries the placement fields, the parameter table, and the
edit and delete actions. Typing a cassette global into a parameter field resolves
it through the same scope as every other chip. The selected face's details
carry the Add profile entry with the profile pulse glyph. The palette lists
profiles as assembly rows;
profile authoring, parameter editing, placement, and removal live on the
canvas.

Owner direction (2026-11-02, in-place sketch mode): profile and face shape
editing happen on the cassette designer's canvas at the target's placement.
The assembly drawing and its camera stay in place, so the edited target keeps
its screen position and the selection survives the edit. The existing CadCraft
profile editor renders the sketch. Sketch edits commit to the cassette live;
Back returns with the edited target's tree details restored, and the mode's
save action writes the library record alone. A selected face or profile draws
its inner shape dimensions in the sketch's CAD dimension style, apart from
the cassette-wide dimension style; an inner dimension label edits its
authored shape field in place. A sketch face carries only its sketch
dimensions; the cassette dimension layer holds the trapezoid faces' base
and height rows.

Owner direction (2026-11-02, shared canvas session): the cassette designer
runs one canvas session over the assembly canvas and the sketch editor. The
session carries the assembly selection through the edit, and the assembly
camera is the camera both modes use. Entering and leaving an edit preserve that
camera. Back returns the assembly to the session's selection; the assembly
document carries the live sketch edits out.

Owner direction (2026-11-03, in-place assembly context): the sketch canvas
places the authored sketch into the cassette assembly at the target's
placement, so the host face, sibling faces, folds and cuts stay around it in
their own coordinates. The assembly rides its own layers with their colors,
weights and dash patterns, locked and unpickable; extraction reads the
authored sketch alone. The sketch model remains the single authored truth.
The frame comes from the target's placement: the face's shard frame composed
with its assembly transform, a closed profile's axis and point placement, or an
open profile's edge embedding. The profile editor hatches the placed parent
face, so the boolean preview rides the real face.

Owner direction (2026-11-03, canvas theme and layer pens): the sketch canvas
mirrors the app's light/dark tokens and UI font into the CadCraft frame, and
the frame's paper/model mode follows the app theme. The cassette assembly
layers keep the OCCS layer standards' colors, weights and dash patterns, so a
dashed fold route reads dashed on the canvas.

Owner direction (2026-11-03, canvas geometry renderer): the cassette designer's
canvas paints its geometry through a CadCraft host behind the SVG interaction
layer. The SVG keeps the camera, chips, hit areas and popups; the host follows
that camera and keeps every assembly layer locked. The main canvas and the
sketch canvas read the same assembly layers, theme and font.

Owner direction (2026-11-03, shared edit canvas): profile and face editing drive
the designer's CadCraft host in place. Entering an edit seeds the sketch over
the assembly context at the existing camera; leaving restores the assembly
document. The edit controls live in the designer's right inspector panel: back
and save, the profile identity, the parameter table and the shape list. The
drawing toolbar fills the left palette; the canvas keeps the dimension editor
and the corner popup; the assembly stays visible around the edited target.

Owner direction (2026-11-03, inspector assembly tree and native canvas): the
right inspector lists the assembly as workpiece → face. The selected face's
details list its placed profiles in one compact row each, with edit and delete
icons and the Add profile action. The canvas carries no per-face menu chip. The
assembly canvas draws its dimensions as native CadCraft dims on the dimension
layer in every view, including the assembly context. The palette lists the
drawing's native layers, and its rows toggle those layers in the assembly and
the edit; hidden layers stay hidden through an edit; an empty visible-layer set
hides every layer. The native host is the one canvas view: it paints every
layer, filled face layers as solid hatches, and the dimension labels; the SVG
overlay keeps hit areas, chips and hover/selection highlights alone. The edit
drawing toolbar fills the left palette; the canvas keeps the dimension editor
and corner popup.

Owner direction (2026-11-05, unified designer dock): the designer dock owns
the canvas commands in every mode. The assembly view carries undo, redo and
zoom; the sketch view carries the sketch's undo, redo, zoom, fit, DXF import
and clear. The tools palette holds the drawing tools, erase and the drafting
toggles while a sketch is open; the cassette's globals and layer rows return
when the assembly view does.

Owner direction (2026-11-05, expanding assembly tree): the inspector's
assembly tree is a PrimeVue `Tree`. Workpieces stay top-level, faces nest
under their workpiece, a placed profile nests once under the face its relation
targets, and every other relation nests under its source workpiece. Selecting
the tree's rows carry identity alone. Selecting a face, a placed profile, a
relation, or a hardware workpiece opens that selection's settings in one
full-width panel under the tree: the face's role, shape actions, Add profile
with the profile pulse glyph and authored parameter fields; a relation's
placement fields; a hardware workpiece's family and parameter fields. Settings
grids auto-fit their host: tracks keep a readable field width, so a narrow
rail renders one column and a wider host fills more; full-row controls span
the track count.
New nodes open expanded and keep their state; a collapsed node stays
collapsed. The face details carry the role and the shape actions alone; child
face spans stay authored node parameters (`edgeStart`, `defaultLength`). The
profile sketch identity packs name, kind and process into one compact block.

Owner direction (2026-11-05, a new profile mounts on creation): a profile
created from a face lands its edge-array relation on that face's first
arrangeable edge — the fold-prone 'E0' default never ships, for drawn drafts
and library picks alike. While a profile edit is open, the sketch canvas
tracks the draft's placement: the first commit (the workpiece and its
relation landing) brings the assembly context and the mount frame into the
canvas live and refits the camera onto the mounted sketch, and a placement
change re-places the sketch in place.

Owner direction (2026-11-05, the edge + dial and honest bindings): the
free-shard + opens a two-choice dial on that edge — grow a face on the
shard, or start a profile mounted on it. The dial's profile workpiece is
created blank with its edge-array relation already bound to that face and
edge, and the sketch editor opens with the cassette context live around the
mount. A placement's binding is the joint: source occurrence, target
occurrence and face, and the pattern's edge; an unresolved target keeps the
relation unplaced under its source workpiece — it never silently rebinds to
another workpiece's face.

Owner direction (2026-11-03, native cassette view): the read-only cassette
record view mounts the native CadCraft canvas with every drawing layer,
dimensions included. Its layer control toggles those native layers. The view
is inert; card and record clicks stay with the host layout.

Owner direction (2026-11-03, native cassette dimensions and layers): the
cassette canvas draws its dimension annotations as native CadCraft dim entities
on the dimension layer from the drawing's structured annotation rows; their
lines render continuous in the canvas ink with readable labels, and a label
opens its authored field in place. Every assembly layer, dimensions included,
is a native CadCraft layer that the layer rows toggle and repaint. A filled
face layer seeds as a native hatch whose outer and hole loops keep their
winding and whose opacity rides entity transparency. A selected placed profile
draws its snapping dimensions along the parent edge: the edge ends and the
profile basis point chain measured distances, and array placements chain every
copy between the same edge ends.

Owner direction (2026-11-02, selection and canvas widgets): a face click
with a profile selected selects that face and leaves the profile relation
untouched; the face becomes the active selection. Designer chips, handles,
and hit areas keep their screen size across zoom. Trapezoid faces expose
width and height dimensions; authored corner geometry lives in the face
shape editor.

Owner direction (2026-11-02, compact profile placement fields): the
placement fields lay as PrimeVue `IftaLabel` controls over native inputs, with
the label inside the field. A parameter is its name label over one input, with
no heading or secondary label. Mirror controls are icon buttons labelled X
and Y. An invalid expression marks its field with the PrimeVue invalid
state and carries the reason in the field title.

Owner decision (2026-11-02, faces are parametric shapes; amended
2026-11-04, 2026-11-07): a face may be authored as a parametric sketch in the profile
shape model; the trapezoid remains the quick path. Add shapes author the
face and replace its trapezoid base; subtract shapes cut the result, and
construction is excluded. The face is its adds minus its subtracts on
the child's side of the datum; a set with no add leaves the face at
zero geometry, and its subtracts cut the parent where they land. The result is the
face region on the child's side of the datum. The child face keeps the material on its side of the datum.
The parent cut is the union of the subtracts, the boolean pass a closed
profile applies to its host. The sketch is the node's authored truth
(`sketch`), the OCCS face is the evaluated region (`polygon`), and the
authored sketch rides `face.extensions.perigram.sketch`. The face editor
is the profile editor in face mode: same expressions, fillets, shape
list, dimensions, and undo stack; the hatch is the face itself. Its datum is the parent
edge the face mounts to — a horizontal line spanning the host edge in
the face's shard coordinates (the shard start sits at zero), drawn as the
editor's dashed mount line. The parent
face renders as a ghost outline in the same coordinates, so the author
sees the real parent geometry and mounts the child to it. A root face
uses its own base edge as that line. A face created on a shard is born a
sketch face: its sketch carries the conversion seeding (a rectangle
keeping the authored width and height bindings), so authoring starts
with no conversion step. Converting a trapezoid seeds the
sketch from its current outline, keeping authored width and height
expressions for a rectangle and a closed chain for any other outline;
clearing the sketch returns the face to its trapezoid parameters. A
sketch face with no shapes has zero geometry: it renders nothing, holds
its shard, and the workpiece tree marks it. The
sketch commits to the node live whatever its table resolves to: structural
edits land while a field error persists, a face whose sketch does not
evaluate renders its trapezoid base until the table resolves, and the
evaluation error rides the editor's message. The
face's attachment edge is its first ring edge; the evaluated ring
rotates to start on the datum line so edge indexes hold across the
trapezoid and sketch authoring paths. Fold routes read the authored
boundaries and run on the child's owned interval, so a face shape
cutting across the datum leaves every bend curve unchanged.

Owner decision (2026-11-01, shape identity): the sketch model is the
truth and the canvas its projection, so a shape's identity rides its
entities. A seeded entity carries its shape's id and a tagged group
rebuilds exactly one shape of the authored kind — a circle from its
CIRCLE, a rectangle from its corner lines and fillet arcs, a chain from
its connected segments — with the authored id, op, expressions, and
fillet bindings whole. Geometry classification serves untagged geometry
alone: a drawn or imported piece becomes a shape of its own, dimensioned
once. Endpoint identity across seed and extraction works at the drawing
scale (0.05 mm), so a filleted corner's line and arc ends are one point.
A tagged group the extraction cannot read holds the authored shape whole.
Dimensions annotate authored shapes: one annotation set per shape, one
linear dimension per authored field or edge; primitives whose position
fields carry one expression share one dimension, and editing it edits
every shape it names.

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
  is the import path). A design is authored through one of two
  construction modes: `render` bakes a template at parameter values, and
  `upload` extracts geometry from a mapped DXF. Both modes store the same
  baked `geometry`; every design is nestable without a second step. The
  record name derives from the template and its parameter values on
  `render`, and from the uploaded file on `upload`; pickers list designs
  by that name. `designKey` stores the stable template-id plus canonical
  parameter identity, so a platform `Find` can reuse an existing design.
  The pure `design-key`, `design-bake`, and the extraction projection operations
  compute these values without writing records; instance creation and
  queue-entry writes stay on platform nodes.
- Owner decision (2026-10-31, DXF import): the upload create takes the
  DXF file and immediately maps its source layers to the OCCS layer
  vocabulary; the mapping is the create form's declared `mapping` input,
  the record stores it beside the extracted geometry, and `cut.outer`
  is the one required target. Template and source stay off the upload
  form. Template-based creation is the separate `render` construct,
  whose create form opens the picked template's OCCS parameter table as
  one input per parameter.
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

The independent Nesting plugin solves the generic polygon parts;
Facade constructs the resulting sheet designs with quantities. The
Facade `nesting-polygons` projection adapts one baked cassette design
into a source item: `sourceId` and `sourceKey` identify the design,
and `parts` carries each workpiece's coordinates, handles, and layer
metadata. A queue entry's count is joined by the Facade graph before
those generic items reach Nesting. A design item without its design ref
refuses at the Facade boundary.

The Nesting plugin accepts only generic source items and stock geometry.
It preserves each source ID and its opaque part metadata, solves the
placements, and groups layouts by sheet shape and the multiset of source
keys; placement order, rotation, and translation are the solver's
arrangement. It knows nothing about cassette-design or queue-entry
types. Facade resolves returned source IDs back to cassette-design refs
when constructing sheet designs. Sheet stock is the item count as the
worst case (one sheet per part); the solver uses only the sheets it
needs, so a run prompts no sheet count. The generic `sourceKey` is
provided by Facade as the cassette-design composition identity.

An organization's queue entry holds one design beside its count; that
design may be a library record outside the queue, so the Facade graph
projects every cassette design and joins each entry's stored design id
to its generic source item.

An XLSX order table becomes queue entries through the organization's
process definition: the table's rows fan out into a design render
(template from the row, parameters from the row) and a queue entry
`{ design, count }` per row. The platform carries no table-to-entry
code; the graph is the contract.

A nesting attempt holds one `sheet` relation (width and height) and one
`machine` relation (tool diameter). The solve reads the attempt's sheet
dimensions and machine tool diameter in place of prompting sheet width,
sheet height, and spacing on every run; the machine's tool diameter is
the nesting clearance.

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
