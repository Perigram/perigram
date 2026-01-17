<template>
    <div class="p-4 md:p-6 lg:p-8 flex flex-col gap-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 class="text-2xl font-bold text-[var(--p-text-color)]">{{ $t('nav.projects') }}</h1>
            <div class="flex gap-2">
                <Button
                    :label="$t('project.create')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </div>
        </div>

        <div class="flex flex-wrap items-center gap-3 bg-[var(--p-content-background)] p-3 rounded-lg border border-[var(--p-content-border-color)]">
            <IconField class="flex-1 min-w-[200px]">
                <InputIcon class="pi pi-search" />
                <InputText
                    v-model="searchQuery"
                    :placeholder="$t('common.search')"
                    class="w-full"
                />
            </IconField>

            <Select
                v-model="sortBy"
                :options="sortOptions"
                optionLabel="label"
                optionValue="value"
                :placeholder="$t('projects.sortBy')"
                class="min-w-[180px]"
            />

            <SelectButton
                v-model="viewMode"
                :options="viewModes"
                optionLabel="label"
                optionValue="value"
                class="hidden md:inline-flex"
            >
                <template #option="slotProps">
                    <i :class="slotProps.option.icon"></i>
                </template>
            </SelectButton>
        </div>

        <div
            v-if="loading"
            class="flex items-center justify-center py-20"
        >
            <ProgressSpinner />
        </div>

        <div
            v-else-if="!projects || projects.length === 0"
            class="text-center py-20 px-6 border-2 border-dashed border-[var(--p-content-border-color)] rounded-xl bg-[var(--p-content-background)]"
        >
            <i class="pi pi-inbox text-6xl text-[var(--p-text-muted-color)] mb-4 opacity-50"></i>
            <p class="text-xl font-medium text-[var(--p-text-color)] mb-6">{{ $t('projects.noProjects') }}</p>
            <Button
                :label="$t('projects.createFirst')"
                icon="pi pi-plus"
                @click="showCreateDialog = true"
                size="large"
            />
        </div>

        <DataView
            v-else
            :value="filteredProjects"
            :layout="viewMode"
            :paginator="filteredProjects.length > 12"
            :rows="12"
            dataKey="id"
            :loading="loading"
        >
            <template #grid="slotProps">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2">
                    <Card
                        v-for="project in slotProps.items"
                        :key="project.slug"
                        class="overflow-hidden hover:shadow-xl transition-all duration-300 border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)]"
                    >
                        <template #title>
                            <NuxtLink :to="`/project/${project.slug}`" class="no-underline text-[var(--p-text-color)] hover:text-[var(--p-primary-color)] transition-colors line-clamp-1 block pt-2">
                                {{ project.name }}
                            </NuxtLink>
                        </template>
                        <template #subtitle>
                            <div class="flex flex-col gap-2 mt-2">
                                <span class="flex items-center gap-2 text-sm text-[var(--p-text-muted-color)]">
                                    <i class="pi pi-calendar text-xs"></i>
                                    {{ formatDate(project.createdAt) }}
                                </span>
                                <Tag
                                    v-if="project.results"
                                    severity="info"
                                    class="w-fit"
                                >
                                    {{ project.results }} {{ $t('projects.results') }}
                                </Tag>
                            </div>
                        </template>
                        <template #footer>
                            <div class="flex justify-end gap-2 border-t border-[var(--p-content-border-color)] pt-4 mt-auto">
                                <Button
                                    icon="pi pi-folder-open"
                                    text
                                    rounded
                                    @click="openProject(project.slug)"
                                    v-tooltip.top="$t('common.open')"
                                />
                                <Button
                                    icon="pi pi-trash"
                                    text
                                    rounded
                                    severity="danger"
                                    @click="confirmDelete(project)"
                                    v-tooltip.top="$t('actions.delete')"
                                />
                            </div>
                        </template>
                    </Card>
                </div>
            </template>

            <template #list="slotProps">
                <div class="flex flex-col gap-4 pt-2">
                    <div
                        v-for="project in slotProps.items"
                        :key="project.slug"
                        class="flex items-center gap-4 p-4 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-xl hover:border-[var(--p-primary-color)] hover:shadow-md transition-all group"
                    >
                        <div class="w-12 h-12 flex items-center justify-center bg-[var(--p-primary-color)] text-white rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
                            <i class="pi pi-folder text-xl"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <NuxtLink
                                :to="`/project/${project.slug}`"
                                class="text-lg font-semibold text-[var(--p-text-color)] hover:text-[var(--p-primary-color)] no-underline truncate block mb-1"
                            >
                                {{ project.name }}
                            </NuxtLink>
                            <div class="flex flex-wrap gap-x-6 gap-y-1">
                                <span class="flex items-center gap-2 text-sm text-[var(--p-text-muted-color)]">
                                    <i class="pi pi-calendar text-xs"></i>
                                    {{ formatDate(project.createdAt) }}
                                </span>
                                <span
                                    v-if="project.results"
                                    class="flex items-center gap-2 text-sm text-[var(--p-text-muted-color)]"
                                >
                                    <i class="pi pi-check-circle text-xs"></i>
                                    {{ project.results }} {{ $t('projects.results') }}
                                </span>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <Button
                                :label="$t('common.open')"
                                icon="pi pi-arrow-right"
                                text
                                @click="openProject(project.slug)"
                                class="hidden sm:inline-flex"
                            />
                            <Button
                                icon="pi pi-arrow-right"
                                text
                                @click="openProject(project.slug)"
                                class="sm:hidden"
                            />
                            <Button
                                icon="pi pi-trash"
                                text
                                rounded
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
            :style="{ width: '95vw', maxWidth: '500px' }"
        >
            <div class="py-4">
                <div class="flex flex-col gap-2">
                    <label for="projectName" class="font-medium text-[var(--p-text-color)]">{{ $t('project.name') }}</label>
                    <InputText
                        id="projectName"
                        v-model="newProjectName"
                        :placeholder="$t('projects.enterName')"
                        class="w-full"
                        autofocus
                    />
                </div>
            </div>
            <template #footer>
                <Button
                    :label="$t('common.cancel')"
                    text
                    severity="secondary"
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
            :style="{ width: '95vw', maxWidth: '400px' }"
        >
            <div class="flex items-center gap-4 py-4">
                <i
                    class="pi pi-exclamation-triangle text-4xl text-red-500"
                ></i>
                <p class="text-[var(--p-text-color)]">{{ $t('projects.deleteWarning', { name: projectToDelete?.name }) }}</p>
            </div>
            <template #footer>
                <Button
                    :label="$t('common.cancel')"
                    text
                    severity="secondary"
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
    import Select from 'primevue/select'
    import SelectButton from 'primevue/selectbutton'
    import Dialog from 'primevue/dialog'
    import ProgressSpinner from 'primevue/progressspinner'
    import IconField from 'primevue/iconfield'
    import InputIcon from 'primevue/inputicon'
    import Tag from 'primevue/tag'
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

<style scoped lang="scss">
</style>
