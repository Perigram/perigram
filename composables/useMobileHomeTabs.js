import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { useRegistryStore } from '~/stores/registry';
import { useEffectiveContainment } from '~/composables/useEffectiveContainment.js';
import { typeParentOf } from '~/utils/generated-screen-source.js';
import { typeLabelKey, localizedLabel } from '#shared/ui-mapping/index.js';

// The mobile home tab contract: the sidebar tree's top level as one
// fixed tab list. Roots are derived exactly like the desktop tree's —
// manifest-backed typeList types plus their containment ancestors form
// the visible set, and a visible type that is another visible type's
// containment child is not a root. Structural ancestors without their
// own compiled screen are folders, not tabs. The selection is shared
// app state: the app-shell bottom bar writes it, the home workspace
// renders it (mobile branch), and an unknown or unset key resolves to
// the first tab.
export function useMobileHomeTabs() {
  const authStore = useAuthStore();
  const registryStore = useRegistryStore();
  const effectiveContainment = useEffectiveContainment();

  const screenfulTypes = computed(() => (authStore.screenManifest || [])
    .filter(screen => screen.typeId && screen.template === 'typeList')
    .map(screen => screen.typeId));

  const { te, t } = useI18n();

  const tabs = computed(() => {
    const parentOf = typeParentOf(effectiveContainment());
    const visible = new Set();
    for (const typeId of screenfulTypes.value) {
      let cursor = typeId;
      const guard = new Set();
      while (cursor && !guard.has(cursor) && registryStore.typeRecord(cursor)) {
        guard.add(cursor);
        visible.add(cursor);
        cursor = parentOf.get(cursor) || '';
      }
    }
    const rooted = new Set([...visible].filter(typeId => {
      const parent = parentOf.get(typeId);
      return parent && visible.has(parent);
    }));
    const screenOf = new Map((authStore.screenManifest || [])
      .filter(screen => screen.typeId && screen.template === 'typeList')
      .map(screen => [screen.typeId, screen]));
    return [...visible]
      .filter(typeId => !rooted.has(typeId) && screenOf.has(typeId))
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
