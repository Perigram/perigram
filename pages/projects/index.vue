<template>
    <div class="p-4">
        <div class="">
            <div class="flex gap-4 justify-end mb-4">
                <Button
                    :label="$t('project.create')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </div>

            <div class="flex gap-3 mb-4 flex-wrap">
                <span class="p-input-icon-left search-input">
                    <InputText
                        v-model="searchQuery"
                        :placeholder="$t('common.search')"
                        class="w-full"
                    />
                </span>

                <Dropdown
                    v-model="sortBy"
                    :options="sortOptions"
                    optionLabel="label"
                    optionValue="value"
                    :placeholder="$t('projects.sortBy')"
                />

                <SelectButton
                    v-model="viewMode"
                    :options="viewModes"
                    optionLabel="label"
                    optionValue="value"
                >
                    <template #option="slotProps">
                        <i :class="slotProps.option.icon"></i>
                    </template>
                </SelectButton>
            </div>
        </div>

        <div
            v-if="loading"
            class="loading-state"
        >
            <ProgressSpinner />
        </div>

        <div
            v-else-if="!projects || projects.length === 0"
            class="empty-state"
        >
            <i class="pi pi-inbox empty-icon"></i>
            <p class="empty-text">{{ $t('projects.noProjects') }}</p>
            <Button
                :label="$t('projects.createFirst')"
                icon="pi pi-plus"
                @click="showCreateDialog = true"
            />
        </div>

        <DataView
            v-else
            :value="filteredProjects"
            :layout="viewMode"
            :paginator="filteredProjects.length > 12"
            :rows="12"
            v-model:filters="filters"
            dataKey="id"
            filterDisplay="row"
            :loading="loading"
            :globalFilterFields="['name', 'slug']"
        >
            <template #grid="slotProps">
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <Card
                        v-for="project in slotProps.items"
                        :key="project.slug"
                    >
                        <template #title>
                            <NuxtLink :to="`/project/${project.slug}`">
                                {{ project.name.length > 20 ? project.name.slice(0, 17) + '...' : project.name }}
                            </NuxtLink>
                        </template>
                        <template #subtitle>
                            <div class="project-meta">
                                <span class="meta-item">
                                    <i class="pi pi-calendar"></i>
                                    {{ formatDate(project.createdAt) }}
                                </span>
                                <span
                                    v-if="project.results"
                                    class="flex gap-1"
                                >
                                    {{ project.results }} {{ $t('projects.results') }}
                                </span>
                            </div>
                        </template>
                        <template #footer>
                            <div>
                                <Button
                                    icon="pi pi-folder-open"
                                    text
                                    @click="openProject(project.slug)"
                                    v-tooltip.top="$t('common.open')"
                                />
                                <Button
                                    icon="pi pi-trash"
                                    text
                                    severity="danger"
                                    @click="confirmDelete(project)"
                                    v-tooltip.top="$t('common.delete')"
                                />
                            </div>
                        </template>
                    </Card>
                </div>
            </template>

            <template #list="slotProps">
                <div class="projects-list">
                    <div
                        v-for="project in slotProps.items"
                        :key="project.slug"
                        class="project-list-item"
                    >
                        <div class="item-icon">
                            <i class="pi pi-folder"></i>
                        </div>
                        <div class="item-content">
                            <NuxtLink
                                :to="`/project/${project.slug}`"
                                class="item-title"
                            >
                                {{ project.name }}
                            </NuxtLink>
                            <div class="item-meta">
                                <span class="meta-item">
                                    <i class="pi pi-calendar"></i>
                                    {{ formatDate(project.createdAt) }}
                                </span>
                                <span
                                    v-if="project.results"
                                    class="meta-item"
                                >
                                    <i class="pi pi-check-circle"></i>
                                    {{ project.results }} {{ $t('projects.results') }}
                                </span>
                            </div>
                        </div>
                        <div class="item-actions">
                            <Button
                                :label="$t('common.open')"
                                icon="pi pi-arrow-right"
                                text
                                @click="openProject(project.slug)"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                severity="danger"
                                @click="confirmDelete(project)"
                            />
                        </div>
                    </div>
                </div>
            </template>
        </DataView>

        <!-- Create Project Dialog -->
        <Dialog
            v-model:visible="showCreateDialog"
            :header="$t('project.create')"
            modal
            :style="{ width: '500px' }"
        >
            <div class="create-form">
                <div class="field">
                    <label for="projectName">{{ $t('project.name') }}</label>
                    <InputText
                        id="projectName"
                        v-model="newProjectName"
                        :placeholder="$t('projects.enterName')"
                        class="w-full"
                    />
                </div>
            </div>
            <template #footer>
                <Button
                    :label="$t('common.cancel')"
                    text
                    @click="showCreateDialog = false"
                />
                <Button
                    :label="$t('common.create')"
                    :loading="creating"
                    @click="createProject"
                />
            </template>
        </Dialog>

        <!-- Delete Confirmation Dialog -->
        <Dialog
            v-model:visible="showDeleteDialog"
            :header="$t('projects.deleteConfirm')"
            modal
            :style="{ width: '400px' }"
        >
            <div class="confirmation-content">
                <i
                    class="pi pi-exclamation-triangle"
                    style="font-size: 2rem; color: var(--red-500)"
                ></i>
                <p>{{ $t('projects.deleteWarning', { name: projectToDelete?.name }) }}</p>
            </div>
            <template #footer>
                <Button
                    :label="$t('common.cancel')"
                    text
                    @click="showDeleteDialog = false"
                />
                <Button
                    :label="$t('common.delete')"
                    severity="danger"
                    :loading="deleting"
                    @click="deleteProject"
                />
            </template>
        </Dialog>
    </div>
