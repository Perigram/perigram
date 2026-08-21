# Отзывы UI Lab

Сгенерировано: 2026-05-19T13:49:32.835Z

| Область | Компонент | Решение | Примечание |
|---|---|---|---|
| entity | `project` | ok | Added optional thumbnail rendering and address display without adding invalid DataBlock paths. |
| entity | `sheetDesign` | ok | Removed file/queue fields, kept trace, and added layer-aware geometry preview. |
| entity | `cassetteDesign` | ok | Removed file-name field and added cassette preview. |
| entity | `cassetteTemplate` | ok | Hid status and removed repeated type display. |
| entity | `user` | ok | Removed role display/mock role; card now uses identity/email/access-safe fields only. |
| entity | `artifact` | ok | Removed repeated file/type body fields and duplicate type subtitles. |
| primitive | `EntityStatus` | ok | Inline/card status now uses badge plus ellipsis; popup owns actions, location, metadata, and history. |
| primitive | `TraceLink` | ok | Contract purpose now distinguishes single related-entity links from TraceChain ancestry. |
| primitive | `ActionToolbar` | ok | Contract purpose now documents it as shared section/header action-row chrome. |
| primitive | `TableFrame` | ok | Keeps only the reusable overflow boundary; DataTable header chrome delegates to Aura. |
| entity | `catalog` | ok | Added manufacturer lineage mock/link and option fields aligned to catalog model. |
| entity | `penTemplate` | ok | Replaced dot avatar with actual stroke preview on token-backed surfaces. |
| entity | `materialPile` | ok | Uses `MaterialSummary` for warehouse/manual pile material/spec/stock display. |
| entity | `batchPile` | ok | Kept `batchPile` in the UI Lab contract and restored batch/requisition-sourced pile rendering with requisition context, serial, specs, and stock. |
| entity | `sheet` | ok | Removed hardcoded warehouse field; current location is rendered from `status.lifecycle.data.location`. |
| entity | `remnant` | ok | Added geometry preview and removed duplicate status rendering; trace remains owned by EntityCard. |
