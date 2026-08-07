<template>
  <div ref="host" class="relative h-full min-h-0 min-w-0 overflow-hidden" @pointerdown="selectObject">
    <slot />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, watch, ref } from 'vue';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const props = defineProps({
  scene: { type: Object, default: null },
  cameraPosition: { type: Array, default: () => [0, 0, 10] },
  clearColor: { type: String, default: '#000000' }
});
const emit = defineEmits(['ready', 'select']);
const host = ref(null);
let renderer;
let camera;
let controls;
let scene;
let resizeObserver;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function disposeObject(object) {
  object?.traverse?.(child => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach(material => {
      Object.values(material).forEach(value => value?.isTexture && value.dispose?.());
      material.dispose?.();
    });
  });
}

function render() {
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function fit() {
  if (!host.value || !renderer || !camera) return;
  const { width, height } = host.value.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  render();
}

function setScene(nextScene) {
  if (!scene) return;
  for (const child of [...scene.children]) {
    if (child.userData?.viewportOwned) continue;
    scene.remove(child);
    disposeObject(child);
  }
  if (nextScene) scene.add(nextScene);
  render();
}

function selectObject(event) {
  if (!renderer || !camera || !props.scene || !host.value) return;
  const bounds = host.value.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(props.scene, true).find(entry => entry.object.userData?.designerItem);
  if (hit) emit('select', hit.object.userData.designerItem, hit);
}

onMounted(() => {
  scene = new THREE.Scene();
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(props.clearColor);
  camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000);
  camera.position.fromArray(props.cameraPosition);
  const ambient = new THREE.HemisphereLight(0xffffff, 0x202020, 2);
  ambient.userData.viewportOwned = true;
  scene.add(ambient);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.addEventListener('change', render);
  host.value.append(renderer.domElement);
  resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(host.value);
  setScene(props.scene);
  fit();
  emit('ready', { renderer, scene, camera, controls, render, fit });
});

watch(() => props.scene, setScene);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  controls?.dispose();
  if (props.scene) disposeObject(props.scene);
  renderer?.dispose();
  renderer?.domElement?.remove();
});
</script>
