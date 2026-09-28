<script setup>
// `/screens` has no surface of its own: the home screen is the default
// screen, so the bare route points at it (see pages/README.md).
definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

await navigateTo('/screens/home', { replace: true });
</script>
