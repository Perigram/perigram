> Archived 2026-11-19. Historical design input only; not an active
> specification. The authoritative architecture is now in
> [../../SPEC.md](../../SPEC.md) §§28 and 30.13. This file is retained
> to preserve rationale and alternatives, not to authorize a parallel
> graph, type system, evaluator, or persistence model.

# Architecture considerations for a universal node-based workflow system

## 1. Purpose and design constraints

The goal is not to build a CAD application with a node editor attached.
The goal is a general, extensible node-based environment for complex
multimodal workflows, including:

-   Parametric and computational geometry
-   B-Rep CAD and mesh modelling
-   Architectural drafting and BIM
-   Drawings, documents, PDFs and markup
-   Tables, data processing and quantity takeoff
-   Spatial/GIS data
-   Text, images and other media
-   Interoperation between these domains

The system must integrate into an existing web application rather than
become a separate application with its own competing data model.

Known constraints:

-   Existing frontend: Vue + TypeScript + Vite.
-   Existing application data authority: MongoDB.
-   MongoDB stores collections of objects whose types are declared by
    users, together with relationships between objects.
-   The node system must operate over that existing object model.
-   The architecture must support multiple computational engines with
    different internal data models.
-   The design must be general-purpose. Fixes and abstractions should
    solve system-level problems rather than special-case a particular
    graph, CAD object or workflow.
-   Browser delivery is required, but substantial computation need not
    run in the browser.
-   Avoid making Pyodide the only execution environment. Its
    package-loading constraints and initialization costs are a poor
    foundation for heavyweight CAD/BIM execution.

The central architectural question is how to provide a coherent graph
and interoperability model without forcing every domain or engine into
one artificial universal object model.

## 2. Main recommendation

Use a small, explicit shared contract around otherwise independent
domain models and engines.

Do **not** create one universal geometry/data type system that attempts
to represent every engine's objects as the same thing. Do **not**
replace the existing MongoDB application model with a second object
database inside the graph engine.

Keep these concerns distinct:

1.  **Application object model** --- persistent user-defined objects and
    relationships in MongoDB.
2.  **Representation model** --- the different representations an
    application object may have, such as B-Rep, mesh, IFC, drawing or
    document.
3.  **Engine-native model** --- the actual types and semantics owned by
    OCCT, Manifold, IfcOpenShell, OpenUSD, DuckDB, etc.
4.  **Graph type model** --- the contracts used to validate connections
    and reason about values and operations.
5.  **Execution value model** --- transient values and references passed
    between nodes during a run.

The graph system connects these layers. It should not collapse them.

## 3. Should the core be written in OCaml?

OCaml is a strong candidate for the graph and workflow core,
particularly for:

-   Graph structure and invariants
-   Type descriptors and compatibility checking
-   Validation
-   Dependency analysis
-   Execution planning
-   Evaluation semantics
-   Incremental recomputation
-   Cache contracts
-   Transaction and side-effect modelling
-   Adapter and conversion contracts

Its algebraic data types, pattern matching, module system and static
type checking are useful for implementing a reliable semantic core.

However, this is not a recommendation to rewrite the entire application
in OCaml.

### Recommended language boundaries

  Area                                       Recommended technology
  ------------------------------------------ ------------------------------------------
  Existing application UI                    Vue + TypeScript
  Graph canvas and inspectors                Existing frontend stack
  Graph semantics and type/validation core   OCaml
  CAD kernel                                 OCCT
  Higher-level CAD API                       OCP / build123d where useful
  Mesh booleans                              Manifold
  Selective computational geometry           CGAL
  BIM / IFC                                  IfcOpenShell
  Tabular analytics                          DuckDB + Polars / Arrow
  Spatial processing                         GDAL, GeoPandas, Shapely as appropriate
  Viewport                                   Three.js or existing rendering stack
  Heavy native execution                     Python, C++, Rust workers as appropriate
  Persistent application objects             Existing MongoDB model
  Large generated files                      Existing object-storage infrastructure

OCaml should own the semantics of the workflow system, not the
implementation details of every domain engine.

### Browser integration

Possible OCaml compilation targets include:

-   **js_of_ocaml**: mature route for compiling OCaml to JavaScript.
-   **Melange**: generates JavaScript with a more direct fit for the
    JavaScript ecosystem.
