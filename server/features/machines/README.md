# COMPONENT: Machines

Machines are `meta` CNC-domain entities managed by organization/asset surfaces,
not inferred work screens. Records contain `data.workArea` width/length and
four `data.boundaryOffset` values. Reads include the immutable public system
default plus machines owned by the active organization; writes never mutate
the system record.

Nesting resolves the selected machine or the seeded system default and embeds
its complete work-area snapshot in task parameters. Sheets larger than the work
area are rejected, and offsets clip the usable nesting polygon.

`GET/POST /api/machines` and `GET/PUT /api/machines/:id` expose the entity
service. Organization records require normal `machines` grants; the system
default is public-read and immutable.
