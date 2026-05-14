# CODE: Design Tokens

This directory is the frontend visual-token source for the current PrimeVue + Tailwind stack.

## Source Files

- `index.js` exports token groups plus projections for PrimeVue and Tailwind.
- Runtime CSS variables are declared in `assets/css/main.css` using the same `--ck-*` names.
- PrimeVue component token overrides are consumed by `assets/presets/re_l.js`.
- Tailwind semantic aliases are consumed by `tailwind.config.js`.

## Rules

- Prefer PrimeVue semantic variables (`--p-*`) for colors.
- Use `--ck-*` tokens for app layout, radius, and motion values not owned by PrimeVue.
- Do not introduce page-local hardcoded colors, radii, or transition durations unless the value is real data, such as a pen color or DXF layer color.
- Shared wrappers own visual chrome. Feature components should compose `EntityCard`, `StandardDialog`, `StandardPage`, `Panel`, and semantic layout classes.
