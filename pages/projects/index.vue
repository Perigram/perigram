<template>
    <StandardPage :title="$t('nav.projects')">
        <template #actions>
            <Button :label="$t('project.create')" icon="pi pi-plus" @click="showCreateDialog = true" />
        </template>

        <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />

        <StateBlock v-else-if="!projects || projects.length === 0" :message="$t('projects.noProjects')" icon="pi pi-inbox">
            <template #actions>
                <Button
                    :label="$t('projects.createFirst')"
                    icon="pi pi-plus"
                    @click="showCreateDialog = true"
                />
            </template>
        </StateBlock>

        <div v-else class="flex flex-col gap-6">
            <section class="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                    <small class="text-muted-color">{{ $t('nav.projects') }}</small>
                    <div class="mt-1 text-2xl font-semibold">{{ projectStats.total }}</div>
                </div>
                <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                    <small class="text-muted-color">{{ $t('project.queues') }}</small>
                    <div class="mt-1 text-2xl font-semibold">{{ projectStats.queues }}</div>
                </div>
                <div class="rounded-ui border border-content-border bg-content px-4 py-3">
                    <small class="text-muted-color">{{ $t('project.totalArea') }}</small>
                    <div class="mt-1 text-2xl font-semibold">{{ projectStats.totalArea }} m²</div>
                </div>
            </section>

            <div class="rounded-panel border border-content-border bg-subtle p-3">
                <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <InputText
                        v-model="searchQuery"
                        :placeholder="$t('common.search')"
                        class="w-full"
                    />
                    <Select
                        v-model="sortBy"
                        :options="sortOptions"
                        optionLabel="label"
                        optionValue="value"
                        class="w-full"
                    />
                </div>
            </div>

            <StateBlock v-if="filteredProjects.length === 0" :message="$t('common.noResults')" icon="pi pi-search" />

            <div v-else class="grid grid-cols-1 gap-4">
                <ProjectIndexCard
                    v-for="project in filteredProjects"
                    :key="project._id"
                    :project="project"
                    :renaming="renamingProjectId === project._id"
                    @view="navigateToProject"
                    @rename="renameProject"
                    @delete="confirmDeleteProject"
                />
            </div>
        </div>

        <!-- Create/Edit Project Dialog -->
        <StandardDialog
            v-model:visible="showCreateDialog"
            :header="$t('project.create')"
            size="sm"
        >
            <div class="py-4">
                <div class="flex flex-col gap-2">
                    <label for="projectName" class="font-medium">{{ $t('project.name') }}</label>
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
                    @click="closeDialog"
                />
                <Button
                    :label="$t('common.create')"
                    :loading="creating"
                    @click="createProject"
                />
            </template>
        </StandardDialog>
        <ConfirmDialog />
    </StandardPage>
</template>

