// The graph-output representation contract (SPEC §27.1, §28.14): the
// ordered views a graph output value supports, best user-facing
// renderer first. Raw JSON is the explicit fallback view, never the
// preferred one.
export function graphOutputViews(value, { hasPluginRenderer = false, representation = '' } = {}) {
  const declared = representation || value?.representation || '';
  const views = [{ value: 'json', label: 'JSON' }];
  if (hasPluginRenderer) views.unshift({ value: 'plugin', label: 'Specialized' });
  if (typeof value === 'string') views.unshift({ value: 'text', label: 'Text' }, { value: 'markdown', label: 'Markdown' });
  else if (typeof value === 'number' || typeof value === 'boolean') views.unshift({ value: 'text', label: 'Text' });
  if (Array.isArray(value) && value.length && value.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    views.unshift({ value: 'table', label: 'Table' });
  }
  if (value && typeof value === 'object' && value.fileId) {
    if (String(value.mime || '').startsWith('image/')) views.unshift({ value: 'image', label: 'Image' });
    else views.unshift({ value: 'document', label: 'Document' });
  }
  if (declared === 'perigram.scene-2d' && Array.isArray(value?.primitives)) views.unshift({ value: 'scene-2d', label: '2D scene' });
  if (declared === 'perigram.scene-3d' && Array.isArray(value?.vertices)) views.unshift({ value: 'scene-3d', label: '3D scene' });
  return views;
}

export function graphOutputTableColumns(value) {
  return [...new Set((Array.isArray(value) ? value : []).flatMap(row => Object.keys(row || {})))];
}
