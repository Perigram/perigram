> Archived 2026-11-19. Historical design input only; not an active
> specification. The authoritative architecture is now in
> [../../SPEC.md](../../SPEC.md) §§28 and 30.13. This file is retained
> to preserve rationale and alternatives, not to authorize a parallel
> graph, type system, evaluator, or persistence model.

# Heterogeneous Artifact Graph (HAG)
## Architecture and implementation specification

**Document:** `SPEC.md`  
**Version:** 0.1.0  
**Status:** Initial implementation baseline  
**Audience:** Small coding agents and engineers implementing a node-based application  
**Normative language:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY have their usual requirements meaning.

---

## 0. Executive summary

Build a **typed, graph-based artifact composition system**. Users connect operations in a visual editor to import, extract, transform, compose, validate, preview, and export heterogeneous content such as Markdown, DOCX, XLSX, PDF, DXF, SVG, and images.

The system MUST unify the **workflow**, not force every format into one universal document model.

The architecture has five parts:

1. **Graph** — a serializable, versioned description of nodes, parameters, and connections.
2. **Type system** — semantic types for node ports, independent of file extensions and MIME types.
3. **Artifact model** — immutable, content-addressed results with one canonical semantic payload and zero or more file representations.
4. **IRs and operations** — a small family of domain-specific intermediate representations (IRs), with explicit transformations between them.
5. **Adapters** — isolated importers, exporters, extractors, and renderers for particular formats.

A graph is validated before execution and evaluated as a directed acyclic graph (DAG). Every conversion is an explicit node. Every node declares its input/output contracts and whether its conversion is lossless, semantically lossy, or visual-only. Unsupported features MUST produce diagnostics; they MUST NOT be silently discarded.

The first implementation SHOULD be deliberately small: Markdown, tabular data, a report composition model, HTML preview, and the artifact/graph runtime. XLSX, DOCX, PDF, and DXF support is added through adapters after the contracts are stable.

## 1. Goals and non-goals

### 1.1 Goals

The system MUST:

- Allow users to build reusable templates as node graphs.
- Compose content originating from different file formats.
- Represent node inputs and outputs with stable semantic types.
- Preserve original uploaded files when importing or extracting from them.
- Keep native format data distinct from normalized/interchange representations.
- Make conversions explicit and describe their fidelity and limitations.
- Support multiple outputs from the same graph, e.g. PDF, DOCX, XLSX, DXF, SVG, or HTML.
- Validate graphs and node parameters before execution.
- Execute deterministic transformations reproducibly where possible.
- Cache deterministic node results using content-derived keys.
- Allow new format adapters without changing the graph runtime or unrelated IRs.
- Provide useful, actionable errors and warnings.
- Keep the core runtime independent of Vue and the visual editor.

### 1.2 Non-goals for version 0.1

Do NOT attempt to:

- Create one universal AST capable of faithfully representing every feature of every file format.
- Reimplement Word, Excel, AutoCAD, or a general-purpose page-layout engine.
- Guarantee lossless conversion between unrelated formats.
- Convert arbitrary PDF pages back into fully editable source documents.
- Treat a rendered preview (PNG, SVG, or PDF) as equivalent to its editable source model.
- Execute arbitrary JavaScript, Python, shell commands, or user-provided code inside templates.
- Support cyclic graphs, unbounded loops, distributed execution, collaborative editing, or a public third-party plugin marketplace in the initial version.
- Make the visual editor responsible for parsing files, validating domain data, or executing transformations.

## 2. Foundational principles and invariants

These invariants are architectural constraints. Implementations and future agents MUST preserve them.

### P1. Semantic type is not file format

`text.flow-document` is a semantic type. `text/markdown` is a media type. `.md` is a filename extension. These are related but not interchangeable.

Node connection compatibility MUST be based on semantic types and schema versions, never on file extensions or MIME strings alone.

### P2. Native source is not an IR

An uploaded `drawing.dxf` MUST remain available as an original/native representation even after geometry is extracted from it. The extracted vector scene is a separate artifact with a declared conversion relationship.

Likewise, extracting values from XLSX MUST NOT destroy the original workbook, formulas, styles, or workbook metadata.

### P3. IRs are purpose-specific

Use different IRs for flow-based text, tabular data, vector geometry, CAD models, and page composition. Share common envelope, storage, graph, and diagnostic conventions—not a universal payload schema.

### P4. Conversion is explicit

A node MUST declare its input types, output types, and conversion fidelity. There is no implicit conversion when connecting graph ports. The editor MAY suggest adapter nodes, but the user or graph author must insert one explicitly.

### P5. No silent information loss

An adapter MUST either preserve a feature, report that it cannot preserve it, or reject the operation according to its declared policy. It MUST NOT silently claim a lossless conversion when it has discarded information.

### P6. Graph and domain layers are independent

The graph runtime MUST NOT import Vue, DOM, canvas, or editor-specific modules. The editor consumes node metadata and calls the runtime through an application service boundary.

