import init, { Modular } from 'nodi-modular';
import { buildNodiGraph } from '~/server/utils/cassetteGraphBuilder';

// Robust singleton management
if (process.client && !window.__NODI_CONTEXT__) {
    window.__NODI_CONTEXT__ = {
        instance: null,
        initPromise: null,
        templateGraph: null,
        renderQueue: Promise.resolve(),
        isCrashing: false
    };
}

async function getContext() {
    const ctx = window.__NODI_CONTEXT__;
    
    if (!ctx.initPromise || ctx.isCrashing) {
        ctx.isCrashing = false;
        ctx.initPromise = (async () => {
            try {
                await init();
                ctx.instance = Modular.new();
                ctx.templateGraph = await $fetch('/Cassette.json');
                return ctx;
            } catch (err) {
                console.error('WASM Engine Critical Init Failure:', err);
                ctx.initPromise = null;
                throw err;
            }
        })();
    }
    return ctx.initPromise;
}

/**
 * Main rendering entry point. 
 * Handles locking, sanitization, and error recovery.
 */
export async function renderCassetteToSVG(cassetteData) {
    if (!process.client) return null;

    const ctx = await getContext();
    
    // Serialized execution queue
    return ctx.renderQueue = ctx.renderQueue.then(async () => {
        try {
            if (!ctx.instance || !ctx.templateGraph) return null;

            // 1. SANITIZE: Prevent WASM panics by ensuring dimensions are valid (> 0)
            const sanitizedParams = {};
            const baseParams = cassetteData.params || {};
            for (const [key, val] of Object.entries(baseParams)) {
                // Engine hates 0 or NaN for geometry
                const num = Number(val);
                sanitizedParams[key] = (isNaN(num) || num <= 0) ? 1 : num;
            }

            const cleanData = {
                params: sanitizedParams,
                extrusions: Array.isArray(cassetteData.extrusions) ? cassetteData.extrusions : []
            };

            // 2. EVALUATE: Use try-catch specifically for WASM operations
            let evalResult;
            try {
                const { graph } = buildNodiGraph(cleanData, ctx.templateGraph);
                ctx.instance.loadGraph(JSON.stringify(graph));
                evalResult = await ctx.instance.evaluate();
            } catch (wasmPanic) {
                console.error('WASM Engine Panicked (unreachable). Marking for reset.', wasmPanic);
                ctx.isCrashing = true; // Trigger re-init on next getContext()
                return null;
            }

            if (!evalResult?.geometryIdentifiers) return null;

            // 3. EXTRACT: Geometry processing
            const allCurves = [];
            evalResult.geometryIdentifiers.forEach((id) => {
                const interop = ctx.instance.findGeometryInteropById(id);
                if (interop?.variant === 'Curve' && interop.data.vertices?.length > 0) {
                    allCurves.push({ 
                        vertices: interop.data.vertices, 
                        id,
                        length: interop.data.vertices.length
                    });
                }
            });

            if (allCurves.length === 0) return null;

            // Sort: Largest polygon is the boundary
            const sorted = [...allCurves].sort((a, b) => b.length - a.length);
            const largest = sorted[0];

            return {
                viewBox: calculateViewBox(largest.vertices),
                path: verticesToSVGPath(largest.vertices),
                vertices: largest.vertices, // Return raw data for Designer
                allCurves: allCurves.map(c => ({
                    path: verticesToSVGPath(c.vertices),
                    isBoundary: c === largest,
                    isExtrusion: c !== largest && c.vertices.length === 5
                }))
            };
        } catch (generalError) {
            console.warn('Render failed:', generalError);
            return null;
        }
    });
}

function calculateViewBox(vertices) {
    if (!vertices?.length) return "0 0 100 100";
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    vertices.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, -y);
        maxY = Math.max(maxY, -y);
    });
    const width = maxX - minX;
    const height = maxY - minY;
    const padding = Math.max(width, height, 100) * 0.2;
    return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
}

function verticesToSVGPath(vertices) {
    if (!vertices?.length) return '';
    const commands = vertices.map((v, i) => (i === 0 ? `M ${v[0]} ${-v[1]}` : `L ${v[0]} ${-v[1]}`));
    return commands.join(' ') + ' Z';
}
