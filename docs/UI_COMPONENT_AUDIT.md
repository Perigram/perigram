# UI Component Audit

Date: 2026-08-21

This is the canonical human-readable UI inventory. It separates PrimeVue/Aura
system ownership from application primitives and derived composition. The matrix
is observational: an `owned` or `overridden` entry records current ownership;
it does not grant an exception to the zero-styling policy. A `violation` is a
mechanically visible conflict that should converge toward PrimeVue defaults or a
registered shared primitive.

## Scope And Reconciliation

In scope: every `.vue` file below `components/`, `layouts/`, and `pages/`,
plus root `error.vue`, including dormant or version-suffixed files. Each ID is
derived from its repository path by lowercasing and replacing non-alphanumeric
runs with hyphens. `shared/design-system.spec.js` enumerates the filesystem and
fails for missing, stale, duplicate, or non-path-derived inventory rows. It also
reconciles the mechanism keys below. Existing projection tests reconcile token
exports with runtime CSS, and registry tests reconcile registered primitives with
their files and UI-lab examples.

Ownership classes:

- `system-owned`: non-component mechanism that projects or centralizes the design system; generic visuals still defer to PrimeVue/Aura.
- `shared/domain primitive`: exact component path in the domain primitive registry; it owns semantics, data visualization, or reusable layout.
- `derived usage`: every unregistered component, route, layout, generated renderer, or other composition that consumes system and primitive contracts.

Mechanism dispositions describe the active system boundary. Component rows use
the four convergence dispositions below and include current occurrence counts;
`compliant` means the analyzer found no local ownership concern.

## Visual Ownership Contract

Each generic visual concern has one owner. PrimeVue Aura owns control and
container typography defaults, padding and spacing, borders, radii, shadows,
container chrome, and hover, active, disabled, invalid, and keyboard-focus
states. The application preset may project the primary brand palette but must
not redefine those generic concerns. Runtime CSS, Tailwind utilities, wrappers,
shared primitives, and derived components are consumers, never alternate theme
owners.

Application ownership is limited to semantic typography roles, reusable layout
constraints, registered shared or domain primitives, derived semantic
composition, and narrowly allowlisted data-driven visuals. Operational
workspaces belong to registered primitives or derived semantic composition;
third-party integration sizing is a reusable layout constraint. Primitives own
structure, content rules, and domain
behavior while delegating generic chrome and states to PrimeVue. Derived
components may compose primitives and approved layout contracts but may not
introduce generic visual language. Geometry and process visualization qualifies
for narrow allowlisting only when its visual value is driven by data. Behavior
PrimeVue genuinely cannot provide belongs to a registered primitive or derived
semantic composition, not a separate visual exception. Every inline binding is
classified by exact file in the inventory rather than broadening the theme.
Allowlisted bindings are also pinned to their normalized expressions, preventing
an allowed file from silently gaining or changing a visual exception.

Violations have four dispositions: `remove` when Aura already supplies the
concern, `replace` when an Aura component or registered primitive owns it,
`centralize` when a repeated semantic type or layout role is legitimate, and
`narrowly allowlist` only for an irreducible exception above.

| Inventory finding | Disposition under this contract |
|---|---|
| PrimeVue/Aura/Tailwind/Nuxt foundation | compliant; add no design-system dependency. |
| 25 registered primitives and UI-lab coverage | compliant semantic ownership; primitives delegate generic chrome and states to Material. |
| Generic preset typography, spacing, borders, radii, shadows, and states | remove; the preset retains only the primary palette. |
| Application motion scales and component-specific spacing tokens | remove; generic transitions and spacing belong to Material, while unavailable interaction behavior stays local to its owning derived composition. |
| Duplicated runtime token values and `!important` PrimeVue overrides | remove; the token module is the sole textual source and Nuxt projects its CSS variables. |
| Forced root size, two-level toolbar mapping, type utilities, and arbitrary 10/11px type | centralize into the eight complete application roles: page title, section heading, body, label, supporting, metric, technical, and prose. |
| Element-wide `p`, `blockquote`, heading, and technical-element styling | remove; prose and technical text opt into their semantic aliases explicitly. |
| Global focus suppression | remove and restore Material interaction states. |
| Raw surface borders and `shadow-sm` | replace with Material components or an existing semantic contract. |
| Hand-built bordered/rounded derived containers | replace with PrimeVue containers or a registered primitive. Domain primitives retain structure only; Material owns their generic chrome. |
| Scoped CSS, inline bindings, render-function styles, and visual utilities | reusable layout and derived semantic composition are compliant; typography, color, border, radius, shadow, and state styling is remove, replace, or centralize. Render-function styles do not bypass classification. Only exact data-driven visuals, including data-driven geometry/process values, may be narrowly allowlisted. |
| Missing canonical component audit | centralize here; reconciliation covers every repository Vue file and mechanism. |
| Missing repository-wide guards | centralize in `shared/design-system.spec.js`; the audit and enforcement use this same boundary. |

