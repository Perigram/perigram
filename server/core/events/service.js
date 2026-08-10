export async function publishDomainEvent(event = {}, auth = {}) {
  if (!event?.type && !event?.id) return null;
  return event;
}
