/**
 * Status Types Configuration
 * Defines valid statuses for each entity type
 */

export const STATUS_TYPES = {
  // Cassette lifecycle
  cassette: ['draft', 'active', 'archived'],
  cassette_design: ['draft', 'validated', 'nested', 'archived'],
  cassette_instance: ['nested', 'cut', 'delivered', 'archived'],
  
  // Sheet lifecycle
  sheet_design: ['draft', 'ready', 'processing', 'completed', 'error', 'archived'],
  sheet_instance: ['in_stock', 'in_cutting', 'milled', 'cut', 'delivered', 'scrapped'],
  
  // Production
  queue: ['draft', 'ready', 'processing', 'completed', 'cancelled', 'error', 'CUT'],
  batch: ['pending', 'active', 'completed', 'archived'],
  material_batch: ['requested', 'assembled', 'sent', 'arrived', 'in_stock', 'partially_used', 'used_up'],
  
  // Business entities
  project: ['draft', 'active', 'completed', 'cancelled', 'archived'],
  requisition: ['draft', 'sent', 'approved', 'rejected', 'in_fulfillment', 'fulfilled', 'canceled'],
  organization: ['active', 'inactive', 'suspended'],
  
  // Inventory
  remnant: ['in_stock', 'reserved', 'used', 'scrapped'],
  warehouse: ['active', 'inactive', 'full'],
  
  // System
  invitation: ['pending', 'accepted', 'expired', 'revoked'],
  catalog: ['draft', 'published', 'archived']
};

/**
 * Get valid statuses for an entity type
 */
export function getValidStatuses(entityType) {
  return STATUS_TYPES[entityType] || [];
}

/**
 * Validate if a status is valid for an entity type
 */
export function isValidStatus(entityType, status) {
  const validStatuses = getValidStatuses(entityType);
  return validStatuses.includes(status);
}

/**
 * Get default initial status for an entity type
 */
export function getDefaultStatus(entityType) {
  const statuses = getValidStatuses(entityType);
  return statuses[0] || 'draft';
}
