import { describe, expect, it } from 'vitest';
import { normalizeEntityOutputContracts, validateResultEntityOutputs } from '../../core/src/index.js';
import { cncCommands } from './commands.js';
import { cncTasks } from './tasks.js';

describe('CNC command and task entity output contracts', () => {
  it('declares every command entity output with persistence owner and timing', () => {
    const declared = Object.fromEntries(Object.entries(cncCommands).map(([id, command]) => [
      id,
      normalizeEntityOutputContracts(command.output).map(contract => `${contract.type}:${contract.persistenceOwner}:${contract.timing}`)
    ]));
    expect(declared).toEqual({
      saveCassetteTemplate: ['cassette:commandOwned:immediate'],
      solveNesting: ['nesting_run:commandOwned:immediate', 'sheet_design:commandOwned:completion', 'sheet:commandOwned:completion'],
      generateAttachment: [],
      convertArtifact: ['artifact:commandOwned:immediate', 'cassette_design:commandOwned:immediate'],
      generateConfigBotDraft: [],
      reindexConfigBotKnowledge: []
    });
  });

  it('declares every task entity output with persistence owner and timing', () => {
    const declared = Object.fromEntries(Object.entries(cncTasks).map(([id, task]) => [
      id,
      normalizeEntityOutputContracts(task.output).map(contract => `${contract.type}:${contract.persistenceOwner}:${contract.timing}`)
    ]));
    expect(declared).toEqual({
      dxfParseUpload: [],
      cassetteBakeTemplate: ['cassette_design:commandOwned:completion'],
      nestingSolve: ['nesting_run:commandOwned:completion', 'sheet_design:commandOwned:completion', 'sheet:commandOwned:completion'],
      attachmentGenerate: [],
      visionExtractGeometry: ['geometry_capture:commandOwned:completion']
    });
  });

  it('accepts the real solveNesting immediate and completion results against its declared outputs', () => {
    const commandContracts = normalizeEntityOutputContracts(cncCommands.solveNesting.output);
    expect(validateResultEntityOutputs({
      contracts: commandContracts,
      entities: [{ type: 'nesting_run', id: 'run-1' }],
      phase: 'immediate'
    })).toEqual([]);

    const taskContracts = normalizeEntityOutputContracts(cncTasks.nestingSolve.output);
    expect(validateResultEntityOutputs({
      contracts: taskContracts,
      entities: [
        { type: 'nesting_run', id: 'run-1' },
        { type: 'sheet_design', id: 'design-1' },
        { type: 'sheet', id: 'sheet-1' }
      ],
      phase: 'completion'
    })).toEqual([]);
  });

  it('keeps no legacy profile requirement keys on command declarations', () => {
    for (const command of Object.values(cncCommands)) {
      expect(command.requiredEntityProfiles).toBeUndefined();
    }
  });
});
