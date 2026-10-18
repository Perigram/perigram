// The pane tab key grammar, single-homed: every key form a pane tree can
// carry is built here. A live call stage tab carries the raw LiveKit room
// name; workspace entity pool items (explorer rows) key by type and id.
export const screenTabKey = screenKey => `screen:${screenKey}`;

export const screenInstanceTabKey = (screenKey, instanceId) => `screen:${screenKey}:${instanceId}`;

export const pageTabKey = pageId => `page:${pageId}`;

export const pageInstanceTabKey = (pageId, instanceId) => `page:${pageId}:${instanceId}`;

export const chatTabKey = conversationKey => (
  conversationKey ? `page:chat:${conversationKey}` : pageTabKey('chats')
);

export const entityPoolKey = (typeId, instanceId) => `${typeId}:${instanceId}`;
