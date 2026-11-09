import { describe, expect, it } from 'vitest';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { compileTreeDeclarations, validateProcessDefinition } from '#packages/processes/src/index.js';
import { createDefinitionAuthoring } from '#packages/processes/src/authoring.js';
import { facadeDomain, facadePackContent } from '../test-tools/facade-plugin.js';
import documentsListing from '../workers/documents/listing.json' with { type: 'json' };
import techDrawingListing from '../workers/tech-drawing/listing.json' with { type: 'json' };
import { composeOrderGraph, composeOrderTree, emptyAuthoringDomain } from './order-process-authoring.js';
import { composeNestingAttemptGraph, composeNestingAttemptTree } from './nesting-attempt-authoring.js';

function domainWith(declarations) {
  const registry = createTypeRegistry({ id: 'order-process-authoring' });
  for (const declaration of [
    ...frameworkTypes,
    ...documentsListing.declarations.types,
    ...techDrawingListing.declarations.types,
    ...facadePackContent.types,
    ...declarations
  ]) {
    registry.defineType(declaration);
  }
  return projectDomainFromView(registry, 'org-test', facadeDomain, {
    packServices: [
      ...(documentsListing.declarations.services || []),
      ...(techDrawingListing.declarations.services || []),
      ...facadePackContent.services
    ]
  });
}

describe('order process authoring', () => {
  it('composes a valid process where XLSX rows become queue entries and nesting reads them', () => {
    const authoring = composeOrderTree(createDefinitionAuthoring(emptyAuthoringDomain()));
    const tree = authoring.definition();
    const { declarations, diagnostics } = compileTreeDeclarations(
      tree.graph.nodes.filter(node => node.type !== 'processNode'),
      tree.graph.edges,
      tree.processNodes
    );
    expect(diagnostics).toEqual([]);

    const domain = domainWith(declarations);
    authoring.withDomain(domain);
    const composed = composeOrderGraph(authoring, 'xlsx-workbook');
    const validation = validateProcessDefinition(composed, domain, {
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } }
    });

    // Plugin service commands resolve from the installed org; the fixture
    // domain carries the signatures, so only that binding reports here.
    expect(validation.errors.filter(error => !/must select a command/.test(error))).toEqual([]);
    expect(composed.processNodes.mkEntry.typeId).toBe('queue-entry');
    expect(composed.processNodes.entryParts.leftKey).toBe('fields.design');
    expect(composed.processNodes.entryParts.rightKey).toBe('designId');
    expect(composed.processNodes.jobItems.fields).toEqual(['designId', 'polygonParts', 'count']);
  });

  it('composes a valid manual solve over projection design items', () => {
    const authoring = composeNestingAttemptTree(createDefinitionAuthoring(emptyAuthoringDomain()));
    const tree = authoring.definition();
    const { declarations, diagnostics } = compileTreeDeclarations(
      tree.graph.nodes.filter(node => node.type !== 'processNode'),
      tree.graph.edges,
      tree.processNodes
    );
    expect(diagnostics).toEqual([]);

    authoring.withDomain(domainWith(declarations));
    const composed = composeNestingAttemptGraph(authoring);
    const validation = validateProcessDefinition(composed, domainWith(declarations), {
      roles: { role_admin: { id: 'role_admin', label: 'Admin' } }
    });

    expect(validation.errors.filter(error => !/must select a command/.test(error))).toEqual([]);
    expect(composed.processNodes.jobItems.fields).toEqual(['designId', 'polygonParts', 'count']);
  });
});
