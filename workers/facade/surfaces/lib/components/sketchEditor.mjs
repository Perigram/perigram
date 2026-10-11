// The profile sketch editor as a plugin surface component: pointer
// sketching (polyline/circle tools, snapping, fillets, DXF import) over
// the OCCS profile sketch model. Created by the designer module with the
// host-injected context.
import {
  evaluateOccsProfileSketchPreview,
  normalizeOccsProfileSketch,
  occsProfileFromSketch,
  projectProfileSketchPointFromPrevious,
  profileSketchFromDxfText
} from '../../../occs/profiles.js';

export default function createSketchEditor({ vue, components, locale }) {
  const { h, ref, computed, watch, defineComponent } = vue;
  const t = locale.t;

  return defineComponent({
    name: 'ProfileSketchEditor',
    props: {
      modelValue: { type: Object, default: null }
    },
    emits: ['update:modelValue', 'profile'],
    setup(props, { emit }) {
      const localSketch = ref(normalizeOccsProfileSketch(props.modelValue || {}));
      const selectedPointId = ref(localSketch.value.points[0]?.id || '');
      const selectedHoleId = ref('');
      const draggingPointId = ref('');
      const dragPoint = ref(null);
      const activeTool = ref('select');
      const pointerPoint = ref(null);
      const fileInputRef = ref(null);
      const importError = ref('');
      const drawDistance = ref(null);
      const orthoMode = ref(false);

      const toolModes = [
        { value: 'select', labelKey: 'cassette.v2.profileEditor.tools.select', icon: 'pi pi-arrow-up-left' },
        { value: 'polyline', labelKey: 'cassette.v2.profileEditor.tools.polyline', icon: 'pi pi-share-alt' },
        { value: 'circle', labelKey: 'cassette.v2.profileEditor.tools.circle', icon: 'pi pi-circle' }
      ];

      const sketchPoints = sketch => (Array.isArray(sketch?.points) ? sketch.points : []);
      const sketchHoles = sketch => (Array.isArray(sketch?.holes) ? sketch.holes : []);

      const displaySketch = computed(() => {
        if (!draggingPointId.value || !dragPoint.value) return localSketch.value;
        return {
          ...localSketch.value,
          points: sketchPoints(localSketch.value).map(point => (
            point.id === draggingPointId.value
              ? { ...point, x: dragPoint.value[0], y: dragPoint.value[1] }
              : point
          ))
        };
      });
      const preview = computed(() => evaluateOccsProfileSketchPreview(displaySketch.value));
      const selectedPoint = computed(() => sketchPoints(localSketch.value).find(point => point.id === selectedPointId.value) || null);
      const selectedHole = computed(() => sketchHoles(localSketch.value).find(hole => hole.id === selectedHoleId.value) || null);
      const selectedFilletRadius = computed(() => filletRadiusForVertex(selectedPointId.value));
      const snapPoint = computed(() => {
        if (!pointerPoint.value || draggingPointId.value) return null;
        const snap = nearestSnapPoint(pointerPoint.value);
        return snap?.distance <= snapThreshold.value ? [snap.point.xValue, snap.point.yValue] : null;
      });
      const snapThreshold = computed(() => {
        const [, , width, height] = viewBox.value.split(' ').map(Number);
        return Math.max(width, height) / 60 || 5;
      });
      const sectionPath = computed(() => {
        const points = preview.value.points;
        if (!points.length) return '';
        if (points.length === 1) return '';
        if (points.length === 2) return `M ${points[0].xValue} ${points[0].yValue} L ${points[1].xValue} ${points[1].yValue}`;
        const closeCommand = preview.value.closed ? ' Z' : '';
        if (preview.value.closed && points.some(point => filletRadiusForVertex(point.id) > 0)) {
          return roundedClosedPolylinePath(points, point => filletRadiusForVertex(point.id));
        }
        const [first, ...rest] = points;
        return [
          `M ${first.xValue} ${first.yValue}`,
          ...rest.map(point => `L ${point.xValue} ${point.yValue}`)
        ].join(' ') + closeCommand;
      });
      const viewBox = computed(() => {
        const stablePreview = evaluateOccsProfileSketchPreview(localSketch.value);
        const points = stablePreview.points;
        const holes = stablePreview.holes || [];
        const xs = points.flatMap(point => [point.xValue]).concat(holes.flatMap(hole => [
          hole.centerValue[0] - hole.diameterValue / 2,
          hole.centerValue[0] + hole.diameterValue / 2
        ]));
        const ys = points.flatMap(point => [point.yValue]).concat(holes.flatMap(hole => [
          hole.centerValue[1] - hole.diameterValue / 2,
          hole.centerValue[1] + hole.diameterValue / 2
        ]));
        const minX = Math.min(...xs, 0);
        const maxX = Math.max(...xs, 100);
        const minY = Math.min(...ys, 0);
        const maxY = Math.max(...ys, 100);
        const padding = Math.max(10, (maxX - minX + maxY - minY) / 12);
        return `${xOrZero(minX - padding)} ${xOrZero(minY - padding)} ${Math.max(1, maxX - minX + padding * 2)} ${Math.max(1, maxY - minY + padding * 2)}`;
      });
      const lastDrawPoint = computed(() => preview.value.points[preview.value.points.length - 1] || null);
      const pendingDrawPoint = computed(() => {
        if (activeTool.value !== 'polyline' || !pointerPoint.value || !lastDrawPoint.value) return null;
        const projected = projectProfileSketchPointFromPrevious(
          lastDrawPoint.value,
          { x: pointerPoint.value[0], y: pointerPoint.value[1] },
          drawDistance.value,
          { ortho: orthoMode.value }
        );
        const snapped = snappedCoords([projected.x, projected.y], [lastDrawPoint.value.id]);
        return { x: snapped[0], y: snapped[1] };
      });
      const previewSegment = computed(() => {
        if (!pendingDrawPoint.value || !lastDrawPoint.value) return null;
        return {
          from: [lastDrawPoint.value.xValue, lastDrawPoint.value.yValue],
          to: [pendingDrawPoint.value.x, pendingDrawPoint.value.y]
        };
      });
      const currentSegmentLength = computed(() => {
        if (!previewSegment.value) return '0';
        const [x1, y1] = previewSegment.value.from;
        const [x2, y2] = previewSegment.value.to;
        return round(Math.hypot(x2 - x1, y2 - y1)).toString();
      });

      watch(() => props.modelValue, (value) => {
        const normalized = normalizeOccsProfileSketch(value || {});
        if (JSON.stringify(normalized) === JSON.stringify(normalizeOccsProfileSketch(localSketch.value))) return;
        localSketch.value = normalized;
        if (selectedPointId.value && !sketchPoints(localSketch.value).some(point => point.id === selectedPointId.value)) {
          selectedPointId.value = sketchPoints(localSketch.value)[0]?.id || '';
        }
        if (selectedHoleId.value && !sketchHoles(localSketch.value).some(hole => hole.id === selectedHoleId.value)) {
          selectedHoleId.value = '';
        }
      }, { deep: true });

      watch(localSketch, () => {
        const normalized = normalizeOccsProfileSketch(localSketch.value);
        emit('update:modelValue', normalized);
        emit('profile', occsProfileFromSketch(normalized));
      }, { deep: true });

      const xOrZero = value => (Number.isFinite(value) ? value : 0);
      const round = value => Math.round(Number(value || 0) * 1000) / 1000;
      const pointAtDistance = (from, to, distance) => {
        const length = Math.hypot(to.xValue - from.xValue, to.yValue - from.yValue);
        if (!length) return [from.xValue, from.yValue];
        const ratio = Math.min(distance, length / 2) / length;
        return [
          from.xValue + (to.xValue - from.xValue) * ratio,
          from.yValue + (to.yValue - from.yValue) * ratio
        ];
      };

      const roundedClosedPolylinePath = (points, radiusForPoint) => {
        const corners = points.map((point, index) => {
          const radius = Math.max(0, Number(radiusForPoint(point) || 0));
          const previous = points[(index - 1 + points.length) % points.length];
          const next = points[(index + 1) % points.length];
          const start = pointAtDistance(point, previous, radius);
          const end = pointAtDistance(point, next, radius);
          return { point, start, end };
        });
        const [first, ...rest] = corners;
        return [
          `M ${first.end[0]} ${first.end[1]}`,
          ...rest.flatMap(corner => [
            `L ${corner.start[0]} ${corner.start[1]}`,
            `Q ${corner.point.xValue} ${corner.point.yValue} ${corner.end[0]} ${corner.end[1]}`
          ]),
          `L ${first.start[0]} ${first.start[1]}`,
          `Q ${first.point.xValue} ${first.point.yValue} ${first.end[0]} ${first.end[1]}`,
          'Z'
        ].join(' ');
      };

      const updateLocalSketch = (updater) => {
        const next = normalizeOccsProfileSketch(localSketch.value);
        updater(next);
        localSketch.value = normalizeOccsProfileSketch(next);
      };

      const rebuildPolylineEdges = (points = [], closed = false) => {
        const edgeCount = closed ? points.length : Math.max(0, points.length - 1);
        return points.slice(0, edgeCount).map((point, index) => ({
          id: `e${index}`,
          type: 'line',
          from: point.id,
          to: points[(index + 1) % points.length]?.id || point.id
        })).filter(edge => edge.from !== edge.to);
      };

      const nextPointId = (points = []) => {
        const used = new Set(points.map(point => point.id));
        let index = points.length;
        while (used.has(`p${index}`)) index++;
        return `p${index}`;
      };

      const defaultPointTarget = () => {
        const points = sketchPoints(localSketch.value);
        const last = points[points.length - 1];
        return last ? [Number(last.x || 0) + 10, Number(last.y || 0)] : [0, 0];
      };

      const filletRadiusForVertex = vertexId => (
        localSketch.value.modifiers?.find(modifier => modifier.type === 'fillet' && modifier.vertexId === vertexId)?.radius || 0
      );
      const gripSize = pointId => (pointId === selectedPointId.value ? 3.2 : 2.4);

      const addPoint = (coords = null) => {
        const target = coords || defaultPointTarget();
        updateLocalSketch((next) => {
          const id = nextPointId(next.points);
          next.points.push({ id, x: round(target[0]), y: round(target[1]) });
          next.closed = false;
          next.edges = rebuildPolylineEdges(next.points, false);
          selectedPointId.value = id;
          selectedHoleId.value = '';
        });
      };

      const closePolylineIfFirstPoint = (coords) => {
        const points = preview.value.points;
        if (points.length < 3) return false;
        const first = points[0];
        const distance = Math.hypot(first.xValue - coords[0], first.yValue - coords[1]);
        if (distance > snapThreshold.value) return false;
        closeActivePolyline();
        selectedPointId.value = first.id;
        return true;
      };

      const startNewPolyline = () => {
        localSketch.value = normalizeOccsProfileSketch({
          version: localSketch.value.version,
          units: localSketch.value.units,
          parameters: localSketch.value.parameters,
          points: [],
          edges: [],
          holes: sketchHoles(localSketch.value),
          closed: false,
          modifiers: [],
          constraints: localSketch.value.constraints
        });
        selectedPointId.value = '';
        selectedHoleId.value = '';
        activeTool.value = 'polyline';
        pointerPoint.value = null;
        drawDistance.value = null;
      };

      const closeActivePolyline = () => {
        updateLocalSketch((next) => {
          if (sketchPoints(next).length < 3) return;
          next.closed = true;
          next.edges = rebuildPolylineEdges(sketchPoints(next), true);
        });
        finishDrawingCommand();
      };

      const undoLastPoint = () => {
        updateLocalSketch((next) => {
          const points = sketchPoints(next);
          const removed = points.pop();
          if (!removed) return;
          next.modifiers = (next.modifiers || []).filter(modifier => modifier.vertexId !== removed.id);
          next.closed = false;
          next.edges = rebuildPolylineEdges(points, false);
          selectedPointId.value = points[points.length - 1]?.id || '';
          selectedHoleId.value = '';
        });
      };

      const finishDrawingCommand = () => {
        activeTool.value = 'select';
        pointerPoint.value = null;
        drawDistance.value = null;
      };

      const addHole = (coords = null) => {
        const target = coords || [0, 0];
        updateLocalSketch((next) => {
          next.holes = sketchHoles(next);
          const id = `h${next.holes.length}`;
          next.holes.push({
            id,
            type: 'circle',
            center: [round(target[0]), round(target[1])],
            diameter: 6
          });
          selectedHoleId.value = id;
          selectedPointId.value = '';
        });
      };

      const updatePoint = (id, patch) => {
        updateLocalSketch((next) => {
          const point = sketchPoints(next).find(item => item.id === id);
          if (point) Object.assign(point, {
            ...patch,
            ...(patch.x !== undefined ? { x: round(patch.x) } : {}),
            ...(patch.y !== undefined ? { y: round(patch.y) } : {})
          });
        });
      };

      const updateHole = (id, patch) => {
        updateLocalSketch((next) => {
          const hole = sketchHoles(next).find(item => item.id === id);
          if (!hole) return;
          if (patch.center) patch.center = patch.center.map(round);
          if (patch.diameter !== undefined) patch.diameter = Math.max(0, round(patch.diameter));
          Object.assign(hole, patch);
        });
      };

      const updatePointFilletRadius = (vertexId, radius) => {
        updateLocalSketch((next) => {
          const value = Math.max(0, round(radius));
          next.modifiers = (next.modifiers || []).filter(modifier => !(modifier.type === 'fillet' && modifier.vertexId === vertexId));
          if (value > 0) next.modifiers.push({ type: 'fillet', vertexId, radius: value });
        });
      };

      const svgPointFromEvent = (event) => {
        const svg = event.currentTarget.closest('svg') || event.currentTarget;
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformed = point.matrixTransform(svg.getScreenCTM().inverse());
        return [round(transformed.x), round(transformed.y)];
      };

      const nearestSnapPoint = (coords, excludedIds = []) => {
        const excluded = new Set(excludedIds);
        const points = preview.value.points.filter(point => !excluded.has(point.id));
        if (!points.length) return null;
        return points
          .map(point => ({
            point,
            distance: Math.hypot(point.xValue - coords[0], point.yValue - coords[1])
          }))
          .sort((left, right) => left.distance - right.distance)[0] || null;
      };

      const snappedCoords = (coords, excludedIds = []) => {
        const snap = nearestSnapPoint(coords, excludedIds);
        return snap?.distance <= snapThreshold.value
          ? [snap.point.xValue, snap.point.yValue]
          : coords;
      };

      const projectedDrawCoords = (coords) => {
        if (!lastDrawPoint.value) return coords;
        const projected = projectProfileSketchPointFromPrevious(
          lastDrawPoint.value,
          { x: coords[0], y: coords[1] },
          drawDistance.value,
          { ortho: orthoMode.value }
        );
        return snappedCoords([projected.x, projected.y], [lastDrawPoint.value.id]);
      };

      const selectHole = (holeId) => {
        selectedHoleId.value = holeId;
        selectedPointId.value = '';
      };

      const startDrag = (event, point) => {
        event.stopPropagation();
        event.preventDefault();
        if (activeTool.value === 'polyline') {
          closePolylineIfFirstPoint([point.xValue, point.yValue]);
          return;
        }
        if (activeTool.value !== 'select') return;
        selectedPointId.value = point.id;
        selectedHoleId.value = '';
        draggingPointId.value = point.id;
        dragPoint.value = [point.xValue, point.yValue];
      };

      const handleCanvasPointerDown = (event) => {
        if (event.target?.tagName?.toLowerCase?.() !== 'svg') return;
        const rawCoords = svgPointFromEvent(event);
        pointerPoint.value = rawCoords;
        if (activeTool.value === 'polyline') {
          const coords = projectedDrawCoords(rawCoords);
          if (closePolylineIfFirstPoint(coords)) return;
          addPoint(coords);
          return;
        }
        const coords = snappedCoords(rawCoords);
        if (activeTool.value === 'circle') {
          addHole(coords);
        }
      };

      const handlePointerMove = (event) => {
        const coords = svgPointFromEvent(event);
        pointerPoint.value = coords;
        if (!draggingPointId.value) return;
        dragPoint.value = snappedCoords(coords);
      };

      const stopDrag = () => {
        if (draggingPointId.value && dragPoint.value) {
          updatePoint(draggingPointId.value, {
            x: dragPoint.value[0],
            y: dragPoint.value[1]
          });
        }
        draggingPointId.value = '';
        dragPoint.value = null;
      };

      const commitDrawPointFromKeyboard = () => {
        if (activeTool.value !== 'polyline' || !pointerPoint.value) return;
        const coords = projectedDrawCoords(pointerPoint.value);
        if (closePolylineIfFirstPoint(coords)) return;
        addPoint(coords);
      };

      const cancelPendingDraw = () => {
        if (activeTool.value !== 'polyline') return;
        finishDrawingCommand();
      };

      const handleDxfUpload = async (event) => {
        const [file] = Array.from(event.target.files || []);
        event.target.value = '';
        if (!file) return;
        importError.value = '';
        try {
          const text = await file.text();
          localSketch.value = profileSketchFromDxfText(text);
          selectedPointId.value = localSketch.value.points[0]?.id || '';
          selectedHoleId.value = '';
        } catch (error) {
          importError.value = error?.message || t('cassette.v2.profileEditor.importFailed');
        }
      };

      const InputNumber = components.InputNumber;

      return () => h('div', {
        class: 'flex min-h-0 flex-col gap-3',
        tabindex: 0,
        onKeydown: event => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitDrawPointFromKeyboard();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelPendingDraw();
          }
        }
      }, [
        h('div', { class: 'grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]' }, [
          h('div', { class: 'min-h-0 rounded-ui border border-content-border bg-subtle p-2' }, [
            h('div', { class: 'mb-2 flex flex-wrap items-center gap-1' }, [
              ...toolModes.map(mode => h(components.Button, {
                key: mode.value,
                label: t(mode.labelKey),
                icon: mode.icon,
                severity: activeTool.value === mode.value ? 'primary' : 'secondary',
                size: 'small',
                onClick: () => { activeTool.value = mode.value; }
              })),
              h(components.Button, {
                icon: 'pi pi-upload',
                label: t('cassette.v2.profileEditor.importDxf'),
                severity: 'secondary',
                size: 'small',
                onClick: () => fileInputRef.value?.click()
              }),
              h(components.Button, {
                icon: 'pi pi-file',
                label: t('cassette.v2.profileEditor.newPolyline'),
                severity: 'secondary',
                size: 'small',
                onClick: startNewPolyline
              }),
              h('input', {
                ref: fileInputRef,
                type: 'file',
                accept: '.dxf',
                class: 'hidden',
                onChange: handleDxfUpload
              })
            ]),
            h('svg', {
              class: 'h-[28rem] w-full rounded-ui',
              viewBox: viewBox.value,
              role: 'img',
              'aria-label': t('cassette.v2.profileEditor.preview'),
              onPointerdown: handleCanvasPointerDown,
              onPointermove: handlePointerMove,
              onPointerup: stopDrag,
              onPointerleave: stopDrag
            }, [
              sectionPath.value
                ? h('path', {
                    d: sectionPath.value,
                    fill: 'none',
                    stroke: 'currentColor',
                    'stroke-linejoin': 'round',
                    'stroke-width': 0.7
                  })
                : null,
              previewSegment.value
                ? h('line', {
                    x1: previewSegment.value.from[0],
                    y1: previewSegment.value.from[1],
                    x2: previewSegment.value.to[0],
                    y2: previewSegment.value.to[1],
                    stroke: 'var(--p-primary-color)',
                    'stroke-dasharray': '4 3',
                    'stroke-width': 0.6
                  })
                : null,
              ...preview.value.holes.map(hole => h('circle', {
                key: hole.id,
                cx: hole.centerValue[0],
                cy: hole.centerValue[1],
                r: hole.diameterValue / 2,
                fill: 'none',
                stroke: 'currentColor',
                'stroke-dasharray': '3 2',
                'stroke-width': 0.7,
                onPointerdown: event => {
                  event.stopPropagation();
                  selectHole(hole.id);
                }
              })),
              ...preview.value.points.map(point => h('rect', {
                key: point.id,
                x: point.xValue - gripSize(point.id) / 2,
                y: point.yValue - gripSize(point.id) / 2,
                width: gripSize(point.id),
                height: gripSize(point.id),
                class: 'cursor-move',
                fill: point.id === selectedPointId.value ? 'var(--p-primary-color)' : 'currentColor',
                stroke: 'var(--p-content-background)',
                'stroke-width': 0.45,
                onPointerdown: event => startDrag(event, point)
              })),
              snapPoint.value
                ? h('circle', {
                    cx: snapPoint.value[0],
                    cy: snapPoint.value[1],
                    r: 2.5,
                    fill: 'none',
                    stroke: 'var(--p-primary-color)',
                    'stroke-width': 0.7
                  })
                : null
            ])
          ]),
          h('div', { class: 'flex min-h-0 flex-col gap-3' }, [
            h('div', { class: 'flex flex-col gap-2 rounded-ui border border-content-border p-2' }, [
              h('strong', null, t('cassette.v2.profileEditor.selection')),
              selectedPoint.value
                ? [
                    h('small', { class: 'text-muted' }, selectedPoint.value.id),
                    h('div', { class: 'grid grid-cols-2 gap-2' }, [
                      h(InputNumber, {
                        modelValue: selectedPoint.value.x,
                        inputClass: 'w-full',
                        minFractionDigits: 0,
                        maxFractionDigits: 3,
                        'onUpdate:modelValue': value => updatePoint(selectedPoint.value.id, { x: value })
                      }),
                      h(InputNumber, {
                        modelValue: selectedPoint.value.y,
                        inputClass: 'w-full',
                        minFractionDigits: 0,
                        maxFractionDigits: 3,
                        'onUpdate:modelValue': value => updatePoint(selectedPoint.value.id, { y: value })
                      }),
                      h(InputNumber, {
                        modelValue: selectedFilletRadius.value,
                        inputClass: 'w-full',
                        min: 0,
                        minFractionDigits: 0,
                        maxFractionDigits: 3,
                        placeholder: t('cassette.v2.profileEditor.cornerFillet'),
                        'onUpdate:modelValue': value => updatePointFilletRadius(selectedPoint.value.id, value)
                      })
                    ])
                  ]
                : selectedHole.value
                  ? [
                      h('small', { class: 'text-muted' }, selectedHole.value.id),
                      h('div', { class: 'grid grid-cols-2 gap-2' }, [
                        h(InputNumber, {
                          modelValue: selectedHole.value.center[0],
                          inputClass: 'w-full',
                          minFractionDigits: 0,
                          maxFractionDigits: 3,
                          'onUpdate:modelValue': value => updateHole(selectedHole.value.id, { center: [value, selectedHole.value.center[1]] })
                        }),
                        h(InputNumber, {
                          modelValue: selectedHole.value.center[1],
                          inputClass: 'w-full',
                          minFractionDigits: 0,
                          maxFractionDigits: 3,
                          'onUpdate:modelValue': value => updateHole(selectedHole.value.id, { center: [selectedHole.value.center[0], value] })
                        }),
                        h(InputNumber, {
                          modelValue: selectedHole.value.diameter,
                          inputClass: 'w-full',
                          min: 0,
                          minFractionDigits: 0,
                          maxFractionDigits: 3,
                          'onUpdate:modelValue': value => updateHole(selectedHole.value.id, { diameter: value })
                        })
                      ])
                    ]
                  : h('small', { class: 'text-muted' }, t('cassette.v2.profileEditor.noSelection'))
            ]),
            h('div', { class: 'flex flex-col gap-2 rounded-ui border border-content-border p-2' }, [
              h('strong', null, t('cassette.v2.profileEditor.polyline')),
              h('div', { class: 'grid grid-cols-2 gap-2' }, [
                h(InputNumber, {
                  modelValue: drawDistance.value,
                  inputClass: 'w-full',
                  min: 0,
                  minFractionDigits: 0,
                  maxFractionDigits: 3,
                  placeholder: t('cassette.v2.profileEditor.distance'),
                  'onUpdate:modelValue': value => { drawDistance.value = value; }
                }),
                h('div', { class: 'flex items-center gap-2' }, [
                  h(components.Checkbox, {
                    modelValue: orthoMode.value,
                    binary: true,
                    'onUpdate:modelValue': value => { orthoMode.value = value; }
                  }),
                  h('label', { class: 'text-muted text-label' }, t('cassette.v2.profileEditor.ortho'))
                ])
              ]),
              h('small', { class: 'text-muted' }, `${t('cassette.v2.profileEditor.segmentLength')}: ${currentSegmentLength.value}`),
              h('div', { class: 'flex items-center gap-2' }, [
                h('label', { class: 'min-w-28 text-muted text-label' }, t('cassette.v2.profileEditor.cornerFillet')),
                h(InputNumber, {
                  modelValue: selectedPoint.value ? selectedFilletRadius.value : 0,
                  inputClass: 'w-full',
                  disabled: !selectedPoint.value,
                  min: 0,
                  minFractionDigits: 0,
                  maxFractionDigits: 3,
                  'onUpdate:modelValue': value => selectedPoint.value && updatePointFilletRadius(selectedPoint.value.id, value)
                })
              ]),
              h('div', { class: 'flex flex-wrap gap-1' }, [
                h(components.Button, {
                  icon: 'pi pi-undo',
                  label: t('cassette.v2.profileEditor.undoPoint'),
                  severity: 'secondary',
                  size: 'small',
                  disabled: !preview.value.points.length,
                  onClick: undoLastPoint
                }),
                h(components.Button, {
                  icon: 'pi pi-link',
                  label: t('cassette.v2.profileEditor.closePolyline'),
                  severity: 'secondary',
                  size: 'small',
                  disabled: preview.value.points.length < 3,
                  onClick: closeActivePolyline
                }),
                h(components.Button, {
                  icon: 'pi pi-check',
                  label: t('cassette.v2.profileEditor.finishPolyline'),
                  severity: 'secondary',
                  size: 'small',
                  disabled: activeTool.value !== 'polyline',
                  onClick: finishDrawingCommand
                }),
                h(components.Button, {
                  icon: 'pi pi-circle',
                  label: t('cassette.v2.profileEditor.addCircle'),
                  severity: 'secondary',
                  size: 'small',
                  onClick: () => addHole()
                })
              ])
            ]),
            importError.value
              ? h(components.Message, { severity: 'error', size: 'small', closable: false }, () => importError.value)
              : null
          ])
        ])
      ]);
    }
  });
}