-   **wasm_of_ocaml**: possible WebAssembly route, subject to runtime
    and browser compatibility evaluation.

Start with the simplest integration that fits the existing
Vue/TypeScript application. Treat the OCaml core as a library called by
the application, not as a replacement frontend.

Do not assume that browser compilation makes native OCaml concurrency or
native engine capabilities available in the browser. Heavy computation
should be dispatched to workers or services.

A sensible progression is:

1.  Implement the semantic core in OCaml.
2.  Compile it to JavaScript and integrate it into the existing
    frontend.
3.  Reuse the same core natively on the server if that becomes useful.
4.  Keep engine execution in dedicated runtimes and workers.

## 4. Three different kinds of types

This distinction is foundational.

### 4.1 Application types

These are user-defined business/domain types in the existing MongoDB
model. Examples might include:

-   Project
-   Building
-   Facade
-   Cassette
-   Material
-   Room
-   DrawingSet
-   Equipment

They define application fields, references and relationships. They are
not CAD-kernel types.

An illustrative descriptor:

``` json
{
  "id": "Cassette",
  "version": 3,
  "fields": {
    "width": {
      "type": "Quantity",
      "dimension": "Length",
      "unit": "mm"
    },
    "height": {
      "type": "Quantity",
      "dimension": "Length",
      "unit": "mm"
    },
    "material": {
      "type": "Reference",
      "target": "Material"
    }
  },
  "relationships": {
    "facade": {
      "target": "Facade",
      "cardinality": "many-to-one"
    }
  }
}
```

This is only an illustration of the concepts. The graph system should
integrate with the actual schema and relationship format already used by
the application, not invent a replacement schema.

Because users can declare types dynamically, these schemas should be
represented as runtime descriptors. They should not need to become newly
compiled OCaml algebraic data types every time a user creates a type.

OCaml's static type system checks the implementation of the core.
Runtime descriptors describe user-created application types.

### 4.2 Representation types

One application object can have several representations, possibly
generated at different times and with different lifecycles:

-   B-Rep solid
-   Triangle mesh
-   IFC entity or IFC file fragment
-   2D drawing
-   Raster image
-   PDF
-   Point cloud
-   Analytical table
-   Scene representation

For example, a `Facade` application object might have a parametric B-Rep
representation, a tessellated viewport representation, an IFC
representation and a drawing representation.

These are not interchangeable. They may have separate versions,
provenance, generation status and storage locations.

### 4.3 Engine-native types

Each engine has its own types and semantics:

-   OCCT: `TopoDS_Shape`, `TopoDS_Face`, `TopoDS_Wire`, etc.
-   Manifold: its mesh/manifold data structures.
-   IfcOpenShell: IFC entities and IFC file/model structures.
-   OpenUSD: stages, prims and composition arcs.
-   DuckDB: relations, tables and query results.
-   Other libraries: their own native objects.

Preserve these native models when possible. Do not flatten them into a
lowest-common-denominator universal geometry structure and pretend that
no information was lost.

A graph port can describe the relevant contract while the runtime value
remains an opaque engine-native handle or artifact reference.

## 5. The shared interoperability contract

The shared type system should be deliberately small. It should describe
what the graph needs to know, not attempt to reimplement every domain's
ontology.

Useful shared concepts include:

-   Stable identity and references
-   Type identifiers and descriptor versions
-   Runtime value kind
-   Engine and representation identifiers
-   Metadata
-   Units and dimensional quantities
-   Coordinate reference systems where relevant
-   Version and provenance
-   Serialization and artifact references
-   Capabilities
-   Conversion declarations
-   Execution and error contracts

### Opaque values and handles

The graph should be able to carry an opaque reference to a native value
without understanding its internal structure.

For example, an OCCT shape can remain an OCCT shape. The graph may know
that it is a B-Rep shape, which engine owns it, what operations are
supported, and how it can be serialized or tessellated. It does not need
to know the shape's internal topology.

### Capabilities, not false universal promises

Capabilities can describe operations or properties that an engine
actually supports, for example:

-   `HasBounds`
-   `CanTessellate`
-   `CanMeasureVolume`
-   `CanSerialize`
-   `SupportsBooleanUnion`

Only expose a capability when the adapter can genuinely provide it with
defined semantics.

Do not assume that all geometry types support the same operations. A
mesh and a B-Rep may both have bounds, but their boolean operations,
tolerances, validity rules and precision guarantees differ.

