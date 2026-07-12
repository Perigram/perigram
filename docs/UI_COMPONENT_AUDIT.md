# UI Component Audit

Date: 2026-06-12

This audit is a working contract for UI cleanup. It is not a deletion list.
Every entry is inspected through the same ten questions:

1. What business job does this surface do?
2. Where is it used in frontend layout?
3. Which DTO blocks does it own?
4. Should status be interactive, read-only, or hidden?
5. Which relationships must be shown as entity references?
6. Which actions belong here and which belong elsewhere?
7. What nested click or popover behavior must be preserved?
8. Is the information density correct for the user's workflow?
9. What responsive constraint prevents overflow or scroll waste?
10. What refactor decision follows from the answers?

## Refactors Applied From This Audit

- `WarehouseHub.vue` was too top-heavy: it rendered toolbar, selector, four stat
  panels, and a nested `WarehouseDetail` before the actual inventory tabs. The
  hub now keeps compact warehouse context above the tabs and leaves full
  `WarehouseDetail` for detail-page contexts.
- `EntityStatus`, `StatusBadge`, and `EntityCard` now bound inline status width
  so long state names and action rails do not consume card-title rows.
- Entity cards must keep canonical body content in the default `EntityCard`
  slot. Inline/compact popovers reuse that body; components must not hide all
  body content behind `variant === 'card'`.
- Asset child routes now use `StandardPage` directly because `/assets/cassettes`
  and sibling routes are not children of `/assets/index.vue`.
- `CatalogDetail.vue` now uses `EntityPage` and hides status through the shared
  `showStatus` contract instead of rebuilding entity header chrome locally.
- `SheetDetail.vue` now renders source warehouse, material pile, and nesting-run
  context as `EntityInlineRef` rows when lineage ids are available.
- `UserCard.vue` now owns card selection on its wrapper with
  `isInteractiveEventTarget`, matching other selectable cards.

## Entity Components

Format per row: business job / frontend context / DTO blocks / status / relationships / actions / click-popover / density / responsive / decision.

