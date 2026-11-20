// The canvas status pill derivation shared by every editor mount; the
// pill contract lives in the process-designer README.
export function canvasStatusOf({ t, running = false, error = '', result = null }) {
  const state = running
    ? 'running'
    : error
      ? 'error'
      : result
        ? 'ready'
        : 'idle';
  const suffix = state[0].toUpperCase() + state.slice(1);
  return {
    state,
    label: t(`processDesigner.canvasStatus${suffix}`),
    count: Object.keys(result?.nodeOutputs || {}).length
  };
}
