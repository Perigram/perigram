# OCCS Implementation Guide

## Geometry Resolution, Folding, Assembly, and Transcription

Version: Draft v0.1

---

# Purpose

This document is informative.

It does not define OCCS syntax. The OCCS specification defines the data model.

This guide defines recommended algorithms and implementation strategies for software that:

* renders OCCS geometry
* generates 3D models
* generates flat patterns
* exports DXF, SVG, STEP, IFC, CAM files
* imports CAD models into OCCS
* transcribes arbitrary geometry into OCCS

The goal is interoperability between independent implementations.

---

# Template to Design Materialization

OCCS has two document profiles:

```text
template
design
```

A template is a reusable parametric cassette definition. A design is the exact materialized cassette produced from a template and exact parameters.

Recommended materialization steps:

```text
template + exact parameter set
→ resolve expressions
→ resolve inherited dimensions
→ resolve workpiece, face, fold, entity, occurrence, and joint geometry
→ apply document/layer/entity defaults
→ resolve toolOffset values when a machine/export profile is selected
→ emit design document
```

The design document SHOULD preserve source template identity:

```text
derivedFrom.templateId
derivedFrom.templateVersion
derivedFrom.templateHash
derivedFrom.parameters
```

Canonical layer IDs SHOULD stay semantic in both template and design documents. Design exporters MAY generate CAD/CAM aliases that include tool diameter, route angle, machine preset, or shop naming.

---

# Terminology

## Workpiece

A physical manufactured part.

Examples:

* ACM tray
* folded sheet rib
* aluminium angle
* hook
* bracket
* extrusion

## Face

A planar region of a sheet workpiece.

## Fold

A geometric relation between two faces belonging to the same sheet workpiece.

## Joint

A connection between separate workpieces.

## Entity

Geometry placed on a workpiece or face.

Examples:

* holes
* slots
* cutouts
* engravings
* route lines
* markings

## Occurrence

An instance of a workpiece definition within a cassette assembly.

---

# Coordinate Systems

## Face Coordinates

Every face owns a local 2D coordinate system.

```text
u axis → horizontal
v axis → vertical
```

Origin is defined by the face geometry.

All face geometry is defined in local coordinates.

## Workpiece Coordinates

Every workpiece owns a local 3D coordinate system.

Sheet workpieces are initially unfolded in the XY plane.

```text
X = face u
Y = face v
Z = sheet normal
```

## Occurrence Coordinates

Each occurrence places a workpiece into cassette space.

Occurrence placement transforms workpiece coordinates into assembly coordinates.

---

# Expression Resolution

All implementations SHALL resolve expressions before geometry generation.

Supported operators:

```text
+
-
*
/
()
```

Example:

```text
A + R / 2 - 1
```

Implementations SHOULD preserve original expressions when saving.

Implementations MAY cache resolved values.

---

# Face Geometry

## Trapezoid Resolution

Trapezoid is the preferred face type.

Resolution uses two coordinate frames:

* reference-edge frame: origin at the referenced edge start, `+X` along the referenced edge
* canonical face-local frame: origin at the trimmed base start; target-face entities use this frame

Parameters:

```text
baseLength
baseStartOffset
baseEndOffset
height
topStartOffset
topEndOffset
p2Height
p3Height
```

Resolved points:

```text
referenceLength = explicit baseLength, or inherited fold source-edge length
L = referenceLength - baseStartOffset - baseEndOffset

Reference-edge frame:
Q0 = (baseStartOffset, 0)
Q1 = (referenceLength - baseEndOffset, 0)
Q2 = (
    referenceLength - baseEndOffset - topEndOffset,
    p2Height ?? height
)
Q3 = (
    baseStartOffset + topStartOffset,
    p3Height ?? height
)

Canonical face-local frame:
P0 = (0, 0)

P1 = (L, 0)

P2 = (
    L - topEndOffset,
    p2Height ?? height
)

P3 = (
    topStartOffset,
    p3Height ?? height
)
```

Generated edges:

```text
E0 = P0→P1
E1 = P1→P2
E2 = P2→P3
E3 = P3→P0
```

Rectangle is a trapezoid where all offsets are zero.

`baseStartOffset` and `baseEndOffset` trim the referenced parent edge during placement. A nonzero start offset means `Q0` is not `(0,0)` in the reference-edge frame, while the same physical corner is still `P0 = (0,0)` in the canonical face-local coordinate system.

---

## Polygon Resolution

Polygon faces are used when trapezoids cannot represent the shape.

Polygon boundaries are defined by segments.

Supported segments:

```text
line
arc
quadraticBezier
cubicBezier
```

Segments SHALL form a closed contour.

