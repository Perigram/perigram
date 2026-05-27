import * as service from './service.js';

export async function generateConfigBotDraft({ parameters = {}, auth }) {
  const result = await service.generateDraft({
    prompt: parameters.prompt,
    context: parameters.context || {}
  }, auth);
  return { data: result };
}

export async function reindexConfigBotKnowledge({ auth }) {
  const result = await service.reindexKnowledge({}, auth);
  return { data: result };
}