The convergence removed the generic preset/runtime overrides, centralized
motion/dock visual contracts, direct global
PrimeVue selectors and variable declarations, element-wide
typography, raw type utilities, arbitrary 10/11px typography, and global focus suppression. Nuxt now
emits application CSS variables from `assets/tokens/index.js`; repository checks
reject raw typography treatments, raw surface borders, nonsemantic radii/shadows,
non-allowlisted scoped CSS, and focus suppression. Remaining standard utility
typography, arbitrary layout, generic chrome, local state, and important
overrides are explicitly counted below with their required disposition; updating
the inventory records debt but does not authorize it as an exception.

Application-owned radius and shadow values are removed. Reusable Tailwind aliases
consume Material variables directly, and registered entity card/popover structures no
longer override Material borders, elevation, or interaction states.

## Mechanism Inventory

| ID | Mechanism | Primary ownership | Intended boundary | Sources | Current disposition |
|---|---|---|---|---|---|
| `mechanism-aura` | PrimeVue/Aura baseline | system-owned | Generic controls, containers, typography, chrome, and interaction states. | `@primeuix/themes/aura`; `assets/presets/re_l.js` | default: Aura is the sole generic visual owner. |
| `mechanism-token-source` | Application token source | shared/domain primitive | Semantic typography roles, reusable layout constraints, domain signals, geometry, and data-driven roles only. | `assets/tokens/index.js`; `assets/tokens/README.md` | owned: sole textual source for application visual values. |
| `mechanism-primevue-projection` | PrimeVue semantic/component projection | system-owned | Projects the brand primary palette and the zinc surface scale; generic component defaults remain Aura-owned. | `assets/tokens/index.js`; `assets/presets/re_l.js` | default: component projection covers app-shell anatomy only; semantic projection is primary palette plus zinc surfaces. |
| `mechanism-tailwind-projection` | Tailwind theme projection | system-owned | Expose semantic app aliases and reusable layout constraints. | `assets/tokens/index.js:L164-L343`; `tailwind.config.js:L1-L15` | owned: `tailwindThemeExtension`; usage is recorded per Vue row. |
| `mechanism-css-variable-projection` | CSS variable projection | system-owned | Expose light and dark `--ck-*` values for app-owned semantic roles. | `assets/tokens/index.js` exports `cssVariableTokens` and `darkCssVariableTokens`; `nuxt.config.js`; `shared/design-system.spec.js` | owned: Nuxt emits both projections directly from the token source. |
| `mechanism-preset` | PrimeVue preset | system-owned | Install Aura plus the bounded primary palette, zinc surface scale, and app-shell component tokens (transparent tab strips, explorer-density trees). | `assets/presets/re_l.js`; `nuxt.config.js` | default: no generic component overrides. |
| `mechanism-tailwind-aliases` | Tailwind aliases | system-owned | Layout utilities plus token-backed app semantic aliases. | `tailwind.config.js:L1-L16`; `assets/tokens/index.js:L164-L343` | owned: aliases are projected from tokens; raw and arbitrary usage remains component drift. |
| `mechanism-global-css` | Global CSS layers | system-owned | Font loading/inheritance, page background, app-shell behavior, and active global integrations only. | `assets/css/fonts.css`; `assets/css/main.css`; `assets/css/variants.css` | owned: HTML elements carry no application type role and generic controls remain Material-owned. |
| `mechanism-runtime-overrides` | Runtime PrimeVue overrides | system-owned | No independent visual-value or generic PrimeVue override source. | `assets/css/main.css`; `shared/design-system.spec.js` | default: PrimeVue variable declarations, component selectors, and important rules are rejected. |
| `mechanism-scoped-css` | Vue local/scoped CSS | shared/domain primitive | Exact reusable layout only; Material-owned padding is not layout. | Every inventory row with a CSS disposition; `shared/design-system.spec.js` allowlist. | compliant only at exact files and property sets; all other scoped CSS is a violation. |
| `mechanism-primitive-registry` | Primitive registry | shared/domain primitive | Canonical registered shared/domain surfaces and component paths. | `packages/domain-cnc/src/ui.js:L46-L72`; `utils/design-system-contract.js` | owned: exact registry paths define shared/domain primitive rows; all other Vue rows are derived usage. |
| `mechanism-runtime-registry` | Vue runtime bindings | shared/domain primitive | Bind the domain contract to Vue components and factories. | `utils/design-system.js`; `framework.manifest.json` | owned: runtime binding remains distinct from the pure domain contract. |
| `mechanism-ui-lab` | UI lab coverage | derived usage | Render every registered primitive and entity contract for visual inspection. | `pages/test/ui-lab.vue:L480-L547`; `pages/test/README.md:L8-L24` | owned: existing tests reconcile primitive keys with examples. |
| `mechanism-enforcement` | Automated enforcement | system-owned | Reconcile inventory, projections, registries, UI lab, wrappers, palettes, and known design-system boundaries. | `shared/design-system.spec.js` | owned: inventory enumeration fails on missing, stale, duplicate, or misidentified Vue rows. |

