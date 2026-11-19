import { describe, expect, it } from 'vitest';
import { createTypeRegistry, frameworkTypes, projectDomainFromView, payloadAccepts } from './index.js';

// The graph document type (SPEC §28): an authored graph as an ordinary
// file instance — it compiles in every registry view, projects as an
// authorable type (the framework machinery types stay hidden), and its
// payload takes JSON uploads alone.
describe('graph-document framework type', () => {
  const graphDocument = frameworkTypes.find(declaration => declaration.id === 'graph-document');

  it('declares as an authorable file type with a JSON payload', () => {
    expect(graphDocument).toMatchObject({
      class: 'file',
      scope: 'system',
      payload: { mime: ['application/json'], creation: ['upload', 'editor'] },
      fields: { name: { base: 'string', identifier: true }, graphId: { base: 'string' } }
    });
    expect(graphDocument.framework).toBeUndefined();
  });

  it('declares execution records as hidden append-only CTS instances', () => {
    const execution = frameworkTypes.find(declaration => declaration.id === 'graph-execution');
    expect(execution).toMatchObject({ framework: true, class: 'item', mutability: 'append-only' });
    expect(execution.fields.graphDocument).toMatchObject({ base: 'ref', accepts: ['graph-document'] });
  });

  it('compiles clean in a registry view and projects as an authorable entity', () => {
    const registry = createTypeRegistry({ id: 'graph-document-check' });
    for (const declaration of frameworkTypes) registry.defineType(declaration);
    expect(registry.compile().errors).toEqual([]);

    const domain = projectDomainFromView(registry, null, {}, { packServices: [] });
    const entity = (domain.entities || []).find(entry => entry.type === 'graph-document');
    expect(entity).toMatchObject({ label: 'Graph', meta: false });
    expect(domain.attachmentKinds['graph-document']).toMatchObject({ kind: 'graph-document', mimeType: 'application/json' });
    // Upload stays the default protocol (the attachment kind's creation
    // mode reads the first entry); the editor protocol offers the blank
    // editor create beside it.
    expect(domain.construction['graph-document'].modes).toEqual(['upload', 'editor']);
    expect(domain.construction['graph-document'].modeInputs.editor).toEqual([]);
  });

  it('accepts JSON payloads and refuses others through the payload traits', () => {
    expect(payloadAccepts(graphDocument.payload, { mime: 'application/json', size: 1024 })).toBe(true);
    expect(payloadAccepts(graphDocument.payload, { mime: 'text/markdown', size: 10 })).toBe(false);
    expect(payloadAccepts(graphDocument.payload, { mime: 'application/json', size: 6291456 })).toBe(false);
  });
});
