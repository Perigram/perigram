# COMPONENT: @cutkit/vue

Frontend adapter helpers for framework entity route metadata. Existing app composables remain the runtime source until this package is covered by tests.

`composables/useEntity.js` now consumes these helpers with endpoint definitions
from `@cutkit/domain-cnc`.

## Public API

- `createEndpointMap(definitions)`
- `getSingleEndpoint(endpointMap, type, id)`
- `getListEndpoint(endpointMap, type, filters)`