- `Artifact/ArtifactCard.vue`: file output preview / cards and artifact refs / identity, data, attachments, lineage / hidden / queue and nesting-run refs / preview open only / preview click must not trigger parent card / enough facts plus preview action / preview owns aspect / keep preview-owned click and no lifecycle chrome.
- `BatchPile/BatchPileCard.vue`: requisition-sourced stock batch / material receipt cards / identity, specs, data.stock, lineage / hidden for batch surface / requisition ref / no local lifecycle / inline ref popover must show requisition body / stock plus specs is enough / compact tags wrap / keep separate from manual `PileCard`.
- `Cassette/CassetteCard.vue`: persisted cassette entity / base cassette cards and refs / identity, data, revisions / interactive only if workflow exists / geometry revision ref / no edit footer here / revision ref clickable / current facts enough / DataBlock wraps / keep distinct from template/design/instance.
- `CassetteDesign/CassetteDesignCard.vue`: baked design from template and geometry version / design refs and sheet design placements / identity, data, lineage, revisions / hidden / template and revision refs / no local transitions / refs must not route to templates when design is intended / geometry summary should remain compact / relation chips wrap / keep source template and revision visible.
- `CassetteInstance/CassetteInstanceCard.vue`: produced physical cassette / warehouse and queue output cards / identity, data, lineage, status / interactive if workflow exists / design, template, queue refs / no ad hoc cut action / thumbnail and refs must keep click behavior / source context is primary / body wraps under thumbnail / keep fetches silent for missing stale refs.
- `CassetteInstance/CassetteInstanceDetail.vue`: produced cassette detail / detail route or deep drilldown / identity, data, lineage, status / interactive via EntityPage / design, template, sheet, pile, warehouse refs / page actions only / refs open entity popovers / source and material context are important / sidebar grid at large screens / keep detail, do not embed inside list hubs.
- `CassetteTemplate/CassetteTemplateCard.vue`: reusable parametric template / template library and design source refs / identity, data.definition, revisions / hidden / geometry revision ref / edit belongs to designer manager / revision ref clickable / parameters plus revision enough / DataBlock wraps / keep template separate from design.
- `Catalog/CatalogCard.vue`: material catalog definition / catalog list and material selectors / identity, data.options, lineage / hidden / manufacturer org ref / catalog admin actions elsewhere / org ref popover / options summary enough / compact body wraps / keep as base material record, not stock.
- `Catalog/CatalogDetail.vue`: catalog detail / dormant but meaningful detail component / identity, data.options, lineage / hidden through `EntityPage showStatus=false` / organization and color refs / page actions only / relation refs clickable / options and colors shown / two-column detail grid / refactored to EntityPage.
- `Color/ColorCard.vue`: catalog color or finish / color list and selectors / identity, data, lineage / hidden / catalog ref / no lifecycle / catalog ref popover / swatch and catalog enough / swatch fixed, text wraps / keep catalog relation.
- `EntityRevision/EntityRevisionCard.vue`: immutable source revision / provenance rows and revision refs / identity, data.version, lineage / hidden / source entity ref / no mutation / source ref clickable / version summary enough / DataBlock wraps / keep as standard provenance surface.
- `LayerStandard/LayerStandardCard.vue`: drawing layer standard / CAD layer panels and assets / identity, data.code, data.defaultPenId / hidden / pen ref resolves through `PenTemplateCard` when the pen DTO is loaded / edit elsewhere / no parent hijack in canvas layer panel / code plus semantic name enough / compact tags wrap / keep as entity concept in DrawingCanvas panels.
- `Material/MaterialCard.vue`: base material record / material library / identity, data / hidden / no stock refs / no lifecycle / card popover body required / base facts only / DataBlock wraps / keep distinct from stock piles.
- `MaterialPile/MaterialSummary.vue`: pile aggregate summary / inventory summaries / stock data / read-only / pile source context / no local transitions / no popover ownership / summary only / compact / keep only as summary helper.
- `MaterialPile/PileCard.vue`: manual warehouse stock pile / warehouse inventory tab and queue material pool / identity, specs, data.stock, lineage / interactive if stock workflow exists / warehouse and catalog refs / edit/delete emitted to hub / refs and footer must not select card / stock count first / compact tags wrap / keep as manual stock surface.
- `NestingRun/NestingRunCard.vue`: generated nesting candidate/run / queue run lists / identity, data.metrics, status / interactive plus choose action / queue and material context by lineage / choose/delete via status or footer policy / geometry/click actions preserved / result metrics first / metric tags wrap / keep action priority inside status contract.
- `Organization/OrganizationCard.vue`: tenant/org identity / user profile and admin org lists / identity, data / hidden / users are separate pages / invite actions elsewhere / popover body required / name/type enough / compact tags wrap / keep.
- `PenTemplate/PenTemplateCard.vue`: CAD pen style / layer standard panels and assets / identity, data.stroke / hidden / none / edit elsewhere / color swatch is data, not theme / stroke facts enough / swatch fixed / keep.
- `Project/ProjectCard.vue`: project workspace entry / project lists and refs / identity, data.summary, status / interactive via workflow / queues via detail page, not card body / open/select in page list / card click must ignore nested status / concise summary enough / thumbnail only in card variant / keep.
- `Project/ProjectDetail.vue`: project workspace shell / project route / identity, status, queues, history / interactive via EntityPage / queues as compact cards / create queue actions in route / tabs and cards clickable / queues are primary content / grid avoids local card chrome / keep.
- `Queue/QueueCard.vue`: production job queue / project queue lists and refs / identity, data.job, status / interactive plus nesting commands / artifacts and materials in detail / footer actions only in card variant / status and footer must not open card / material and item summary first / compact facts wrap / keep.
- `Queue/QueueDetail.vue`: queue execution detail / queue route / identity, status, artifacts, material consumption / interactive via EntityPage / artifacts and consumed material refs / choose/run actions through status / table rows and refs clickable / execution facts primary / table framed / keep.
- `Queue/QueueEntryCard.vue`: queue editor cassette row / QueueEditor grid / item id/type/qty/parameters / no lifecycle / cassette design/template ref / quantity/dimension inputs local / inputs and refs must not select parent / row density appropriate / controls wrap under preview / keep.
- `Remnant/RemnantCard.vue`: reusable leftover geometry / warehouse remnant tabs and refs / identity, specs, data.geometry, lineage, status / interactive if workflow exists / sheet and warehouse refs / no local cut actions / geometry preview must keep canvas clicks / geometry first / preview aspect owned / keep.
- `Remnant/RemnantDetail.vue`: remnant detail / drilldown detail page / identity, specs, geometry, lineage, status / interactive via EntityPage / pile, sheet, warehouse refs / page actions only / refs clickable / provenance plus geometry primary / sidebar grid / keep.
- `Requisition/RequisitionCard.vue`: procurement request / requisition lists / identity, data.items, status / interactive with status actions / manufacturer and project refs / receive/transition through status / refs clickable / item count and totals enough / actions wrap / keep.
- `Requisition/RequisitionDetail.vue`: procurement detail / requisition route / identity, items, status, history / interactive via EntityPage / item material refs when available / receive actions via status / rows clickable / item table primary / grid detail layout / keep.
- `Sheet/SheetCard.vue`: physical sheet inventory / warehouse sheet tabs and queue material refs / identity, specs, status, lineage / interactive if workflow exists / warehouse, pile, nesting run refs / no local transitions / refs and status click safe / dimensions first / SpecsBlock handles compact / keep.
- `Sheet/SheetDetail.vue`: sheet detail / drilldown detail page / identity, specs, status, history / interactive via EntityPage / source warehouse, pile, and run refs use `EntityInlineRef` / page actions only / refs clickable / physical facts primary / sidebar grid / refactored.
- `SheetDesign/SheetDesignCard.vue`: digital sheet design / design lists and queue planning / identity, specs, geometry / hidden / cassette design placements in detail / no local lifecycle / geometry click safe / geometry plus dimensions enough / preview aspect owned / keep.
- `SheetDesign/SheetDesignDetail.vue`: design composition / sheet design route / identity, specs, geometry, placements / hidden or page status only if workflow exists / cassette design refs, not cassette template links / page actions elsewhere / placement refs clickable / geometry and placements primary / sidebar grid / keep relation key `cassetteDesign`.
- `ToolProfile/ToolProfileCard.vue`: CNC tool profile / asset tool library / identity, data.tool / hidden / none / edit elsewhere / card popover body required / diameter/speed facts enough / compact tags wrap / keep.
- `User/UserCard.vue`: user identity and role / admin and org user tables/cards / identity, data.role/email / hidden / org relation elsewhere / row/card select emitted from wrapper / click handler respects child targets / email/role enough / compact tags wrap / refactored.
- `Warehouse/WarehouseCard.vue`: facility identity / warehouse refs and org profile / identity, data.stats / hidden / inventory lives in hub / edit elsewhere / card popover body required / type and stock counts enough / tags wrap / keep.
- `Warehouse/WarehouseDetail.vue`: facility detail / detail contexts only / identity, data, computed stats / hidden / inventory tabs live in hub / edit action only / should not be nested above inventory tabs / stats useful but secondary / grid stats wrap / keep but do not embed in `WarehouseHub`.

