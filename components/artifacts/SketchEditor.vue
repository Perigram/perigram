<template>
    <div class="flex min-h-0 flex-1 flex-col gap-3">
        <ActionToolbar :title="editorTitle" :level="2">
            <template #actions>
                <SelectButton
                    :model-value="tool"
                    :options="toolOptions"
                    option-value="value"
                    option-label="label"
                    size="small"
                    :allow-empty="false"
                    :aria-label="$t('sketch.tool')"
                    @update:model-value="value => tool = value"
                />
                <ColorPicker v-model="color" :aria-label="$t('sketch.color')" />
                <Select
                    v-model="size"
                    :options="sizeOptions"
                    option-label="label"
                    option-value="value"
                    size="small"
                    class="w-24"
                    :aria-label="$t('sketch.strokeWidth')"
                />
                <Button icon="pi pi-undo" severity="secondary" text rounded size="small" :aria-label="$t('sketch.undo')" :disabled="!canUndo" @click="undo" />
                <Button icon="pi pi-refresh" severity="secondary" text rounded size="small" :aria-label="$t('sketch.redo')" :disabled="!canRedo" @click="redo" />
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" :aria-label="$t('sketch.clear')" :disabled="!scene.strokes.length && !scene.background" @click="clearScene" />
                <Button :label="$t('common.save')" icon="pi pi-check" size="small" :loading="saving" :disabled="!dirty" @click="save" />
            </template>
        </ActionToolbar>

        <div class="flex flex-wrap items-center gap-2">
            <input ref="backgroundInput" class="hidden" type="file" accept="image/*" @change="selectBackground">
            <Button
                :label="scene.background ? $t('sketch.replaceBackground') : $t('sketch.setBackground')"
                icon="pi pi-image"
                size="small"
                severity="secondary"
                outlined
                @click="backgroundInput?.click()"
            />
            <Button
                v-if="scene.background"
                :label="$t('sketch.removeBackground')"
                icon="pi pi-times"
                size="small"
                severity="secondary"
                text
                @click="removeBackground"
            />
            <template v-if="persistence.origin">
                <span class="text-muted text-supporting">{{ $t('sketch.originEntity') }}:</span>
                <span class="text-muted text-supporting">{{ $t('sketch.originEntity') }}:</span>
                <EntityInlineRef :type="originEntity.typeId" :id="originEntity.entityId" :fetch="false" />
                <Button icon="pi pi-times" severity="secondary" text rounded size="small" :aria-label="$t('sketch.clearOrigin')" @click="clearOrigin" />
            </template>
            <template v-else>
                <Select
                    v-model="originDraft.typeId"
                    :options="typeIdOptions"
                    option-label="label"
                    option-value="value"
                    size="small"
                    class="w-44"
                    :placeholder="$t('sketch.originType')"
                    :aria-label="$t('sketch.originType')"
                />
                <InputText
                    v-model="originDraft.entityId"
                    size="small"
                    class="w-44"
                    :placeholder="$t('sketch.originId')"
                    :aria-label="$t('sketch.originId')"
                />
                <Button
                    :label="$t('sketch.setOrigin')"
                    icon="pi pi-link"
                    size="small"
                    severity="secondary"
                    outlined
                    :disabled="!originDraft.typeId || !originDraft.entityId.trim()"
                    @click="setOrigin"
                />
            </template>
        </div>

        <div
            ref="canvasHost"
            class="relative flex min-h-0 flex-1 items-stretch overflow-hidden rounded-ui"
            :class="cursorClass"
        >
            <svg
                ref="svgEl"
                class="h-full w-full touch-none select-none"
                :viewBox="`0 0 ${SKETCH_VIEWBOX.width} ${SKETCH_VIEWBOX.height}`"
                preserveAspectRatio="xMidYMid meet"
                @pointerdown="pointerDown"
                @pointermove="pointerMove"
                @pointerup="pointerUp"
                @pointercancel="pointerUp"
            >
                <image
                    v-if="scene.background"
                    :href="scene.background.url"
                    x="0"
                    y="0"
                    :width="SKETCH_VIEWBOX.width"
                    :height="SKETCH_VIEWBOX.height"
                    preserveAspectRatio="xMidYMid slice"
                />
                <path
                    v-for="stroke in scene.strokes"
                    :key="stroke.id"
                    :d="strokeToSvgPath(stroke)"
                    :stroke="stroke.tool === 'pen' ? 'none' : stroke.color"
                    :fill="stroke.tool === 'pen' ? stroke.color : 'none'"
                    :stroke-width="stroke.size"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    v-if="liveStroke"
                    :d="strokeToSvgPath(liveStroke)"
                    :stroke="liveStroke.tool === 'pen' ? 'none' : liveStroke.color"
                    :fill="liveStroke.tool === 'pen' ? liveStroke.color : 'none'"
                    :stroke-width="liveStroke.size"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
            <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" class="absolute inset-0" />
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import Button from 'primevue/button';
import ColorPicker from 'primevue/colorpicker';
import InputText from 'primevue/inputtext';
import Select from '~/components/shared/EntitySelect.vue';
import SelectButton from 'primevue/selectbutton';
import { useI18n } from 'vue-i18n';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { artifactSurfaces } from '~/utils/artifact-ui.js';
import { SKETCH_TOOLS, SKETCH_VIEWBOX, parseScene, strokeToSvgPath, strokesAtPoint } from '~/utils/sketch.js';

const props = defineProps({
  // Persistence contract, host-supplied: `title`, `loadScene()` returning
  // raw scene JSON text, `saveScene(sceneText, filename, { origin })`, and
  // an optional `origin` ref capability (`{ value }`). One editor serves
  // artifact-backed and instance-backed hosts.
  persistence: { type: Object, required: true }
});
const emit = defineEmits(['saved']);
const { t } = useI18n();

