/**
 * API endpoint to get data models for UI Lab
 */
import { extractDataModels, generateRelationshipDiagram } from '~/server/utils/extract-data-models.js';

export default defineEventHandler(async (event) => {
  try {
    const models = await extractDataModels();
    const diagram = generateRelationshipDiagram(models);
    
    return {
      success: true,
      models,
      diagram,
      count: models.length
    };
  } catch (error) {
    console.error('[API] Error extracting data models:', error);
    return {
      success: false,
      error: error.message,
      models: [],
      diagram: 'Error generating diagram'
    };
  }
});
