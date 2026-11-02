// The cassette designer's one canvas session: the target, assembly
// selection, and cameras a flip between the assembly SVG surface and the
// CadCraft sketch editor preserves.

export const canvasTargetKey = (mode, id = '') => `${mode}:${id}`;

export const createCanvasSession = () => ({
  target: null,
  returnState: null,
  assemblyView: null,
  sketchViews: new Map()
});

export const beginCanvasSession = (session, { mode, id = '', returnState = null, assemblyView = null }) => {
  session.target = { mode, id, key: canvasTargetKey(mode, id) };
  session.returnState = returnState;
  session.assemblyView = assemblyView ? { ...assemblyView } : null;
  return session.target;
};

export const endCanvasSession = (session) => {
  const state = {
    returnState: session.returnState,
    assemblyView: session.assemblyView
  };
  session.target = null;
  session.returnState = null;
  session.assemblyView = null;
  return state;
};

export const rememberCanvasSketchView = (session, view) => {
  if (session.target?.key && view) session.sketchViews.set(session.target.key, { ...view });
};

export const canvasSketchView = (session, key) => session.sketchViews.get(key) || null;
