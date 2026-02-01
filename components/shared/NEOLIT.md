# COMPONENT: Shared UI Components

This directory contains reusable, standardized UI components that MUST be used across the application to ensure consistency.

## Standard Components
- **StandardCard:** Wrapper around PrimeVue Card/Panel with consistent padding and header slots.
- **StandardDialog:** Wrapper around PrimeVue Dialog with standardized footer buttons and responsiveness.
- **StandardPage:** Layout wrapper for page content with header and breadcrumbs.
- **EntityStatus:** Standardized status badge/chip for entities.
- **MaterialSpecs:** Display component for material specifications.

## Usage
Import these components from `~/components/shared/` and use them instead of raw PrimeVue components where possible to maintain consistent spacing and behavior.

```vue
<template>
  <StandardCard title="My Card">
    Content
  </StandardCard>
</template>
```
