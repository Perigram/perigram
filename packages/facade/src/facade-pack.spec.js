// The facade pack's value-service registrations (SPEC §8/§21): the ways
// they could fail, pinned against the REAL pack content — a service entry
// without a command binding is invisible to execution; a signature that
// does not match the command definition's parameters silently drops
// wired values; a service whose ports do not resolve leaves the palette
// item dead.
import { describe, expect, it } from 'vitest';
import { facadeServices, facadeCommands, facadeDomain } from './index.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { composeSystemDeclarations } from '../../../server/packs/declarations.js';
import { resolveCatalogNodePorts, servicesPaletteGroups } from '#packages/processes/src/index.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'facade-pack-registration' });
  for (const declaration of [...frameworkTypes, ...composeSystemDeclarations()]) registry.defineType(declaration);
  return projectDomainFromView(registry, 'org-1', facadeDomain, { packServices: facadeServices });
}

describe('facade pack value-service registrations', () => {
  const domain = projectedDomain();

  it('registers every service contract with a command binding', () => {
    for (const service of facadeServices) {
      expect(domain.serviceContracts?.[service.id]).toMatchObject({ id: service.id, command: service.command });
    }
  });

  it('declares the command definitions the effect runtime resolves', () => {
    for (const service of facadeServices) {
      const command = facadeCommands[service.command];
      expect(command, service.command).toBeTruthy();
      // The command parameters ARE the signature fields: commandEffectPayload
      // delivers wired socket values by parameter name, so the two lists must
      // name exactly the service signature's input fields.
      expect(command.input.parameters.map(parameter => parameter.name), service.id)
        .toEqual(Object.keys(service.signature.input.fields));
    }
  });

  it('exposes every registered item in the services palette group', () => {
    const groups = servicesPaletteGroups(domain.serviceContracts);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.preset.operator)).toEqual(facadeServices.map(service => service.id));
  });

  it('resolves signature-derived typed sockets for a dropped cts.service node', () => {
    for (const service of facadeServices) {
      const ports = resolveCatalogNodePorts({ kind: 'cts.service', operator: service.id }, { domain });
      expect(ports.inputs.map(port => port.id), service.id)
        .toEqual(['in', ...Object.keys(service.signature.input.fields)]);
      expect(ports.outputs.map(port => port.id), service.id).toEqual(['completed', 'result']);
    }
  });

  it('carries the solver knobs as optional sockets and the collection sockets as List access', () => {
    const ports = resolveCatalogNodePorts({ kind: 'cts.service', operator: 'nesting.solve' }, { domain });
    const byId = Object.fromEntries(ports.inputs.map(port => [port.id, port]));
    expect(byId.items.required).toBe(true);
    expect(byId.items.access).toBe('list');
    expect(byId.sheetWidth.required).toBe(true);
    expect(byId.sheetHeight.required).toBe(true);
    expect(byId.space.required).toBe(false);
    expect(byId.sheetCount.required).toBe(false);
    // Purity (SPEC §8): the signature carries no ref inputs — the sheet
    // arrives as values, geometry through the declared projection.
    expect(ports.inputs.every(port => port.type.base !== 'entityRef')).toBe(true);
  });
});
