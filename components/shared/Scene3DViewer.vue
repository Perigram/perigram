<template>
  <div
    ref="host"
    class="relative h-80 w-full touch-none select-none overflow-hidden"
    data-scene-3d
    role="img"
    :aria-label="alt"
  >
    <canvas ref="canvas" class="block h-full w-full" />
    <p v-if="failure" class="absolute inset-0 grid place-items-center text-supporting">
      {{ $t('processDesigner.previewUnavailable') }}
    </p>
    <button
      v-if="hasGeometry && ready"
      type="button"
      class="absolute right-2 top-2 rounded-ui bg-subtle p-1 text-muted"
      :aria-label="$t('processDesigner.frameAll')"
      :title="$t('processDesigner.frameAll')"
      @click.stop="frameAll"
    >
      <i class="pi pi-expand" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup>
// The host's common interactive 3D viewer (contract: components/shared
// README). Scene buffers come from utils/scene3d.js; Z-up matches the
// geometry providers.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { scene3dGeometry } from '~/utils/scene3d.js';

const props = defineProps({
  value: { type: Object, default: () => ({}) },
  alt: { type: String, default: '' }
});

const host = ref(null);
const canvas = ref(null);
const ready = ref(false);
const failure = ref(false);
const geometry = computed(() => scene3dGeometry(props.value));
const hasGeometry = computed(() => geometry.value.vertexCount > 0);

let THREE = null;
let controls = null;
let renderer = null;
let scene = null;
let camera = null;
let mesh = null;
let edgeLines = null;
let highlight = null;
let resizeObserver = null;
let selectedTriangle = -1;
let pointerStart = null;
let meshMaterial = null;
let edgeMaterial = null;
let highlightMaterial = null;

function readColor(property, fallback) {
  const styles = host.value ? getComputedStyle(host.value) : null;
  return styles?.getPropertyValue(property)?.trim() || fallback;
}

function disposeObject(object) {
  if (!object) return;
  scene?.remove(object);
  object.geometry?.dispose?.();
}

function clearSceneObjects() {
  disposeObject(mesh);
  disposeObject(edgeLines);
  disposeObject(highlight);
  mesh = null;
  edgeLines = null;
  highlight = null;
}

function frameAll() {
  if (!THREE || !camera || !controls || !geometry.value.bounds) return;
  const { min, max, center } = geometry.value.bounds;
  const box = new THREE.Box3(
    new THREE.Vector3(min[0], min[1], min[2]),
    new THREE.Vector3(max[0], max[1], max[2])
  );
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.001);
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.25;
  const target = new THREE.Vector3(center[0], center[1], center[2]);
  controls.target.copy(target);
  camera.position.copy(target).add(new THREE.Vector3(1, -1, 0.8).normalize().multiplyScalar(distance));
  camera.near = Math.max(radius / 1000, 0.0001);
  camera.far = Math.max(radius * 100, 10);
  camera.updateProjectionMatrix();
  controls.update();
}

function rebuild() {
  if (!THREE || !scene) return;
  clearSceneObjects();
  selectedTriangle = -1;
  const data = geometry.value;
  if (!data.vertexCount) return;

  const positions = new THREE.Float32BufferAttribute(data.positions, 3);
  if (data.indices.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positions);
    if (data.normals.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setIndex(data.indices);
    if (!data.normals.length) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    mesh = new THREE.Mesh(geometry, meshMaterial);
    scene.add(mesh);
  }

  if (data.edgeCount) {
    const edgeGeometry = new THREE.BufferGeometry();
    const edgePositions = [];
    for (let index = 0; index < data.edges.length; index += 1) {
      const source = data.edges[index] * 3;
      edgePositions.push(data.positions[source], data.positions[source + 1], data.positions[source + 2]);
    }
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.renderOrder = 2;
    scene.add(edgeLines);
  }
  frameAll();
}

function showSelection(triangleIndex) {
  selectedTriangle = triangleIndex;
  disposeObject(highlight);
  highlight = null;
  if (!THREE || !scene || triangleIndex < 0 || triangleIndex >= geometry.value.triangleCount) return;
  const data = geometry.value;
  const offset = triangleIndex * 3;
  const points = [];
  for (let index = 0; index < 3; index += 1) {
    const source = data.indices[offset + index] * 3;
    points.push(data.positions[source], data.positions[source + 1], data.positions[source + 2]);
  }
  const selectionGeometry = new THREE.BufferGeometry();
  selectionGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  highlight = new THREE.Mesh(selectionGeometry, highlightMaterial);
  highlight.renderOrder = 3;
  scene.add(highlight);
  renderer?.render(scene, camera);
}

function handlePointerDown(event) {
  if (event.button !== 0) return;
  pointerStart = { x: event.clientX, y: event.clientY };
}

function handlePointerUp(event) {
  if (event.button !== 0 || !pointerStart || !mesh || !camera || !renderer) return;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved > 4) return;
  const rect = canvas.value.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(mesh, false)[0];
  showSelection(Number.isInteger(hit?.faceIndex) ? hit.faceIndex : -1);
}

function resize() {
  if (!renderer || !camera || !host.value) return;
  const width = Math.max(host.value.clientWidth, 1);
  const height = Math.max(host.value.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

onMounted(async () => {
  try {
    THREE = await import('three');
    const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    if (!host.value || !canvas.value) return;

    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.001, 1000);
    camera.up.set(0, 0, 1);

    const accent = readColor('--p-primary-color', '#6b7280');
    const ink = readColor('color', '#4b5563');
    meshMaterial = new THREE.MeshStandardMaterial({
      color: accent,
      metalness: 0.05,
      roughness: 0.65,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
    edgeMaterial = new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.55 });
    highlightMaterial = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(1, -1.2, 1.6);
    scene.add(keyLight);

    controls = new OrbitControls(camera, canvas.value);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.01;
    controls.maxDistance = 1e7;

    canvas.value.addEventListener('pointerdown', handlePointerDown);
    canvas.value.addEventListener('pointerup', handlePointerUp);
    canvas.value.addEventListener('dblclick', frameAll);
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host.value);
    resize();
    ready.value = true;
    rebuild();
    renderer.setAnimationLoop(() => {
      controls?.update();
      renderer?.render(scene, camera);
    });
  } catch {
    failure.value = true;
    ready.value = false;
  }
});

watch(() => props.value, rebuild);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  canvas.value?.removeEventListener('pointerdown', handlePointerDown);
  canvas.value?.removeEventListener('pointerup', handlePointerUp);
  canvas.value?.removeEventListener('dblclick', frameAll);
  renderer?.setAnimationLoop(null);
  clearSceneObjects();
  controls?.dispose();
  meshMaterial?.dispose();
  edgeMaterial?.dispose();
  highlightMaterial?.dispose();
  renderer?.dispose();
});
</script>