Capabilities should be scoped where necessary: by representation,
engine, version, or operation implementation.

### Explicit conversions

Conversions should be explicit, inspectable operations, not invisible
coercions that silently discard information.

Example:

`OCCT B-Rep -> tessellation -> triangle mesh -> Manifold`

This conversion changes representation and may lose exact curves,
surfaces, topology semantics and parametric information.

A conversion declaration should communicate:

-   Source and target types
-   Engine performing the conversion
-   Preconditions
-   Parameters and units
-   Expected information loss
-   Whether the conversion is approximate
-   Whether the result is reversible
-   Version/provenance information

The graph should not claim that two values are compatible merely because
both can be displayed as triangles.

## 6. Graph semantics: more than a simple value-to-value DAG

A robust computational design system needs more than a list of nodes
connected by wires.

The graph model should be designed to accommodate:

-   Ordinary value flow
-   Collections and nested data
-   Trees or structured data paths
-   Lazy evaluation
-   Fields and deferred computations
-   Instances and references
-   Subgraphs and reusable components
-   Stateful resources
-   Side effects
-   Incremental recomputation
-   Explicit iteration or controlled cycles
-   Transactions and commit boundaries

Grasshopper, Blender Geometry Nodes, Dynamo and FreeCAD offer different
useful precedents:

-   **Grasshopper**: data trees, component composition and computational
    design.
-   **Blender Geometry Nodes**: fields, domains, instances and deferred
    evaluation.
-   **Dynamo**: application/BIM integration and external data.
-   **FreeCAD**: document objects, properties, parametric features and
    transactions.
-   **Sverchok**: additional node-based computational geometry patterns.

Do not copy one of these systems wholesale. Borrow the semantics that
solve real requirements.

### Values versus fields

A node output may be:

-   A concrete value already computed.
-   A collection of values.
-   A reference to a persistent object.
-   A deferred field/function evaluated over a domain.
-   A native engine handle.
-   An artifact reference.

Fields are particularly important for geometry workflows. A field can
describe a value to be evaluated at points, vertices, faces or another
domain, rather than eagerly materializing a value for every element.

This distinction matters for scalability and for workflows inspired by
Geometry Nodes.

### Data trees and collections

The graph should have a principled representation for nested collections
and structured paths. Avoid ad hoc list flattening or special-case list
handling in individual nodes.

The system should define:

-   Collection shape and nesting
-   Mapping and broadcasting rules
-   Matching/alignment semantics
-   Filtering and partitioning
-   Empty collection behavior
-   Whether operations preserve or change structure

These semantics belong in the core, not in unrelated per-node patches.

## 7. Application objects, execution values and artifacts

Keep these concepts separate.

  -----------------------------------------------------------------------
  Concept                 Meaning                 Persistence
  ----------------------- ----------------------- -----------------------
  Application object      User-owned domain       Persistent
                          object in MongoDB       

  Representation          B-Rep, mesh, IFC,       Persistent or
                          drawing, etc. for an    regenerable
                          object                  

  Execution value         Temporary value passed  Usually
                          between nodes           transient/cacheable

  Graph                   Workflow definition     Persistent

  Execution record        Run status, inputs,     Persistent
                          outputs, errors and     
                          provenance              

  Artifact                Large generated file or Object storage or
                          dataset                 artifact store
  -----------------------------------------------------------------------

Do not persist every intermediate node result as a new MongoDB
application object. That would pollute the user's domain model with
implementation details and make graph execution expensive.

Instead, distinguish:

-   A node that computes a temporary value.
-   A node that creates or updates a persistent application object.
-   A node that creates a derived representation.
-   A node that writes an artifact.
-   A node that explicitly commits changes to the application model.

Outputs should be able to reference existing objects, derived
representations, artifacts or transient values.

## 8. MongoDB integration and data authority

MongoDB remains the source of truth for application objects,
user-defined types and relationships.

The graph is a computational interface over that model, not a parallel
object database.

The graph engine needs an adapter/API for:

-   Discovering available application types
-   Reading type descriptors and versions
-   Querying objects
-   Resolving references and relationships
-   Reading fields
-   Validating proposed updates
-   Creating objects when explicitly requested
-   Updating objects when explicitly requested
-   Writing relationship changes
-   Handling concurrency/version conflicts
-   Recording provenance and execution results

