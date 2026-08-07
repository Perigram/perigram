import ProjectCard from '~/components/entities/Project/ProjectCard.vue';
import QueueCard from '~/components/entities/Queue/QueueCard.vue';
import NestingRunCard from '~/components/entities/NestingRun/NestingRunCard.vue';
import SheetDesignCard from '~/components/entities/SheetDesign/SheetDesignCard.vue';
import CassetteCard from '~/components/entities/Cassette/CassetteCard.vue';
import CassetteDesignCard from '~/components/entities/CassetteDesign/CassetteDesignCard.vue';
import CassetteTemplateCard from '~/components/entities/CassetteTemplate/CassetteTemplateCard.vue';
import CassetteInstanceCard from '~/components/entities/CassetteInstance/CassetteInstanceCard.vue';
import RequisitionCard from '~/components/entities/Requisition/RequisitionCard.vue';
import MaterialCard from '~/components/entities/Material/MaterialCard.vue';
import PileCard from '~/components/entities/MaterialPile/PileCard.vue';
import BatchPileCard from '~/components/entities/BatchPile/BatchPileCard.vue';
import SheetCard from '~/components/entities/Sheet/SheetCard.vue';
import RemnantCard from '~/components/entities/Remnant/RemnantCard.vue';
import CatalogCard from '~/components/entities/Catalog/CatalogCard.vue';
import ColorCard from '~/components/entities/Color/ColorCard.vue';
import EntityRevisionCard from '~/components/entities/EntityRevision/EntityRevisionCard.vue';
import GeometryCaptureCard from '~/components/entities/GeometryCapture/GeometryCaptureCard.vue';
import ProfileTemplateCard from '~/components/entities/ProfileTemplate/ProfileTemplateCard.vue';
import WarehouseCard from '~/components/entities/Warehouse/WarehouseCard.vue';
import ToolProfileCard from '~/components/entities/ToolProfile/ToolProfileCard.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import LibraryCard from '~/components/entities/Library/LibraryCard.vue';
import UserCard from '~/components/entities/User/UserCard.vue';
import OrganizationCard from '~/components/entities/Organization/OrganizationCard.vue';
import ArtifactCard from '~/components/entities/Artifact/ArtifactCard.vue';
import ArtifactTemplateCard from '~/components/entities/ArtifactTemplate/ArtifactTemplateCard.vue';
import FacadeCard from '~/components/entities/Facade/FacadeCard.vue';
import FacadePatternCard from '~/components/entities/FacadePattern/FacadePatternCard.vue';

import * as factories from '~/test-data/factories.js';
import {
  DESIGN_SYSTEM_FIELD_GROUPS,
  DESIGN_SYSTEM_ENTITY_CONTRACTS,
  DESIGN_SYSTEM_SURFACES,
  validateDesignSystemContracts,
  validateDesignSystemDisplayContracts
} from '~/utils/design-system-contract.js';

const components = {
  facade: FacadeCard,
  facadePattern: FacadePatternCard,
  project: ProjectCard,
  queue: QueueCard,
  nestingRun: NestingRunCard,
  sheetDesign: SheetDesignCard,
  cassette: CassetteCard,
  cassetteDesign: CassetteDesignCard,
  cassetteTemplate: CassetteTemplateCard,
  cassetteInstance: CassetteInstanceCard,
  requisition: RequisitionCard,
  material: MaterialCard,
  materialPile: PileCard,
  batchPile: BatchPileCard,
  sheet: SheetCard,
  remnant: RemnantCard,
  catalog: CatalogCard,
  color: ColorCard,
  entityRevision: EntityRevisionCard,
  geometryCapture: GeometryCaptureCard,
  profileTemplate: ProfileTemplateCard,
  warehouse: WarehouseCard,
  toolProfile: ToolProfileCard,
  penTemplate: PenTemplateCard,
  layerStandard: LayerStandardCard,
  library: LibraryCard,
  user: UserCard,
  organization: OrganizationCard,
  artifact: ArtifactCard,
  artifactTemplate: ArtifactTemplateCard
};

export const DESIGN_SYSTEM_ENTITIES = DESIGN_SYSTEM_ENTITY_CONTRACTS.map((entry) => ({
  ...entry,
  fieldGroups: DESIGN_SYSTEM_FIELD_GROUPS[entry.key] || {},
  surfaces: DESIGN_SYSTEM_SURFACES[entry.key]?.surfaces || {},
  component: components[entry.key],
  factory: factories[entry.factoryName]
}));

export function createDesignSystemDemoRows() {
  return DESIGN_SYSTEM_ENTITIES.map((entry) => {
    const entity = entry.factory();
    return {
      ...entry,
      entity,
      props: { [entry.propName]: entity }
    };
  });
}

export function validateDesignSystemManifest(entries = DESIGN_SYSTEM_ENTITIES) {
  const contractIssues = validateDesignSystemContracts(entries);
  const displayIssues = validateDesignSystemDisplayContracts(entries);
  const runtimeIssues = entries.flatMap((entry) => {
    const issues = [];
    if (!entry.component) issues.push('missing component');
    if (typeof entry.factory !== 'function') issues.push('missing factory');

    const entity = entry.factory?.();
    if (!entity?.identity) issues.push('factory missing identity block');
    if (!entity?.origin) issues.push('factory missing origin block');
    if (!entity?.status) issues.push('factory missing status block');
    if (!entity?.lineage) issues.push('factory missing lineage block');
    if (!entity?.attachments) issues.push('factory missing attachments block');
    if (!entity?.data) issues.push('factory missing data block');

    return issues.map((issue) => ({ key: entry.key || 'unknown', issue }));
  });

  return [...contractIssues, ...displayIssues, ...runtimeIssues];
}
