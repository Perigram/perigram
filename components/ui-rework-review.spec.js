import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('reviewed UI rework contracts', () => {
  it('uses container width for entity page facts and collections', () => {
    expect(read('./shared/EntityPage.vue')).toContain('container-type: inline-size');
    expect(read('./shared/blocks/DataBlock.vue')).toContain('@container (min-width: 32rem)');
    expect(read('./shared/blocks/SpecsBlock.vue')).toContain('@container (min-width: 32rem)');
    expect(read('./generated/GeneratedEntityCollection.vue')).toContain('responsive-context="container"');
  });

  it('suppresses a displayed parent from descendant lineage traces', () => {
    expect(read('./shared/EntityPage.vue')).toContain("provide('displayedEntityContext'");
    expect(read('./shared/links/TraceChain.vue')).toContain("inject('displayedEntityContext'");
  });

  it('keeps the chats inbox visible beside the selected conversation on the full route', () => {
    expect(read('../pages/chats.vue')).toContain('<ChatSupport :embedded="true" :full-page="true" />');
    expect(read('./ChatSupport.vue')).toContain("md:grid-cols-[20rem_minmax(0,1fr)]");
    expect(read('./ChatSupport.vue')).toContain("'hidden md:block': fullPage && activeConversation");
    expect(read('./ChatSupport.vue')).toContain('grid-rows-[minmax(0,1fr)]');
  });

  it('renders profile organization navigation as a visible direct action', () => {
    expect(read('./entities/Organization/OrganizationCard.vue')).toContain('footer-display="inline"');
    expect(read('../pages/profile/index.vue')).toContain("$t('profile.viewOrganization')");
    expect(read('../pages/profile/index.vue')).not.toContain('v-for="screen in organizationScreens"');
    expect(read('../pages/profile/index.vue')).toContain("v-if=\"activeProfileTab === '0'\"");
    expect(read('../pages/profile/index.vue')).toContain("@click=\"activeProfileTab = '2'\"");
  });

  it('renders organization navigation as direct actions around the canonical entity page', () => {
    const overview = read('./generated/GeneratedOrganizationOverview.vue');
    expect(overview).toContain('<EntityPage');
    expect(overview).toContain('<ActionToolbar');
    expect(overview).not.toContain('<Panel v-for');
  });

  it('builds organization breadcrumbs as organization then section', () => {
    const navigation = read('../stores/navigation.js');
    expect(navigation).toContain("if (parts[0] === 'organization')");
    expect(navigation).toContain("to: '/organization'");
    expect(navigation).toContain("currentScreen.route !== '/organization'");
  });

  it('uses a centered invitation identity and cropped user avatars', () => {
    const invitation = read('../pages/invitation/[token].vue');
    expect(invitation).toContain('<h1 class="m-0 text-xl">{{ $t(\'auth.invitationTitle\') }}</h1>');
    expect(invitation).toContain("t('auth.invitationUnavailable')");
    expect(read('./entities/User/UserCard.vue')).toContain('[&_.p-avatar-image]:object-cover');
  });

  it('keeps attachment-only chat messages sendable and gives full-page threads their own header', () => {
    const chat = read('./ChatSupport.vue');
    expect(chat).toContain("(!message.value.trim() && !entityRefs.value.length)");
    expect(chat).toContain('v-if="fullPage" class="flex items-center gap-3 border-b');
  });

  it('imports i18n explicitly on the projects route', () => {
    expect(read('../pages/projects/index.vue')).toContain("import { useI18n as useProjectsI18n } from 'vue-i18n'");
  });
});
