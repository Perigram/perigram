<template>
  <div
    class="relative h-full w-full select-none rounded-ui border border-content-border bg-content p-2 [box-shadow:var(--ck-shadow-overlay)]"
  >
    <div class="flex h-6 items-center justify-between gap-2">
      <small class="truncate text-muted-color">{{ $t(titleKey) }}</small>
      <div class="flex items-center gap-1">
        <Button
          v-if="isolatedWorkpieceId"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="$t('cassette.v2.showWholeCassette')"
          v-tooltip.top="$t('cassette.v2.showWholeCassette')"
          @click="clearIsolation"
        />
        <Button
          icon="pi pi-refresh"
          severity="secondary"
          text
          rounded
          size="small"
          :aria-label="$t('cassette.v2.resetOrbit')"
          v-tooltip.top="$t('cassette.v2.resetOrbit')"
          @click="resetOrbit"
        />
      </div>
    </div>
    <div
      ref="viewportRef"
      class="h-[calc(100%-1.5rem)] w-full cursor-grab touch-none active:cursor-grabbing"
      :class="visibleFaces.length ? '' : 'hidden'"
      role="img"
      :aria-label="$t(titleKey)"
      @pointerdown="recordPointerDown"
      @click.stop="selectMesh"
    />
    <div v-if="!visibleFaces.length" class="flex h-[calc(100%-1.5rem)] w-full items-center justify-center text-muted-color">
      <i class="pi pi-image" aria-hidden="true" />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import Button from 'primevue/button';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildCassetteV2FoldedPreview } from '~/utils/cassetteV2FoldedPreview.js';

const props = defineProps({
  preview: {
    type: Object,
    default: null
  },
  selectedFaceId: {
    type: String,
    default: ''
  },
  titleKey: {
    type: String,
    default: 'cassette.v2.foldedPreview'
  },
  selectedWorkpieceId: {
    type: String,
    default: ''
  },
  isolatedWorkpieceId: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['workpiece-select', 'update:isolatedWorkpieceId']);

const viewportRef = ref(null);
const renderer = shallowRef(null);
const scene = shallowRef(null);
const camera = shallowRef(null);
const controls = shallowRef(null);
const faceGroup = shallowRef(null);
const resizeObserver = shallowRef(null);
const selectableMeshes = shallowRef([]);
const pointerStart = ref(null);
const folded = computed(() => buildCassetteV2FoldedPreview(props.preview || {}));
const visibleFaces = computed(() => {
  if (!props.isolatedWorkpieceId) return folded.value.faces || [];
  return (folded.value.faces || []).filter(face => face.workpieceId === props.isolatedWorkpieceId);
});
const visibleAttachments = computed(() => {
  const attachments = folded.value.attachments || [];
  if (!props.isolatedWorkpieceId) return attachments;
  return attachments.filter(attachment => (
    attachment.sourceWorkpieceId === props.isolatedWorkpieceId ||
    attachment.targetWorkpieceId === props.isolatedWorkpieceId
  ));
});

let animationFrame = 0;

const hueForWorkpiece = (workpieceId = '') => {
  let hash = 0;
  for (const char of String(workpieceId || 'workpiece')) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return (hash * 137 + 43) % 360;
};

const materialColor = (face) => {
  const hue = hueForWorkpiece(face.workpieceId || face.nodeId) / 360;
  const selected = face.workpieceId === props.selectedWorkpieceId || face.nodeId === props.selectedFaceId;
  return new THREE.Color().setHSL(hue, selected ? 0.68 : 0.56, selected ? 0.62 : 0.52);
};

const edgeColor = (face) => {
  const hue = hueForWorkpiece(face.workpieceId || face.nodeId) / 360;
  return new THREE.Color().setHSL(hue, 0.62, 0.24);
};

const attachmentColor = (attachment) => {
  if (attachment.status === 'impossible') return new THREE.Color(0xdc2626);
  if (attachment.status === 'unresolved') return new THREE.Color(0xf59e0b);
  return new THREE.Color(0x2563eb);
};

const toVector3 = (point = [0, 0, 0]) => new THREE.Vector3(
  Number(point[0]) || 0,
  Number(point[2]) || 0,
  -(Number(point[1]) || 0)
);

const disposeObject = (object) => {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach(material => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
};

const createFaceMesh = (face) => {
  const points = (face.points || []).map(toVector3);
  if (points.length < 3) return null;

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const indices = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    indices.push(0, index, index + 1);
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const selected = face.workpieceId === props.selectedWorkpieceId || face.nodeId === props.selectedFaceId;
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    color: materialColor(face),
    roughness: 0.62,
    metalness: 0.03,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  }));
  mesh.userData = {
    nodeId: face.nodeId,
    workpieceId: face.workpieceId
  };

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: selected ? 0x111827 : edgeColor(face),
      depthTest: true
    })
  );
  outline.raycast = () => {};

  const group = new THREE.Group();
  group.add(mesh);
  group.add(outline);
  return { group, mesh };
};

