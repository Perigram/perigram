# COMPONENT: @cutkit/vue

Frontend adapter helpers for framework entity route, surface, and attachment
preview metadata. App composables consume this adapter instead of hardcoding
domain route names.

`composables/useEntity.js` consumes these helpers with endpoint definitions
from `@cutkit/domain-cnc` for standard CRUD and list endpoints. Status
transitions use the app-level canonical status API rather than entity PATCH
route metadata.

## Public API

- `createDomainUiAdapter(domain)`
- `createEndpointMap(definitions)`
- `createEndpointKeys(definition)`
- `collectionToEntityType(collection)`
- `camelToSnake(value)` / `snakeToCamel(value)`
- `getSingleEndpoint(endpointMap, type, id)`
- `getListEndpoint(endpointMap, type, filters)`

`createDomainUiAdapter()` also exposes attachment kind lookup, preview
policy, and download endpoint resolution so components do not infer preview
behavior from MIME strings alone.

Endpoint maps register each route under keys derived from endpoint metadata:
the declared type, optional `entityType`, camel/snake variants, and the
singular collection name. This keeps runtime components able to pass canonical
entity names such as `cassette_instance` while route ownership remains in the
domain endpoint definitions.