### P7. Determinism by default

A node SHOULD be a pure deterministic transformation. Time, random values, network access, filesystem access, and mutable global state MUST NOT be implicit inputs. Nodes requiring these capabilities must declare them and MUST NOT be cached as pure nodes.

### P8. Small contracts over broad abstractions

Prefer a small number of explicit interfaces and concrete types. Do not add generic extension systems, inheritance frameworks, or speculative abstractions without a working use case and tests.

## 3. Vocabulary

| Term | Definition |
|---|---|
| **Graph** | A versioned DAG describing a computation or template. |
| **Node definition** | A registered operation contract and its implementation. |
| **Node instance** | A configured instance of a node definition inside a graph. |
| **Port** | A typed input or output of a node. |
| **Edge** | A connection from one node output to another node input. |
| **Semantic type** | The meaning and structure of a value, e.g. `table.dataset`. |
| **Schema version** | Version of a semantic payload contract. |
| **Artifact** | An immutable semantic result with stored payload and representations. |
| **Representation** | A serialization or view of an artifact, e.g. native DOCX, SVG preview, or canonical JSON. |
| **IR** | An intermediate representation used by transformations and composition. |
| **Adapter** | A format-specific importer, exporter, extractor, or renderer. |
| **Diagnostic** | A structured error, warning, or informational message. |
| **Fidelity** | What information survives a transformation. |

## 4. High-level architecture

```text
Input files
    │
    ▼
Format adapters ──► Artifacts + preserved native representations
    │
    ▼
Typed IRs
    │
    ▼
Graph operations: extract / transform / combine / validate / compose
    │
    ▼
Output IRs
    │
    ▼
Format adapters ──► DOCX / XLSX / PDF / DXF / SVG / HTML / other
```

The runtime has these modules:

```text
application/
  graph-editor/          # UI; depends on graph contracts and application services
  graph-service/         # load/save/validate/run graph use cases

core/
  graph/                 # graph schema, validation, DAG ordering
  types/                 # semantic type registry and compatibility
  artifacts/             # artifact records, references, provenance
  storage/               # artifact and blob storage interfaces
  execution/             # DAG evaluator, node context, cache
  diagnostics/           # diagnostic contracts
  nodes/                 # node definition registry and built-in node contracts

ir/
  flow-document/         # structured flowing text
  table-dataset/         # portable typed tabular data
  vector-scene/          # portable 2D vector scene
  report-document/       # flow-oriented composed report
  page-canvas/           # fixed-coordinate page composition
  cad-drawing/           # CAD-specific model boundary; initially DXF-focused
  workbook/              # workbook-specific boundary; initially XLSX-focused

adapters/
  markdown/
  xlsx/
  docx/
  pdf/
  dxf/
  svg/
  html/

```

This is a logical module structure, not a requirement to create every directory immediately. Do not create empty modules for future work.

## 5. Semantic type system

### 5.1 Type identifiers

Semantic type IDs MUST be stable, lowercase, namespaced strings. Use this convention:

```text
<domain>.<name>
```

Initial identifiers:

| Type ID | Meaning | Initial status |
|---|---|---|
| `file.binary` | Opaque file bytes plus media metadata | Required foundation |
| `text.flow-document` | Structured flowing text and block content | MVP |
| `table.dataset` | Portable typed rows and columns | MVP |
| `document.report` | Flow-oriented report composed from blocks | MVP |
| `document.page-canvas` | Fixed-size pages with positioned elements | Later |
| `media.image` | Raster image with dimensions and media data | Later |
| `geometry.vector-scene-2d` | Portable 2D vector scene | Later |
| `cad.drawing` | CAD drawing with CAD-specific entities and semantics | Later |
| `office.workbook` | Native spreadsheet workbook boundary | Later |
| `document.pdf` | Native PDF document boundary | Later |

A type ID identifies semantic meaning, not a file extension. A semantic type MUST have a schema version. Example: `text.flow-document@1`.

### 5.2 Type compatibility

Version 0.1 MUST use conservative compatibility:

- Exact semantic type ID and compatible schema version: connectable.
- Different semantic types: not connectable without an explicit conversion node.
- Unknown types: rejected with a diagnostic.
- No implicit conversion based on MIME type, file extension, or coincidental JSON shape.

Initially, only exact major schema versions are compatible. Add explicit migration nodes or migration functions when schema evolution is required.

### 5.3 Type descriptors

```ts
export interface SemanticTypeDescriptor {
  id: string;
  schemaVersion: number;
  title: string;
  description?: string;
  schema: object; // JSON Schema for serializable payload validation
}
```

JSON Schema validates payload shape; semantic rules such as units, coordinate frames, formula behavior, or CAD constraints may require additional validators.

## 6. Artifact model and storage

### 6.1 Artifact envelope

An artifact is an immutable logical value. Graph edges pass references to artifacts, not large in-memory objects or raw file bytes.

