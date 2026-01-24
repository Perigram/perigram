/**
 * Procedurally extract data models from repository files
 * Used by UI Lab to visualize backend structure
 */

import fs from 'fs';
import path from 'path';

// Resolve paths correctly in Nuxt server context
function getFeaturesDir() {
  const possiblePaths = [
    path.resolve(process.cwd(), 'server/features'),
    path.resolve('/home/suo/cutkit-demo/server/features'),
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  
  throw new Error(`Could not find features directory. Tried: ${possiblePaths.join(', ')}`);
}

const FEATURES_DIR = getFeaturesDir();

/**
 * Extract collection name from repository file
 */
function extractCollectionName(content) {
  const match = content.match(/const COLLECTION = ['"]([^'"]+)['"]/);
  return match ? match[1] : null;
}

/**
 * Read service file for a feature to extract schema from create operations
 */
function readServiceFile(featurePath) {
  const serviceFile = path.join(featurePath, 'service.js');
  if (fs.existsSync(serviceFile)) {
    return fs.readFileSync(serviceFile, 'utf-8');
  }
  return null;
}

/**
 * Extract all fields from various sources in repository, service, and test files
 */
function extractFields(repoContent, serviceContent, specContent) {
  const fields = new Map(); // Use Map to store field -> type/description
  
  // 1. Extract from insertOne/insertMany calls in repository
  const insertPattern = /insertOne\s*\(\s*\{([^}]+)\}/gs;
  let match;
  
  while ((match = insertPattern.exec(repoContent)) !== null) {
    const insertContent = match[1];
    extractFieldsFromObject(insertContent, fields);
  }
  
  // 2. Extract from $set patterns in updates
  const updatePattern = /\$set:\s*\{([^}]+)\}/g;
  while ((match = updatePattern.exec(repoContent)) !== null) {
    extractFieldsFromObject(match[1], fields);
  }
  
  // 3. Extract from service layer - look for object creations
  if (serviceContent) {
    // Find objects being pushed to arrays or created
    const servicePushPattern = /\.push\s*\(\s*\{[\s\S]{1,2000}?\}\s*\)/g;
    while ((match = servicePushPattern.exec(serviceContent)) !== null) {
      extractFieldsFromObject(match[0], fields, true);
    }
    
    // Find direct object returns/assignments
    const serviceObjectPattern = /(?:const|let|var)\s+\w+\s*=\s*\{[\s\S]{1,1000}?\};/g;
    while ((match = serviceObjectPattern.exec(serviceContent)) !== null) {
      extractFieldsFromObject(match[0], fields, true);
    }
    
    // Find repository creation calls: repository.create({ ... })
    const repoCreatePattern = /repository\.(?:create|insertMany|updateById)\s*\(\s*(?:[^,]+,\s*)?\{([\s\S]{1,1000}?)\}/g;
    while ((match = repoCreatePattern.exec(serviceContent)) !== null) {
      extractFieldsFromObject(match[1], fields, true);
    }
    
    // Find return statements with objects
    const returnPattern = /return\s+\{[\s\S]{1,500}?\}/g;
    while ((match = returnPattern.exec(serviceContent)) !== null) {
      extractFieldsFromObject(match[0], fields, true);
    }
  }
  
  // 4. Extract from findOne/find query projections
  const findPattern = /find(?:One)?\([^)]*\)/g;
  while ((match = findPattern.exec(repoContent)) !== null) {
    extractFieldsFromObject(match[0], fields);
  }
  
  // 5. Extract from test/spec files (most complete!)
  if (specContent) {
    // Find all object literals in insertOne calls in tests
    const testInsertPattern = /insertOne\s*\(\s*\{[\s\S]{1,2000}?\}\s*\)/g;
    while ((match = testInsertPattern.exec(specContent)) !== null) {
      extractFieldsFromObject(match[0], fields, true);
    }
    
    // Find mock data objects
    const mockPattern = /const\s+mock\w+\s*=\s*\{[\s\S]{1,1000}?\};/g;
    while ((match = mockPattern.exec(specContent)) !== null) {
      extractFieldsFromObject(match[0], fields, true);
    }
  }
  
  return Array.from(fields.entries()).map(([name, info]) => ({
    name,
    type: info.type,
    description: info.description,
    example: info.example
  }));
}