<script setup>
    import { ref, computed, onMounted } from 'vue'
    import Button from 'primevue/button'
    import InputText from 'primevue/inputtext'
    import Select from '~/components/shared/EntitySelect.vue'
    import ConfirmDialog from 'primevue/confirmdialog'
    import ProjectIndexCard from '~/components/entities/Project/ProjectIndexCard.vue'
    import StandardDialog from '~/components/shared/StandardDialog.vue'
    import StandardPage from '~/components/shared/StandardPage.vue'
    import StateBlock from '~/components/shared/StateBlock.vue'
    import { useGlobalStore } from '~/stores/global'
    import { storeToRefs } from 'pinia'
    import { useToast } from 'primevue/usetoast'
    import { useConfirm } from 'primevue/useconfirm'
    import { useEntity } from '~/composables/useEntity'

    definePageMeta({
        layout: 'app',
        middleware: 'auth',
    })

    const { t } = useI18n()
    const router = useRouter()
    const globalStore = useGlobalStore()
    const toast = useToast()
    const confirm = useConfirm()
    const { projectsList } = storeToRefs(globalStore)
    
    const projects = computed(() => projectsList.value.map(normalizeProjectListItem))
    const loading = ref(true)
    const searchQuery = ref('')
    const sortBy = ref('date-desc')

    const showCreateDialog = ref(false)
    const newProjectName = ref('')
    const creating = ref(false)
    const renamingProjectId = ref(null)

    const sortOptions = computed(() => [
        { label: t('projects.sortNewest'), value: 'date-desc' },
        { label: t('projects.sortOldest'), value: 'date-asc' },
        { label: t('projects.sortNameAZ'), value: 'name-asc' },
        { label: t('projects.sortNameZA'), value: 'name-desc' },
    ])

    const projectStats = computed(() => {
        const rows = projects.value || []
        return {
            total: rows.length,
            queues: rows.reduce((sum, project) => sum + Number(project.summary?.queueCount || 0), 0),
            totalArea: formatNumber(rows.reduce((sum, project) => sum + Number(project.summary?.totalArea || 0), 0)),
        }
    })

    const filteredProjects = computed(() => {
        if (!projects.value) return []

        let filtered = [...projects.value]

        // Search filter
        if (searchQuery.value) {
            const query = searchQuery.value.toLowerCase()
            filtered = filtered.filter(
                (p) => p.identity?.name?.toLowerCase().includes(query) || p.identity?.slug?.toLowerCase().includes(query),
            )
        }

        // Sort
        filtered.sort((a, b) => {
            const nameA = a.identity?.name || ''
            const nameB = b.identity?.name || ''
            switch (sortBy.value) {
                case 'date-desc':
                    return new Date(b.createdAt) - new Date(a.createdAt)
                case 'date-asc':
                    return new Date(a.createdAt) - new Date(b.createdAt)
                case 'name-asc':
                    return nameA.localeCompare(nameB)
                case 'name-desc':
                    return nameB.localeCompare(nameA)
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
    })

    const navigateToProject = (project) => {
        const slug = project.identity?.slug || project.identity?.uid || project._id
        router.push(`/project/${slug}`)
    }

    const closeDialog = () => {
        showCreateDialog.value = false
        newProjectName.value = ''
    }

    const renameProject = async (project, name, close) => {
        if (!name.trim()) return
        renamingProjectId.value = project._id
        try {
            const slug = project.identity?.slug
            const { update } = useEntity('project', slug)
            await update({ name: name.trim() })
            await globalStore.getProjects()
            close?.()
            toast.add({ severity: 'success', summary: t('common.success'), detail: t('project.updated'), life: 3000 })
        } catch (error) {
            console.error('Failed to update project:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
        } finally {
            renamingProjectId.value = null
        }
    }

    const createProject = async () => {
        creating.value = true
        try {
            const { create } = useEntity('project')
            const newProject = await create({ name: newProjectName.value.trim() || undefined })

            showCreateDialog.value = false
            newProjectName.value = ''

            await globalStore.getProjects()
            const slug = newProject.identity?.slug || newProject.identity?.uid
            router.push(`/project/${slug}`)
        } catch (error) {
            console.error('Failed to create project:', error)
            toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
        } finally {
            creating.value = false
        }
    }

    const confirmDeleteProject = async (project) => {
        confirm.require({
            message: t('project.confirmDelete'),
            header: t('common.confirmation'),
            icon: 'pi pi-exclamation-triangle',
            accept: async () => {
                try {
                    const slug = project.identity?.slug
                    const { remove } = useEntity('project', slug)
                    await remove()
                    await globalStore.getProjects()
                    toast.add({ severity: 'success', summary: t('common.success'), detail: t('project.deleted'), life: 3000 })
                } catch (error) {
                    console.error('Failed to delete project:', error)
                    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message, life: 3000 })
                }
            }
        })
    }

    function normalizeProjectListItem(project = {}) {
        const id = project._id || project.id || project.identity?.uid || project.slug || project.identity?.slug || ''
        return {
            ...project,
            _id: project._id || id,
            identity: {
                ...(project.identity || {}),
                uid: project.identity?.uid || id,
                name: project.identity?.name || project.name || project.title || project.identity?.slug || project.slug || id,
                slug: project.identity?.slug || project.slug || project.identity?.uid || id,
            },
            status: normalizeStatusBlock(project.status || project.state || project.currentStatus || 'UNKNOWN'),
            data: project.data || {},
            summary: project.summary || {},
        }
    }

    function normalizeStatusBlock(status) {
        if (status?.state) return status;
        if (status?.current) return { ...status, state: status.current };
        return { state: status || 'UNKNOWN' };
    }

    function formatNumber(value) {
        const number = Number(value || 0)
        return Number.isInteger(number) ? number : Number(number.toFixed(2))
    }
</script>