</template>

<script setup>
    import { ref, computed, onMounted } from 'vue'
    import DataView from 'primevue/dataview'
    import Card from 'primevue/card'
    import Button from 'primevue/button'
    import InputText from 'primevue/inputtext'
    import Dropdown from 'primevue/dropdown'
    import SelectButton from 'primevue/selectbutton'
    import Dialog from 'primevue/dialog'
    import ProgressSpinner from 'primevue/progressspinner'
    import { useGlobalStore } from '~/stores/global'
    import { storeToRefs } from 'pinia'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const { t } = useI18n()
    const router = useRouter()
    const globalStore = useGlobalStore()
    const { projectsList } = storeToRefs(globalStore)
    
    const projects = projectsList
    const loading = ref(true)
    const searchQuery = ref('')
    const sortBy = ref('date-desc')
    const viewMode = ref('grid')

    const showCreateDialog = ref(false)
    const newProjectName = ref('')
    const creating = ref(false)

    const showDeleteDialog = ref(false)
    const projectToDelete = ref(null)
    const deleting = ref(false)

    const sortOptions = computed(() => [
        { label: t('projects.sortNewest'), value: 'date-desc' },
        { label: t('projects.sortOldest'), value: 'date-asc' },
        { label: t('projects.sortNameAZ'), value: 'name-asc' },
        { label: t('projects.sortNameZA'), value: 'name-desc' },
    ])

    const viewModes = computed(() => [
        { label: t('assets.viewModes.grid'), value: 'grid', icon: 'pi pi-th-large' },
        { label: t('assets.viewModes.list'), value: 'list', icon: 'pi pi-list' },
    ])

    const filteredProjects = computed(() => {
        if (!projects.value) return []

        let filtered = [...projects.value]

        // Search filter
        if (searchQuery.value) {
            const query = searchQuery.value.toLowerCase()
            filtered = filtered.filter(
                (p) => p.name.toLowerCase().includes(query) || p.slug.toLowerCase().includes(query),
            )
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy.value) {
                case 'date-desc':
                    return new Date(b.createdAt) - new Date(a.createdAt)
                case 'date-asc':
                    return new Date(a.createdAt) - new Date(b.createdAt)
                case 'name-asc':
                    return a.name.localeCompare(b.name)
                case 'name-desc':
                    return b.name.localeCompare(a.name)
                default:
                    return 0
            }
        })

        return filtered
    })

    onMounted(async () => {
        loading.value = true
        await globalStore.getProjects()
        loading.value = false

        if (typeof trackEvent !== 'undefined') {
            trackEvent('page_view', { page: 'projects_hub' })
        }
    })

    const formatDate = (date) => {
        if (!date) return ''
        return new Date(date).toLocaleDateString()
    }

    const openProject = (slug) => {
        router.push(`/project/${slug}`)
    }

    const createProject = async () => {
        creating.value = true
        try {
            const data = await $fetch('/api/project', {
                method: 'POST',
            })

            // Update project name if custom name was provided
            if (newProjectName.value.trim()) {
                await $fetch(`/api/project/${data.slug}`, {
                    method: 'PATCH',
                    body: { name: newProjectName.value.trim() },
                })
            }

            showCreateDialog.value = false
            newProjectName.value = ''

            // Refresh projects list
            await globalStore.getProjects()

            // Navigate to new project
            router.push(`/project/${data.slug}`)
        } catch (error) {
            console.error('Failed to create project:', error)
            alert(t('errors.saveFailed') + ': ' + error.message)
        } finally {
            creating.value = false
        }
    }

    const confirmDelete = (project) => {
        projectToDelete.value = project
        showDeleteDialog.value = true
    }

    const deleteProject = async () => {
        if (!projectToDelete.value) return

        deleting.value = true
        try {
            await $fetch(`/api/project/${projectToDelete.value.slug}`, {
                method: 'DELETE',
            })

            showDeleteDialog.value = false
            projectToDelete.value = null

            // Refresh projects list
            await globalStore.getProjects()
        } catch (error) {
            console.error('Failed to delete project:', error)
        } finally {
            deleting.value = false
        }
    }
</script>