const loading = ref(true);
const saving = ref(false);
const dirty = ref(false);
const scene = reactive(parseScene(null));
const tool = ref('pen');
const color = ref('#c9144a');
const size = ref(4);
const liveStroke = ref(null);
const svgEl = ref(null);
const backgroundInput = ref(null);
const originEntity = ref(props.persistence.origin?.value || null);
const originDraft = ref({ typeId: '', entityId: '' });
const editorTitle = computed(() => props.persistence.title || t('sketch.editorTitle'));
const undoStack = [];
const redoStack = [];

const toolOptions = computed(() => SKETCH_TOOLS.map(value => ({ value, label: t(`sketch.tools.${value}`) })));
const sizeOptions = computed(() => [
    { label: t('sketch.sizes.thin'), value: 2 },
    { label: t('sketch.sizes.medium'), value: 4 },
    { label: t('sketch.sizes.thick'), value: 8 }
]);
const typeIdOptions = computed(() => artifactSurfaces
    .map(surface => ({ label: t(`entities.${surface.key}`), value: surface.key }))
    .filter(option => option.label !== `entities.${option.value}`));

const canUndo = computed(() => undoStack.length > 0);
const canRedo = computed(() => redoStack.length > 0);
const cursorClass = computed(() => (tool.value === 'eraser' ? 'cursor-crosshair' : 'cursor-crosshair'));

const snapshot = () => JSON.stringify({ background: scene.background, strokes: scene.strokes });
const pushHistory = () => {
    undoStack.push(snapshot());
    if (undoStack.length > 50) undoStack.shift();
    redoStack.length = 0;
    dirty.value = true;
};
const applySnapshot = (entry) => {
    const restored = JSON.parse(entry);
    scene.background = restored.background;
    scene.strokes = restored.strokes;
    dirty.value = true;
};

const toViewBoxPoint = (event) => {
    const rect = svgEl.value?.getBoundingClientRect();
    if (!rect) return [0, 0];
    const scale = Math.min(rect.width / SKETCH_VIEWBOX.width, rect.height / SKETCH_VIEWBOX.height);
    const offsetX = (rect.width - SKETCH_VIEWBOX.width * scale) / 2;
    const offsetY = (rect.height - SKETCH_VIEWBOX.height * scale) / 2;
    return [
        (event.clientX - rect.left - offsetX) / scale,
        (event.clientY - rect.top - offsetY) / scale
    ];
};

const pointerDown = (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    event.target.setPointerCapture?.(event.pointerId);
    const point = toViewBoxPoint(event);
    if (tool.value === 'eraser') {
        const erased = new Set(strokesAtPoint(scene, point));
        if (!erased.size) return;
        pushHistory();
        scene.strokes = scene.strokes.filter(stroke => !erased.has(stroke.id));
        return;
    }
    liveStroke.value = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tool: tool.value,
        points: [point],
        color: color.value,
        size: size.value
    };
};

const pointerMove = (event) => {
    if (!liveStroke.value) {
        if (tool.value !== 'eraser' || event.buttons !== 1) return;
        const point = toViewBoxPoint(event);
        const erased = new Set(strokesAtPoint(scene, point));
        if (!erased.size) return;
        pushHistory();
        scene.strokes = scene.strokes.filter(stroke => !erased.has(stroke.id));
        return;
    }
    const point = toViewBoxPoint(event);
    const points = liveStroke.value.points;
    if (liveStroke.value.tool === 'pen') {
        points.push(point);
    } else {
        points[1] = point;
    }
    liveStroke.value = { ...liveStroke.value, points: [...points] };
};

const pointerUp = () => {
    if (!liveStroke.value) return;
    const stroke = liveStroke.value;
    liveStroke.value = null;
    if (stroke.points.length < 2 && stroke.tool !== 'pen') return;
    pushHistory();
    scene.strokes.push(stroke);
};

const selectBackground = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
        const stored = await $fetch('/api/files/upload?bucket=sketches', { method: 'POST', body: form });
        pushHistory();
        scene.background = { fileId: stored.id, url: stored.url };
    } catch (error) {
        console.error('Failed to upload sketch background:', error);
    }
};

const removeBackground = () => {
    pushHistory();
    scene.background = null;
};

const clearScene = () => {
    if (!scene.strokes.length && !scene.background) return;
    pushHistory();
    scene.strokes = [];
    scene.background = null;
};

const setOrigin = () => {
    const typeId = originDraft.value.typeId;
    const entityId = originDraft.value.entityId.trim();
    if (!typeId || !entityId) return;
    originEntity.value = { typeId, entityId };
    originDraft.value = { typeId: '', entityId: '' };
    dirty.value = true;
};

const clearOrigin = () => {
    originEntity.value = null;
    dirty.value = true;
};

const undo = () => {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    applySnapshot(undoStack.pop());
};

const redo = () => {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    applySnapshot(redoStack.pop());
};

const save = async () => {
    saving.value = true;
    try {
        const filename = `${props.persistence.title || 'sketch'}.json`;
        const saved = await props.persistence.saveScene(JSON.stringify({ ...scene }), filename, {
            origin: originEntity.value
        });
        dirty.value = false;
        emit('saved', saved);
    } catch (error) {
        console.error('Failed to save sketch:', error);
    } finally {
        saving.value = false;
    }
};

onMounted(async () => {
    try {
        const restored = parseScene(await props.persistence.loadScene());
        scene.background = restored.background;
        scene.strokes = restored.strokes;
    } catch (error) {
        console.error('Failed to load sketch:', error);
    } finally {
        loading.value = false;
    }
});

onBeforeUnmount(() => {
    if (dirty.value) console.warn('Sketch editor closed with unsaved changes');
});
</script>
