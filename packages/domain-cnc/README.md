# COMPONENT: @cutkit/domain-cnc

Cutkit CNC domain definitions for the framework extraction. This package is the only package allowed to know about queues, cassettes, sheets, nesting, remnants, and manufacturing-specific workflows.

## Contents

- Entity definitions for current v24 persisted production, master-data, material, and system entities.
- Frontend endpoint definitions for the app's `useEntity` type keys.
- Workflow definitions matching `server/core/machines/definitions.js`.
- Summary definitions replacing hardcoded aggregator rules in a later migration.
- Summary definitions consumed by the current Mongo aggregator adapter.

The framework manifest includes CNC primitives that application builders can compose directly, including layer standards, pen templates, tool profiles, and materials. Runtime support collections such as sessions, invitations, audit events, and preset options stay outside this package unless they become first-class app entities.

## Related

- [server/features/README.md](../../server/features/README.md)
- [server/core/machines/README.md](../../server/core/machines/README.md)
