<template>
    <div class="assets-page">
        <TabView>
            <TabPanel header="Cassettes">
                <CassetteManager />
            </TabPanel>
            <TabPanel header="Library">
                <AssetsLibrary />
            </TabPanel>
            <TabPanel header="Standards">
                <div class="p-4">
                    <h2>Layer Standards</h2>
                    <p>System-defined layer standards. These are read-only.</p>
                    <!-- TODO: Implement Layer Standards viewer -->
                </div>
            </TabPanel>
        </TabView>
    </div>
</template>

<script setup>
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import CassetteManager from '~/components/CassetteManager.vue';
import AssetsLibrary from '~/components/AssetsLibrary.vue';
</script>

<style scoped>
.assets-page {
    padding: 1rem;
}
</style>
