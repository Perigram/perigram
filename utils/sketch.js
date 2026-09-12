import { getStroke } from 'perfect-freehand'

/**
 * Sketch scene contract (SKETCH attachment kind).
 *
 * A scene is plain JSON persisted as the artifact file:
 * `{ version: 1, background: { fileId, url } | null, strokes: Stroke[] }`
 * where `Stroke` is `{ id, tool: 'pen'|'line'|'rect'|'ellipse', points,
 * color, size }` and `points` are viewBox-space `[x, y]` pairs (two points
 * for the shape tools, free length for the pen).
 *
 * The same normalizer feeds the editor and the DrawingCanvas preview, so
 * there is exactly one rendering definition per stroke.
 */

export const SKETCH_VIEWBOX = { width: 1000, height: 700 }
export const SKETCH_TOOLS = ['pen', 'line', 'rect', 'ellipse', 'eraser']

export const emptyScene = () => ({ version: 1, background: null, strokes: [] })

export const parseScene = (raw) => {
    let scene
    try {
        scene = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
        scene = null
    }
    if (!scene || typeof scene !== 'object') return emptyScene()
    return {
        version: 1,
        background: scene.background?.url ? { fileId: scene.background.fileId || null, url: scene.background.url } : null,
        strokes: Array.isArray(scene.strokes)
            ? scene.strokes.filter(stroke => Array.isArray(stroke?.points) && stroke.points.length)
            : []
    }
}

const strokeOptions = stroke => ({
    size: stroke.size || 4,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    easing: t => Math.sin((t * Math.PI) / 2),
    simulatePressure: true,
    last: true
})

const pointsToPath = (points, closed) => {
    const [first, ...rest] = points
    return [
        closed ? `M ${first[0]},${first[1]}` : `M ${first[0]},${first[1]}`,
        ...rest.map(([x, y]) => `L ${x},${y}`),
        closed ? 'Z' : ''
    ].join(' ')
}

/** SVG path `d` for one stroke; shapes derive from their two defining points. */
export const strokeToSvgPath = (stroke) => {
    const points = stroke.points.map(([x, y]) => [Number(x) || 0, Number(y) || 0])
    if (points.length < 2) {
        const [x, y] = points[0] || [0, 0]
        return `M ${x},${y} L ${x},${y}`
    }
    if (stroke.tool === 'pen') {
        const outline = getStroke(points, strokeOptions(stroke))
        const [first, ...rest] = outline
        return [
            `M ${first[0]},${first[1]}`,
            ...rest.map(([x, y]) => `L ${x},${y}`),
            'Z'
        ].join(' ')
    }
    if (stroke.tool === 'line') {
        return pointsToPath(points, false)
    }
    const [start, end] = [points[0], points[points.length - 1]]
    if (stroke.tool === 'rect') {
        return pointsToPath([
            start,
            [end[0], start[1]],
            end,
            [start[0], end[1]]
        ], true)
    }
    if (stroke.tool === 'ellipse') {
        const rx = Math.abs(end[0] - start[0]) / 2
        const ry = Math.abs(end[1] - start[1]) / 2
        const cx = start[0] + (end[0] > start[0] ? rx : -rx)
        const cy = start[1] + (end[1] > start[1] ? ry : -ry)
        return [
            `M ${cx - rx},${cy}`,
            `A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`,
            `A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`,
            'Z'
        ].join(' ')
    }
    return pointsToPath(points, false)
}

const distanceToStroke = ([x, y], stroke) => {
    const threshold = (stroke.size || 4) + 12
    return stroke.points.some(([px, py]) => {
        const dx = Number(px) - x
        const dy = Number(py) - y
        return dx * dx + dy * dy <= threshold * threshold
    })
}

/** Strokes hit by the eraser at a viewBox point. */
export const strokesAtPoint = (scene, point) => scene.strokes
    .filter(stroke => distanceToStroke(point, stroke))
    .map(stroke => stroke.id)

/** Normalizes a scene into the shared DrawingCanvas layer contract. */
export const normalizeSketchDrawing = (scene) => {
    const viewBox = `0 0 ${SKETCH_VIEWBOX.width} ${SKETCH_VIEWBOX.height}`
    const layers = []
    if (scene.background?.url) {
        layers.push({
            name: 'background',
            paths: [{
                kind: 'image',
                href: scene.background.url,
                x: 0,
                y: 0,
                width: SKETCH_VIEWBOX.width,
                height: SKETCH_VIEWBOX.height
            }]
        })
    }
    if (scene.strokes.length) {
        layers.push({
            name: 'sketch',
            paths: scene.strokes.map(stroke => ({
                kind: 'path',
                d: strokeToSvgPath(stroke),
                color: stroke.color || 'var(--p-text-color)',
                weight: stroke.size || 4,
                fill: stroke.tool === 'pen' ? stroke.color || 'var(--p-text-color)' : 'none'
            }))
        })
    }
    return { viewBox, layers }
}
