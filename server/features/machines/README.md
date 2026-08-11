# COMPONENT: Machines

Machine entities describe CNC working-area presets used by nesting. They are
normal v24 DTOs with canonical blocks and are registered as the `machines`
feature.

## Data Contract

- `identity`: machine display name and uid.
- `lineage.scope: "system"` plus public visibility marks the immutable system
  default.
- `lineage.organizationId` owns custom tenant machines.
- `data.workingArea`: `{ width, length }` in millimetres.
- `data.boundaryOffset`: non-negative inset from the machine boundary. The
  offset must leave a positive usable area.
- `data.description`: optional operator-facing note.

The service seeds one public read-only default machine:
`machine-system-default`, with a `3000 x 1500` working area and zero boundary
offset. Listing machines always upserts this default before returning readable
system and organization-owned machines. The upsert key is the stable `_id`, not
`data.systemKey`, so old records that predate the system-key field are repaired
in place instead of causing duplicate `_id` insert attempts during queue editor
initialization.

## API

- `GET /api/machines` lists readable system and organization machines.
- `POST /api/machines` creates an organization-owned machine and requires
  `machines:write`.
- `GET /api/machines/:id` returns one readable machine.
- `PATCH /api/machines/:id` and `PUT /api/machines/:id` update custom machine
  identity/data and require `machines:write`.
- `DELETE /api/machines/:id` removes a custom machine and requires
  `machines:admin`.

System machines cannot be updated or deleted through user operations.

## Nesting Contract

Queues store the chosen machine id in `data.nestingSettings.machineId`.
Nesting snapshots copy the machine working area and boundary offset into the
run parameters so later layout/revision reads do not depend on mutable machine
records. The solver still receives material size from the selected virtual or
warehouse material source; the machine boundary offset is the usable-area inset.

## Related

- [queues](../queues/README.md) - stores nesting settings.
- [nesting](../nesting/README.md) - solver operations and snapshots.
- [tool-profiles](../tool-profiles/README.md) - kerf and cutter profile data.
