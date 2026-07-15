# COMPONENT: Machines

Machines are CNC meta entities with `data.workArea` width/length and
`data.boundaryOffset` top/right/bottom/left. Organization machines use normal
`machines` grants. The immutable public system default has stable id and
identity `machine-system-default`, so settings and snapshots never depend on a
new seed id.

Nesting loads the selected machine or calls `ensureSystemDefault()`. It rejects
sheets larger than the work area, clips the usable sheet polygon to boundary
offsets, and serializes the full machine snapshot into the task and terminal
queue revision. Changing a machine later cannot change an existing attempt.

`GET/POST /api/machines` and `GET/PUT /api/machines/:id` expose the service.