Edge numbering follows segment order.

---

# Entity Geometry

Entities represent manufacturing geometry.

Examples:

```text
hole
slot
cutout
engraving
marking
routing
```

Entity meaning is determined by layer semantics.

Implementations SHOULD NOT infer manufacturing intent from geometry alone.

Example:

```text
circle on cut.hole
→ through hole

circle on engrave
→ engraved circle
```

---

# Folding Algorithm

## Overview

Folding converts a sheet workpiece into a 3D body.

Input:

```text
faces
folds
```

Output:

```text
3D transforms for every face
```

---

## Step 1: Build Fold Graph

Construct graph:

```text
vertex = face
edge = fold
```

Validate:

```text
referenced faces exist
referenced edges exist
```

---

## Step 2: Select Root Face

Preferred order:

```text
role = main
largest area
first face in document
```

Root transform:

```text
identity matrix
```

Root face lies in XY plane.

---

## Step 3: Traverse Fold Graph

Recommended:

```text
breadth-first search
```

For each fold:

```text
parent face already placed
child face not yet placed
```

---

## Step 4: Compute Fold Axis

Fold axis is parent edge.

Example:

```text
main.E2
```

Resolved edge coordinates define axis line.

---

## Step 5: Align Child Edge

Transform child so:

```text
child edge
coincides with
parent edge
```

before rotation.

---

## Step 6: Apply Fold Rotation

Rotate child around fold axis.

```text
axis = fold.from start point -> fold.from end point
angle > 0 = right-hand-rule positive rotation around axis
angle < 0 = right-hand-rule negative rotation around axis
```

Recommended rotation:

```text
Rodrigues rotation
quaternion rotation
matrix rotation
```

all acceptable.

---

## Step 7: Apply Bend Radius

Simple viewers MAY ignore bend radius.

Manufacturing software SHOULD support:

```text
bend radius
neutral axis
bend allowance
k-factor
```

if available.

---

# Assembly Algorithm

Assembly places occurrences into cassette space.

Input:

```text
occurrences
joints
```

---

## Occurrence Placement

Resolve:

```text
origin
rotation
matrix
```

Apply transform to workpiece.

---

## Joint Placement

Joints connect workpieces.

Examples:

```text
rivet
screw
adhesive
hook
weld
```

Joints SHOULD NOT modify source geometry.

They define assembly relationships only.

---

# Flat Pattern Generation

## Purpose

Generate manufacturing layout.

Output:

```text
DXF
SVG
CAM
```

---

## Sheet Workpiece

Flat pattern equals unfolded geometry.

Generate:

```text
face contours
holes
slots
routing
markings
fold lines
```

using layer registry mappings.

---

## Profile Workpiece

Generate profile representation according to exporter capabilities.

---

# OCCS → DXF

Recommended mapping:

```text
cut.outer
→ DXF layer CUT_OUTER

cut.inner
→ DXF layer CUT_INNER

fold.centerline
→ DXF layer FOLD

fold.route
→ DXF layer ROUTE

engrave
→ DXF layer ENGRAVE

mark
→ DXF layer MARK
```

Implementations MAY allow user overrides.

---

# OCCS → SVG

Recommended mapping:

```text
layer
→ CSS class
```

Example:

```text
occs-cut-inner
occs-fold
occs-engrave
```

---

# Transcription (3D → OCCS)

## Purpose

Convert arbitrary geometry into OCCS.

---

## Step 1

Detect disconnected bodies.

Each body becomes:

```text
workpiece
```

candidate.

---

## Step 2

Detect planar regions.

Each planar region becomes:

```text
face
```

candidate.

---

## Step 3

Detect shared edges.

Shared edges become:

```text
fold candidates
```

---

## Step 4

Measure dihedral angles.

Store as:

```text
fold.angle
```

---

## Step 5

Unfold face graph.

Choose root face.

Rotate all adjacent faces into root plane.

---

## Step 6

Fit OCCS Geometry

Attempt:

```text
trapezoid fit
```

If valid within tolerance:

```text
emit trapezoid
```

Otherwise:

```text
emit polygon
```

---

# Canonicalization Rules

Implementations SHOULD prefer:

```text
trapezoid
```

over:

```text
polygon
```

when both represent identical geometry.

Implementations SHOULD preserve:

```text
expressions
layer ids
workpiece ids
entity ids
```

whenever possible.

Implementations SHOULD preserve topology even if geometry is rewritten.

---

# Round Trip Goal

The following transformation SHOULD preserve information:

```text
OCCS
 → CAD
 → OCCS
```

within configured tolerances.

Implementations SHOULD minimize conversion loss.

End of document.