```ts
export interface ArtifactRef {
  artifactId: string;
  semanticType: string;
  schemaVersion: number;
  contentHash: string;
}

export type RepresentationRole =
  | "canonical"
  | "native-source"
  | "interchange"
  | "preview";

export interface ArtifactRepresentation {
  id: string;
  role: RepresentationRole;
  mediaType: string;
  format?: string;
  storageKey: string;
  sha256: string;
  byteLength: number;
  createdBy?: string;
}

export interface ArtifactRecord {
  id: string;
  semanticType: string;
  schemaVersion: number;
  contentHash: string;
  payloadStorageKey: string;
  representations: ArtifactRepresentation[];
  provenance: {
    createdAt: string;
    producerNodeId?: string;
    producerDefinition?: string;
    inputArtifactIds: string[];
    sourceArtifactIds?: string[];
  };
  metadata: Record<string, unknown>;
}
```

`payloadStorageKey` points to the canonical serialized semantic payload. A canonical representation descriptor MAY also be present for download/export purposes. Avoid storing the same bytes twice; implementations may treat the canonical payload itself as the canonical representation.

### 6.2 Artifact immutability

- An artifact MUST NOT be modified in place.
- Any transformation creates a new artifact.
- A representation may be added only by creating a new artifact record/version or by using an explicitly separate mutable metadata index. The canonical artifact record should remain immutable.
- Re-importing identical bytes and producing identical canonical payloads SHOULD result in the same content hash, even if artifact IDs differ.

### 6.3 Content hashes

- Use SHA-256 for blob integrity and cache identity.
- Canonical JSON payloads MUST use deterministic serialization before hashing (stable key order, stable number representation, no undefined values).
- The hash MUST include semantic type ID and schema version, so identical JSON under different types is not treated as the same artifact.
- Do not use timestamps, random IDs, or graph node IDs in pure-node cache keys.

### 6.4 Storage interfaces

Keep storage independent of the runtime and UI:

```ts
export interface ArtifactStore {
  get(ref: ArtifactRef): Promise<ArtifactRecord>;
  put(record: ArtifactRecord, payload: Uint8Array): Promise<ArtifactRef>;
  getPayload(ref: ArtifactRef): Promise<Uint8Array>;
}

export interface BlobStore {
  put(bytes: Uint8Array, options?: { mediaType?: string }): Promise<string>;
  get(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}
```

Adapt method signatures to the existing storage layer if one exists, but retain these responsibilities. Do not make node implementations access storage through global variables.

### 6.5 Unknown files

Any unsupported input MUST still be importable as `file.binary` with its original bytes, filename, detected media type, size, and hash. It can then be stored, passed to generic file-management nodes, or handled by a future adapter. Do not guess its semantic content.

## 7. Initial intermediate representations

IR payloads MUST be serializable and versioned. The following are canonical contracts for the initial system. Implement only the IRs required by the current milestone.

### 7.1 `text.flow-document@1`

Purpose: represent flowing text independently of Markdown, HTML, or DOCX serialization.

```ts
export interface FlowDocumentV1 {
  type: "text.flow-document";
  schemaVersion: 1;
  metadata?: {
    title?: string;
    language?: string;
  };
  blocks: FlowBlock[];
}

export type FlowBlock =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "blockquote"; blocks: FlowBlock[] }
  | { type: "code-block"; language?: string; text: string }
  | { type: "table"; dataset: ArtifactRef }
  | { type: "image"; image: ArtifactRef; alt?: string; caption?: string }
  | { type: "horizontal-rule" };

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "emphasis"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] };
```

Rules:

- Do not add arbitrary HTML nodes to the canonical model.
- Preserve unsupported source constructs in adapter diagnostics and, where practical, retain the original source representation.
- Do not embed large images or table payloads directly; reference their artifacts.
- A table block references a `table.dataset`, not a native spreadsheet workbook.

### 7.2 `table.dataset@1`

Purpose: portable tabular values, not a complete spreadsheet workbook.

```ts
export type TableValue = string | number | boolean | null;
export type TableColumnType =
  | "string" | "number" | "integer" | "boolean"
  | "date" | "datetime" | "decimal";

export interface TableDatasetV1 {
  type: "table.dataset";
  schemaVersion: 1;
  columns: Array<{
    id: string;
    name: string;
    label?: string;
    valueType: TableColumnType;
    unit?: string;
  }>;
  rows: Array<Record<string, TableValue>>;
  metadata?: {
    title?: string;
    source?: string;
  };
}
```

Rules:

- Each row MUST use column IDs as keys.
- Every declared column MUST have a value in every row; use `null` for missing data.
- `NaN`, `Infinity`, `undefined`, functions, and arbitrary class instances are forbidden.
- Dates MUST use ISO 8601 strings; do not serialize JavaScript `Date` instances.
- Formulas are not part of `table.dataset@1`. Formula evaluation belongs to workbook-specific logic or an explicit calculation node.
- Column order is the order in `columns`, not object key order.

### 7.3 `document.report@1`

