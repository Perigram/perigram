<script setup>
// `/screens` has no surface of its own: the home screen is the default
// screen, so the bare route points at the stable home route.

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

import { HOME_SCREEN_ROUTE } from '@perigram/processes/screen-contract';
await navigateTo(HOME_SCREEN_ROUTE, { replace: true });
</script>