## Component Inventory

This generated matrix records durable ownership plus current source-derived
visual findings. Counts are occurrences, not exemptions. Run
`node scripts/ui-visual-inventory.js` after an intentional visual change;
`shared/design-system.spec.js` fails when source and this matrix diverge.

| ID | Path | Primary ownership | Current disposition |
|---|---|---|---|
| `ui-components-artifactlayouteditor-vue` | `components/ArtifactLayoutEditor.vue` | derived usage | centralize:layout (1); replace:chrome (4) |
| `ui-components-artifacts-artifacttexteditor-vue` | `components/artifacts/ArtifactTextEditor.vue` | derived usage | replace:inline-visual (1) |
| `ui-components-artifacts-artifactviewer-vue` | `components/artifacts/ArtifactViewer.vue` | derived usage | replace:chrome (2) |
| `ui-components-artifacts-sketcheditor-vue` | `components/artifacts/SketchEditor.vue` | derived usage | replace:chrome (1) |
| `ui-components-artifactstable-vue` | `components/ArtifactsTable.vue` | derived usage | compliant |
| `ui-components-assetslibrary-vue` | `components/AssetsLibrary.vue` | derived usage | replace:chrome (2); narrowly-allowlist:inline-data-driven (1) |
| `ui-components-authprogress-vue` | `components/AuthProgress.vue` | derived usage | compliant |
| `ui-components-calls-callfloatingwindow-vue` | `components/calls/CallFloatingWindow.vue` | derived usage | centralize:layout (4); replace:chrome (7) |
| `ui-components-calls-callpanel-vue` | `components/calls/CallPanel.vue` | derived usage | replace:chrome (1); compliant:scoped-layout; narrowly-allowlist:inline-data-driven (1) |
| `ui-components-calls-callprejoin-vue` | `components/calls/CallPrejoin.vue` | derived usage | replace:chrome (5) |
| `ui-components-calls-calltile-vue` | `components/calls/CallTile.vue` | derived usage | replace:chrome (5); replace:inline-visual (1) |
| `ui-components-calls-callworkspacepage-vue` | `components/calls/CallWorkspacePage.vue` | derived usage | replace:chrome (4); compliant:scoped-layout |
| `ui-components-calls-incomingcalls-vue` | `components/calls/IncomingCalls.vue` | derived usage | replace:chrome (5) |
| `ui-components-cassettedesignerv2-vue` | `components/CassetteDesignerV2.vue` | derived usage | centralize:layout (1); replace:chrome (35); narrowly-allowlist:inline-data-driven (2) |
| `ui-components-cassetteeditordialog-vue` | `components/CassetteEditorDialog.vue` | derived usage | centralize:layout (6); replace:chrome (2) |
| `ui-components-cassetteexpressioneditor-vue` | `components/CassetteExpressionEditor.vue` | derived usage | replace:chrome (17); remove:state (1) |
| `ui-components-cassettefoldedpreview-vue` | `components/CassetteFoldedPreview.vue` | derived usage | centralize:layout (2); replace:chrome (4); remove:state (1) |
| `ui-components-cassettethumbnail-vue` | `components/CassetteThumbnail.vue` | derived usage | replace:chrome (4) |
| `ui-components-chatsupport-vue` | `components/ChatSupport.vue` | derived usage | replace:chrome (21); remove:state (7); remove:important-override (11); compliant:scoped-layout; narrowly-allowlist:inline-data-driven (2) |
| `ui-components-config-bot-configbotcitationlist-vue` | `components/config-bot/ConfigBotCitationList.vue` | derived usage | replace:chrome (4) |
| `ui-components-config-bot-configbotdraftpreview-vue` | `components/config-bot/ConfigBotDraftPreview.vue` | derived usage | centralize:layout (1); replace:chrome (12) |
| `ui-components-config-bot-configbotgeneratedpreview-vue` | `components/config-bot/ConfigBotGeneratedPreview.vue` | derived usage | replace:chrome (8) |
| `ui-components-config-bot-configbotvalidationpanel-vue` | `components/config-bot/ConfigBotValidationPanel.vue` | derived usage | replace:chrome (4) |
| `ui-components-entities-artifact-artifactcard-vue` | `components/entities/Artifact/ArtifactCard.vue` | derived usage | compliant |
| `ui-components-entities-artifact-artifactdetail-vue` | `components/entities/Artifact/ArtifactDetail.vue` | derived usage | centralize:layout (1) |
| `ui-components-entities-artifacttemplate-artifacttemplatecard-vue` | `components/entities/ArtifactTemplate/ArtifactTemplateCard.vue` | derived usage | compliant |
| `ui-components-entities-cassette-cassettecard-vue` | `components/entities/Cassette/CassetteCard.vue` | derived usage | compliant |
| `ui-components-entities-cassettedesign-cassettedesigncard-vue` | `components/entities/CassetteDesign/CassetteDesignCard.vue` | derived usage | compliant |
| `ui-components-entities-cassettetemplate-cassettetemplatecard-vue` | `components/entities/CassetteTemplate/CassetteTemplateCard.vue` | derived usage | compliant |
| `ui-components-entities-entityrevision-entityrevisioncard-vue` | `components/entities/EntityRevision/EntityRevisionCard.vue` | derived usage | compliant |
| `ui-components-entities-layerstandard-layerstandardcard-vue` | `components/entities/LayerStandard/LayerStandardCard.vue` | derived usage | compliant |
| `ui-components-entities-organization-organizationcard-vue` | `components/entities/Organization/OrganizationCard.vue` | derived usage | compliant |
| `ui-components-entities-pentemplate-pentemplatecard-vue` | `components/entities/PenTemplate/PenTemplateCard.vue` | derived usage | replace:chrome (5); narrowly-allowlist:inline-data-driven (1) |
| `ui-components-entities-profiletemplate-profiletemplatecard-vue` | `components/entities/ProfileTemplate/ProfileTemplateCard.vue` | derived usage | compliant |
| `ui-components-entities-sheetdesign-sheetdesigncard-vue` | `components/entities/SheetDesign/SheetDesignCard.vue` | derived usage | compliant |
| `ui-components-entities-sheetdesign-sheetdesigndetail-vue` | `components/entities/SheetDesign/SheetDesignDetail.vue` | derived usage | compliant |
| `ui-components-entities-toolprofile-toolprofilecard-vue` | `components/entities/ToolProfile/ToolProfileCard.vue` | derived usage | compliant |
| `ui-components-entities-user-usercard-vue` | `components/entities/User/UserCard.vue` | derived usage | compliant |
| `ui-components-facadedesigner-vue` | `components/FacadeDesigner.vue` | derived usage | compliant |
| `ui-components-facadepatterndesigner-vue` | `components/FacadePatternDesigner.vue` | derived usage | replace:chrome (9) |
| `ui-components-footer-vue` | `components/Footer.vue` | derived usage | compliant |
| `ui-components-generated-generatedactionbutton-vue` | `components/generated/GeneratedActionButton.vue` | derived usage | compliant |
| `ui-components-generated-generatedartifactcreator-vue` | `components/generated/GeneratedArtifactCreator.vue` | derived usage | compliant |
| `ui-components-generated-generatedcassettedesigneraction-vue` | `components/generated/GeneratedCassetteDesignerAction.vue` | derived usage | compliant |
| `ui-components-generated-generatedcassettedesignerworkspacepage-vue` | `components/generated/GeneratedCassetteDesignerWorkspacePage.vue` | derived usage | compliant |
| `ui-components-generated-generateddeletebutton-vue` | `components/generated/GeneratedDeleteButton.vue` | derived usage | compliant |
| `ui-components-generated-generateddetailscreen-vue` | `components/generated/GeneratedDetailScreen.vue` | derived usage | compliant |
| `ui-components-generated-generatedfacadedesignerworkspacepage-vue` | `components/generated/GeneratedFacadeDesignerWorkspacePage.vue` | derived usage | compliant |
| `ui-components-generated-generatedfacadepatterndesignerworkspacepage-vue` | `components/generated/GeneratedFacadePatternDesignerWorkspacePage.vue` | derived usage | compliant |
| `ui-components-generated-generatedfilepreview-vue` | `components/generated/GeneratedFilePreview.vue` | derived usage | compliant |
| `ui-components-generated-generatedhomeworkspace-vue` | `components/generated/GeneratedHomeWorkspace.vue` | derived usage | replace:chrome (1); remove:important-override (17) |
| `ui-components-generated-generatedinstancecollection-vue` | `components/generated/GeneratedInstanceCollection.vue` | derived usage | replace:chrome (5); remove:important-override (2); compliant:scoped-layout |
| `ui-components-generated-generatedinstancedetail-vue` | `components/generated/GeneratedInstanceDetail.vue` | derived usage | compliant |
| `ui-components-generated-generatedinstancedetailbody-vue` | `components/generated/GeneratedInstanceDetailBody.vue` | derived usage | compliant |
| `ui-components-generated-generatedinstancefile-vue` | `components/generated/GeneratedInstanceFile.vue` | derived usage | replace:chrome (6) |
| `ui-components-generated-generatedobjectinput-vue` | `components/generated/GeneratedObjectInput.vue` | derived usage | compliant |
| `ui-components-generated-generatedorganizationaccount-vue` | `components/generated/GeneratedOrganizationAccount.vue` | derived usage | replace:chrome (11) |
| `ui-components-generated-generatedorganizationoverview-vue` | `components/generated/GeneratedOrganizationOverview.vue` | derived usage | compliant |
| `ui-components-generated-generatedprojectactionpalette-vue` | `components/generated/GeneratedProjectActionPalette.vue` | derived usage | compliant |
| `ui-components-generated-generatedprojectworkspace-vue` | `components/generated/GeneratedProjectWorkspace.vue` | derived usage | replace:chrome (10); remove:important-override (27); compliant:scoped-layout |
| `ui-components-generated-generatedregion-vue` | `components/generated/GeneratedRegion.vue` | derived usage | compliant |
| `ui-components-generated-generatedscreen-vue` | `components/generated/GeneratedScreen.vue` | derived usage | centralize:layout (1); remove:important-override (5) |
| `ui-components-generated-generatedscreenpane-vue` | `components/generated/GeneratedScreenPane.vue` | derived usage | replace:chrome (3) |
| `ui-components-generated-generatedtypescreen-vue` | `components/generated/GeneratedTypeScreen.vue` | derived usage | compliant |
| `ui-components-generated-generatedworkspacepage-vue` | `components/generated/GeneratedWorkspacePage.vue` | derived usage | replace:chrome (3) |
| `ui-components-generated-generatedworkspacepane-vue` | `components/generated/GeneratedWorkspacePane.vue` | derived usage | replace:chrome (3) |
| `ui-components-generated-generatedworkspacepanemenu-vue` | `components/generated/GeneratedWorkspacePaneMenu.vue` | derived usage | compliant |
| `ui-components-generated-generatedworkspacetabs-vue` | `components/generated/GeneratedWorkspaceTabs.vue` | derived usage | replace:chrome (3); remove:important-override (2) |
| `ui-components-languageswitcher-vue` | `components/LanguageSwitcher.vue` | derived usage | compliant |
| `ui-components-partlibrary-vue` | `components/PartLibrary.vue` | derived usage | replace:chrome (3) |
| `ui-components-permissioneditor-vue` | `components/PermissionEditor.vue` | derived usage | centralize:layout (2); replace:chrome (2) |
| `ui-components-permissionrulebuilder-vue` | `components/PermissionRuleBuilder.vue` | derived usage | replace:chrome (8) |
| `ui-components-process-designer-applymigrationdialog-vue` | `components/process-designer/ApplyMigrationDialog.vue` | derived usage | replace:chrome (4) |
| `ui-components-process-designer-ctstypenode-vue` | `components/process-designer/CtsTypeNode.vue` | derived usage | replace:chrome (1) |
| `ui-components-process-designer-inspector-declarationedgeinspector-vue` | `components/process-designer/inspector/DeclarationEdgeInspector.vue` | derived usage | compliant |
| `ui-components-process-designer-inspector-declarationinspector-vue` | `components/process-designer/inspector/DeclarationInspector.vue` | derived usage | compliant |
| `ui-components-process-designer-inspector-processnodeinspector-vue` | `components/process-designer/inspector/ProcessNodeInspector.vue` | derived usage | centralize:layout (1); replace:chrome (8) |
| `ui-components-process-designer-processnode-vue` | `components/process-designer/ProcessNode.vue` | derived usage | replace:chrome (1) |
| `ui-components-process-designer-typedvaluecontrol-vue` | `components/process-designer/TypedValueControl.vue` | derived usage | compliant |
| `ui-components-process-designer-typemigrationstepsdialog-vue` | `components/process-designer/TypeMigrationStepsDialog.vue` | derived usage | replace:chrome (4) |
| `ui-components-profilesketcheditor-vue` | `components/ProfileSketchEditor.vue` | derived usage | centralize:layout (2); replace:chrome (13) |
| `ui-components-projectstatistics-vue` | `components/ProjectStatistics.vue` | derived usage | compliant |
| `ui-components-shared-actiontoolbar-vue` | `components/shared/ActionToolbar.vue` | shared/domain primitive | compliant |
| `ui-components-shared-blocks-datablock-vue` | `components/shared/blocks/DataBlock.vue` | shared/domain primitive | replace:chrome (1); compliant:scoped-layout; narrowly-allowlist:inline-data-driven (1) |
| `ui-components-shared-blocks-statusbadge-vue` | `components/shared/blocks/StatusBadge.vue` | shared/domain primitive | replace:chrome (1) |
| `ui-components-shared-chatattachmentpicker-vue` | `components/shared/ChatAttachmentPicker.vue` | derived usage | compliant |
| `ui-components-shared-chatsupportdialog-vue` | `components/shared/ChatSupportDialog.vue` | derived usage | centralize:layout (1); replace:inline-visual (1) |
| `ui-components-shared-communicationmenu-vue` | `components/shared/CommunicationMenu.vue` | derived usage | compliant |
| `ui-components-shared-designerdialog-vue` | `components/shared/DesignerDialog.vue` | shared/domain primitive | compliant:scoped-layout |
| `ui-components-shared-designernodecard-vue` | `components/shared/DesignerNodeCard.vue` | derived usage | replace:chrome (5) |
| `ui-components-shared-designersockethandle-vue` | `components/shared/DesignerSocketHandle.vue` | derived usage | narrowly-allowlist:inline-data-driven (1) |
| `ui-components-shared-designersurface-vue` | `components/shared/DesignerSurface.vue` | shared/domain primitive | compliant |
| `ui-components-shared-designerworkspace-vue` | `components/shared/DesignerWorkspace.vue` | shared/domain primitive | centralize:layout (5); replace:chrome (24); compliant:scoped-layout |
| `ui-components-shared-drawingcanvas-vue` | `components/shared/DrawingCanvas.vue` | shared/domain primitive | replace:chrome (10) |
| `ui-components-shared-errorboundary-vue` | `components/shared/ErrorBoundary.vue` | derived usage | replace:chrome (2) |
| `ui-components-shared-filterbuilder-vue` | `components/shared/FilterBuilder.vue` | derived usage | remove:important-override (3) |
| `ui-components-shared-geometrypreview-vue` | `components/shared/GeometryPreview.vue` | shared/domain primitive | compliant |
| `ui-components-shared-instanceactionspopover-vue` | `components/shared/InstanceActionsPopover.vue` | derived usage | compliant |
| `ui-components-shared-instancecard-vue` | `components/shared/InstanceCard.vue` | shared/domain primitive | centralize:layout (1) |
| `ui-components-shared-instancechatpanel-vue` | `components/shared/InstanceChatPanel.vue` | derived usage | replace:chrome (4) |
| `ui-components-shared-instanceinlineref-vue` | `components/shared/InstanceInlineRef.vue` | derived usage | centralize:layout (1); replace:chrome (2); narrowly-allowlist:inline-data-driven (2) |
| `ui-components-shared-instancemultiselect-vue` | `components/shared/InstanceMultiSelect.vue` | shared/domain primitive | compliant |
| `ui-components-shared-instancepage-vue` | `components/shared/InstancePage.vue` | shared/domain primitive | replace:chrome (3); compliant:scoped-layout |
| `ui-components-shared-instancepreview-vue` | `components/shared/InstancePreview.vue` | derived usage | replace:chrome (1) |
| `ui-components-shared-instancerefinput-vue` | `components/shared/InstanceRefInput.vue` | derived usage | compliant |
| `ui-components-shared-instancerelationsblock-vue` | `components/shared/InstanceRelationsBlock.vue` | derived usage | centralize:layout (3) |
| `ui-components-shared-instanceselect-vue` | `components/shared/InstanceSelect.vue` | shared/domain primitive | compliant |
| `ui-components-shared-instancesurfacecontent-vue` | `components/shared/InstanceSurfaceContent.vue` | derived usage | compliant:scoped-layout |
| `ui-components-shared-instanceworkspace-vue` | `components/shared/InstanceWorkspace.vue` | derived usage | compliant:scoped-layout |
| `ui-components-shared-links-tracechain-vue` | `components/shared/links/TraceChain.vue` | shared/domain primitive | centralize:layout (1) |
| `ui-components-shared-links-tracelink-vue` | `components/shared/links/TraceLink.vue` | shared/domain primitive | replace:chrome (2) |
| `ui-components-shared-metricpanel-vue` | `components/shared/MetricPanel.vue` | derived usage | replace:chrome (3) |
| `ui-components-shared-motiondock-vue` | `components/shared/MotionDock.vue` | derived usage | replace:chrome (9); replace:inline-visual (2); replace:render-visual (5) |
| `ui-components-shared-nameeditpopover-vue` | `components/shared/NameEditPopover.vue` | derived usage | compliant |
| `ui-components-shared-offlineoutboxbadge-vue` | `components/shared/OfflineOutboxBadge.vue` | derived usage | replace:chrome (4) |
| `ui-components-shared-responsivegrid-vue` | `components/shared/ResponsiveGrid.vue` | shared/domain primitive | centralize:layout (4); compliant:scoped-layout |
| `ui-components-shared-scrollablepanel-vue` | `components/shared/ScrollablePanel.vue` | derived usage | remove:important-override (3) |
| `ui-components-shared-standarddialog-vue` | `components/shared/StandardDialog.vue` | shared/domain primitive | compliant |
| `ui-components-shared-standardpage-vue` | `components/shared/StandardPage.vue` | shared/domain primitive | compliant |
| `ui-components-shared-state-instancestate-vue` | `components/shared/state/InstanceState.vue` | shared/domain primitive | remove:important-override (3) |
| `ui-components-shared-state-statehistory-vue` | `components/shared/state/StateHistory.vue` | shared/domain primitive | centralize:layout (1); replace:chrome (3); remove:important-override (1) |
| `ui-components-shared-state-statelocation-vue` | `components/shared/state/StateLocation.vue` | shared/domain primitive | compliant |
| `ui-components-shared-state-statetransitiondialog-vue` | `components/shared/state/StateTransitionDialog.vue` | derived usage | compliant |
| `ui-components-shared-stateblock-vue` | `components/shared/StateBlock.vue` | shared/domain primitive | compliant |
| `ui-components-shared-supportmessagecontent-vue` | `components/shared/SupportMessageContent.vue` | derived usage | compliant |
| `ui-components-shared-tableframe-vue` | `components/shared/TableFrame.vue` | shared/domain primitive | compliant |
| `ui-components-shared-threeviewport-vue` | `components/shared/ThreeViewport.vue` | shared/domain primitive | compliant |
| `ui-components-shared-typedsettingsform-vue` | `components/shared/TypedSettingsForm.vue` | derived usage | compliant |
| `ui-components-shared-useraccountmenu-vue` | `components/shared/UserAccountMenu.vue` | derived usage | replace:chrome (4); remove:important-override (1) |
| `ui-components-shared-workspacelanes-vue` | `components/shared/WorkspaceLanes.vue` | derived usage | compliant |
| `ui-components-shared-workspacesplitnode-vue` | `components/shared/WorkspaceSplitNode.vue` | derived usage | replace:chrome (3); remove:important-override (2) |
| `ui-components-sheetdesigneditor-vue` | `components/SheetDesignEditor.vue` | derived usage | replace:chrome (1) |
| `ui-components-templatesmanager-vue` | `components/TemplatesManager.vue` | derived usage | compliant |
| `ui-components-themeswitcher-vue` | `components/ThemeSwitcher.vue` | derived usage | compliant |
| `ui-components-type-designer-descriptoreditor-vue` | `components/type-designer/DescriptorEditor.vue` | derived usage | compliant |
| `ui-components-type-designer-fieldnode-vue` | `components/type-designer/FieldNode.vue` | derived usage | compliant |
| `ui-components-type-designer-statenode-vue` | `components/type-designer/StateNode.vue` | derived usage | compliant |
| `ui-components-type-designer-typenode-vue` | `components/type-designer/TypeNode.vue` | derived usage | replace:chrome (1) |
| `ui-components-ui-mapping-actionbutton-vue` | `components/ui-mapping/ActionButton.vue` | derived usage | compliant |
| `ui-components-ui-mapping-breadcrumbtrail-vue` | `components/ui-mapping/BreadcrumbTrail.vue` | derived usage | compliant |
| `ui-components-ui-mapping-cardgrid-vue` | `components/ui-mapping/CardGrid.vue` | derived usage | compliant |
| `ui-components-ui-mapping-carouselgrid-vue` | `components/ui-mapping/CarouselGrid.vue` | derived usage | compliant |
| `ui-components-ui-mapping-chipsinput-vue` | `components/ui-mapping/ChipsInput.vue` | derived usage | compliant |
| `ui-components-ui-mapping-collectiontable-vue` | `components/ui-mapping/CollectionTable.vue` | derived usage | compliant:scoped-layout |
| `ui-components-ui-mapping-enumselect-vue` | `components/ui-mapping/EnumSelect.vue` | derived usage | compliant |
| `ui-components-ui-mapping-fieldcontrol-vue` | `components/ui-mapping/FieldControl.vue` | derived usage | compliant |
| `ui-components-ui-mapping-fileuploadcontrol-vue` | `components/ui-mapping/FileUploadControl.vue` | derived usage | compliant |
| `ui-components-ui-mapping-generatedmappingscreen-vue` | `components/ui-mapping/GeneratedMappingScreen.vue` | derived usage | compliant |
| `ui-components-ui-mapping-hierarchytable-vue` | `components/ui-mapping/HierarchyTable.vue` | derived usage | replace:chrome (2); compliant:scoped-layout |
| `ui-components-ui-mapping-hierarchytree-vue` | `components/ui-mapping/HierarchyTree.vue` | derived usage | compliant |
| `ui-components-ui-mapping-instancechip-vue` | `components/ui-mapping/InstanceChip.vue` | derived usage | compliant |
| `ui-components-ui-mapping-instancemultipicker-vue` | `components/ui-mapping/InstanceMultiPicker.vue` | derived usage | compliant |
| `ui-components-ui-mapping-instancepicker-vue` | `components/ui-mapping/InstancePicker.vue` | derived usage | remove:important-override (1) |
| `ui-components-ui-mapping-jsoneditor-vue` | `components/ui-mapping/JsonEditor.vue` | derived usage | compliant |
| `ui-components-ui-mapping-listeditor-vue` | `components/ui-mapping/ListEditor.vue` | derived usage | compliant |
| `ui-components-ui-mapping-objecteditor-vue` | `components/ui-mapping/ObjectEditor.vue` | derived usage | compliant |
| `ui-components-ui-mapping-previewbox-vue` | `components/ui-mapping/PreviewBox.vue` | derived usage | compliant |
| `ui-components-ui-mapping-quantityinput-vue` | `components/ui-mapping/QuantityInput.vue` | derived usage | compliant |
| `ui-components-ui-mapping-regionblock-vue` | `components/ui-mapping/RegionBlock.vue` | derived usage | replace:chrome (1); remove:important-override (1) |
| `ui-components-ui-mapping-regiondatastate-vue` | `components/ui-mapping/RegionDataState.vue` | derived usage | compliant |
| `ui-components-ui-mapping-sortcontrol-vue` | `components/ui-mapping/SortControl.vue` | derived usage | compliant |
| `ui-components-ui-mapping-statgrid-vue` | `components/ui-mapping/StatGrid.vue` | derived usage | compliant |
| `ui-components-ui-mapping-surfacebody-vue` | `components/ui-mapping/SurfaceBody.vue` | derived usage | compliant |
| `ui-components-ui-mapping-surfacedetailbody-vue` | `components/ui-mapping/SurfaceDetailBody.vue` | derived usage | replace:chrome (2); remove:state (1) |
| `ui-components-ui-mapping-surfaceheader-vue` | `components/ui-mapping/SurfaceHeader.vue` | derived usage | compliant:scoped-layout |
| `ui-components-ui-mapping-timelinecollection-vue` | `components/ui-mapping/TimelineCollection.vue` | derived usage | compliant |
| `ui-components-ui-mapping-varianteditor-vue` | `components/ui-mapping/VariantEditor.vue` | derived usage | compliant |
| `ui-components-userform-vue` | `components/UserForm.vue` | derived usage | compliant |
| `ui-error-vue` | `error.vue` | derived usage | compliant |
| `ui-layouts-app-vue` | `layouts/app.vue` | derived usage | centralize:layout (4); replace:chrome (7); remove:state (1); remove:important-override (2) |
| `ui-layouts-ui-lab-layout-vue` | `layouts/ui-lab-layout.vue` | derived usage | centralize:layout (2); replace:chrome (10); remove:state (2) |
| `ui-pages-auth-login-vue` | `pages/auth/login.vue` | derived usage | replace:chrome (1) |
| `ui-pages-auth-register-vue` | `pages/auth/register.vue` | derived usage | replace:chrome (1) |
| `ui-pages-chats-vue` | `pages/chats.vue` | derived usage | compliant |
| `ui-pages-index-vue` | `pages/index.vue` | derived usage | centralize:layout (5); replace:chrome (4) |
| `ui-pages-invitation-token-vue` | `pages/invitation/[token].vue` | derived usage | replace:chrome (3) |
| `ui-pages-organization-billing-vue` | `pages/organization/billing.vue` | derived usage | compliant |
| `ui-pages-organization-index-vue` | `pages/organization/index.vue` | derived usage | compliant |
| `ui-pages-organization-process-vue` | `pages/organization/process.vue` | derived usage | centralize:layout (2); replace:chrome (13); remove:state (1); remove:important-override (4); replace:inline-visual (1) |
| `ui-pages-organization-types-vue` | `pages/organization/types.vue` | derived usage | replace:chrome (4) |
| `ui-pages-organization-users-vue` | `pages/organization/users.vue` | derived usage | replace:chrome (5); compliant:scoped-layout |
| `ui-pages-profile-index-vue` | `pages/profile/index.vue` | derived usage | replace:chrome (4) |
| `ui-pages-screens-screenkey-vue` | `pages/screens/[screenKey].vue` | derived usage | compliant |
| `ui-pages-screens-index-vue` | `pages/screens/index.vue` | derived usage | compliant |
| `ui-pages-terms-and-conditions-vue` | `pages/terms-and-conditions.vue` | derived usage | replace:chrome (2) |
| `ui-pages-test-ui-lab-vue` | `pages/test/ui-lab.vue` | derived usage | replace:chrome (12) |
| `ui-pages-test-ui-mapping-vue` | `pages/test/ui-mapping.vue` | derived usage | compliant |