Purpose: compose a flow-oriented report whose content can be rendered into HTML, PDF, or a supported DOCX subset.

```ts
export interface ReportDocumentV1 {
  type: "document.report";
  schemaVersion: 1;
  title?: string;
  language?: string;
  sections: Array<{
    id: string;
    title?: string;
    blocks: ReportBlock[];
  }>;
  theme?: {
    fontFamily?: string;
    baseFontSizePt?: number;
    pageSize?: "A4" | "Letter" | "Legal";
    marginsMm?: { top: number; right: number; bottom: number; left: number };
  };
}

export type ReportBlock =
  | { type: "flow"; document: ArtifactRef }
  | { type: "table"; dataset: ArtifactRef; title?: string }
  | { type: "figure"; image: ArtifactRef; caption?: string }
  | { type: "vector-figure"; scene: ArtifactRef; caption?: string };
```

Rules:

- Report blocks refer to other artifacts. They do not copy entire IR payloads.
- A renderer determines pagination and target-specific layout.
- `document.report` is not a fixed-coordinate canvas.
- Version 1 has a deliberately small block vocabulary. Add a block type only with an IR schema, renderer behavior, and tests.

### 7.4 `geometry.vector-scene-2d@1` (later milestone)

Purpose: represent portable 2D visual geometry. This is not a replacement for a CAD drawing.

Required concepts:

- Explicit `units` (at minimum `mm`, `pt`, `px`, or `unitless`).
- Explicit coordinate-space identifier.
- Primitive elements: line, polyline, path, circle, ellipse, rectangle, text, and group.
- Optional stroke/fill styles and affine transforms.
- Stable element IDs where editing or selection requires them.

Do not silently interpret unitless geometry as millimetres or points. Any coordinate conversion must be an explicit operation.

### 7.5 `cad.drawing@1` (later milestone)

Purpose: preserve CAD-specific semantics such as entities, layers, blocks, dimensions, units, and coordinate systems.

The initial DXF adapter MAY treat native DXF bytes as the authoritative source and maintain a normalized index for supported queries. It MUST NOT claim that an SVG or simplified geometry extraction is a complete editable CAD model.

A DXF-to-vector-scene node is a visual/interchange conversion unless a documented subset is proven to round-trip. It MUST report unsupported entities or approximations.

### 7.6 `office.workbook@1` (later milestone)

Purpose: preserve workbook-specific features. XLSX is not equivalent to `table.dataset`.

The initial workbook adapter MAY preserve the native XLSX package as the authoritative representation and expose explicit operations such as:

- List sheets.
- Extract a selected sheet/range into `table.dataset`.
- Read named ranges where supported.
- Write a dataset into a new workbook or designated range where supported.

It MUST document whether formulas, formatting, charts, merged cells, validation rules, macros, external links, and named ranges are preserved. Never claim complete workbook round-tripping unless tested for those features.

### 7.7 `document.page-canvas@1` (later milestone)

Purpose: fixed-coordinate page composition for layouts where exact placement matters.

It MUST define page dimensions and coordinate units explicitly. It is separate from `document.report`; a report flows and paginates, while a page canvas positions elements at specified coordinates.

## 8. Graph data model

### 8.1 Graph schema

```ts
export interface GraphDocumentV1 {
  format: "hag.graph";
  version: 1;
  id: string;
  title?: string;
  nodes: NodeInstance[];
  edges: GraphEdge[];
  inputs?: GraphInputBinding[];
  outputs?: GraphOutputBinding[];
}

export interface NodeInstance {
  id: string;
  definitionId: string;
  definitionVersion: string;
  params: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  from: { nodeId: string; portId: string };
  to: { nodeId: string; portId: string };
}

export interface GraphInputBinding {
  id: string;
  nodeId: string;
  portId: string;
  title?: string;
}

export interface GraphOutputBinding {
  id: string;
  nodeId: string;
  portId: string;
  title?: string;
}
```

The graph format version is independent of node definition versions and IR schema versions. Do not conflate them.

### 8.2 Node definition contract

```ts
export interface PortDefinition {
  id: string;
  title: string;
  semanticType: string;
  schemaVersion: number;
  required?: boolean;       // default true for inputs
  multiple?: boolean;       // default false
  description?: string;
}

export interface NodeDefinition {
  id: string;
  version: string;          // semantic version
  title: string;
  category: string;
  description?: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  paramsSchema: object;     // JSON Schema
  execution: "pure" | "effect";
  conversion?: {
    fidelity: "lossless" | "semantic-loss" | "visual-only";
    notes: string[];
  };
  execute(
    context: NodeExecutionContext,
    inputs: Record<string, ArtifactRef | ArtifactRef[]>,
    params: Record<string, unknown>
  ): Promise<Record<string, ArtifactRef>>;
}
```

Rules:

