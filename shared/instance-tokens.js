// The message-body instance token grammar (the support feature owns the
// contract): {{instance:type:id}} references a message's attached
// instanceRefs entry. Display strips the tokens — refs render attached
// to the message, never inline in a bubble.
export const INSTANCE_TOKEN_PATTERN = /\{\{instance:([^:}]+):([^}]+)\}\}/g;

export const stripInstanceTokens = (text = '') => String(text).replace(INSTANCE_TOKEN_PATTERN, ' ');
