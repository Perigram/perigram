const automaticHandlers = new Set();

export function registerDomainEventHandler(handler) {
  if (typeof handler !== 'function') return () => {};
  automaticHandlers.add(handler);
  return () => automaticHandlers.delete(handler);
}

export async function publishDomainEvent(event = {}, auth = {}) {
  if (!event?.type && !event?.id) return null;
  await Promise.all([...automaticHandlers].map(handler => (
    Promise.resolve().then(() => handler(event, auth)).catch(error => {
      console.error('[Domain Events] Automatic process trigger failed:', error.message);
    })
  )));
  return event;
}
