// The cassette folded 3D preview as a plugin surface component: a
// three.js viewport over the renderer's folded-preview payload. The
// three.js runtime is vendored beside the plugin (relative imports
// against the executor's static tree) — the plugin owns its rendering
// choice, the host never learns about it.
import * as THREE from '../../../assets/vendor/three/three.module.js';
import { OrbitControls } from '../../../assets/vendor/three/OrbitControls.js';
import { buildCassetteV2FoldedPreview } from '../cassetteV2FoldedPreview.js';

export default function createFoldedPreview({ vue, components, locale }) {
  const { h, ref, computed, shallowRef, watch, onMounted, onBeforeUnmount, nextTick, defineComponent } = vue;
  const t = locale.t;

  return defineComponent({
    name: 'CassetteFoldedPreview',
    props: {
      preview: { type: Object, default: null },
      selectedFaceId: { type: String, default: '' },
      titleKey: { type: String, default: 'cassette.v2.foldedPreview' },
      selectedWorkpieceId: { type: String, default: '' },
      isolatedWorkpieceId: { type: String, default: '' },
      expandable: { type: Boolean, default: false }
    },
    emits: ['workpiece-select', 'update:isolatedWorkpieceId', 'expand'],
    setup(props, { emit }) {
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
      const visibleBodies = computed(() => {
        const bodies = folded.value.bodies || [];
        if (!props.isolatedWorkpieceId) return bodies;
        return bodies.filter(body => body.workpieceId === props.isolatedWorkpieceId);
      });
      const visibleCutouts = computed(() => {
        const cutouts = folded.value.cutouts || [];
        if (!props.isolatedWorkpieceId) return cutouts;
        return cutouts.filter(cutout => cutout.workpieceId === props.isolatedWorkpieceId);
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

      const cutoutColor = (cutout) => (
        cutout.layer === 'cut.hole' ? new THREE.Color(0x0f766e) : new THREE.Color(0xdc2626)
      );

      const bodyColor = (body) => {
        const hue = hueForWorkpiece(body.workpieceId || body.id) / 360;
        const selected = body.workpieceId === props.selectedWorkpieceId;
        return new THREE.Color().setHSL(hue, selected ? 0.72 : 0.58, selected ? 0.46 : 0.36);
      };

      const toVector3 = (point = [0, 0, 0]) => new THREE.Vector3(
        Number(point[0]) || 0,
        Number(point[2]) || 0,
        -(Number(point[1]) || 0)
      );

      const toDirection3 = (point = [0, 0, 1]) => toVector3(point).normalize();

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
        const points3d = face.points || [];
        const points = points3d.map(toVector3);
        if (points.length < 3) return null;

        const holePoints3d = face.holes || [];
        const flatPoints = [...points, ...holePoints3d.flat().map(toVector3)];
        const geometry = new THREE.BufferGeometry().setFromPoints(flatPoints);
        const sourceVertices = face.sourceVertices || points3d.map(point => [point[0], point[1]]);
        const sourceHoles = face.sourceHoles || [];
        const triangles = THREE.ShapeUtils.triangulateShape(
          sourceVertices.map(point => new THREE.Vector2(Number(point?.[0]) || 0, Number(point?.[1]) || 0)),
          sourceHoles.map(hole => hole.map(point => new THREE.Vector2(Number(point?.[0]) || 0, Number(point?.[1]) || 0)))
        );
        const indices = triangles.length ? triangles.flat() : [];
        if (!indices.length) {
          for (let index = 1; index < points.length - 1; index += 1) {
            indices.push(0, index, index + 1);
          }
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

        const outline = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
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

      const createCutoutLine = (cutout) => {
        if (cutout.layer === 'cut.inner') return null;
        const points = (cutout.points || []).map(toVector3);
        if (points.length < 2) return null;
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
          color: cutoutColor(cutout),
          depthTest: false
        }));
        line.raycast = () => {};
        return line;
      };

      const bodyParameter = (body, key, fallback) => {
        const value = Number(body?.parameters?.[key]);
        return Number.isFinite(value) ? value : fallback;
      };

      const createBodyMesh = (body) => {
        const diameter = bodyParameter(body, 'diameter', bodyParameter(body, 'outerDiameter', 8));
        const length = bodyParameter(body, 'length', bodyParameter(body, 'thickness', 8));
        const width = bodyParameter(body, 'width', bodyParameter(body, 'widthAcrossFlats', diameter * 1.6));
        const height = bodyParameter(body, 'height', length);
        const thickness = bodyParameter(body, 'thickness', Math.max(1.5, diameter * 0.25));
        const family = body.family || 'bolt';
        let geometry;

        if (family === 'nut') {
          geometry = new THREE.CylinderGeometry(width / 2, width / 2, thickness, 6);
        } else if (family === 'washer') {
          geometry = new THREE.TorusGeometry(bodyParameter(body, 'outerDiameter', 14) / 2, Math.max(0.5, thickness / 2), 8, 28);
        } else if (family === 'hanger_clip') {
          geometry = new THREE.BoxGeometry(width, Math.max(2, thickness), height);
        } else {
          geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, Math.max(2, length), 20);
        }

        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
          color: bodyColor(body),
          roughness: 0.54,
          metalness: family === 'hanger_clip' ? 0.18 : 0.42
        }));
        mesh.position.copy(toVector3(body.center));
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toDirection3(body.normal || [0, 0, 1]));
        mesh.userData = {
          workpieceId: body.workpieceId,
          bodyId: body.id
        };
        return mesh;
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
        for (const cutout of visibleCutouts.value) {
          const line = createCutoutLine(cutout);
          if (line) group.add(line);
        }
        for (const body of visibleBodies.value) {
          const mesh = createBodyMesh(body);
          if (!mesh) continue;
          group.add(mesh);
          meshes.push(mesh);
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
        () => [visibleFaces.value, visibleAttachments.value, visibleBodies.value, visibleCutouts.value, props.selectedFaceId, props.selectedWorkpieceId],
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

      // The preview data lands after mount (the designer's debounced
      // assembly render), so content visibility must stay reactive.
      const hasContent = computed(() => Boolean(visibleFaces.value.length || visibleBodies.value.length));
      return () => h('div', { class: 'relative h-full w-full select-none rounded-ui border border-content-border p-2 shadow-overlay' }, [
        h('div', { class: 'flex h-6 items-center justify-between gap-2' }, [
          h('small', { class: 'truncate text-muted' }, t(props.titleKey)),
          h('div', { class: 'flex items-center gap-1' }, [
            props.expandable
              ? h(components.Button, {
                  icon: 'pi pi-window-maximize',
                  severity: 'secondary',
                  text: true,
                  rounded: true,
                  size: 'small',
                  'aria-label': t('common.expand'),
                  title: t('common.expand'),
                  onClick: () => emit('expand')
                })
              : null,
            props.isolatedWorkpieceId
              ? h(components.Button, {
                  icon: 'pi pi-arrow-left',
                  severity: 'secondary',
                  text: true,
                  rounded: true,
                  size: 'small',
                  'aria-label': t('cassette.v2.showWholeCassette'),
                  title: t('cassette.v2.showWholeCassette'),
                  onClick: clearIsolation
                })
              : null,
            h(components.Button, {
              icon: 'pi pi-refresh',
              severity: 'secondary',
              text: true,
              rounded: true,
              size: 'small',
              'aria-label': t('cassette.v2.resetOrbit'),
              title: t('cassette.v2.resetOrbit'),
              onClick: resetOrbit
            })
          ])
        ]),
        h('div', {
          ref: viewportRef,
          class: ['h-[calc(100%-1.5rem)] w-full cursor-grab touch-none active:cursor-grabbing', hasContent.value ? '' : 'hidden'],
          role: 'img',
          'aria-label': t(props.titleKey),
          onPointerdown: recordPointerDown,
          onClick: event => {
            event.stopPropagation();
            selectMesh(event);
          }
        }),
        !hasContent.value
          ? h('div', { class: 'flex h-[calc(100%-1.5rem)] w-full items-center justify-center text-muted' }, [
              h('i', { class: 'pi pi-image', 'aria-hidden': 'true' })
            ])
          : null
      ]);
    }
  });
}