## Shared Components

- `ActionToolbar.vue`: section/page command row / StandardPage and hubs / title/subtitle/action slots / no status / no entity refs / owns action alignment / buttons clickable / compact title density / wraps actions / keep.
- `DrawingCanvas.vue`: normalized CAD/geometry renderer / previews, designer, artifacts / geometry layers and controls / no status / layer standards and pens as entities / emits drawing operations / canvas clicks must not bubble to cards / high-density by domain need / owns aspect and pan/zoom / keep.
- `EntityCard.vue`: canonical entity card shell / all entity cards / identity,status,trace slots / delegates to EntityStatus / trace as lineage / footer actions only / parent click ignores interactive targets / body reused in popovers / bounded status rail / keep as only Card owner.
- `EntityInlineRef.vue`: compact relation renderer / card/detail relation rows / fetched entity DTO / uses referenced card policy / one referenced entity / no extra actions / popover must show full referenced card body / compact by design / width bounded / keep and prefer over TraceLink for relations.
- `EntityPage.vue`: canonical entity detail shell / detail components/routes / identity,status,trace,info/sidebar / interactive via EntityStatus when `showStatus` is true / TraceChain only / page actions slot / header controls clickable / compact header, content below / responsive sidebar / keep.
- `EntityRefInput.vue`: typed entity selector / admin forms / selected entity summary / read-only badge only / selected entity ref / selection action only / dropdown click safe / form density / full width / keep.
- `ErrorBoundary.vue`: local error containment / wrapper surfaces / error state / no status / none / retry slot / no popover / minimal / bounded / keep.
- `GeometryPreview.vue`: entity geometry preview / cards/details / data.geometry / no status / none / emits as interactive target / preview click must not open card / geometry primary / aspect from DrawingCanvas / keep.
- `NameEditPopover.vue`: single-field edit / card footers and identity actions / identity.name or equivalent / no status / none / save/cancel local / popover click safe / compact / inline width / keep instead of full dialog for rename.
- `ResponsiveGrid.vue`: repeated card layout / pages and hubs / none / no status / none / none / no click / density by variant / fixed grid tracks / keep.
- `StandardDialog.vue`: dialog chrome / forms and confirmations / none / no status / none / save/cancel slots / modal click contained / form density / size prop / keep as Dialog owner.
- `StandardPage.vue`: route page shell / app pages / title/subtitle/breadcrumb slots / no status / none / page actions / no entity click / app layout owns route padding / max-w-app / refactored.
- `StateBlock.vue`: empty/loading/error state / pages and panels / state/message / no status / none / action slot / action click safe / intentionally sparse / centered bounded width / keep.
- `TableFrame.vue`: DataTable wrapper / operational tables / none / no status / row refs inside table / none / table clicks delegated / dense table chrome / overflow hidden / keep.
- `TypedSettingsForm.vue`: typed admin field form / config/workbench / schema fields / no status except field choices / entity fields through EntityRefInput / emits model updates / form controls clickable / dense / grid by field type / keep.
- `blocks/DataBlock.vue`: DTO fact renderer / cards/details / explicit field paths / no status / object refs formatted but not linked / none / no click by default / hides non-displayable data / dl grid wraps / keep.
- `blocks/IdentityBlock.vue`: canonical identity renderer / all cards/pages/refs / identity block only / no status / none / none / chip click inherited / minimal / truncates through parent / keep.
- `blocks/SpecsBlock.vue`: canonical dimensions renderer / physical cards/details / specs block / no status / none / none / no click / physical dimensions first / compact/default variants / keep.
- `blocks/StatusBadge.vue`: read-only status tag / EntityStatus and read-only selectors / status.state / read-only / none / none / no parent hijack when inside EntityStatus / atomic / truncates inside bounded rail / keep.
- `links/TraceChain.vue`: ancestry breadcrumb / EntityCard and EntityPage / lineage / no status / ancestry only / navigate through TraceLink / links clickable / compact ancestry / wraps / keep.
- `links/TraceLink.vue`: explicit navigation link / lineage and status location / type/id/label / no status / one route target / navigation only / click must not open parent card / atomic / inline / keep, not for relation summaries.
- `status/EntityStatus.vue`: status display and transitions / EntityCard and EntityPage / status.lifecycle / interactive if workflow exists / StatusLocation only / transition actions here / popover click safe / inline badge plus menu / bounded rail / keep.
- `status/StatusHistory.vue`: lifecycle timeline / status popover/sidebar / status events / read-only / none / fetch history / links/buttons safe / compact fallback event / scrollable in parent / keep.
- `status/StatusLocation.vue`: mutable current location / EntityStatus / status.lifecycle.data.location / read-only / warehouse TraceLink if location / no actions / link safe / compact / inline wrap / keep.

