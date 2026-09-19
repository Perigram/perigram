// Nuxt #app stubs for the page SSR smoke harness (vitest.ssr.config.js).
// Only what the mounted page tree touches outside real Nuxt runtime.
export const useNuxtApp = () => ({ $fetch: globalThis.$fetch });
export const navigateTo = () => {};
export const useRouter = () => ({ push: () => {}, replace: () => {} });
export const useRoute = () => ({ params: {}, query: {} });
export default { useNuxtApp, navigateTo, useRouter, useRoute };
