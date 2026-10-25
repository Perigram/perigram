import { describe, it, expect, beforeEach, vi } from 'vitest';

// The definition tools' authoring-surface contract, pinned: the
// activation-written records (compiled snapshot, history, activated) never
// cross the tool wire in either direction, and a graph-level save composes
// over the stored document instead of replacing it.

const { mockedProcessDefinitions, mockedSupport, mockedTypes, mockedRegistry, mockedOrganizations, mockedAgentService, mockedWebSearch, mockedFiles, mockedTranscription } = vi.hoisted(() => ({
    mockedProcessDefinitions: {
        list: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        validate: vi.fn(),
        activate: vi.fn(),
        deactivate: vi.fn(),
        executeActiveProcessAction: vi.fn(),
        composeDefinition: vi.fn(),
        editDefinition: vi.fn(),
        declareStatusMappings: vi.fn()
    },
    mockedSupport: { normalizeInstanceRefs: vi.fn(), findConversationAttachment: vi.fn() },
    mockedTypes: { describeOrganizationTypes: vi.fn() },
    mockedRegistry: { getAppRegistry: vi.fn() },
    mockedOrganizations: { listRoles: vi.fn() },
    mockedAgentService: { buildPrincipalAuth: vi.fn() },
    mockedWebSearch: { isWebSearchAvailable: vi.fn(), webSearch: vi.fn() },
    mockedFiles: { getFileBuffer: vi.fn() },
    mockedTranscription: { transcribeAudio: vi.fn() }
}));

vi.mock('~/server/features/process-definitions/service.js', () => mockedProcessDefinitions);
vi.mock('~/server/features/support/service.js', () => mockedSupport);
vi.mock('~/server/features/cts-types/service.js', () => mockedTypes);
vi.mock('~/server/runtime/app-registry.js', () => mockedRegistry);
vi.mock('~/server/features/organizations/service.js', () => mockedOrganizations);
vi.mock('~/server/features/agent-bots/service.js', () => mockedAgentService);
vi.mock('~/server/features/web-search/service.js', () => mockedWebSearch);
vi.mock('~/server/features/files/service.js', () => mockedFiles);
vi.mock('~/server/features/transcription/service.js', () => mockedTranscription);

import { executeTool, mcpToolDescriptors, chatToolDescriptors, toolCallDetail } from './tools.js';

const AUTH = { userId: 'user-1', organizationId: 'org-1' };
const STORED = {
    _id: 'd1',
    identity: { uid: 'process-d1', name: 'Organization process' },
    status: { state: { primary: 'DRAFT' } },
    data: {
        dataflowVersion: 4,
        graph: { nodes: [{ id: 'n1', type: 'processNode', data: { refId: 'n1' } }], edges: [] },
        processNodes: {
            n1: { id: 'n1', kind: 'source.literalItem', typeId: '', inputs: [], outputs: [{ id: 'value', role: 'data' }] }
        },
        valueInputs: { a: 1 },
        compiled: { bundle: 'server-derived' },
        history: [{ superseded: true }],
        activated: { snapshot: true }
    }
};

beforeEach(() => {
    vi.clearAllMocks();
    mockedWebSearch.isWebSearchAvailable.mockResolvedValue(true);
    mockedProcessDefinitions.getById.mockResolvedValue(structuredClone(STORED));
    mockedProcessDefinitions.update.mockImplementation(async (_id, payload) => ({ saved: payload }));
    mockedProcessDefinitions.create.mockImplementation(async (payload) => ({ created: payload }));
});

