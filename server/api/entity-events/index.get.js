import {
  createEventStream,
  defineEventHandler,
  setResponseHeaders,
  setResponseStatus
} from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import * as entityEventService from '~/server/features/entity-events/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const eventStream = createEventStream(event);

  setResponseStatus(event, 200);
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'private, no-cache, no-store, no-transform, must-revalidate, max-age=0',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive'
  });
  event.node.res.flushHeaders?.();

  eventStream.push(JSON.stringify({
    type: 'connected',
    ts: Date.now()
  }));

  const unsubscribe = entityEventService.subscribe(auth, payload => eventStream.push(payload));
  const heartbeatInterval = setInterval(() => {
    eventStream.push(JSON.stringify({
      type: 'heartbeat',
      ts: Date.now()
    }));
  }, 30000);

  eventStream.onClosed(() => {
    clearInterval(heartbeatInterval);
    unsubscribe();
  });

  return eventStream.send();
});