The graph core should not directly encode the application's collection
names, field names or domain-specific schemas. Those belong in the
application integration layer.

### Dynamic schema changes

Type descriptors need versioning. A graph created against one descriptor
version may be run after a user changes a type.

Define behavior for:

-   Compatible additive changes
-   Removed or renamed fields
-   Changed field types
-   Changed relationship targets/cardinality
-   Deleted types
-   Migrations or explicit graph updates

Do not silently reinterpret old graph data against a changed schema if
that could alter results.

### Querying and object identity

Object references should be stable and distinguish identity from the
object's current field values. A node should be able to query a
collection of a user-defined type, filter objects, traverse
relationships and retrieve selected fields without copying the entire
application object into every graph value.

## 9. Execution architecture

Separate graph evaluation from the engines that perform domain
operations.

A useful high-level architecture:

1.  **Frontend** --- graph canvas, node palette, inspectors, previews
    and application integration.
2.  **Graph core** --- graph model, type checking, validation and
    planning.
3.  **Execution coordinator** --- schedules work, manages dependencies
    and dispatches operations.
4.  **Runtime adapters** --- connect the coordinator to engine-specific
    execution environments.
5.  **Domain engines** --- OCCT, Manifold, IfcOpenShell, DuckDB,
    document and spatial tooling.
6.  **Persistence adapters** --- MongoDB and artifact/object storage.

### Hybrid execution

Different operations should run where they make sense:

-   Browser main thread: UI only; avoid blocking it.
-   Browser workers: lightweight pure operations, small previews and
    client-side tasks.
-   Native/server workers: OCCT, build123d/OCP, IfcOpenShell, large
    meshes, document conversion and heavy data processing.
-   Specialized services: optional when an engine needs isolation, a
    different runtime or independent scaling.

The browser should not be required to load every engine and every
dependency just to open the graph editor.

### Python and Pyodide

Pyodide may be useful for selected browser-side Python workflows, but it
should not be the mandatory runtime for all CAD/BIM execution.

For heavyweight packages such as OCP/build123d and IfcOpenShell, a
persistent native Python worker is generally a more practical baseline:

-   Dependencies are installed in a controlled environment.
-   Expensive imports can be amortized across tasks.
-   Native libraries can be used normally.
-   The browser does not have to download and initialize the full
    runtime.
-   Worker lifecycle and resource limits can be managed centrally.

Keep the worker protocol independent of Python so that C++, Rust or
other runtimes can be added without changing graph semantics.

## 10. Node and adapter design

Nodes should be declarative descriptions of operations, not hand-written
islands of special-case graph behavior.

A node definition should describe at least:

-   Stable node/operation identifier
-   Version
-   Input and output port descriptors
-   Parameter descriptors and defaults
-   Required capabilities
-   Runtime/engine adapter
-   Evaluation behavior
-   Purity or side-effect classification
-   Cacheability
-   Serialization requirements
-   Error contract
-   Documentation and UI metadata

The engine adapter implements the operation using its native library.

Avoid creating a separate hardcoded type conversion, field extraction or
method invocation implementation for every node. Provide generic
mechanisms where semantics are genuinely shared.

However, genericity must not erase meaningful domain differences. A
generic method invocation mechanism may be useful for controlled,
registered APIs, but arbitrary reflection over every native object is
unsafe and difficult to version. Prefer explicit adapter-exposed
operations and introspection metadata.

### Object fields and methods

The system should support:

-   Reading fields/properties from values and application objects.
-   Traversing relationships.
-   Calling exposed methods/operations.
-   Selecting members from structured results.
-   Handling optional/missing values.
-   Inspecting available members where the adapter supports it.

This should be a system-level capability with access rules and typed
outputs, not a collection of one-off nodes.

## 11. Purity, side effects and transactions

Not all nodes are equivalent.

Distinguish:

-   Pure computation: output depends only on declared inputs and
    parameters.
-   External read: queries MongoDB, files or another service.
-   Resource operation: uses a stateful engine/session/resource.
-   Side effect: writes an object, file or external system.
-   Commit: makes proposed changes persistent.

This classification is necessary for correct caching, re-execution and
debugging.

A useful execution pattern is:

1.  **Preview** --- compute and inspect proposed results without
    committing application changes.
2.  **Validate** --- check types, constraints, permissions, schema
    versions and transaction preconditions.
