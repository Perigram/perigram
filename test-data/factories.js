/**
 * Mock Data Factories for UI Lab - v24 Standardized
 */
import { ObjectId } from 'bson';

const createStatusBlock = (state, userId = 'user-123', meta = {}) => ({
  state,
  userId,
  timestamp: new Date(),
  metadata: meta,
  eventId: new ObjectId()
});

export function createMockProject(overrides = {}) {
  const origin = createStatusBlock('DRAFT');
  return {
    _id: new ObjectId(),
    identity: { slug: 'mock-project', name: 'Downtown Complex' },
    origin,
    status: origin,
    lineage: { organizationId: new ObjectId() },
    summary: { totalArea: 150.5, progress: 45, queueCount: 3 },
    ...overrides
  };
}

export function createMockQueue(overrides = {}) {
  const origin = createStatusBlock('PENDING');
  return {
    _id: new ObjectId(),
    identity: { name: 'Morning Production Run', queueNumber: 1 },
    origin,
    status: origin,
    lineage: { organizationId: new ObjectId(), projectId: new ObjectId() },
    job: {
      items: [{ designId: new ObjectId(), quantity: 10, parameters: { A: 1200, B: 400 } }],
      materialPool: [{ type: 'PILE', id: new ObjectId() }]
    },
    ...overrides
  };
}

export function createMockSheet(overrides = {}) {
  const origin = createStatusBlock('AVAILABLE');
  return {
    _id: new ObjectId(),
    identity: { serial: 'SH-2025-001' },
    origin,
    status: origin,
    lineage: { 
      organizationId: new ObjectId(), 
      warehouseId: new ObjectId(), 
      pileId: new ObjectId(),
      queueId: new ObjectId(),
      runId: new ObjectId()
    },
    specs: { width: 2000, length: 1000, area: 2.0 },
    ...overrides
  };
}

export function createMockPile(overrides = {}) {
  const origin = createStatusBlock('STOCKED');
  return {
    _id: new ObjectId(),
    identity: { name: 'Alucobond Silver', serial: 'P-101' },
    origin,
    status: origin,
    lineage: { organizationId: new ObjectId(), warehouseId: new ObjectId(), catalogId: new ObjectId() },
    specs: { sheetThickness: 4, foilThickness: 0.5, width: 3000, height: 1500 },
    stock: { total: 100, used: 25 },
    ...overrides
  };
}

export function createMockCatalog(overrides = {}) {
  return {
    _id: new ObjectId(),
    identity: { name: 'Standard Metals' },
    material: 'ALUMINUM',
    pricing: { pricePerSqm: 45, currency: 'USD' },
    options: { sheetThicknesses: [3, 4, 6], foilThicknesses: [0.3, 0.5] },
    ...overrides
  };
}

export function createMockStatistics() {
  return {
    sheetsUsed: 12,
    totalAreaUsed: 45.5,
    utilizationRate: 87.4,
    totalCost: 15678.90
  };
}

export function createMockHistory(statuses = ['DRAFT', 'ACTIVE', 'CLOSED']) {
  return statuses.map((s, i) => ({
    _id: new ObjectId(),
    targetId: new ObjectId(),
    targetType: 'Project',
    toState: s,
    timestamp: new Date(Date.now() - (statuses.length - i) * 3600000),
    status: createStatusBlock(s, 'user-123', { note: `Step ${i+1}` })
  }));
}