import { describe, it, expect, beforeAll } from 'vitest';
import { ObjectId } from 'mongodb';

// Mocking some of the context if needed, but here we test the actual logic integration
// We'll focus on verifying that the blocks are correctly applied in services

describe('V24 Compliance Integration Check', () => {
  it('should verify blocks.js inheritLineage robustness', async () => {
    const { inheritLineage } = await import('../server/utils/blocks.js');
    
    // Test with string ID
    const parentStr = { _id: '6795f7c3562473335500808b', lineage: { orgId: new ObjectId('6795f7c3562473335500808a') } };
    const lineageStr = inheritLineage(parentStr, 'project');
    expect(lineageStr.projectId).toBeInstanceOf(ObjectId);
    expect(lineageStr.projectId.toString()).toBe('6795f7c3562473335500808b');
    expect(lineageStr.orgId.toString()).toBe('6795f7c3562473335500808a');

    // Test with ObjectId
    const parentObj = { _id: new ObjectId('6795f7c3562473335500808c') };
    const lineageObj = inheritLineage(parentObj, 'organization');
    expect(lineageObj.organizationId.toString()).toBe('6795f7c3562473335500808c');
  });

  it('should verify mapLineageQuery centralized utility', async () => {
    const { mapLineageQuery } = await import('../server/utils/query.js');
    
    const query = {
        catalogId: '6795f7c3562473335500808a',
        'lineage.projectId': '6795f7c3562473335500808b', // already compliant
        name: 'Test'
    };
    
    const mapped = mapLineageQuery(query);
    
    expect(mapped['lineage.catalogId']).toBeInstanceOf(ObjectId);
    expect(mapped['lineage.catalogId'].toString()).toBe('6795f7c3562473335500808a');
    expect(mapped['lineage.projectId'].toString()).toBe('6795f7c3562473335500808b');
    expect(mapped.name).toBe('Test');
    expect(mapped.catalogId).toBeUndefined(); // removed
  });
});
