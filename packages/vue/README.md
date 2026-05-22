# COMPONENT: @cutkit/vue

Frontend adapter helpers for framework entity route, surface, and attachment
preview metadata. Existing app composables remain the runtime source until this
package is covered by tests.

`composables/useEntity.js` now consumes these helpers with endpoint definitions
from `@cutkit/domain-cnc`.

## Public API

- `createDomainUiAdapter(domain)`
- `createEndpointMap(definitions)`
- `getSingleEndpoint(endpointMap, type, id)`
- `getListEndpoint(endpointMap, type, filters)`

`createDomainUiAdapter()` also exposes attachment kind lookup, preview
policy, and download endpoint resolution so components do not infer preview
behavior from MIME strings alone.