3.  **Commit** --- apply explicit persistent changes.
4.  **Record** --- persist execution status, provenance and resulting
    object/artifact references.

Do not allow a graph rerun to unexpectedly repeat irreversible side
effects. Side-effecting nodes need explicit semantics, idempotency
strategy where possible, and clear execution records.

## 12. Incremental recomputation and caching

The system should be designed for incremental evaluation from the
beginning, even if the first implementation has a conservative cache.

Cache keys must account for all relevant inputs:

-   Node/operation identity and version
-   Parameters
-   Input values or stable input references
-   Relevant application object versions
-   Type descriptor versions
-   Engine/runtime version
-   Conversion parameters
-   External resource versions where applicable

A cache must not return stale results after an application object,
schema, engine or upstream graph operation changes.

Pure operations are easiest to cache. External reads need source-version
or freshness semantics. Side effects should not be treated as ordinary
cached computations.

Store large cached values as artifacts or engine-managed resources, not
as giant graph documents in MongoDB.

## 13. Candidate domain engines and their roles

These are complementary tools, not competing candidates for one
universal kernel.

### CAD and B-Rep

-   **OCCT**: primary B-Rep geometry kernel candidate.
-   **OCP**: Python bindings to OCCT.
-   **build123d**: higher-level Python modelling API built on the OCCT
    ecosystem.

Keep the native OCCT representation intact. build123d can provide a
productive modelling layer, but the architecture should not depend on
build123d-specific object conventions as the universal graph type
system.

### Mesh

-   **Manifold**: useful for robust manifold triangle-mesh boolean
    workflows.
-   **CGAL**: selectively use packages for exact predicates, mesh
    processing and computational geometry where their guarantees justify
    the complexity and licensing review.

Mesh and B-Rep are different representations with different precision
and topology semantics.

### BIM

-   **IfcOpenShell**: IFC parsing, authoring and processing.
-   Treat BIM as semantic building data plus relationships and
    representations, not as geometry with arbitrary properties attached.
-   Preserve IFC entity identity, relationships, units, placements,
    property sets and schema semantics.
-   A B-Rep or mesh may be a representation of a building element, but
    it is not a substitute for the IFC object model.

### Scene and visualization interchange

-   **OpenUSD**: useful for scene composition and exchange, not a
    replacement for a CAD kernel or BIM database.
-   **Three.js**: browser viewport and visualization layer, not the
    source of geometric truth.

### Tables and analytics

-   **DuckDB**, **Polars** and **Arrow** are candidates for tabular
    querying, transformations and interchange.
-   Keep analytical tables distinct from MongoDB application objects
    unless a workflow explicitly materializes results into the
    application model.

### Spatial data

-   **GDAL**, **GeoPandas** and **Shapely** can provide GIS and spatial
    operations.
-   Coordinate reference systems and units must be explicit.

### Documents

Use suitable document-specific tooling for PDFs, office documents, text
extraction, conversion and markup. Do not represent every document as a
geometry object merely to fit the graph.

## 14. Lessons from CadCraft and other systems

CadCraft's family of applications is useful as an example of modular
domain applications and handoff between tools. It is not a suitable
foundation for a universal computational engine.

Its custom polygonal modelling model and application-specific workflows
do not provide a universal OCCT/B-Rep, BIM or data-processing substrate.

The useful lesson is architectural modularity: several specialized
applications or engines can cooperate through clear exchange contracts
without sharing one internal model.

Likewise, Grasshopper, Geometry Nodes, Dynamo and FreeCAD should be
treated as sources of specific design ideas rather than templates to
reproduce wholesale.

## 15. Persistence and artifact strategy

Use MongoDB for structured application data and workflow metadata that
belongs there:

-   User-defined type descriptors
-   Application objects and relationships
-   Graph definitions
-   Node/operation references and graph versions
-   Execution records
-   Object/representation metadata
-   References to artifacts

Use object storage or an artifact store for large payloads:

-   STEP and other CAD files
-   IFC files
-   Meshes
-   Drawings
-   PDFs
-   Images
-   Point clouds
-   Large analytical datasets
-   Engine-specific serialized values

Artifact metadata should record enough information to identify and
validate the payload:

-   Artifact ID
-   Representation/type
-   Engine and serialization format
-   Version
-   Units and coordinate system
-   Source object or graph execution
-   Creation time and provenance
-   Content hash where appropriate
-   Storage location/reference