describe('tool call detail', () => {
    it('cites the authored vocabulary a call addressed, storage ids never', () => {
        expect(toolCallDetail('create_process_definition', { name: 'Order flow', data: {} })).toBe('Order flow');
        expect(toolCallDetail('run_action', { actionId: 'rename', instanceId: '507f1f77bcf86cd799439011' })).toBe('rename');
        expect(toolCallDetail('list_instances', { type: 'cassette', limit: 5 })).toBe('cassette');
        // Definition calls addressed by storage id carry no detail — the
        // id is code-only and never renders.
        expect(toolCallDetail('get_process_definition', { definitionId: '507f1f77bcf86cd799439011' })).toBe('');
        expect(toolCallDetail('list_types', {})).toBe('');
    });

    it('joins several values and caps runaway lengths', () => {
        expect(toolCallDetail('x', { name: 'Order flow', type: 'cassette' })).toBe('Order flow · cassette');
        const long = 'x'.repeat(500);
        expect(toolCallDetail('x', { name: long })).toHaveLength(60);
    });
});

describe('definition tool authoring surface', () => {
    it('get serves the compact digest by default and the stripped full document on request', async () => {
        const digest = await executeTool('get_process_definition', { definitionId: 'd1' }, AUTH);
        expect(digest.id).toBe('process-d1');
        expect(digest.name).toBe('Organization process');
        expect(digest.status).toBe('DRAFT');
        expect(digest.valueInputs).toEqual(['a']);
        expect(digest.nodes[0]).toMatchObject({ id: 'n1', kind: 'source.literalItem' });
        expect(digest.nodes[0].sockets).toEqual(['data:value']);
        expect(digest.data).toBeUndefined();
        expect(JSON.stringify(digest).length).toBeLessThan(2048);

        const full = await executeTool('get_process_definition', { definitionId: 'd1', full: true }, AUTH);
        expect(full.data.compiled).toBeUndefined();
        expect(full.data.history).toBeUndefined();
        expect(full.data.activated).toBeUndefined();
        expect(full.data.graph).toEqual(STORED.data.graph);
        expect(full.data.valueInputs).toEqual(STORED.data.valueInputs);
    });

    it('update keeps the stored activation records and drops client-injected ones', async () => {
        await executeTool('update_process_definition', {
            definitionId: 'd1',
            data: { dataflowVersion: 4, graph: { nodes: [] }, compiled: { stale: true }, history: [{ fake: true }] }
        }, AUTH);
        const payload = mockedProcessDefinitions.update.mock.calls[0][1];
        expect(payload.data.history).toEqual([{ superseded: true }]);
        expect(payload.data.activated).toEqual({ snapshot: true });
        expect(payload.data.compiled).toBeUndefined();
        expect(payload.data.graph).toEqual({ nodes: [] });
    });

    it('update_definition_graph replaces graph and value inputs over the stored document', async () => {
        await executeTool('update_definition_graph', {
            definitionId: 'd1',
            graph: { nodes: [{ id: 'n2' }], edges: [{ id: 'e1', source: 'n2', target: 'n2' }] },
            valueInputs: { b: 2 }
        }, AUTH);
        const payload = mockedProcessDefinitions.update.mock.calls[0][1];
        expect(payload.data.graph).toEqual({ nodes: [{ id: 'n2' }], edges: [{ id: 'e1', source: 'n2', target: 'n2' }] });
        expect(payload.data.valueInputs).toEqual({ b: 2 });
        expect(payload.data.dataflowVersion).toBe(4);
        expect(payload.data.history).toEqual([{ superseded: true }]);
    });

    it('a graph save without value inputs keeps the stored ones', async () => {
        await executeTool('update_definition_graph', { definitionId: 'd1', graph: { nodes: [] } }, AUTH);
        expect(mockedProcessDefinitions.update.mock.calls[0][1].data.valueInputs).toEqual({ a: 1 });
    });

    it('create passes seeded authored data through, stripped', async () => {
        await executeTool('create_process_definition', {
            name: 'Fork',
            data: { dataflowVersion: 4, graph: { nodes: [] }, history: [{ fake: true }] }
        }, AUTH);
        expect(mockedProcessDefinitions.create.mock.calls[0][0].data).toEqual({ dataflowVersion: 4, graph: { nodes: [] } });
    });

    it('serves the graph tool on both descriptors; chat-only tools stay off MCP', async () => {
        const mcp = (await mcpToolDescriptors()).map(tool => tool.name);
        expect(mcp).toContain('update_definition_graph');
        expect(mcp).not.toContain('attach_instances');
        expect((await chatToolDescriptors()).map(tool => tool.name)).toContain('attach_instances');
    });

    it('serves the authoring vocabulary compact by default; details arrive on request', async () => {
        mockedOrganizations.listRoles.mockResolvedValue({
            role_admin: { id: 'role_admin', label: 'Admin' },
            role_ops: { id: 'role_ops', label: 'Operations' }
        });
        const vocabulary = await executeTool('get_authoring_vocabulary', {}, AUTH);
        // Compact by default: no catalog or socket tables, palette items
        // are id/kind pairs — one oversized vocabulary response must never
        // evict the tools from a small context window.
        expect(vocabulary.nodeCatalog).toBeUndefined();
        expect(vocabulary.valueOperations).toBeUndefined();
        expect(vocabulary.palette.some(group => group.items.some(item => item.kind))).toBe(true);
        expect(vocabulary.palette.every(group => group.items.every(item => Object.keys(item).length <= 2))).toBe(true);
        expect(vocabulary.declarationNodeTypes).toEqual(['ctsClass', 'ctsType', 'ctsField', 'ctsState']);
        expect(vocabulary.guide).toContain('compose_process_definition');
        expect(vocabulary.guide).toContain('wireDeclaration');
        expect(vocabulary.guide).toContain('grants');
        expect(vocabulary.guide).toContain('edit_process_definition');
        expect(mockedOrganizations.listRoles).toHaveBeenCalledWith(AUTH.organizationId, AUTH);
        expect(vocabulary.roles).toEqual([
            { id: 'role_admin', label: 'Admin' },
            { id: 'role_ops', label: 'Operations' }
        ]);
        expect(JSON.stringify(vocabulary).length).toBeLessThan(12 * 1024);

        const catalog = await executeTool('get_authoring_vocabulary', { detail: 'nodeCatalog', family: 'values' }, AUTH);
        expect(catalog.nodeCatalog.length).toBeGreaterThan(0);
        expect(catalog.nodeCatalog.every(node => node.family === 'values')).toBe(true);

        const socketTable = await executeTool('get_authoring_vocabulary', { detail: 'sockets', kind: 'source.literalItem' }, AUTH);
        expect(socketTable.sockets['source.literalItem'].outputs).toEqual([
            expect.objectContaining({ id: 'value', base: 'json' })
        ]);
        expect(vocabulary.guide).toContain("detail:'sockets'");
        expect(vocabulary.guide).toContain('id is the FROM node');

        const sockets = await executeTool('get_authoring_vocabulary', { detail: 'valueOperations', kind: 'value.math' }, AUTH);
        const math = sockets.valueOperations['value.math'] || {};
        const firstMath = math[Object.keys(math)[0]];
        expect(Array.isArray(firstMath?.inputs)).toBe(true);
        // The payload is data only: no runtime (function) members of the
        // operation registry may cross the wire.
        expect(JSON.stringify(sockets)).not.toContain('"run"');
    });

    it('composes definitions through the headless seam with the caller\'s auth', async () => {
        mockedProcessDefinitions.composeDefinition.mockResolvedValueOnce({
            _id: 'process-new',
            identity: { uid: 'process-new', name: 'Composed' },
            status: { state: { primary: 'DRAFT' } },
            data: { graph: { nodes: [], edges: [] }, processNodes: {}, ctsTypes: {}, valueInputs: {} }
        });
        const result = await executeTool('compose_process_definition', {
            name: 'Composed',
            steps: [
                { op: 'declareClass', id: 'cls_a', typeId: 't-x', name: 'A' },
                { op: 'drop', item: 'construct', id: 'node_b' }
            ]
        }, AUTH);
        expect(mockedProcessDefinitions.composeDefinition).toHaveBeenCalledWith({
            name: 'Composed',
            steps: [
                { op: 'declareClass', id: 'cls_a', typeId: 't-x', name: 'A' },
                { op: 'drop', item: 'construct', id: 'node_b' }
            ]
        }, AUTH);
        // The save answers with the digest, never the whole document.
        expect(result.id).toBe('process-new');
        expect(result.name).toBe('Composed');
        expect(result.status).toBe('DRAFT');
        expect(result.nodes).toEqual([]);
    });

    it('edits an existing definition through gestures with the caller\'s auth', async () => {
        mockedProcessDefinitions.editDefinition.mockResolvedValueOnce({
            _id: 'd1',
            identity: { uid: 'd1', name: 'Edited' },
            status: { state: { primary: 'DRAFT' } },
            data: { graph: { nodes: [], edges: [] }, processNodes: {}, ctsTypes: {}, valueInputs: {} }
        });
        const result = await executeTool('edit_process_definition', {
            definitionId: 'd1',
            steps: [
                { op: 'drop', item: 'construct', id: 'node_c' },
                { op: 'configure', id: 'node_c', values: { typeId: 'cassette' } }
            ]
        }, AUTH);
        expect(mockedProcessDefinitions.editDefinition).toHaveBeenCalledWith({
            definitionId: 'd1',
            steps: [
                { op: 'drop', item: 'construct', id: 'node_c' },
                { op: 'configure', id: 'node_c', values: { typeId: 'cassette' } }
            ]
        }, AUTH);
        // The save answers with the digest, never the whole document.
        expect(result.id).toBe('d1');
        expect(result.name).toBe('Edited');
        expect((await mcpToolDescriptors()).map(tool => tool.name)).toContain('edit_process_definition');
    });

    it('truncates oversized tool results instead of blinding the model', async () => {
        mockedProcessDefinitions.list.mockResolvedValueOnce(
            Array.from({ length: 900 }, (_, index) => ({ id: `process-${index}`, name: `Definition ${index}`, status: 'ACTIVE' }))
        );
        const result = await executeTool('list_process_definitions', {}, AUTH);
        expect(result.truncated).toBe(true);
        expect(result.notice).toContain('truncated');
        expect(result.bytes).toBeGreaterThan(16 * 1024);
        expect(result.preview.length).toBeLessThanOrEqual(4096);
    });

    it('forwards the chat-run side channel — attach_instances accumulates refs inside a run', async () => {
        mockedSupport.normalizeInstanceRefs.mockResolvedValue([
            { type: 'cassette', id: 'c1', label: 'Cassette One' },
            { type: 'sheet', id: 's1', label: 'Sheet One' }
        ]);
        const run = { instanceRefs: [] };
        const result = await executeTool('attach_instances', { instances: [{ type: 'cassette', id: 'c1' }] }, AUTH, run);
        expect(result).toEqual([
            { type: 'cassette', id: 'c1', label: 'Cassette One' },
            { type: 'sheet', id: 's1', label: 'Sheet One' }
        ]);
        expect(run.instanceRefs).toHaveLength(2);
        // Without a run the tool states its real constraint.
        await expect(executeTool('attach_instances', { instances: [{ type: 'cassette', id: 'c1' }] }, AUTH))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    it('serves the action manifest live — mid-run activations are visible without a new run', async () => {
        // The run-start snapshot carries no actions; the live principal
        // does. The manifest must reflect the live one.
        mockedAgentService.buildPrincipalAuth.mockResolvedValue({
            userId: AUTH.userId,
            organizationId: AUTH.organizationId,
            roleAssignments: { actions: [
                { id: 'nodeMake', actionKind: 'createInstance', typeId: 'test-task', label: 'Create Task' },
                { id: 'nodeUpdate', actionKind: 'updateInstance', typeId: 'test-task', label: 'Update Task' }
            ] }
        });
        const actions = await executeTool('list_actions', {}, AUTH);
        expect(mockedAgentService.buildPrincipalAuth).toHaveBeenCalledWith(AUTH.userId);
        expect(actions.map(action => action.id)).toEqual(['nodeMake', 'nodeUpdate']);

        mockedProcessDefinitions.executeActiveProcessAction.mockResolvedValue({ ok: true });
        await executeTool('run_action', { actionId: 'nodeUpdate', instanceId: 'i1', data: { done: false } }, AUTH);
        const liveAuth = mockedProcessDefinitions.executeActiveProcessAction.mock.calls[0][1];
        expect(liveAuth.userId).toBe(AUTH.userId);
        expect(liveAuth.roleAssignments.actions.map(action => action.id)).toContain('nodeUpdate');
    });
});

describe('org-gated and room-scoped tools', () => {
    it('offers web_search on both surfaces only when the org has a search provider', async () => {
        const chat = await chatToolDescriptors('org-1');
        const mcp = await mcpToolDescriptors('org-1');
        expect(chat.some(tool => tool.name === 'web_search')).toBe(true);
        expect(mcp.some(tool => tool.name === 'web_search')).toBe(true);
        // read_attachment and ask_user are the chat run's own (they read
        // this room's attachments / wait on this room's answer); the MCP
        // listing excludes them.
        expect(mcp.some(tool => tool.name === 'read_attachment')).toBe(false);
        expect(mcp.some(tool => tool.name === 'ask_user')).toBe(false);
        expect(chat.some(tool => tool.name === 'ask_user')).toBe(true);
        mockedWebSearch.isWebSearchAvailable.mockResolvedValue(false);
        expect((await chatToolDescriptors('org-1')).some(tool => tool.name === 'web_search')).toBe(false);
        expect((await mcpToolDescriptors('org-1')).some(tool => tool.name === 'web_search')).toBe(false);
    });

    it('web_search executes through the capability seam with the caller\'s organization', async () => {
        mockedWebSearch.webSearch.mockResolvedValue({ provider: 'searxng', results: [] });
        await executeTool('web_search', { query: 'perigram', maxResults: 3 }, AUTH);
        expect(mockedWebSearch.webSearch).toHaveBeenCalledWith({ organizationId: 'org-1', query: 'perigram', maxResults: 3 });
    });

    it('declare_status_mappings delegates the migration decision to the service seam', async () => {
        mockedProcessDefinitions.declareStatusMappings.mockResolvedValue({
            definitionId: 'd1',
            declared: [{ typeId: 'task', from: 'archived', to: 'done' }]
        });
        const mappings = [{ typeId: 'task', from: 'archived', to: 'done' }];
        const result = await executeTool('declare_status_mappings', { definitionId: 'd1', mappings }, AUTH);
        expect(mockedProcessDefinitions.declareStatusMappings).toHaveBeenCalledWith({ definitionId: 'd1', mappings }, AUTH);
        expect(result.declared).toEqual(mappings);
        // A plain authoring action: both surfaces list it.
        expect((await chatToolDescriptors()).some(tool => tool.name === 'declare_status_mappings')).toBe(true);
        expect((await mcpToolDescriptors()).some(tool => tool.name === 'declare_status_mappings')).toBe(true);
    });

    it('read_attachment is chat-run-only and reads nothing outside this conversation', async () => {
        await expect(executeTool('read_attachment', { fileId: 'f1' }, AUTH)).rejects.toMatchObject({ statusCode: 400 });
        mockedSupport.findConversationAttachment.mockResolvedValue(null);
        await expect(executeTool('read_attachment', { fileId: 'f1' }, AUTH, { conversationKey: 'group:g1' }))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(mockedSupport.findConversationAttachment).toHaveBeenCalledWith('group:g1', 'f1');
    });

    it('read_attachment returns the stored text and refuses binary content', async () => {
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f1', name: 'notes.txt', mimeType: 'text/plain', size: 12 });
        mockedFiles.getFileBuffer.mockResolvedValue(new TextEncoder().encode('plain text body\n'));
        const result = await executeTool('read_attachment', { fileId: 'f1' }, AUTH, { conversationKey: 'group:g1' });
        expect(mockedFiles.getFileBuffer).toHaveBeenCalledWith('f1', 'files');
        expect(result.readAs).toBe('text');
        expect(result.text).toBe('plain text body\n');
        expect(result.name).toBe('notes.txt');

        mockedFiles.getFileBuffer.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]));
        await expect(executeTool('read_attachment', { fileId: 'f1' }, AUTH, { conversationKey: 'group:g1' }))
            .rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('read_attachment typed content extraction', () => {
    const RUN = { conversationKey: 'group:g1' };

    it('flattens spreadsheets to CSV sheets', async () => {
        const { write, utils } = await import('xlsx/xlsx.mjs');
        const workbook = utils.book_new();
        utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Part', 'Qty'], ['bracket', '4']]), 'Order');
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f1', name: 'order.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file' });
        mockedFiles.getFileBuffer.mockResolvedValue(Buffer.from(write(workbook, { type: 'buffer', bookType: 'xlsx' })));
        const result = await executeTool('read_attachment', { fileId: 'f1' }, AUTH, RUN);
        expect(result.readAs).toBe('csv');
        expect(result.text).toContain('## Sheet: Order');
        expect(result.text).toContain('bracket,4');
    });

    it('extracts PDF page text', async () => {
        const { PDFDocument } = await import('pdf-lib');
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([420, 300]);
        page.drawText('Perigram attachment round trip', { size: 12 });
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f1', name: 'sheet.pdf', mimeType: 'application/pdf', kind: 'file' });
        mockedFiles.getFileBuffer.mockResolvedValue(Buffer.from(await pdf.save()));
        const result = await executeTool('read_attachment', { fileId: 'f1' }, AUTH, RUN);
        expect(result.readAs).toBe('text');
        expect(result.text).toContain('Perigram attachment round trip');
    });

    it('unwraps the DOCX document body', async () => {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        zip.file('word/document.xml', '<?xml version="1.0"?><w:document><w:body><w:p><w:r><w:t>Cut list &amp; notes</w:t></w:r></w:p><w:p><w:r><w:t>second paragraph</w:t></w:r></w:p></w:body></w:document>');
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f1', name: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file' });
        mockedFiles.getFileBuffer.mockResolvedValue(await zip.generateAsync({ type: 'nodebuffer' }));
        const result = await executeTool('read_attachment', { fileId: 'f1' }, AUTH, RUN);
        expect(result.readAs).toBe('text');
        expect(result.text).toContain('Cut list & notes');
        expect(result.text).toContain('second paragraph');
    });

    it('transcribes audio through the organization\'s transcription seam', async () => {
        mockedTranscription.transcribeAudio.mockResolvedValue({ text: 'spoken notes', provider: 'local', model: '' });
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f1', name: 'voice.webm', mimeType: 'audio/webm', kind: 'audio' });
        mockedFiles.getFileBuffer.mockResolvedValue(Buffer.from('opaque-audio-bytes'));
        const result = await executeTool('read_attachment', { fileId: 'f1' }, AUTH, RUN);
        expect(result.readAs).toBe('transcript');
        expect(result.text).toBe('spoken notes');
        expect(mockedTranscription.transcribeAudio).toHaveBeenCalledWith(expect.objectContaining({
            filename: 'voice.webm',
            organizationId: 'org-1'
        }));
        mockedTranscription.transcribeAudio.mockRejectedValue(Object.assign(new Error('Transcription is not configured'), { statusCode: 503 }));
        await expect(executeTool('read_attachment', { fileId: 'f1' }, AUTH, RUN)).rejects.toMatchObject({ statusCode: 503 });
    });

    it('refuses images with the text-only boundary and unknown binaries', async () => {
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f1', name: 'photo.png', mimeType: 'image/png', kind: 'image' });
        await expect(executeTool('read_attachment', { fileId: 'f1' }, AUTH, RUN)).rejects.toMatchObject({ statusCode: 400 });
        mockedSupport.findConversationAttachment.mockResolvedValue({ fileId: 'f2', name: 'model.bin', mimeType: 'application/octet-stream', kind: 'file' });
        mockedFiles.getFileBuffer.mockResolvedValue(Buffer.from([0x00, 0x01, 0x02, 0x03]));
        await expect(executeTool('read_attachment', { fileId: 'f2' }, AUTH, RUN)).rejects.toMatchObject({ statusCode: 400 });
    });
});

describe('instance file reads and action input contracts', () => {
    const fileInstanceService = { processList: vi.fn(), processGetById: vi.fn() };

    beforeEach(() => {
        mockedRegistry.getAppRegistry.mockReturnValue({ getInstanceService: () => fileInstanceService });
    });

    it('get_instance carries the payload reference of file-type instances', async () => {
        fileInstanceService.processGetById.mockResolvedValue({
            _id: 'r1', type: 'report', name: 'Passport', state: 'ACTIVE',
            fields: { pages: 2 },
            payload: { fileId: 'f1', mime: 'application/pdf', size: 15, name: 'passport.pdf' }
        });
        const row = await executeTool('get_instance', { type: 'report', id: 'r1' }, AUTH);
        expect(row.payload).toEqual({ fileId: 'f1', mime: 'application/pdf', size: 15, name: 'passport.pdf' });
    });

    it('read_instance_file extracts the instance payload on both surfaces', async () => {
        fileInstanceService.processGetById.mockResolvedValue({
            _id: 'r1', type: 'text-document', name: 'Notes',
            payload: { fileId: 'f1', mime: 'text/markdown', size: 4, name: 'notes.md' }
        });
        mockedFiles.getFileBuffer.mockResolvedValue(Buffer.from('# hi'));
        const result = await executeTool('read_instance_file', { type: 'text-document', id: 'r1' }, AUTH);
        expect(mockedFiles.getFileBuffer).toHaveBeenCalledWith('f1', 'files');
        expect(result).toMatchObject({ name: 'notes.md', mimeType: 'text/markdown', readAs: 'text', text: '# hi' });

        const chat = await chatToolDescriptors('org-1');
        const mcp = await mcpToolDescriptors('org-1');
        expect(chat.some(tool => tool.name === 'read_instance_file')).toBe(true);
        expect(mcp.some(tool => tool.name === 'read_instance_file')).toBe(true);
    });

    it('read_instance_file refuses payload-less instances and missing blobs', async () => {
        fileInstanceService.processGetById.mockResolvedValue({ _id: 'r2', type: 'report', name: 'X', fields: {} });
        await expect(executeTool('read_instance_file', { type: 'report', id: 'r2' }, AUTH))
            .rejects.toMatchObject({ statusCode: 400, message: /carries no file payload/ });

        fileInstanceService.processGetById.mockResolvedValue({ _id: 'r3', type: 'report', payload: { fileId: 'gone' } });
        mockedFiles.getFileBuffer.mockResolvedValue(null);
        await expect(executeTool('read_instance_file', { type: 'report', id: 'r3' }, AUTH))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    it('serves action input contracts and one action by id', async () => {
        mockedAgentService.buildPrincipalAuth.mockResolvedValue({
            userId: AUTH.userId,
            organizationId: AUTH.organizationId,
            roleAssignments: { actions: [
                { id: 'fillReport', actionKind: 'createInstance', typeId: 'report', label: 'Fill report',
                  construction: { mode: 'fromTemplate', inputs: ['name', 'template', 'values'] },
                  inputPolicy: { fields: [{ id: 'name', type: 'string', required: true }] },
                  inputs: [{ id: 'values', type: 'object' }] },
                { id: 'bare', actionKind: 'updateInstance', typeId: 'report', label: 'Update' }
            ] }
        });
        const actions = await executeTool('list_actions', {}, AUTH);
        expect(actions[0].construction).toEqual({ mode: 'fromTemplate', inputs: ['name', 'template', 'values'] });
        expect(actions[0].inputPolicy.fields).toEqual([{ id: 'name', type: 'string', required: true }]);
        expect(actions[0].inputs).toEqual([{ id: 'values', type: 'object' }]);
        expect(actions[1].construction).toBeUndefined();

        const one = await executeTool('list_actions', { actionId: 'fillReport' }, AUTH);
        expect(one.id).toBe('fillReport');
        await expect(executeTool('list_actions', { actionId: 'missing' }, AUTH)).rejects.toMatchObject({ statusCode: 404 });
    });
});