- A node definition is registered in code; a graph stores its `definitionId` and pinned `definitionVersion`.
- Port IDs are stable API identifiers. Changing a port ID is a breaking node-definition change.
- Parameter and payload validation must happen before executing the node.
- Node implementations MUST NOT access Vue, editor state, browser DOM, or global mutable stores.
- Node outputs MUST match the declared output ports and semantic types.
- A node MUST return an error if a required capability or feature is unavailable. It MUST NOT manufacture placeholder output that looks valid.

### 8.3 Graph validation

Before running a graph, validate all of the following:

1. Graph format and version are supported.
2. Every node definition exists at the pinned version.
3. Node parameters satisfy the node's JSON Schema.
4. Every edge references an existing node and port.
5. Edge direction is output → input.
6. Semantic types and schema versions are compatible.
7. Required input ports are connected or bound to graph inputs.
8. Single-input ports do not receive multiple edges.
9. No duplicate edges exist.
10. The graph is acyclic.
11. Required node capabilities are available in the current runtime.

Return all discoverable validation diagnostics together; do not stop at the first unrelated error.

Version 1 does not support cycles. A cycle MUST be rejected with a diagnostic that includes the cycle path if available.

## 9. Execution model

### 9.1 DAG evaluation

- Validate first; do not begin execution on an invalid graph.
- Calculate a topological order.
- Execute a node only after all of its inputs are available.
- Independent nodes MAY run concurrently, subject to a configurable concurrency limit.
- Node outputs are stored as artifacts and referenced by `ArtifactRef`.
- A node failure blocks its downstream dependents but does not erase successful independent results.
- Execution MUST support cancellation.
- Initial implementation MAY execute in one process/worker. Distributed scheduling is out of scope.

### 9.2 Execution context

```ts
export interface NodeExecutionContext {
  signal: AbortSignal;
  artifacts: ArtifactStore;
  blobs: BlobStore;
  diagnostics: DiagnosticReporter;
  runtimeVersion: string;
  graphId: string;
  nodeId: string;
}
```

Inject dependencies through the context. Do not import singleton stores from nodes.

### 9.3 Purity and effects

`execution: "pure"` means output is a deterministic function of definition version, parameters, and input content hashes. Pure nodes can be cached.

`execution: "effect"` means the node accesses state outside its declared inputs or performs side effects. Effect nodes are not cached by default and must state their required capabilities. Examples include fetching remote data or writing to an external system. Do not add effect nodes to the MVP unless required.

### 9.4 Cache key

A pure-node cache key MUST include:

- Node definition ID and exact version.
- Canonically serialized validated parameters.
- Input port IDs and input artifact content hashes, in deterministic order.
- Relevant runtime/adapter version when it affects output.

A cache key MUST NOT include node instance ID, graph ID, canvas position, current time, or random values.

If the node's implementation or external adapter behavior changes, its definition version or cache-relevant adapter version must change.

### 9.5 Diagnostics

```ts
export type DiagnosticSeverity = "info" | "warning" | "error";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  nodeId?: string;
  portId?: string;
  artifactId?: string;
  details?: Record<string, unknown>;
  sourceLocation?: {
    file?: string;
    page?: number;
    sheet?: string;
    cellRange?: string;
    entityHandle?: string;
  };
}
```

Diagnostic codes MUST be stable machine-readable identifiers such as `GRAPH_CYCLE`, `PORT_TYPE_MISMATCH`, `UNSUPPORTED_DXF_ENTITY`, or `XLSX_FORMULA_NOT_EVALUATED`.

A warning must identify what was not preserved or what assumption was made. Avoid vague messages such as "conversion may be imperfect".

## 10. Conversion and fidelity rules

Every adapter or conversion node MUST declare one of these fidelity levels:

| Fidelity | Meaning | Example |
|---|---|---|
| `lossless` | All supported semantic information is preserved according to the declared source/target contracts. | A validated dataset serialization round-trip. |
| `semantic-loss` | Some source semantics/features are dropped, simplified, or not represented. | XLSX range extraction to `table.dataset` drops workbook formatting and formulas. |
| `visual-only` | Appearance is produced, but editability or domain semantics are not preserved. | DXF to SVG rendering. |

Do not use `lossless` merely because the output looks similar. Fidelity is relative to a documented supported feature subset.

Each conversion node SHOULD expose an unsupported-feature policy:

- `error`: fail if an unsupported feature is encountered.
- `warn`: continue, emit a diagnostic for each unsupported feature class, and retain the original source artifact.
- `skip`: omit unsupported material only when the user explicitly selected this policy.

The default SHOULD be `warn` for extractors and `error` for operations that promise exact editing or manufacturing output.

## 11. Rendering and output targets

### 11.1 Separate content from rendering

IRs describe meaning. Renderers translate IRs to target formats. Do not place PDF-specific drawing commands in `FlowDocument` or Excel cell coordinates in `ReportDocument`.

### 11.2 Initial report targets

For `document.report@1`, implement targets in this order:

1. HTML preview.
2. PDF export.
3. DOCX export for the explicitly supported report-block subset.

A renderer MUST declare supported block types and feature limits. Unsupported blocks MUST cause an error or an explicit fallback diagnostic according to the chosen policy.

