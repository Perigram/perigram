/**
 * Mock Data Factories for UI Lab
 * Enterprise pattern: Reusable factory functions for consistent test data
 */

import { ObjectId } from 'bson';

/**
 * Creates a realistic project object
 */
export function createMockProject(overrides = {}) {
  return {
    _id: new ObjectId(),
    slug: 'mock-project',
    name: 'Downtown Complex',
    customer: 'Acme Corporation',
    organizationId: new ObjectId(),
    queueCount: 3,
    resultCount: 12,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic queue object
 */
export function createMockQueue(overrides = {}) {
  return {
    _id: new ObjectId(),
    queueNumber: 1,
    name: 'Morning Production Run',
    projectSlug: 'mock-project',
    status: 'READY',
    material: 'Aluminum',
    thickness: 3,
    ownerId: 'user-123',
    organizationId: new ObjectId(),
    entries: [
      {
        entryId: 'E1',
        cassetteTemplateId: new ObjectId().toString(),
        quantity: 10,
        dimensions: { width: 500, height: 300 }
      }
    ],
    runs: [],
    statusHistory: [
      {
        status: 'DRAFT',
        timestamp: new Date('2025-01-20'),
        userId: 'user-123',
        note: 'Queue created'
      }
    ],
    createdAt: new Date('2025-01-20'),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic sheet object
 */
export function createMockSheet(overrides = {}) {
  return {
    _id: new ObjectId(),
    sheetNumber: 'SHT-2025-001',
    sheetId: 'SHT-001',
    status: 'READY',
    material: 'Aluminum',
    color: 'Silver',
    thickness: 3,
    width: 2000,
    height: 1000,
    area: 2.0,
    colorFallback: '#C0C0C0',
    batchId: new ObjectId(),
    warehouseId: new ObjectId(),
    organizationId: new ObjectId(),
    statusHistory: [],
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic material batch object
 */
export function createMockBatch(overrides = {}) {
  return {
    _id: new ObjectId(),
    batchNumber: 'B-2025-101',
    status: 'PENDING',
    receiptId: 'REC-5050',
    warehouseId: new ObjectId(),
    organizationId: new ObjectId(),
    piles: [
      {
        pileNumber: 1,
        material: 'Aluminum',
        color: 'Silver',
        colorFallback: '#C0C0C0',
        thickness: 3,
        width: 2000,
        height: 1000,
        quantity: 50
      }
    ],
    totalSheets: 0,
    statusHistory: [
      {
        status: 'PENDING',
        timestamp: new Date(),
        userId: 'user-123',
        note: 'Batch received'
      }
    ],
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic warehouse object
 */
export function createMockWarehouse(overrides = {}) {
  return {
    _id: new ObjectId(),
    name: 'Main Warehouse',
    address: '123 Industrial Blvd, Factory District',
    organizationId: new ObjectId(),
    totalBatches: 45,
    totalSheets: 230,
    totalRemnants: 89,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic requisition object
 */
export function createMockRequisition(overrides = {}) {
  return {
    _id: new ObjectId(),
    requisitionNumber: 'REQ-2025-001',
    status: 'PENDING',
    contractorId: new ObjectId(),
    manufacturerId: new ObjectId(),
    items: [
      {
        catalogId: new ObjectId(),
        colorId: new ObjectId(),
        material: 'Aluminum',
        color: 'Silver',
        sheetThickness: 3,
        thickness: 3,
        width: 2000,
        length: 1000,
        quantity: 10,
        pricePerSheet: 125.05,
        totalPrice: 1250.50
      }
    ],
    totalAmount: 1250.50,
    statusHistory: [
      {
        status: 'PENDING',
        timestamp: new Date(),
        userId: 'user-123',
        note: 'Requisition submitted'
      }
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic remnant object
 */
export function createMockRemnant(overrides = {}) {
  return {
    _id: new ObjectId(),
    remnantNumber: 'REM-2025-001',
    remnantId: 'REM-001',
    status: 'in_stock',
    sheetId: new ObjectId(),
    warehouseId: new ObjectId(),
    material: 'Aluminum',
    color: 'Silver',
    thickness: 3,
    width: 800,
    height: 600,
    area: 0.48,
    isReusable: true,
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Creates a realistic catalog object
 */
export function createMockCatalog(overrides = {}) {
  return {
    _id: new ObjectId(),
    name: 'Standard Metals Catalog',
    description: 'Standard metal colors and finishes for architectural panels',
    organizationId: new ObjectId(),
    sheetTypes: [
      { material: 'Aluminum', color: 'Silver', colorFallback: '#C0C0C0', thickness: 3 },
      { material: 'Aluminum', color: 'Black', colorFallback: '#1a1a1a', thickness: 3 },
      { material: 'Aluminum', color: 'White', colorFallback: '#f5f5f5', thickness: 3 },
      { material: 'Steel', color: 'Galvanized', colorFallback: '#e0e0e0', thickness: 2 },
      { material: 'Copper', color: 'Natural', colorFallback: '#b87333', thickness: 1.5 }
    ],
    createdAt: new Date('2024-06-01'),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Creates realistic statistics
 */
export function createMockStatistics(overrides = {}) {
  return {
    sheetsUsed: 12,
    totalAreaUsed: 45.5,
    utilizationRate: 87.4,
    totalCost: 15678.90,
    ...overrides
  };
}

/**
 * Creates realistic history timeline
 */
export function createMockHistory(statuses = ['DRAFT', 'READY', 'PROCESSING', 'COMPLETED']) {
  const baseDate = new Date('2025-01-20T10:00:00');
  return statuses.map((status, index) => ({
    status,
    timestamp: new Date(baseDate.getTime() + index * 24 * 60 * 60 * 1000),
    userId: index === 0 ? 'user-123' : (index % 2 === 0 ? 'system' : 'user-456'),
    note: getStatusNote(status)
  }));
}

function getStatusNote(status) {
  const notes = {
    'DRAFT': 'Created',
    'READY': 'Approved for processing',
    'PROCESSING': 'Started nesting operation',
    'COMPLETED': 'Nesting completed successfully',
    'ERROR': 'Processing failed',
    'CUT': 'Marked as cut'
  };
  return notes[status] || `Status changed to ${status}`;
}

/**
 * Creates realistic material specifications
 */
export function createMockMaterial(overrides = {}) {
  return {
    material: 'Aluminum',
    thickness: 3,
    color: 'Silver',
    colorFallback: '#C0C0C0',
    width: 2000,
    height: 1000,
    finish: 'Brushed',
    grade: '5052-H32',
    ...overrides
  };
}

/**
 * Creates a list of recent projects
 */
export function createMockProjectsList(count = 3) {
  const projects = [];
  for (let i = 0; i < count; i++) {
    projects.push({
      slug: `proj-${i + 1}`,
      name: ['Downtown Complex', 'Riverside Facade', 'Airport Terminal', 'Office Tower'][i] || `Project ${i + 1}`,
      createdAt: new Date(Date.now() - (count - i) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      results: Math.floor(Math.random() * 20)
    });
  }
  return projects;
}
