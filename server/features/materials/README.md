# COMPONENT: Materials

This directory contains the Materials feature, managing the global collection of production materials (Aluminium Composite, Plywood, etc).

## Data Structure
### Material (Global)
- `name`: Human-readable name
- `code`: Unique identifier
- `manufacturer`: Brand/Producer
- `color`: Finish/Color description
- `thickness`: Material thickness in mm

`data.thickness` is also the virtual material thickness used by nesting. When a
material is selected it overrides the queue's manual sheet thickness and is
passed to cassette baking as the reserved regular OCCS parameter `T`.
- `type`: Category (ACP, WOOD, STEEL, etc)

## Architecture
- `repository.js`: MongoDB operations on `materials` collection.
- `service.js`: Business logic and validation.
- `index.js`: Public API for the component.

## Project Integration
Projects store references to these materials and maintain their own inventory of sheets and waste polygons for each used material.

## Access

Base materials are system catalogue records. They are marked public-read with
`lineage.scope: "system"`, `lineage.public: true`, and
`data.visibility.public: true`, and `GET /api/materials` is public-read. Viewing
base materials does not require or grant a `materials` permission; mutable
inventory entities such as material piles, sheets, remnants, and geometry
captures still use normal `materials` grants.
