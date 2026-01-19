# COMPONENT: Materials

This directory contains the Materials feature, managing the global collection of production materials (Aluminium Composite, Plywood, etc).

## Data Structure
### Material (Global)
- `name`: Human-readable name
- `code`: Unique identifier
- `manufacturer`: Brand/Producer
- `color`: Finish/Color description
- `thickness`: Material thickness in mm
- `type`: Category (ACP, WOOD, STEEL, etc)

## Architecture
- `repository.js`: MongoDB operations on `materials` collection.
- `service.js`: Business logic and validation.
- `index.js`: Public API for the component.

## Project Integration
Projects store references to these materials and maintain their own inventory of sheets and waste polygons for each used material.
