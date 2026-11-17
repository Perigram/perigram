// Readable file-instance options for graph inputs. The list endpoint
// already applies access filtering; the capability rechecks the file grant
// at execution time.
export function graphFileOptions(typeIds = [], pool = {}) {
  return (Array.isArray(typeIds) ? typeIds : []).flatMap(typeId => (
    Object.values(pool?.[typeId] || {})
      .filter(instance => typeof instance?.payload?.fileId === 'string' && instance.payload.fileId)
      .map(instance => ({ ...instance, typeId }))
  ));
}
