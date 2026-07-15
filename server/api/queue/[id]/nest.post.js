import { requireAuth } from '../../../utils/permissions.js';
import { executeCommand } from '../../../core/commands/service.js';
import * as queuesService from '../../../features/queues/service.js';
import { createError } from 'h3';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event) || {};
  const queueId = event.context.params.id;
  const settingsUpdate = body.nestingSettings || body.nestingParams || rootNestingSettings(body);

  if (body.job || settingsUpdate) {
    await queuesService.update(
      queueId,
      {
        ...(body.job ? { job: body.job } : {}),
        ...(settingsUpdate ? { nestingSettings: settingsUpdate } : {})
      },
      auth.userId,
      auth.organizationId,
      auth.role,
      auth
    );
  }

  const queue = await queuesService.getById(
    queueId,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );
  if (!queue) throw createError({ statusCode: 404, message: 'Queue not found' });
  const parameters = queuesService.buildNestingCommandParameters(queue, {
    materialPool: body.materialPool
  });
  const nestingResult = await executeCommand('solveNesting', {
    entities: { queue: queueId },
    parameters
  }, auth);
  const requestedAttachments = body.generateAttachments
    ? (body.requestedAttachments || body.requestedArtifacts || queue.data?.nestingSettings?.requestedArtifacts || ['LAYOUT_DXF'])
    : [];
  const attachments = [];

  for (const kind of requestedAttachments) {
    const result = await executeCommand('generateAttachment', {
      entities: { nestingRun: nestingResult.data.runId },
      parameters: { kind, pdfTemplateId: body.pdfTemplateId }
    }, auth);
    attachments.push(result.data.attachmentId);
  }

  return {
    ...nestingResult.data,
    attachments
  };
});

function rootNestingSettings(body = {}) {
  const keys = [
    'materialMode',
    'virtualWidth',
    'virtualLength',
    'width',
    'height',
    'spacing',
    'space',
    'warehouseId',
    'inventoryItems',
    'toolProfileId',
    'toolId',
    'requestedArtifacts'
  ];
  const result = {};
  for (const key of keys) {
    if (body[key] !== undefined) result[key] = body[key];
  }
  return Object.keys(result).length ? result : null;
}
