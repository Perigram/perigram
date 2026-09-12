import { describe, expect, it } from 'vitest';
import {
    emptyScene,
    normalizeSketchDrawing,
    parseScene,
    strokeToSvgPath,
    strokesAtPoint
} from './sketch.js';

const penStroke = {
    id: 's1',
    tool: 'pen',
    points: [[10, 10], [40, 42], [80, 85]],
    color: '#c9144a',
    size: 4
};

describe('sketch scene contract', () => {
    it('parses valid scenes and rejects garbage', () => {
        expect(parseScene('not json')).toEqual(emptyScene());
        expect(parseScene(null)).toEqual(emptyScene());
        const scene = parseScene(JSON.stringify({ background: { fileId: 'f1', url: '/u.png' }, strokes: [penStroke] }));
        expect(scene.strokes).toHaveLength(1);
        expect(scene.background.url).toBe('/u.png');
    });

    it('drops malformed strokes and backgrounds without a url', () => {
        const scene = parseScene(JSON.stringify({
            background: { fileId: 'f1' },
            strokes: [{ id: 'broken' }, penStroke]
        }));
        expect(scene.strokes).toHaveLength(1);
        expect(scene.background).toBeNull();
    });

    it('renders pen strokes as closed perfect-freehand outlines', () => {
        const d = strokeToSvgPath(penStroke);
        expect(d).toMatch(/^M [\d.-]+,[\d.-]+ L /);
        expect(d).toContain('Z');
    });

    it('renders shapes from their two defining points', () => {
        expect(strokeToSvgPath({ tool: 'line', points: [[0, 0], [10, 10]], color: '#000', size: 2 }).trim()).toBe('M 0,0 L 10,10');
        const rect = strokeToSvgPath({ tool: 'rect', points: [[0, 0], [20, 10]], color: '#000', size: 2 });
        expect(rect).toContain('L 20,0');
        expect(rect.split('L ')).toHaveLength(4);
        expect(strokeToSvgPath({ tool: 'ellipse', points: [[0, 0], [20, 10]], color: '#000', size: 2 })).toContain('A 10 5 0');
    });

    it('finds eraser hits with size tolerance', () => {
        const scene = { strokes: [penStroke] };
        expect(strokesAtPoint(scene, [12, 12])).toEqual(['s1']);
        expect(strokesAtPoint(scene, [500, 500])).toEqual([]);
    });

    it('normalizes into the shared DrawingCanvas layer contract', () => {
        const drawing = normalizeSketchDrawing(parseScene(JSON.stringify({
            background: { fileId: 'f1', url: '/bg.png' },
            strokes: [penStroke, { id: 's2', tool: 'line', points: [[0, 0], [5, 5]], color: '#000', size: 2 }]
        })));
        expect(drawing.viewBox).toBe('0 0 1000 700');
        expect(drawing.layers.map(layer => layer.name)).toEqual(['background', 'sketch']);
        expect(drawing.layers[0].paths[0]).toMatchObject({ kind: 'image', href: '/bg.png' });
        expect(drawing.layers[1].paths).toHaveLength(2);
        expect(drawing.layers[1].paths[0]).toMatchObject({ kind: 'path' });
    });
});