## Operational Hubs And Feature Components

- `WarehouseHub.vue`: facility inventory workflow / `/warehouses` / selected warehouse plus inventories / no status in hub header / tabs use entity cards / create/edit/delete dialogs / tabs and refs clickable / inventory tabs must be above detail bulk / compact stat tags / refactored.
- `PilesTab.vue`: manual stock tab / WarehouseHub / pile collection / card status policy / pile cards / create/edit/delete emits / footer click safe / stock-first / grid cards / keep.
- `SheetsTab.vue`: sheet inventory tab / WarehouseHub / sheet collection / card status policy / sheet cards / no local actions / refs safe / inventory-first / grid cards / keep.
- `RemnantsTab.vue`: reusable remnants tab / WarehouseHub / remnant collection / card status policy / remnant cards / no local actions / geometry click safe / geometry-first / grid cards / keep.
- `CassetteInstancesTab.vue`: produced cassette tab / WarehouseHub / instance collection / card status policy / instance cards / no local actions / source refs safe / production output-first / grid cards / keep.
- `CassetteManager.vue`: cassette template manager / assets/admin surfaces / cassette DTO list / card policy / template/design refs through cards / create/edit/delete manager-owned / footer click safe / designer entry visible / ResponsiveGrid / keep.
- `QueueEditor.vue`: queue composition tool / queue route / queue job item DTO / queue status in header / cassette refs and material pool / queue item edit actions local / inputs must not trigger card popover / dense operational editor / grid/table toggle / keep.
- `CassetteThumbnail.vue`: cassette visual preview / cassette cards and queue editor / geometry definition / no status / none / canvas controls / click safe / visual-first / aspect owned / keep.
- `CassetteDesignerV2.vue`: persisted OCCS template designer / workbench and cassette manager / OCCS definition, graph tree / no lifecycle here / template source external / save/load/reset designer actions / canvas and panel clicks local / high-density CAD tool / responsive columns / keep.