HTML preview is not the canonical artifact. It is a representation generated from the report.

### 11.3 Target-specific layout

- A flow report delegates pagination to its renderer.
- A page canvas uses explicit page coordinates and units.
- A spreadsheet uses a cell grid and workbook-specific layout.
- CAD uses model coordinates and drawing-specific semantics.

Do not attempt to make one layout algorithm cover all four.

## 12. Adapter architecture

Each format adapter is isolated behind a small interface. Exact interfaces may vary by operation, but the responsibilities must remain separate.

```ts
export interface ImportAdapter {
  id: string;
  supportedMediaTypes: string[];
  importFile(
    context: AdapterContext,
    file: ImportedFile,
    options: Record<string, unknown>
  ): Promise<ImportResult>;
}

export interface ExportAdapter {
  id: string;
  targetMediaType: string;
  exportArtifact(
    context: AdapterContext,
    artifact: ArtifactRef,
    options: Record<string, unknown>
  ): Promise<ExportResult>;
}
```

An adapter MUST:

- Be testable without the visual editor.
- Declare supported formats and versions.
- Validate inputs and outputs.
- Preserve original bytes when importing where applicable.
- Report unsupported features and fidelity.
- Avoid changing unrelated semantic types.
- Avoid hidden network access.

Suggested technology is intentionally not mandated by this spec. Select libraries after checking browser/Node compatibility, licensing, feature coverage, package size, and maintenance. A library must be replaceable without changing the semantic type contracts.

## 13. Project package format

A saved template/project SHOULD be a ZIP-based package with a manifest and graph. Example:

```text
example.hag/
  manifest.json
  graph.json
  schemas/
    graph-v1.schema.json
  assets/
    input/
      source.md
      drawing.dxf
      materials.xlsx
    artifacts/
      <content-hash>.json
      <content-hash>.bin
  previews/
  exports/
```

Example manifest:

```json
{
  "format": "hag.package",
  "version": 1,
  "projectId": "example-project",
  "title": "Engineering report template",
  "graph": "graph.json",
  "createdAt": "2026-11-02T00:00:00Z"
}
```

Rules:

- Package paths MUST be relative and normalized.
- Reject path traversal (`../`), absolute paths, duplicate normalized paths, and suspicious archive expansion ratios.
- The manifest MUST declare package format version.
- Graph and IR schema versions remain separately versioned.
- Original input files MUST be retained under `assets/input/` or equivalent blob storage.
- Generated previews and exports MAY be omitted from a portable package and regenerated.
- Do not store credentials, secrets, or expiring access tokens in the package.

The package is a project container, not a new universal document format. Exported DOCX/XLSX/PDF/DXF files remain ordinary native files.

## 14. Security and resource limits

All imported files are untrusted.

The implementation MUST:

- Enforce configurable limits on file size, decompressed size, page count, row count, entity count, nesting depth, and execution time.
- Protect against ZIP bombs and path traversal in ZIP-based formats (DOCX, XLSX, ODT, and project packages).
- Avoid executing macros, embedded scripts, formulas with external side effects, or arbitrary template code.
- Run expensive parsers/renderers in a worker or isolated process when practical.
- Support cancellation and fail safely on resource exhaustion.
- Avoid logging full file contents or sensitive cell/text values by default.
- Treat external links in documents as data; do not fetch them automatically.

Any limit exceeded MUST produce a structured diagnostic, not a hang or silent partial result.

## 15. User experience contract for the node editor

The editor is a client of the graph and node registries.

It MUST be able to query:

- Node title, category, description, and version.
- Input/output port IDs, labels, semantic types, schema versions, and multiplicity.
- Parameter JSON Schema and user-facing parameter descriptions.
- Conversion fidelity and notes.
- Whether a node requires capabilities unavailable in the current environment.

The editor SHOULD:

- Display semantic types on ports or in connection inspection.
- Prevent invalid connections or explain why they are invalid.
- Offer suggestions for explicit conversion nodes where a registered path exists.
- Show warnings and errors on the relevant node/port.
- Distinguish original/native files from previews and extracted representations.
- Show output previews without making previews editable source artifacts.

Do not put business rules in Vue components. The editor may do fast visual checks, but the core validator is authoritative.

## 16. MVP implementation plan

Implement in small vertical slices. Each phase must compile and have tests before the next begins.

### Phase 0 — Repository and contract discovery

1. Inspect existing repository architecture, language, storage, node editor, and test tooling.
2. Identify existing graph types and avoid duplicating them.
3. Write a short mapping from this spec to existing modules.
4. Do not refactor unrelated application code.

**Deliverable:** a repository-specific implementation plan and list of files to add/change.

### Phase 1 — Core contracts

Implement:

- Semantic type descriptors and registry.
- Artifact references and records.
- Graph schema types.
- Node definition and port contracts.
- Structured diagnostics.
- JSON Schema validation utilities.

No format adapters yet.

