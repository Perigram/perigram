# COMPONENT: @cutkit/domain-cnc

Cutkit CNC domain definitions for the framework extraction. This package is the only package allowed to know about queues, cassettes, sheets, nesting, remnants, and manufacturing-specific workflows.

## Contents

- Entity definitions for current v24 persisted entities.
- Workflow definitions matching `server/core/machines/definitions.js`.
- Summary definitions replacing hardcoded aggregator rules in a later migration.

## Related

- [server/features/README.md](../../server/features/README.md)
- [server/core/machines/README.md](../../server/core/machines/README.md)
