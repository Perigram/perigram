import { extractDataModels, generateMarkdown } from './server/utils/extract-data-models.js';
import fs from 'fs';

async function main() {
  const models = await extractDataModels();
  const artifactModel = models.find(m => m.collection === 'artifacts');
  console.log('Artifact Model:', JSON.stringify(artifactModel, null, 2));
  
  const md = generateMarkdown(models);
  fs.writeFileSync('DEBUG_DATA_MODEL.md', md);
}

main().catch(console.error);
