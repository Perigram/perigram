# COMPONENT: Sheet Instances

A `sheet_instance` is a planned future physical sheet digital twin. Nesting
creates one instance for every required copy of a deduplicated sheet design.
Instances inherit queue/run/design lineage, pair `sheetDesignId` with the
geometry revision ID, copy sheet specs, and start in `PLANNED` state.

`data.physicalSheetId` is initially null and can later bind the planned instance
to a warehouse `sheet`. This entity is distinct from the current physical sheet
inventory model.