/**
 * Extract field definitions from object string
 */
function extractFieldsFromObject(objString, fields, includeValues = false) {
  // Remove single line comments before processing
  const cleanObjString = objString.replace(/\/\/.*$/gm, '');
  
  // Match field: value patterns
  const fieldPattern = /(\w+)\s*:\s*([^,\n]+)/g;
  let match;
  
  while ((match = fieldPattern.exec(cleanObjString)) !== null) {
    const fieldName = match[1];
    const fieldValue = match[2].trim();
    
    // Skip common keywords, spreads and generic API return fields
    if (['session', 'options', 'sort', 'limit', 'skip', 'success', 'id'].includes(fieldName)) continue;
    if (fieldName.startsWith('...')) continue;
    
    if (!fields.has(fieldName)) {
      const type = inferFieldType(fieldName, fieldValue);
      fields.set(fieldName, {
        type,
        description: getFieldDescription(fieldName, type),
        example: includeValues ? cleanExample(fieldValue) : null
      });
    }
  }
}

/**
 * Infer field type from name and value
 */
function inferFieldType(fieldName, fieldValue) {
  // From value patterns
  if (fieldValue.includes('ObjectId') || fieldValue.includes('new ObjectId')) return 'ObjectId';
  if (fieldValue.includes('new Date')) return 'Date';
  if (fieldValue.match(/^\d+$/)) return 'Number';
  if (fieldValue.match(/^['"`]/)) return 'String';
  if (fieldValue === 'true' || fieldValue === 'false') return 'Boolean';
  if (fieldValue.startsWith('[')) return 'Array';
  if (fieldValue.startsWith('{')) return 'Object';
  
  // From field name patterns
  if (fieldName === '_id' || fieldName.endsWith('Id')) return 'ObjectId';
  if (fieldName.includes('Date') || fieldName === 'createdAt' || fieldName === 'updatedAt') return 'Date';
  if (fieldName.includes('Count') || fieldName.includes('Number') || fieldName.includes('total') || fieldName.includes('amount') || fieldName.includes('price')) return 'Number';
  if (fieldName.startsWith('is') || fieldName.startsWith('has') || fieldName.includes('Enabled')) return 'Boolean';
  if (fieldName.endsWith('s') && !fieldName.endsWith('ss') && !fieldName.endsWith('Status')) return 'Array';
  if (fieldName === 'status' || fieldName === 'type' || fieldName === 'role') return 'String (enum)';
  
  return 'String';
}

/**
 * Clean example value for display
 */
function cleanExample(value) {
  value = value.replace(/new ObjectId\([^)]*\)/g, 'ObjectId()');
  value = value.replace(/new Date\([^)]*\)/g, 'Date()');
  if (value.length > 50) value = value.substring(0, 47) + '...';
  return value;
}

/**
 * Extract relationships from queries and references
 */
function extractRelationships(content, collectionName) {
  const relationships = new Set();
  
  // Look for Id fields (foreignId patterns)
  const idPattern = /(\w+)Id['":\s]/g;
  let match;
  
  while ((match = idPattern.exec(content)) !== null) {
    const relatedEntity = match[1];
    if (['inserted', 'updated', 'deleted', 'modified', 'matched'].includes(relatedEntity)) continue;
    if (relatedEntity.length < 3) continue;
    relationships.add(relatedEntity);
  }
  
  // Look for collection references in queries
  const collectionPattern = /collection\(['"]([^'"]+)['"]\)/g;
  while ((match = collectionPattern.exec(content)) !== null) {
    const otherCollection = match[1];
    if (otherCollection === collectionName || otherCollection === 'COLLECTION') continue;
    relationships.add(otherCollection);
  }
  
  return Array.from(relationships).filter(r => r !== 'Object' && r !== 'toObject');
}

/**
 * Get description from field name
 */
function getFieldDescription(fieldName, type) {
  const descriptions = {
    '_id': 'Unique document identifier',
    'createdAt': 'Creation timestamp',
    'updatedAt': 'Last update timestamp',
    'ownerId': 'Owner user ID (OAuth string)',
    'userId': 'User ID (OAuth string)',
    'organizationId': 'Organization reference',
    'status': 'Current status',
    'statusHistory': 'Status change history',
    'name': 'Display name',
    'description': 'Description text',
    'slug': 'URL-friendly identifier',
    'email': 'Email address',
    'role': 'User role',
    'permissions': 'Access permissions',
    'metadata': 'Additional metadata'
  };
  
  if (descriptions[fieldName]) return descriptions[fieldName];
  
  // Generate from field name
  const words = fieldName.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return `${words} field`;
}

/**
 * Read test/spec file for a feature
 */
function readSpecFile(featurePath) {
  const specFiles = [
    path.join(featurePath, `${path.basename(featurePath)}.spec.js`),
    path.join(featurePath, `${path.basename(featurePath).replace(/-/g, '-')}.spec.js`),
  ];
  
  for (const specFile of specFiles) {
    if (fs.existsSync(specFile)) {
      return fs.readFileSync(specFile, 'utf-8');
    }
  }
  
  // Try alternative patterns
  const files = fs.readdirSync(featurePath);
  const specFile = files.find(f => f.endsWith('.spec.js') || f.endsWith('.test.js'));
  if (specFile) {
    return fs.readFileSync(path.join(featurePath, specFile), 'utf-8');
  }
  
  return null;
}

/**
 * Scan all repository files and extract models
 */
export async function extractDataModels() {
  const models = [];
  
  const features = fs.readdirSync(FEATURES_DIR);
  
  for (const feature of features) {
    const featurePath = path.join(FEATURES_DIR, feature);
    const repoPath = path.join(featurePath, 'repository.js');
    
    if (!fs.existsSync(repoPath)) continue;
    
    const repoContent = fs.readFileSync(repoPath, 'utf-8');
    const serviceContent = readServiceFile(featurePath);
    const specContent = readSpecFile(featurePath);
    const collectionName = extractCollectionName(repoContent);
    
    if (!collectionName || collectionName === 'collection_name') continue;
    
    const fields = extractFields(repoContent, serviceContent, specContent);
    const relationships = extractRelationships(repoContent, collectionName);
    
    // Generate better description
    const description = feature
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    
    models.push({
      collection: collectionName,
      feature,
      description: `${description} - manages ${collectionName.replace(/_/g, ' ')}`,
      fields: fields.sort((a, b) => {
        // Sort: _id first, then createdAt/updatedAt last, rest alphabetically
        if (a.name === '_id') return -1;
        if (b.name === '_id') return 1;
        if (a.name.includes('At') && !b.name.includes('At')) return 1;
        if (!a.name.includes('At') && b.name.includes('At')) return -1;
        return a.name.localeCompare(b.name);
      }),
      relationships: relationships.sort(),
      fieldCount: fields.length
    });
  }
  
  return models.sort((a, b) => a.collection.localeCompare(b.collection));
}

/**
 * Generate relationship diagram
 */
export function generateRelationshipDiagram(models) {
  const lines = ['=== Entity Relationship Diagram ===\n'];
  
  // Group by main entities
  const mainEntities = models.filter(m => 
    ['projects', 'organizations', 'warehouses', 'requisitions'].includes(m.collection)
  );
  
  for (const entity of mainEntities) {
    lines.push(`${entity.collection.toUpperCase()}`);
    lines.push(`  Collection: ${entity.collection}`);
    lines.push(`  Fields: ${entity.fieldCount}`);
    
    if (entity.relationships.length > 0) {
      lines.push(`  Related to:`);
      for (const rel of entity.relationships.slice(0, 5)) {
        const relModel = models.find(m => 
          m.collection === rel || 
          m.collection.replace(/_/g, '-') === rel ||
          m.feature === rel
        );
        lines.push(`    → ${rel}${relModel ? ` (${relModel.collection})` : ''}`);
      }
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  extractDataModels().then(models => {
    console.log(JSON.stringify(models, null, 2));
  });
}
