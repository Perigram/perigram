/**
 * Procedurally extract data models - v24 Absolute Final Version
 * Architecture-aware: Knows about BaseEntity and Standard Blocks.
 * STRICT MODE: Only captures fields explicitly assigned to 'data'.
 */

import fs from 'fs';
import path from 'path';

// Resolve paths correctly
function getFeaturesDir() {
  const possiblePaths = [
    path.resolve(process.cwd(), 'server/features'),
    path.resolve(process.cwd(), '.output/server/features'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const FEATURES_DIR = getFeaturesDir();

// Standard BaseEntity Blocks (Always present, never duplicated)
const STANDARD_BLOCKS = [
  { name: 'identity', type: 'Object', description: 'Standard Identity Block (uid, name)' },
  { name: 'origin', type: 'Object', description: 'Standard Origin Block (creation state)' },
  { name: 'status', type: 'Object', description: 'Standard Status Block (current state)' },
  { name: 'lineage', type: 'Object', description: 'Standard Lineage Block (ancestor IDs)' },
  { name: 'attachments', type: 'Object', description: 'Standard Attachments Block (files)' }
];

/**
 * Extract fields specific to the 'data' block from service/repository files
 */
function extractDataFields(featurePath) {
  const dataFields = new Map();
  
  // Read Source Files
  const files = ['service.js', 'repository.js', 'model.js'];
  let content = '';
  for (const f of files) {
    const p = path.join(featurePath, f);
    if (fs.existsSync(p)) content += fs.readFileSync(p, 'utf-8') + '\n';
  }

  // Strategy 1: Explicit 'data' or 'params' object construction
  // Matches: data: { key1, key2: val } or params: { key1 } 
  const objectRegex = /(?:data|params)\s*:\s*createData\(\s*\{([^}]+)\}\s*\)|(?:data|params)\s*:\s*\{([^}]+)\}/g;
  let match;
  while ((match = objectRegex.exec(content)) !== null) {
      const inner = match[1] || match[2];
      const props = inner.split(',').map(p => p.split(':')[0].trim());
      for (const p of props) {
          if (!p || p.startsWith('...')) continue;
          if (['identity', 'lineage', 'status', 'origin', 'attachments', 'metadata', 'fileId', 'name', 'definition'].includes(p)) continue;
          dataFields.set(`data.${p}`, { type: inferType(p), description: `${camelToWords(p)} field` });
      }
  }

  // Strategy 2: Class Constructor Assignment (this.data = { ... })
  const classAssignRegex = /this\.data\s*=\s*\{([^}]+)\}/g;
  while ((match = classAssignRegex.exec(content)) !== null) {
      const inner = match[1];
      const props = inner.split(',').map(p => p.split(':')[0].trim());
      for (const p of props) {
          if (!p || p.startsWith('...')) continue;
          dataFields.set(`data.${p}`, { type: inferType(p), description: `${camelToWords(p)} field` });
      }
  }

  // Strategy 3: Dot notation assignment (data.field = val)
  // Matches: data.someField = ... or this.data.someField = ...
  const dotAssignRegex = /(?:this\.|^|\s)data\.([\w]+)\s*=/g;
  while ((match = dotAssignRegex.exec(content)) !== null) {
      const p = match[1];
      if (['metadata'].includes(p)) continue;
      dataFields.set(`data.${p}`, { type: inferType(p), description: `${camelToWords(p)} field` });
  }

  return Array.from(dataFields.entries()).map(([name, info]) => ({
    name,
    type: info.type,
    description: info.description
  }));
}

function inferType(key) {
  if (key.endsWith('Id') || key === 'currency' || key === 'material' || key === 'code') return 'String';
  if (key.includes('Date') || key === 'timestamp') return 'Date';
  if (key.includes('count') || key === 'quantity' || key === 'total' || key === 'price' || key === 'width' || key === 'length') return 'Number';
  if (key.endsWith('s') && !key.endsWith('ss')) return 'Array';
  return 'String';
}

function camelToWords(str) {
  return str.replace(/([A-Z])/g, ' $1').toLowerCase();
}

/**
 * Scan features and build models
 */
export async function extractDataModels() {
  const models = [];
  if (!FEATURES_DIR) return models;
  
  const features = fs.readdirSync(FEATURES_DIR);
  for (const feature of features) {
    if (feature.startsWith('.')) continue;
    const featurePath = path.join(FEATURES_DIR, feature);
    if (!fs.statSync(featurePath).isDirectory()) continue;

    const repoPath = path.join(featurePath, 'repository.js');
    if (!fs.existsSync(repoPath)) continue;
    const repoContent = fs.readFileSync(repoPath, 'utf-8');
    const collectionMatch = repoContent.match(/const COLLECTION = [\'\"]([^\'\"]+)[\'\"]/);
    if (!collectionMatch) continue;
    const collection = collectionMatch[1];

    const entitySpecificFields = extractDataFields(featurePath);
    const allFields = [...STANDARD_BLOCKS, ...entitySpecificFields];

    models.push({
      collection,
      feature,
      description: `${camelToWords(feature).replace(/^\w/, c => c.toUpperCase())} - manages ${collection.replace(/_/g, ' ')}`,
      fields: allFields
    });
  }
  
  return models.sort((a, b) => a.collection.localeCompare(b.collection));
}

/**
 * Generate Markdown
 */
export function generateMarkdown(models) {
  let md = '# Data Model (Generated)\n\n';
  md += 'This document is procedurally generated from the actual codebase. It reflects the refactored v24 Standardized architecture using blocks.\n\n';
  
  md += '## Collections\n\n';
  for (const model of models) {
    md += `### ${model.collection}\n`;
    md += `*${model.description}*\n\n`;
    md += '| Field | Type | Description |\n';
    md += '|---|---|---|\n';
    
    const sortedFields = model.fields.sort((a, b) => {
        const score = (name) => {
            if (name === 'identity') return 1;
            if (name === 'origin') return 2;
            if (name === 'status') return 3;
            if (name === 'lineage') return 4;
            if (name === 'attachments') return 5;
            if (name.startsWith('data')) return 10;
            return 20;
        };
        const sa = score(a.name);
        const sb = score(b.name);
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name);
    });

    for (const field of sortedFields) {
      md += `| \`${field.name}\` | ${field.type} | ${field.description} |\n`;
    }
    md += '\n';
  }
  return md;
}

// Execution
if (import.meta.url === `file://${process.argv[1]}`) {
  extractDataModels().then(models => {
    const md = generateMarkdown(models);
    fs.writeFileSync(path.resolve(process.cwd(), 'server/DATA_MODEL.md'), md);
    console.log('✓ Successfully updated server/DATA_MODEL.md');
  }).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}