import { beforeEach, describe, expect, it, vi } from 'vitest';

// The headless seam's draft-overlay law, pinned: the tree's own
// declarations — authored this session or seeded from a stored draft
// that never applied — resolve as ports, so a field declares and wires
// in ONE session with no intermediate apply. Live defect 2026-10-17: an
// unapplied field's connect was refused with `Unknown port` until an
// activation posted it into the registry (the acceptance adapter already
// followed the overlay; the authoring seam did not).

vi.mock('../plugins/repository.js', () => ({
    listDisabledPacks: vi.fn(async () => []),
    enablePack: vi.fn(),
    disablePack: vi.fn(),
    listInstallsByOrganization: vi.fn(async () => []),
    listDeclarationsByOrganization: vi.fn(async () => []),
    findDeclarationByTypeId: vi.fn(async () => null),
    findInstallByConnectorToken: vi.fn(async () => null)
}));
vi.mock('../cts-types/service.js', async () => {
    const cts = await import('#packages/cts');
    const registry = cts.createTypeRegistry({ id: 'spec-cts' });
    for (const declaration of cts.frameworkTypes) registry.defineType(declaration);
    return { compileRegistryForOrganization: vi.fn(async () => registry) };
});
vi.mock('./repository.js', () => ({
    findById: vi.fn(async () => null),
    findActiveSetByOrganization: vi.fn(async () => []),
    insert: vi.fn(async doc => doc),
    updateById: vi.fn(async (_id, doc) => doc)
}));

import { createDefinitionAuthoring } from '@perigram/processes/authoring';
import { declarationOverlayDomain } from './compiler-adapter.js';
import { applyAuthoringSteps } from './service.js';

// The raw served projection: framework types only, no knowledge of the
// draft's in-tree declarations.
const RAW_DOMAIN = { entities: [], workflows: {}, fieldSchemas: {}, relations: [], commands: {} };

const BASE_STEPS = [
    { op: 'declareClass', id: 'clsTask', typeId: 'task', name: 'Task' },
    { op: 'declareField', id: 'fldTitle', ownerClassId: 'clsTask', name: 'title' },
    { op: 'wireDeclaration', from: 'fldTitle', to: 'clsTask', role: 'declares' },
    { op: 'drop', item: 'construct', id: 'nodeMake' },
    { op: 'wireDeclaration', from: 'clsTask', to: 'nodeMake', role: 'binds' },
    { op: 'drop', item: 'literal', id: 'nodeLit' },
    { op: 'connect', id: 'nodeLit', fromPort: 'data:value', to: 'nodeMake', toPort: 'data:fields.title' }
];

const CONNECT_ORG_FIELD = { op: 'connect', id: 'nodeLit', fromPort: 'data:value', to: 'nodeMake', toPort: 'data:fields.organization' };

beforeEach(() => {
    vi.clearAllMocks();
});

