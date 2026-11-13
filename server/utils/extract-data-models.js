
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

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function extractObjectBodies(source, patterns) {
  const bodies = [];

  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      const openIndex = source.indexOf('{', match.index);
      if (openIndex === -1) continue;
      const closeIndex = findMatchingBrace(source, openIndex);
      if (closeIndex === -1) continue;
      bodies.push(source.slice(openIndex + 1, closeIndex));
      pattern.lastIndex = closeIndex + 1;
    }
  }

  return bodies;
}

function splitTopLevelProperties(objectBody) {
  const props = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = 0; i < objectBody.length; i++) {
    const char = objectBody[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if ('{[('.includes(char)) depth++;
    if ('}])'.includes(char)) depth--;

    if (char === ',' && depth === 0) {
      props.push(objectBody.slice(start, i).trim());
      start = i + 1;
    }
  }

  const last = objectBody.slice(start).trim();
  if (last) props.push(last);
  return props;
}

function extractPropertyName(prop) {
  if (!prop || prop.startsWith('...')) return null;
  const match = prop.match(/^([A-Za-z_$][\w$]*)\s*(?::|=|$)/);
  return match?.[1] || null;
}

function createField(name, source) {
  const issues = [];
  if (/[^A-Za-z0-9_.]/.test(name)) issues.push('invalid-name');
  if (name.includes('\n')) issues.push('multiline-name');
  if (/\boptional|required|parent\b/i.test(name)) issues.push('prose-in-name');
  if (name.includes('//')) issues.push('comment-captured');
  if (['serial', 'reference'].includes(name)) issues.push('identity-duplicate');
  if (name.endsWith('Id') || name.endsWith('Ids')) issues.push('relationship-candidate');
  if (['specs', 'stock', 'geometry', 'options', 'pricing', 'settings', 'visuals', 'job', 'results', 'layoutData', 'attachment', 'attachments'].includes(name)) {
    issues.push('complex-shape');
  }

  return {
    type: inferType(name),
    description: `${camelToWords(name)} field`,
    source,
    issues
  };
}

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
  content = stripComments(content);

  // Strategy 1: Explicit 'data' or 'params' object construction
  // Matches: data: { key1, key2: val }, params: { key1 }, or data: createData({ key1 })
  const objectBodies = extractObjectBodies(content, [
    /(?:data|params)\s*:\s*createData\(\s*\{/g,
    /(?:data|params)\s*:\s*\{/g
  ]);
  for (const inner of objectBodies) {
      const props = splitTopLevelProperties(inner).map(extractPropertyName);
      for (const p of props) {
          if (!p) continue;
          if (['identity', 'lineage', 'status', 'origin', 'attachments', 'metadata', 'fileId', 'name', 'definition'].includes(p)) continue;
          dataFields.set(`data.${p}`, createField(p, 'object-literal'));
      }
  }

  // Strategy 2: Class Constructor Assignment (this.data = { ... })
  const classBodies = extractObjectBodies(content, [/this\.data\s*=\s*\{/g]);
  for (const inner of classBodies) {
      const props = splitTopLevelProperties(inner).map(extractPropertyName);
      for (const p of props) {
          if (!p) continue;
          dataFields.set(`data.${p}`, createField(p, 'class-assignment'));
      }
  }

  // Strategy 3: Dot notation assignment (data.field = val)
  // Matches: data.someField = ... or this.data.someField = ...
  const dotAssignRegex = /(?:this\.|^|\s)data\.([\w]+)\s*=/g;
  let match;
  while ((match = dotAssignRegex.exec(content)) !== null) {
      const p = match[1];
      if (['metadata'].includes(p)) continue;
      dataFields.set(`data.${p}`, createField(p, 'dot-assignment'));
  }

  return Array.from(dataFields.entries()).map(([name, info]) => ({
    name,
    type: info.type,
    description: info.description,
    source: info.source,
    issues: info.issues
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
    const collectionMatch = repoContent.match(/const COLLECTION = ['"]([^'"]+)['"]/);
    if (!collectionMatch) continue;
    const collection = collectionMatch[1];

    const entitySpecificFields = extractDataFields(featurePath);
    
    // Read files again for lineage (simple approach)
    let fullContent = repoContent;
    ['service.js', 'model.js'].forEach(f => {
        const p = path.join(featurePath, f);
        if (fs.existsSync(p)) fullContent += fs.readFileSync(p, 'utf-8');
    });

    const lineageFields = [];
    const lineageRegex = /lineage\s*:\s*\{([^}]+)\}/g;
    let lmatch;
    while ((lmatch = lineageRegex.exec(fullContent)) !== null) {
        const inner = lmatch[1];
        const props = inner.split(',').map(p => p.split(':')[0].trim());
        for (const p of props) {
            if (!p || p.startsWith('...')) continue;
            if (lineageFields.find(f => f.name === `lineage.${p}`)) continue;
            lineageFields.push({ name: `lineage.${p}`, type: 'ObjectId | string', description: `Lineage link to ${p}`, source: 'lineage-literal', issues: [] });
        }
    }

    const allFields = [...STANDARD_BLOCKS, ...lineageFields, ...entitySpecificFields];
    const issues = allFields.flatMap(field => (field.issues || []).map(issue => ({ field: field.name, issue })));

    models.push({
      collection,
      feature,
      description: `${camelToWords(feature).replace(/^\w/, c => c.toUpperCase())} - manages ${collection.replace(/_/g, ' ')}`,
      fields: allFields,
      issues
    });
  }
  
  return models.sort((a, b) => a.collection.localeCompare(b.collection));
}

/**
 * Generate Markdown
 */
