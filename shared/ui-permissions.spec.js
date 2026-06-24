import { describe, it, expect } from 'vitest';
import { PERMISSION_TEMPLATES } from './permission-templates.js';
import { hasPermissionGrant } from './access-control.js';
import { resolveUiPermission } from './ui-permissions.js';

describe('UI Permission Matrix', () => {
    describe('system data defaults', () => {
        it('does not grant catalogue permissions through role presets', () => {
            for (const permissions of Object.values(PERMISSION_TEMPLATES)) {
                expect(hasPermissionGrant({ permissions, feature: 'materials', level: 'read' })).toBe(false);
                expect(hasPermissionGrant({ permissions, feature: 'layer_standards', level: 'read' })).toBe(false);
            }
        });
    });

    describe('manufacturer preset grants', () => {
        const permissions = PERMISSION_TEMPLATES.ManufacturerAdmin;

        it('should be able to manage own catalogs', () => {
            expect(resolveUiPermission(null, 'catalogs', 'create', { permissions })).toBe(true);
            expect(resolveUiPermission(null, 'catalogs', 'edit', { permissions })).toBe(true);
        });

        it('should NOT be able to create requisitions (Contractor job)', () => {
            expect(resolveUiPermission(null, 'requisitions', 'create', { permissions })).toBe(false);
        });

        it('should be able to fulfill requisitions', () => {
            expect(resolveUiPermission(null, 'requisitions', 'fulfill', { permissions })).toBe(true);
        });

        it('should be able to view contractor warehouses (for shipping)', () => {
            expect(resolveUiPermission(null, 'warehouses', 'view_contractors', { permissions })).toBe(true);
        });
    });

    describe('contractor preset grants', () => {
        const permissions = PERMISSION_TEMPLATES.ContractorAdmin;

        it('should be able to create requisitions', () => {
            expect(resolveUiPermission(null, 'requisitions', 'create', { permissions })).toBe(true);
        });

        it('should be able to view all catalogs (to buy)', () => {
            expect(resolveUiPermission(null, 'catalogs', 'view_all', { permissions })).toBe(true);
        });

        it('should NOT be able to create catalogs', () => {
            expect(resolveUiPermission(null, 'catalogs', 'create', { permissions })).toBe(false);
        });
    });

    describe('explicit grants', () => {
        it('should allow access from decomposed permissions without a role bypass', () => {
            expect(resolveUiPermission(null, 'config_bot', 'admin', {
                permissions: { config_bot: 'admin' }
            })).toBe(true);
            expect(resolveUiPermission(null, 'anything', 'random', {
                permissions: { config_bot: 'admin' }
            })).toBe(false);
        });

        it('should apply logical rule filters to otherwise valid grants', () => {
            const permissions = {
                projects: {
                    level: 'write',
                    rule: {
                        all: [
                            { fact: 'lineage.projectId', equals: 'project-a' },
                            { fact: 'status.primary', equals: 'ACTIVE' }
                        ]
                    }
                }
            };
            expect(hasPermissionGrant({
                permissions,
                feature: 'projects',
                level: 'write',
                entityType: 'project',
                entity: { lineage: { projectId: 'project-a' }, status: { state: { primary: 'ACTIVE' } } }
            })).toBe(true);
            expect(hasPermissionGrant({
                permissions,
                feature: 'projects',
                level: 'write',
                entityType: 'project',
                entity: { lineage: { projectId: 'project-b' }, status: { state: { primary: 'ACTIVE' } } }
            })).toBe(false);
        });

        it('should support any/not rule gates for transition grants', () => {
            const permissions = {
                projects: {
                    level: 'admin',
                    rule: {
                        all: [
                            { fact: 'transition.to', in: ['READY', 'DONE'] },
                            { not: { fact: 'action', equals: 'delete' } }
                        ]
                    }
                }
            };
            expect(hasPermissionGrant({ permissions, feature: 'projects', action: 'admin', transition: { from: 'DRAFT', to: 'READY' } })).toBe(true);
            expect(hasPermissionGrant({ permissions, feature: 'projects', action: 'delete', transition: { from: 'DRAFT', to: 'READY' } })).toBe(false);
            expect(hasPermissionGrant({ permissions, feature: 'projects', action: 'admin', transition: { from: 'DRAFT', to: 'ARCHIVED' } })).toBe(false);
        });

        it('should evaluate traits on resolved lineage entities', () => {
            const permissions = {
                queues: {
                    level: 'write',
                    rule: {
                        all: [
                            { fact: 'lineage.project.status.primary', equals: 'ACTIVE' },
                            { not: { fact: 'lineage.project.type', equals: 'archived' } }
                        ]
                    }
                }
            };
            const queue = { lineage: { projectId: 'project-a' }, status: { state: { primary: 'READY' } } };
            expect(hasPermissionGrant({
                permissions,
                feature: 'queues',
                level: 'write',
                entityType: 'queue',
                entity: queue,
                context: { lineageEntities: { project: { _id: 'project-a', data: { type: 'production' }, status: { state: { primary: 'ACTIVE' } } } } }
            })).toBe(true);
            expect(hasPermissionGrant({
                permissions,
                feature: 'queues',
                level: 'write',
                entityType: 'queue',
                entity: queue,
                context: { lineageEntities: { project: { _id: 'project-a', data: { type: 'production' }, status: { state: { primary: 'CLOSED' } } } } }
            })).toBe(false);
        });
    });

    describe('missing grants', () => {
        it('should deny everything', () => {
            expect(resolveUiPermission(null, 'catalogs', 'create', { permissions: {} })).toBe(false);
            expect(resolveUiPermission(null, 'catalogs', 'create')).toBe(false);
        });
    });
});
