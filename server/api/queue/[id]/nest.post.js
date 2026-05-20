import { requireAuth } from '../../../utils/permissions.js';
import { executeServerOperation } from '../../../core/operations/service.js';
import '../../../features/nesting/operations.js';
import '../../../features/artifacts/operations.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const nestingResult = await executeServerOperation('solveNesting', {
    entities: { queue: event.context.params.id },
    parameters: body
  }, auth);
  const requestedArtifacts = body.requestedArtifacts || ['LAYOUT_DXF'];
  const artifacts = [];

  for (const type of requestedArtifacts) {
    const result = await executeServerOperation('generateArtifact', {
      entities: { nestingRun: nestingResult.data.runId },
      parameters: { type, pdfTemplateId: body.pdfTemplateId }
    }, auth);
    artifacts.push(result.data.artifactId);
  }

  return {
    ...nestingResult.data,
    artifacts
  };
});