## Pages And Layouts

- `layouts/app.vue`: authenticated app shell / all app pages / auth/navigation / no entity status / nav links / shell actions / page content owns clicks / dense operational chrome / owns route padding / keep.
- `layouts/ui-lab-layout.vue`: demo shell / `/test/ui-lab` / manifest demos / no status / demo refs / lab controls / demo click safe / dense inspection / constrained lab width / keep.
- `pages/index.vue`: public landing and redirect gate / root route / auth store / no entity status / projects redirect / auth actions / hero clicks only / marketing density / responsive hero / keep.
- `pages/auth/login.vue`: login form / public auth / credentials / no status / invitation links / submit action / form controls safe / minimal / centered / keep.
- `pages/auth/register.vue`: registration form / public auth / user/org payload / no status / terms link / submit action / form controls safe / minimal / centered / keep.
- `pages/invitation/[token].vue`: invitation acceptance / public token route / invitation DTO / no entity status / org/user context / accept/register actions / form safe / task-focused / centered / keep.
- `pages/terms-and-conditions.vue`: legal content / public route / static content / no status / none / none / links safe / readable / StandardPage / keep.
- `pages/projects/index.vue`: project list / authenticated route / project collection / project cards own status / project refs / create/search actions / card clicks safe / list-first / ResponsiveGrid / keep.
- `pages/project/[slug].vue`: project workspace / project route shell / project DTO / EntityPage status / child tabs / project actions / tabs safe / workspace-first / page tabs / keep.
- `pages/project/[slug]/index.vue`: project overview / child route / project summary / inherited page status / queues/artifacts refs / local actions / cards safe / summary density / grid / keep.
- `pages/project/[slug]/queues.vue`: project queues / child route / queue collection / queue cards own status / project lineage / create/open actions / status safe / queues-first / ResponsiveGrid / keep.
- `pages/project/[slug]/queue/[queueId].vue`: queue editor/detail / child route / queue DTO / queue status / cassette/material refs / queue operations / editor controls safe / operational density high / editor responsive / keep.
- `pages/project/[slug]/artifacts.vue`: project artifacts / child route / artifact collection / hidden / queue/run refs / preview/download actions / preview click safe / output-first / table/grid / keep.
- `pages/project/[slug]/data.vue`: project data tables / child route / project-scoped resources / entity cards own status / entity refs / import/open actions / table controls safe / data-first / TableFrame / keep.
- `pages/project/[slug]/sheet-designs.vue`: sheet design list / child route / design collection / card hidden / design refs / open actions / preview safe / design-first / grid / keep.
- `pages/project/[slug]/sheet-design/[sheetDesignId].vue`: sheet design detail / child route / design DTO / detail policy / cassette design refs / page actions / refs safe / geometry-first / detail grid / keep.
- `pages/warehouses/index.vue`: warehouse operations / authenticated route / WarehouseHub / hub no status header / warehouse inventory cards / create/edit/delete in hub / tabs safe / inventory above detail / compact header / refactored via hub.
- `pages/requisitions/index.vue`: requisition list / authenticated route / requisition collection / cards own status / org/project refs / create/open actions / status safe / procurement-first / grid/table / keep.
- `pages/catalog/index.vue`: catalog route / authenticated route / catalog collection / hidden status / org refs / catalog actions / cards safe / library-first / shared page shell / keep.
- `pages/assets/index.vue`: asset root redirect / authenticated root redirect only / no status / no child refs / redirect action / no entity click / compact loading state / `StandardPage` shell without tabs or `NuxtPage` / refactored.
- `pages/assets/cassettes.vue`: cassette manager route / authenticated route / cassette/template collections / card policy / design/template refs / manager actions / designer safe / manager-first / `StandardPage` shell / refactored.
- `pages/assets/layer-standards.vue`: layer standards route / authenticated route / layer standard collection / hidden / pen refs when available / asset actions / cards safe / standards-first / `StandardPage` shell / refactored.
- `pages/assets/pens.vue`: pen templates route / authenticated route / pen collection / hidden / none / asset actions / cards safe / asset-first / `StandardPage` shell / refactored.
- `pages/assets/templates.vue`: template placeholder route / authenticated route / none yet / no status / none / navigation only / no entity click / sparse state acceptable / `StandardPage` shell / refactored.
- `pages/assets/tools.vue`: tool profiles route / authenticated route / tool collection / hidden / none / asset actions / cards safe / tool-first / `StandardPage` shell / refactored.
- `pages/profile/index.vue`: user profile and orgs / authenticated route / user/org/billing data / hidden / organization cards / billing/org actions / table/card safe / account-first / responsive grids / keep.
- `pages/organization/users.vue`: org user admin / authenticated route / user/invitation lists / hidden / users/org implicit / invite/approve actions / table controls safe / dense admin / TableFrame / keep.
- `pages/admin/index.vue`: admin landing / admin route / admin navigation / no status / links / admin nav actions / links safe / compact / grid/list / keep.
- `pages/admin/users.vue`: admin users / admin route / user collection / hidden / org refs if shown / admin actions / table safe / dense admin / TableFrame / keep.
- `pages/admin/support.vue`: support/admin page / admin route / support data / no status / user refs if shown / admin actions / form/table safe / task-focused / shared shell / keep.
- `pages/admin/config-bot.vue`: config bot / admin route / generated package data / no entity status / citations/targets / generate/apply actions / form controls safe / dense tool / panels / keep.
- `pages/admin/workbench.vue`: domain workbench / admin route / fixtures/workflows/designer / local status workflows / many entity refs / scenario actions / demo clicks safe / intentionally dense / lab-like layout / keep.
- `pages/designer-test.vue`: designer test route / dev route / cassette designer fixture / no status / none / test actions / canvas safe / dev density / responsive designer / keep.
- `pages/test/ui-lab.vue`: design-system lab / test route / manifest/factory DTOs / demo status / demo relations / variant controls / demos safe / inspection density / lab grid / keep.
