// Optimistic state moves over the shared instance pool: a board drop (or
// any served-machine transition intent) flips the record's flat state in
// the pool BEFORE the state service executes, so the card lands in its
// lane immediately and every open surface reconciles through the same
// store write the server result uses. The returned rollback restores the
// captured DTO when execution fails; an offline-queued execution never
// rolls back — the outbox replays it and emits the shared entity event,
// the same optimistic contract as every other mutation in the app.
export function applyOptimisticState(instances, { typeId = '', id = '', to = '' } = {}) {
  const typeKey = instances?.canonicalTypeKey?.(typeId || '') || typeId;
  const dto = instances?.dtoFor?.(typeKey, id);
  if (!dto || !to || dto.state === to) return null;
  instances.upsertRecord?.(typeKey, { ...dto, state: to });
  return () => instances.upsertRecord?.(typeKey, dto);
}