**Acceptance:** type-checking and unit tests prove unknown types, invalid schemas, and incompatible versions are rejected.

### Phase 2 — Graph validation and execution

Implement:

- Node registry.
- Graph validator.
- DAG cycle detection and topological ordering.
- Sequential executor first; bounded concurrency can follow.
- Injected artifact/blob stores.
- Pure-node cache interface and deterministic cache-key generation.

Create test nodes: constant, pass-through, concatenate text, and deliberately failing node.

**Acceptance:** valid graph executes; invalid graph never executes; independent successful branches survive a separate branch failure; cancellation works; pure cache key is stable.

### Phase 3 — Minimal IRs and Markdown ingestion

Implement:

- `text.flow-document@1` validators.
- `table.dataset@1` validators.
- Markdown importer to FlowDocument.
- Markdown exporter from FlowDocument.
- Original source-file preservation.

**Acceptance:** heading/paragraph/list/emphasis/code/link round-trip tests; unsupported syntax emits diagnostics; imported original bytes remain available.

### Phase 4 — Report composition and preview

Implement:

- `document.report@1` validator.
- Nodes to create a report, add a section, append flow content, and append a table.
- HTML preview renderer.
- Basic table renderer.

**Acceptance:** one graph composes a Markdown description and a generated dataset table into a report preview; report IR does not contain HTML markup.

### Phase 5 — Native file adapters

Prioritize based on actual product needs:

1. XLSX import → selected range → `table.dataset`.
2. DOCX import → supported `text.flow-document` subset; preserve original DOCX.
3. PDF import/preservation and preview/extraction operations.
4. DXF import/preservation and CAD-to-vector preview.
5. PDF and DOCX report export.
6. XLSX and DXF output only when their native editing/round-trip requirements are specified.

Each adapter is a separate task with a feature matrix and tests. Do not implement all formats in one task.

### Phase 6 — Project packaging and template library

Implement versioned package import/export, asset references, graph templates, and package security checks.

Package support can be pulled earlier if persistence requires it, but keep it independent of graph execution.

## 17. Required test strategy

Every module must have unit tests. Add integration tests for cross-module behavior.

### 17.1 Core tests

- Semantic type equality and schema-version compatibility.
- Artifact hash stability.
- Graph edge validation.
- Required and multiple inputs.
- Cycle rejection.
- Missing node definition rejection.
- Parameter validation.
- Deterministic topological ordering.
- Cache-key stability and invalidation on definition version change.
- Cancellation and failure propagation.

### 17.2 IR tests

- Valid payload accepted; invalid payload rejected.
- Unknown enum/type rejected.
- Non-finite numbers rejected.
- Table rows contain declared column IDs only.
- FlowDocument nested blocks validate to a bounded depth.
- Artifact references point to compatible semantic types.

### 17.3 Adapter tests

For every adapter, maintain a small fixture set with:

- A simple valid file.
- A file with common optional features.
- A malformed file.
- A file with at least one unsupported feature.

Assert output content and diagnostic codes, not just that the adapter does not throw.

### 17.4 End-to-end golden test

The first end-to-end scenario:

```text
source.md ──► Markdown importer ──► FlowDocument ─┐
                                                  ├─► Report composer ─► HTML preview
sample rows ─► Dataset creator ─► TableDataset ───┘
```

A golden test must verify the resulting report structure and key rendered HTML, while allowing irrelevant whitespace differences.

## 18. Implementation rules for small coding agents

These rules are intended to prevent agents with limited context from creating incompatible architecture.

### 18.1 Before editing

1. Read this entire spec.
2. Inspect the existing repository and identify its current language, graph implementation, storage, and test commands.
3. Locate existing types before adding new ones.
4. State the exact task scope and the files expected to change.
5. If the repository already has an equivalent abstraction, extend it rather than creating a duplicate.

### 18.2 During implementation

- Work on one bounded task from the implementation plan.
- Preserve the invariants in Section 2.
- Do not rename public IDs, port IDs, or semantic types without an explicit migration.
- Do not introduce implicit conversions.
- Do not add dependencies without stating why and checking their license/runtime compatibility.
- Do not implement future phases opportunistically.
- Do not create fake adapters that return plausible but incomplete outputs.
- Do not swallow parser errors or unsupported-feature warnings.
- Keep UI, graph runtime, IRs, and adapters separated.
- Prefer small functions and explicit types over generic frameworks.

### 18.3 Before declaring completion

The agent MUST report:

1. Files created or modified.
2. Contracts or behavior implemented.
3. Tests run and their results.
4. Known limitations and unsupported cases.
5. Any deviation from this spec, with justification.

A task is not complete merely because the code compiles. Its acceptance criteria and tests must pass.

### 18.4 Task prompt template

Use this template when delegating to a small agent:

