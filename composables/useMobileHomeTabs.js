import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { typeParentOf } from '~/utils/generated-screen-source.js';
import { typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';

// The mobile home tab contract: the sidebar tree's top level as one
// fixed tab list. Tabs are exactly the active process's stationed
// typeList types; a type is not a tab only when its containment parent
// is itself stationed (it is reached through the parent instead).
// Registry declarations no active definition stations neither render
// nor root anything — stale types from old applies stay invisible.
// The selection is shared
// app state: the app-shell bottom bar writes it, the home workspace
// renders it (mobile branch), and an unknown or unset key resolves to
// the first tab.
export function useMobileHomeTabs() {
  const authStore = useAuthStore();
  const registryStore = useRegistryStore();
  const effectiveContainment = useEffectiveContainment();

  const { te, t } = useI18n();

  const tabs = computed(() => {
    const parentOf = typeParentOf(effectiveContainment());
    const screenOf = new Map((authStore.screenManifest || [])
      .filter(screen => screen.typeId && screen.template === 'typeList')
      .map(screen => [screen.typeId, screen]));
    // Tabs are the active process's stationed types. A child is rooted
    // only under a parent that is itself stationed: registry-only parents
    // (declarations some old apply posted, absent from every active
    // definition) neither render nor root anything.
    return [...screenOf.keys()]
      .filter(typeId => {
        const parent = parentOf.get(typeId);
        return !(parent && screenOf.has(parent));
      })
      .map(typeId => {
        const screen = screenOf.get(typeId);
        // Procedural label contract only: the generated type key (locale
        // override) over the authored render label — no entity contracts.
        const record = registryStore.typeRecord(typeId);
        return {
          key: `screen:${screen.screenKey || screen.id}`,
          label: record
            ? localizedLabel({ te, t }, typeLabelKey(typeId), record.render?.label || typeId)
            : typeId,
          icon: registryStore.iconFor(typeId),
          screen
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  const selected = useState('mobileHomeTab', () => '');

  const activeKey = computed(() => (
    tabs.value.some(tab => tab.key === selected.value)
      ? selected.value
      : (tabs.value[0]?.key || '')
  ));

  function selectTab(key = '') {
    selected.value = key;
  }

  return { tabs, activeKey, selectTab };
}
