// The nesting solver's pack registration (SPEC §8/§21): the ways it could
// fail, pinned against the REAL pack content — a service entry without a
// command binding is invisible to execution; a signature that does not
// match the command definition's parameters silently drops wired values;
// a service whose ports do not resolve leaves the palette item dead.
import { describe, expect, it } from 'vitest';
import { cncPackContent, cncServices } from './pack.js';
import { cncCommands } from './commands.js';
import { cncDomain } from './index.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView } from '#packages/cts/src/index.js';
import { cncTypePack } from '#packages/cts/src/pack/cnc.js';
import { resolveCatalogNodePorts, servicesPaletteGroups } from '#packages/processes/src/index.js';

function projectedDomain() {
  const registry = createTypeRegistry({ id: 'nesting-registration' });
  for (const declaration of [...frameworkTypes, ...cncTypePack]) registry.defineType(declaration);
  return projectDomainFromView(registry, 'org-1', cncDomain, { packServices: cncServices });
}

describe('nesting solver pack registration', () => {
  const domain = projectedDomain();
  const service = domain.serviceContracts?.['nesting.solve'];

  it('registers the service contract with a command binding', () => {
    expect(service).toMatchObject({ id: 'nesting.solve', command: 'solveNestingValue' });
    expect(cncPackContent.services).toContain(service);
  });

  it('declares the command definition the effect runtime resolves', () => {
    const command = cncCommands.solveNestingValue;
    expect(command).toBeTruthy();
    // The command parameters ARE the signature fields: commandEffectPayload
    // delivers wired socket values by parameter name, so the two lists must
    // name exactly the service signature's input fields.
    expect(command.input.parameters.map(parameter => parameter.name))
      .toEqual(Object.keys(service.signature.input.fields));
  });

  it('exposes the registered item in the services palette group', () => {
    const groups = servicesPaletteGroups(domain.serviceContracts);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(item => item.kind)).toEqual(['cts.service']);
    expect(groups[0].items[0].preset).toMatchObject({ operator: 'nesting.solve' });
  });

  it('resolves signature-derived typed sockets for a dropped cts.service node', () => {
    const ports = resolveCatalogNodePorts(
      { kind: 'cts.service', operator: 'nesting.solve' },
      { domain }
    );
    expect(ports.inputs.map(port => port.id)).toEqual(['items', 'params']);
    expect(ports.inputs.every(port => port.type?.base && port.required)).toBe(true);
    expect(ports.outputs.map(port => port.id)).toEqual(['result']);
  });
});
