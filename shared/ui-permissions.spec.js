import { describe, it, expect } from 'vitest';
import { resolveUiPermission } from './ui-permissions.js';

describe('UI Permission Matrix', () => {
    describe('ManufacturerAdmin', () => {
        const role = 'ManufacturerAdmin';

        it('should be able to manage own catalogs', () => {
            expect(resolveUiPermission(role, 'catalogs', 'create')).toBe(true);
            expect(resolveUiPermission(role, 'catalogs', 'edit')).toBe(true);
        });

        it('should NOT be able to create requisitions (Contractor job)', () => {
            expect(resolveUiPermission(role, 'requisitions', 'create')).toBe(false);
        });

        it('should be able to fulfill requisitions', () => {
            expect(resolveUiPermission(role, 'requisitions', 'fulfill')).toBe(true);
        });

        it('should be able to view contractor warehouses (for shipping)', () => {
            expect(resolveUiPermission(role, 'warehouses', 'view_contractors')).toBe(true);
        });
    });

    describe('ContractorAdmin', () => {
        const role = 'ContractorAdmin';

        it('should be able to create requisitions', () => {
            expect(resolveUiPermission(role, 'requisitions', 'create')).toBe(true);
        });

        it('should be able to view all catalogs (to buy)', () => {
            expect(resolveUiPermission(role, 'catalogs', 'view_all')).toBe(true);
        });

        it('should NOT be able to create catalogs', () => {
            expect(resolveUiPermission(role, 'catalogs', 'create')).toBe(false);
        });
    });

    describe('SuperAdmin', () => {
        it('should have access to everything', () => {
            expect(resolveUiPermission('SuperAdmin', 'catalogs', 'create')).toBe(true);
            expect(resolveUiPermission('SuperAdmin', 'anything', 'random')).toBe(true);
        });
    });

    describe('Unknown Role', () => {
        it('should deny everything', () => {
            expect(resolveUiPermission('Hacker', 'catalogs', 'create')).toBe(false);
            expect(resolveUiPermission(null, 'catalogs', 'create')).toBe(false);
        });
    });
});
