import { registerPageCollabTopicAuthorizer } from '~/server/features/pages/collab.js';

export default defineNitroPlugin(() => {
  registerPageCollabTopicAuthorizer();
});
