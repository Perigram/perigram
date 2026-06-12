import { requireAuth } from '../../../utils/permissions.js';
import { executeCommand } from '../../../core/commands/service.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const nestingResult = await executeCommand('solveNesting', {
    entities: { queue: event.context.params.id },
    parameters: body
  }, auth);
  const requestedAttachments = body.generateAttachments
    ? (body.requestedAttachments || body.requestedArtifacts || ['LAYOUT_DXF'])
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