Avoid putting large binary or serialized engine objects directly into
ordinary MongoDB application documents.

## 16. Proposed logical project structure

An illustrative OCaml core layout:

``` text
core/
  graph/
    graph
    node
    connection
    subgraph
  types/
    descriptor
    expression
    compatibility
    capabilities
    units
  values/
    value
    reference
    artifact
  execution/
    evaluator
    scheduler
    dependency
    cache
    transaction
  schema/
    registry
    application_types
    validation
  adapters/
    protocol
    registry
    conversion

domains/
  geometry/
    brep
    mesh
  bim/
    ifc
  documents/
  tables/
  spatial/

runtimes/
  browser/
  native/
  python/
  wasm/

integrations/
  mongodb/
  object_storage/
  application_api/
```

This is a conceptual boundary map, not a requirement to create every
directory or abstraction immediately. Keep the initial implementation
smaller while preserving these boundaries.

## 17. Deployment shape

A practical deployment arrangement:

-   Existing Vue + TypeScript + Vite app remains the application shell.
-   OCaml core is integrated as a library for graph semantics and
    validation.
-   The existing application API and MongoDB remain authoritative for
    user-defined objects and relationships.
-   An execution coordinator plans and dispatches graph work.
-   Browser workers handle suitable lightweight operations.
-   Native workers execute OCCT/OCP/build123d, IfcOpenShell, mesh and
    other heavyweight tasks.
-   Object storage holds generated files and large artifacts.
-   MongoDB stores graph definitions, application data, execution
    records and artifact metadata.

This keeps the web application intact while allowing the workflow engine
and execution infrastructure to evolve independently.

## 18. First end-to-end milestone

Do not begin by building a huge node palette or implementing every
engine. Prove the architecture across several genuinely different
domains.

A useful vertical slice:

1.  Query a `Facade` application object from MongoDB.
2.  Query its associated `Cassette` objects through existing
    relationships.
3.  Read user-defined fields and quantities using runtime type
    descriptors.
4.  Generate a B-Rep representation using OCCT through OCP/build123d.
5.  Generate a mesh representation using a declared conversion or mesh
    engine.
6.  Create or update an IFC representation using IfcOpenShell.
7.  Calculate quantities using a tabular/analytical engine such as
    DuckDB.
8.  Preview the proposed outputs.
9.  Validate schema and transaction preconditions.
10. Explicitly commit object updates and representation/artifact
    references.
11. Record execution provenance and versions.

This one workflow tests application objects, dynamic schemas,
relationships, native engine values, explicit conversion, multiple
runtimes, artifacts and transactional persistence.

## 19. Architecture acceptance tests

Before expanding the node library, verify these system-level properties:

### Application model

-   Existing MongoDB user-defined types are discovered dynamically.
-   Existing objects and relationships can be queried without
    duplicating the object model.
-   Schema changes are versioned and handled predictably.
-   Graph operations do not silently overwrite concurrent application
    changes.

### Type and representation model

-   Application types, representation types and engine-native types
    remain distinct.
-   Native engine values can pass through the graph without being
    flattened.
-   Compatibility is based on real contracts and capabilities.
-   Lossy conversions are explicit and inspectable.
-   Units and coordinate systems are preserved and validated.

### Graph semantics

-   Collections and nested data have defined behavior.
-   Fields/deferred evaluation can be represented without forcing eager
    computation.
-   Subgraphs and reusable operations are supported by the model.
-   Pure operations and side effects are distinguished.
-   Errors identify the node, port, operation and relevant runtime
    context.

### Execution

-   The frontend remains responsive during heavy computation.
-   Heavy dependencies are not loaded merely to open the graph editor.
-   Worker processes can be reused rather than paying import/startup
    costs for every operation.
-   Cache invalidation accounts for input, schema and engine versions.
-   Failed runs do not partially commit persistent application changes.
-   Execution records make results and failures reproducible enough to
    debug.

### Extensibility

-   A new engine can be integrated through an adapter without changing
    the graph core.
-   A new user-defined application type does not require recompiling the
    OCaml core.
-   A new representation does not require redefining the entire
    universal type system.
-   New node operations declare contracts rather than adding special
    cases to the evaluator.

## 20. Decisions to avoid

Avoid these architectural traps:

1.  **One universal geometry type.** It will erase distinctions between
    B-Rep, mesh, IFC and scene data.