```text
Read SPEC.md fully. Implement only: <one bounded task>.

Repository context:
- Inspect the existing code before editing.
- Reuse existing abstractions where equivalent.

Scope:
- <explicit behavior to implement>
- <exact modules/files if known>

Do not:
- Implement other phases.
- Add implicit type conversions.
- change public contracts outside this task.
- invent unsupported format behavior.

Acceptance criteria:
- <observable criterion 1>
- <observable criterion 2>
- tests cover success, invalid input, and relevant failure paths.

Before finishing, run the relevant type-check and tests, then report changed files, test results, and limitations.
```

## 19. Definition of done for version 0.1

The foundational implementation is complete when:

- A graph can be serialized and loaded using a versioned format.
- Node definitions are registered and version-pinned.
- Ports use semantic types and JSON Schema validation.
- Graph validation rejects incompatible connections and cycles.
- A DAG executes through an injected artifact store.
- Artifacts are immutable and content-addressed.
- Pure nodes have deterministic cache keys.
- Markdown can be imported into FlowDocument and exported back for the supported subset.
- Tabular data can be validated and inserted into a report.
- A report can be previewed as HTML.
- Original inputs remain preserved.
- Diagnostics identify unsupported or lossy operations.
- Tests cover the end-to-end Markdown + table → report → HTML path.

This is a foundation, not a claim of complete DOCX/XLSX/PDF/DXF interoperability.

## 20. Open decisions (do not guess silently)

Resolve these using the existing repository and product requirements. Record decisions in an ADR or implementation note.

1. **Runtime:** browser-only, Node/server, or hybrid. This affects parser/rendering adapters, but not core contracts.
2. **Persistence:** existing database/blob store versus a local ZIP package as the primary source of truth.
3. **Graph editor:** existing Vue node editor and its graph schema. Reuse it where feasible.
4. **Expression language:** whether templates need a safe expression language for calculations and conditional content. Do not use `eval`; defer until a real use case exists.
5. **DOCX fidelity:** which Word features must round-trip or be generated.
6. **XLSX fidelity:** whether formulas/styles/charts/macros need preservation or only values and selected ranges.
7. **DXF scope:** supported DXF versions and entity types; whether editing or only extraction/rendering is required initially.
8. **PDF scope:** preservation, merging, text extraction, page rendering, or full generation; these are separate capabilities.
9. **Licensing:** verify every selected library against the application's distribution and commercial-use requirements.

Do not block Phase 1 on decisions that do not affect its contracts. Do not pretend unresolved adapter requirements are already supported.

---

## Appendix A — Reference graph (illustrative)

This is an illustration of the graph shape, not a complete JSON Schema. IDs and node definitions must exist in the runtime registry.

```json
{
  "format": "hag.graph",
  "version": 1,
  "id": "engineering-report",
  "title": "Engineering report",
  "nodes": [
    {
      "id": "markdown-import",
      "definitionId": "markdown.import",
      "definitionVersion": "1.0.0",
      "params": { "sourceAssetId": "asset-description" }
    },
    {
      "id": "dataset-source",
      "definitionId": "table.dataset.create",
      "definitionVersion": "1.0.0",
      "params": {
        "columns": [
          { "id": "material", "name": "Material", "valueType": "string" },
          { "id": "quantity", "name": "Quantity", "valueType": "number", "unit": "m²" }
        ],
        "rows": [
          { "material": "Aluminium", "quantity": 12.5 }
        ]
      }
    },
    {
      "id": "report-compose",
      "definitionId": "report.compose",
      "definitionVersion": "1.0.0",
      "params": { "title": "Material report" }
    },
    {
      "id": "html-render",
      "definitionId": "report.render-html",
      "definitionVersion": "1.0.0",
      "params": {}
    }
  ],
  "edges": [
    {
      "id": "e1",
      "from": { "nodeId": "markdown-import", "portId": "document" },
      "to": { "nodeId": "report-compose", "portId": "content" }
    },
    {
      "id": "e2",
      "from": { "nodeId": "dataset-source", "portId": "dataset" },
      "to": { "nodeId": "report-compose", "portId": "table" }
    },
    {
      "id": "e3",
      "from": { "nodeId": "report-compose", "portId": "report" },
      "to": { "nodeId": "html-render", "portId": "report" }
    }
  ],
  "outputs": [
    { "id": "preview", "nodeId": "html-render", "portId": "html" }
  ]
}
```

## Appendix B — Important distinctions

| Do not confuse | Correct distinction |
|---|---|
| `.xlsx` and `table.dataset` | XLSX is a workbook package; dataset is extracted portable data. |
| `.dxf` and `geometry.vector-scene-2d` | DXF contains CAD semantics; vector scene is a portable visual model. |
| PDF and `document.report` | PDF is a fixed rendered document; report is a semantic source for rendering. |
| MIME type and semantic type | MIME identifies serialization; semantic type determines meaning and port compatibility. |
| Preview and source | A preview is a derived representation, not the authoritative editable model. |
| Graph version and node version | The graph serialization contract and individual operation contracts evolve independently. |
| Validation and execution | Invalid graphs must be rejected before node execution begins. |

**End of specification.**
