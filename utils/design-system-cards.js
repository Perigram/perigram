// The one card-component binding: the registry (design-system.js) and
// every card host (InstanceInlineRef, DrawingCanvas) resolve cards
// through this map.
import EntityRevisionCard from '~/components/entities/EntityRevision/EntityRevisionCard.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import UserCard from '~/components/entities/User/UserCard.vue';
import OrganizationCard from '~/components/entities/Organization/OrganizationCard.vue';
import ArtifactCard from '~/components/entities/Artifact/ArtifactCard.vue';
import ArtifactTemplateCard from '~/components/entities/ArtifactTemplate/ArtifactTemplateCard.vue';

export const DESIGN_SYSTEM_CARD_COMPONENTS = {
  entityRevision: EntityRevisionCard,
  penTemplate: PenTemplateCard,
  layerStandard: LayerStandardCard,
  user: UserCard,
  organization: OrganizationCard,
  artifact: ArtifactCard,
  artifactTemplate: ArtifactTemplateCard
};