2.  **A second application object database.** MongoDB already owns
    user-defined objects and relationships.
3.  **Compiling user schemas into OCaml types.** User-defined schemas
    are dynamic runtime data.
4.  **Treating every node output as a persistent object.** Most
    intermediate values should remain transient or cacheable.
5.  **Making Pyodide mandatory.** It couples the whole system to browser
    package constraints and startup costs.
6.  **Putting all computation in the browser.** Heavy native engines
    belong in workers/services.
7.  **Hardcoding conversions into individual nodes.** Conversion
    semantics belong in shared contracts and adapters.
8.  **Pretending every engine supports the same operations.** Use honest
    capabilities and explicit conversions.
9.  **Treating BIM as geometry plus metadata.** Preserve IFC's semantic
    object and relationship model.
10. **Building a giant abstraction framework before a vertical slice.**
    Implement the core contracts and prove them across multiple domains.
11. **Using a simple DAG as the permanent semantic model.** Plan for
    collections, fields, subgraphs, state and controlled iteration.
12. **Allowing hidden persistent side effects.** Make preview,
    validation and commit explicit.

## 21. Recommended decisions

The current recommendation, in condensed form:

-   Keep the existing Vue + TypeScript + Vite application.
-   Keep MongoDB as the source of truth for user-defined application
    types, objects and relationships.
-   Use OCaml for the graph semantic core: graph model, type
    descriptors, validation, planning, evaluation semantics and
    cache/transaction contracts.
-   Compile the OCaml core to JavaScript initially; consider native
    reuse where it adds value.
-   Keep application types dynamic and descriptor-driven.
-   Keep representation types and engine-native types distinct.
-   Use opaque engine handles and artifact references rather than a
    universal internal geometry model.
-   Use explicit capabilities and explicit conversions.
-   Use OCCT as the primary B-Rep kernel candidate, with OCP/build123d
    as a useful higher-level Python layer.
-   Use Manifold for suitable mesh operations and CGAL selectively.
-   Use IfcOpenShell for IFC/BIM semantics.
-   Use native/persistent workers for heavyweight engines; browser
    workers for lightweight tasks.
-   Make pure computation, external reads, side effects and commits
    different execution classes.
-   Design for incremental recomputation, version-aware caching and
    transactional writes.
-   Prove the design with one end-to-end workflow spanning MongoDB
    objects, B-Rep, mesh, IFC and analytics before scaling the node
    library.

## 22. The governing principle

The system should provide **one coherent workflow language, not one
universal domain model**.

The graph needs consistent rules for identity, typing, compatibility,
execution, conversion, caching, errors and persistence. It does not need
to make an IFC entity, an OCCT face, a mesh component, a MongoDB object
and a table row all become the same kind of thing.

Keep domain semantics where they belong. Connect them through explicit,
versioned contracts. This is the foundation for a genuinely extensible
multimodal workflow system.

# UPD from another thread

Kernel-independent node system — key considerations
Goal: Build a universal visual modelling and workflow system, not a build123d-specific node editor.

1. Separate the core from CAD kernels. Graph execution, connections, node registration, UI, serialization and dependency management must not depend on build123d or OCC.

2. Use pluggable kernel adapters. Each kernel provides its own types, operations, conversions, importers, exporters and capabilities.

3. Avoid a rigid universal geometry hierarchy. Define common semantic types (Solid, Curve, Surface, Mesh, etc.), but allow kernel-native types and representations.

4. Use capability-based compatibility. Nodes should declare required types and capabilities rather than rely on hardcoded class checks or kernel-specific assumptions.

5. Make conversions explicit and extensible. Support conversions between semantic and native types, including cross-kernel conversions. Preserve information where possible; don't imply equivalence where it doesn't exist.

6. Keep serialization kernel-neutral. Store graph definitions, parameters, references and portable data—not raw kernel objects. Kernel-specific persistence should live in adapters.

7. Support heterogeneous workflows. Different kernels and domain systems should coexist in one graph, with explicit conversion boundaries where necessary.

8. Don't make CAD the architectural limit. The same infrastructure should accommodate BIM, drafting, simulation, point clouds, procedural geometry and other domains.

Architectural principle: Universal graph engine + extensible semantic type system + independent domain/kernel adapters. Do not build a universal geometry kernel or force every backend into one object model.
