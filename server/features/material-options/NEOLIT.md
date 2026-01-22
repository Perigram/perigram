# COMPONENT: Material Options

This component provides default presets for different material types (e.g., Aluminium Composite) to simplify catalog creation.

## Data Structure
Collection: `material_options`

Key fields:
- `material`: Material name (e.g., "Aluminium Composite")
- `foilThicknessOptions`: Default foil thicknesses [0.2, 0.3, 0.5]
- `sheetThicknessOptions`: Default sheet thicknesses [2, 2.5, 3, 4, 5]
- `widthOptions`: Default width options [1220, 1500]

## API Endpoints
- `GET /api/material-options`: List all presets
- `POST /api/material-options/seed`: Reset/Initialize default presets

## Architecture
- `repository.js`: MongoDB operations
- `service.js`: Logic for fetching and seeding defaults