describe('headless authoring draft overlay', () => {
    it('wires a field declared in the same session — one pass, no intermediate apply', () => {
        const authoring = createDefinitionAuthoring(RAW_DOMAIN);
        applyAuthoringSteps(authoring, [
            ...BASE_STEPS,
            { op: 'declareField', id: 'fldOrg', ownerClassId: 'clsTask', name: 'organization' },
            { op: 'wireDeclaration', from: 'fldOrg', to: 'clsTask', role: 'declares' },
            CONNECT_ORG_FIELD
        ], RAW_DOMAIN);
        const edges = authoring.definition().graph.edges;
        expect(edges.some(edge => edge.target === 'nodeMake' && String(edge.targetHandle || '').includes('fields.organization'))).toBe(true);
    });

    it('a session without the overlay re-seat refuses the same connect', () => {
        // The base composes WITH the overlay (as the fixed seam does); the
        // refusal under test is the second session resolving ports against
        // the raw projection only.
        const authoring = createDefinitionAuthoring(RAW_DOMAIN);
        applyAuthoringSteps(authoring, BASE_STEPS, RAW_DOMAIN);
        const seeded = createDefinitionAuthoring(RAW_DOMAIN, null, authoring.definition());
        expect(() => applyAuthoringSteps(seeded, [CONNECT_ORG_FIELD], null))
            .toThrow(/Unknown port nodeMake:data:fields\.organization/);
    });

    it('keeps a draft ref field to a served plugin type', () => {
        const domain = {
            entities: [{ type: 'cassette-design', label: 'Cassette design', collection: 'files', blocks: ['fields'], meta: false }],
            workflows: {}, fieldSchemas: {}, relations: [], construction: {}, commands: {}
        };
        const authoring = createDefinitionAuthoring(domain);
        authoring.declareClass({ id: 'clsTask', typeId: 'task', name: 'Task' });
        authoring.declareTypeRef({ id: 'designRef', typeId: 'cassette-design' });
        authoring.declareField({
            id: 'fldDesign', ownerClassId: 'clsTask', name: 'design',
            descriptor: { base: 'ref', accepts: ['cassette-design'], nullable: true }
        });
        authoring.wireDeclaration('designRef', 'fldDesign', 'targets');
        const overlay = declarationOverlayDomain(authoring.definition(), domain);
        expect(overlay.fieldSchemas.task.some(field => field.path === 'relations.design')).toBe(true);
        expect(overlay.construction.task.inputs.some(input => input.id === 'relations.design')).toBe(true);
    });

    it('a stored draft with unapplied declarations resolves them from the first step (the edit path)', () => {
        // A stored draft whose organization field was declared and wired
        // but never applied — the exact live session's stored state.
        const stored = createDefinitionAuthoring(RAW_DOMAIN);
        applyAuthoringSteps(stored, [
            ...BASE_STEPS,
            { op: 'declareField', id: 'fldOrg', ownerClassId: 'clsTask', name: 'organization' },
            { op: 'wireDeclaration', from: 'fldOrg', to: 'clsTask', role: 'declares' }
        ], RAW_DOMAIN);
        const storedData = stored.definition();

        // editDefinition's opening move: seat the session onto the overlay
        // of the stored draft before any step runs.
        const editing = createDefinitionAuthoring(RAW_DOMAIN, null, structuredClone(storedData));
        editing.withDomain(declarationOverlayDomain(storedData, RAW_DOMAIN));
        expect(() => applyAuthoringSteps(editing, [CONNECT_ORG_FIELD], RAW_DOMAIN)).not.toThrow();
        const edges = editing.definition().graph.edges;
        expect(edges.some(edge => edge.target === 'nodeMake' && String(edge.targetHandle || '').includes('fields.organization'))).toBe(true);
    });
});

describe('the overlay names its skips (no silent Unknown port)', () => {
    const CONNECT = { op: 'connect', id: 'nodeLit', fromPort: 'data:value', to: 'nodeMake', toPort: 'data:fields.category' };

    it('reports a declaration the registry refuses, with the reason', async () => {
        const authoring = createDefinitionAuthoring(RAW_DOMAIN);
        applyAuthoringSteps(authoring, BASE_STEPS, RAW_DOMAIN);
        const data = authoring.definition();
        // The live trap: a stored declaration the registry refuses
        // (here: a non-kebab type id) — silently stubbed until now.
        data.ctsTypes.clsTask.typeId = 'Task_X';
        const seeded = createDefinitionAuthoring(RAW_DOMAIN, null, structuredClone(data));
        seeded.withDomain(declarationOverlayDomain(data, RAW_DOMAIN));
        let failure = null;
        try {
            applyAuthoringSteps(seeded, [CONNECT], RAW_DOMAIN);
        } catch (error) {
            failure = error;
        }
        expect(failure?.message).toMatch(/Unknown port/);
        expect(failure?.message).toMatch(/Task_X skipped: type id must be kebab-case/);
    });

    it('reports field records that matched no class typeId', async () => {
        const authoring = createDefinitionAuthoring(RAW_DOMAIN);
        applyAuthoringSteps(authoring, BASE_STEPS, RAW_DOMAIN);
        const data = authoring.definition();
        // A field record whose typeId points anywhere else: its name never
        // becomes a declaration field, and the port never exists.
        data.ctsTypes.fldTitle.typeId = 'some-other-type';
        const seeded = createDefinitionAuthoring(RAW_DOMAIN, null, structuredClone(data));
        seeded.withDomain(declarationOverlayDomain(data, RAW_DOMAIN));
        let failure = null;
        try {
            applyAuthoringSteps(seeded, [{ ...CONNECT, toPort: 'data:fields.title' }], RAW_DOMAIN);
        } catch (error) {
            failure = error;
        }
        expect(failure?.message).toMatch(/Unknown port/);
        expect(failure?.message).toMatch(/field record\(s\) matched no class typeId/);
    });
});