const createAttachmentLine = (attachment) => {
  if (!attachment.sourcePoint || !attachment.targetPoint) return null;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    toVector3(attachment.sourcePoint),
    toVector3(attachment.targetPoint)
  ]);
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: attachmentColor(attachment),
    depthTest: false
  }));
  line.raycast = () => {};
  return line;
};

const updateSize = () => {
  const viewport = viewportRef.value;
  if (!viewport || !renderer.value || !camera.value) return;
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.value.setSize(width, height, false);
  camera.value.aspect = width / height;
  camera.value.updateProjectionMatrix();
};

const fitCamera = () => {
  if (!camera.value || !controls.value || !faceGroup.value) return;
  const box = new THREE.Box3().setFromObject(faceGroup.value);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.value.fov) / 2)) * 1.35;
  camera.value.position.set(center.x + distance * 0.75, center.y + distance * 0.55, center.z + distance * 0.9);
  camera.value.near = Math.max(0.1, distance / 1000);
  camera.value.far = distance * 8 + maxDimension * 8;
  camera.value.updateProjectionMatrix();
  controls.value.target.copy(center);
  controls.value.update();
};

const updateScene = () => {
  if (!scene.value) return;
  if (faceGroup.value) {
    scene.value.remove(faceGroup.value);
    disposeObject(faceGroup.value);
  }

  const group = new THREE.Group();
  const meshes = [];
  for (const face of visibleFaces.value) {
    const entry = createFaceMesh(face);
    if (!entry) continue;
    group.add(entry.group);
    meshes.push(entry.mesh);
  }
  for (const attachment of visibleAttachments.value) {
    const line = createAttachmentLine(attachment);
    if (line) group.add(line);
  }
  scene.value.add(group);
  faceGroup.value = group;
  selectableMeshes.value = meshes;
  fitCamera();
};

const renderFrame = () => {
  animationFrame = window.requestAnimationFrame(renderFrame);
  controls.value?.update();
  if (renderer.value && scene.value && camera.value) {
    renderer.value.render(scene.value, camera.value);
  }
};

const setupRenderer = async () => {
  if (typeof window === 'undefined' || renderer.value) return;
  await nextTick();
  const viewport = viewportRef.value;
  if (!viewport) return;

  scene.value = new THREE.Scene();
  scene.value.add(new THREE.HemisphereLight(0xffffff, 0x6b7280, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(0.5, 1, 0.8);
  scene.value.add(keyLight);

  camera.value = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
  renderer.value = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.value.outputColorSpace = THREE.SRGBColorSpace;
  renderer.value.setClearAlpha(0);
  renderer.value.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.value.domElement.className = 'block h-full w-full';
  viewport.appendChild(renderer.value.domElement);

  controls.value = new OrbitControls(camera.value, renderer.value.domElement);
  controls.value.enableDamping = true;
  controls.value.dampingFactor = 0.12;
  controls.value.enablePan = false;

  resizeObserver.value = new ResizeObserver(() => {
    updateSize();
    fitCamera();
  });
  resizeObserver.value.observe(viewport);
  updateSize();
  updateScene();
  renderFrame();
};

const resetOrbit = () => {
  fitCamera();
};

const clearIsolation = () => {
  emit('update:isolatedWorkpieceId', '');
};

const recordPointerDown = (event) => {
  pointerStart.value = { x: event.clientX, y: event.clientY };
};

const selectMesh = (event) => {
  if (!renderer.value || !camera.value || !pointerStart.value) return;
  const distance = Math.hypot(event.clientX - pointerStart.value.x, event.clientY - pointerStart.value.y);
  if (distance > 4) return;

  const bounds = renderer.value.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
    -(((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2 - 1)
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera.value);
  const hits = raycaster.intersectObjects(selectableMeshes.value, false);
  const face = hits[0]?.object?.userData;
  if (!face?.workpieceId) return;
  emit('workpiece-select', face.workpieceId);
  emit('update:isolatedWorkpieceId', face.workpieceId);
};

onMounted(setupRenderer);

watch(
  () => [visibleFaces.value, visibleAttachments.value, props.selectedFaceId, props.selectedWorkpieceId],
  () => {
    if (!renderer.value) {
      setupRenderer();
      return;
    }
    nextTick(updateScene);
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame);
  resizeObserver.value?.disconnect?.();
  controls.value?.dispose?.();
  if (faceGroup.value) disposeObject(faceGroup.value);
  renderer.value?.dispose?.();
  renderer.value?.domElement?.remove?.();
});
</script>
