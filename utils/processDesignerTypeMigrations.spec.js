import { describe, expect, it } from 'vitest';
import {
  clearTypeMigrationSteps,
  declarationPostFailure,
  declarationVocabulary,
  stepsFromTypeMigrationRows,
  typeMigrationRows,
  writeTypeMigrationSteps
} from './processDesignerTypeMigrations.js';

// The type-migration authoring seam: a refused declaration post's plan
// (`data.plan` from the cts-types gate) becomes step rows labeled by the
// authored vocabulary, confirmed rows become class-node `migrate` state,
// and consumed steps clear. The server re-verifies every step — these
// pure functions only suggest and write back.

const classNode = (typeId, extra = {}) => ({
  id: `class:${typeId}`, type: 'ctsClass', data: { typeId, class: 'item', ...extra }
});
const fieldNode = (typeId, name, descriptor = { base: 'string' }) => ({
  id: `field:${typeId}:${name}`, type: 'ctsField', data: { typeId, name, descriptor }
});
const stateNode = (typeId, value) => ({
  id: `state:${typeId}:${value}`, type: 'ctsState', data: { typeId, value }
});
const declares = (source, target, label) => ({
  id: `d:${source.id}-${target.id}`, source: source.id, target: target.id, role: 'type', label
});

describe('declaration vocabulary', () => {
  it('maps field ids to authored labels through the tree, stored descriptors for removed fields', () => {
    const widget = classNode('child', { name: 'Child' });
    const field = fieldNode('child', 'Anythin');
    const nodes = [widget, field, stateNode('child', 'ready')];
    const edges = [declares(field, widget, 'field'), declares(nodes[2], widget, 'state')];
    const stored = [{
      id: 'child',
      name: null,
      fields: { gone: { base: 'string', label: 'Gone field' }, anythin: { base: 'string', label: 'Anythin' } },
      states: { main: { values: ['scrap', 'ready'] } }
    }];
    const vocabulary = declarationVocabulary(nodes, edges, stored);
    expect(vocabulary.child.name).toBe('Child');
    expect(vocabulary.child.fields).toEqual({ gone: 'Gone field', anythin: 'Anythin' });
    // The tree's CURRENT state values are the rename targets.
    expect(vocabulary.child.states).toEqual(['ready']);
  });
});

describe('type migration rows', () => {
  it('pairs a removed field with an added required field as one rename row labeled by the vocabulary', () => {
    const plan = {
      changes: [
        { severity: 'breaking', kind: 'remove-field', field: 'anythin' },
        { severity: 'breaking', kind: 'add-required-field', field: 'anything' }
      ],
      requiredSteps: []
    };
    const rows = typeMigrationRows(plan, { fields: { anythin: 'Anythin', anything: 'Anything' } });
    expect(rows).toEqual([
      {
        key: 'rename-field:anythin',
        kind: 'rename-field',
        field: 'anythin',
        fieldLabel: 'Anythin',
        to: 'anything',
        toLabel: 'Anything'
      }
    ]);
  });

  it('pairs every remove with an add as a rename suggestion; surplus removes/adds surface unpaired', () => {
    // A remove+add pair is always offered as the rename gesture (the common
    // authored edit; the server gate re-verifies descriptor equality when
    // the retried post carries the step). Surplus rows appear when the
    // counts differ: a surplus remove is confirm-only, a surplus add
    // becomes an add-default row.
    const surplusRemove = typeMigrationRows({
      changes: [
        { severity: 'breaking', kind: 'remove-field', field: 'gone' },
        { severity: 'breaking', kind: 'remove-field', field: 'stale' },
        { severity: 'breaking', kind: 'add-required-field', field: 'brandNew' }
      ],
      requiredSteps: []
    }, { fields: { gone: 'Gone', stale: 'Stale', brandNew: 'Brand new' } });
    expect(surplusRemove.map(row => row.kind)).toEqual(['rename-field', 'remove-field']);
    expect(surplusRemove[0]).toMatchObject({ field: 'gone', fieldLabel: 'Gone', to: 'brandNew', toLabel: 'Brand new' });
    expect(surplusRemove[1]).toMatchObject({ field: 'stale', fieldLabel: 'Stale' });

    const surplusAdd = typeMigrationRows({
      changes: [
        { severity: 'breaking', kind: 'remove-field', field: 'gone' },
        { severity: 'breaking', kind: 'add-required-field', field: 'brandNew' },
        { severity: 'breaking', kind: 'add-required-field', field: 'count' }
      ],
      requiredSteps: []
    }, { fields: { gone: 'Gone', brandNew: 'Brand new', count: 'Count' } });
    expect(surplusAdd.map(row => row.kind)).toEqual(['rename-field', 'add-default-field']);
    expect(surplusAdd[1]).toMatchObject({ field: 'count', fieldLabel: 'Count' });
  });

  it('a removed state offers the retained states as rename targets; remove-edge is blocked with the reason', () => {
    const rows = typeMigrationRows({
      changes: [
        { severity: 'breaking', kind: 'remove-state', state: 'scrap' },
        { severity: 'breaking', kind: 'remove-edge', edge: 'children.parts' }
      ],
      requiredSteps: [
        'remove-state scrap requires a rename-enum-value step',
        'remove-edge children.parts is not coverable by any declared migration step'
      ]
    }, { states: ['ready', 'done'] });
    const enumRow = rows.find(row => row.kind === 'rename-enum-value');
    expect(enumRow.targets).toEqual(['ready', 'done']);
    const blocked = rows.find(row => row.kind === 'blocked');
    expect(blocked.subject).toBe('children.parts');
    expect(blocked.reason).toBe('remove-edge children.parts is not coverable by any declared migration step');
  });
});

describe('steps from confirmed rows', () => {
  it('derives the rename target from the authored new name; the prefill keeps the paired field id', () => {
    const rows = typeMigrationRows({
      changes: [
        { severity: 'breaking', kind: 'remove-field', field: 'anythin' },
        { severity: 'breaking', kind: 'add-required-field', field: 'anything' }
      ],
      requiredSteps: []
    }, { fields: { anythin: 'Anythin', anything: 'Anything' } });
    // Prefilled answer (the authored new label) maps back to the paired id.
    expect(stepsFromTypeMigrationRows(rows, { 'rename-field:anythin': 'Anything' }))
      .toEqual([{ kind: 'rename-field', from: 'anythin', to: 'anything' }]);
    // An edited answer derives the id the same way the tree does.
    expect(stepsFromTypeMigrationRows(rows, { 'rename-field:anythin': 'Other Name' }))
      .toEqual([{ kind: 'rename-field', from: 'anythin', to: 'otherName' }]);
  });

  it('retype offers exactly the two honest expressions: keep value or literal null', () => {
    const rows = [{
      key: 'retype-field:anythin', kind: 'retype-field', field: 'anythin', fieldLabel: 'Anythin'
    }];
    expect(stepsFromTypeMigrationRows(rows, {})).toEqual([
      { kind: 'retype-field', field: 'anythin', via: { op: 'var', name: 'value' } }
    ]);
    expect(stepsFromTypeMigrationRows(rows, { 'retype-field:anythin': 'empty' })).toEqual([
      { kind: 'retype-field', field: 'anythin', via: { op: 'lit', value: null } }
    ]);
  });

  it('add-default parses empty as null and numerics as numbers; enum renames carry the main axis', () => {
    const rows = [
      { key: 'add-default-field:count', kind: 'add-default-field', field: 'count', fieldLabel: 'Count' },
      { key: 'add-default-field:note', kind: 'add-default-field', field: 'note', fieldLabel: 'Note' },
      { key: 'rename-enum-value:scrap', kind: 'rename-enum-value', state: 'scrap', targets: ['ready'], to: null }
    ];
    expect(stepsFromTypeMigrationRows(rows, {
      'add-default-field:count': ' 42 ',
      'add-default-field:note': 'keep this',
      'rename-enum-value:scrap': 'ready'
    })).toEqual([
      { kind: 'add-default-field', field: 'count', value: 42 },
      { kind: 'add-default-field', field: 'note', value: 'keep this' },
      { kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'ready' }
    ]);
  });
});

describe('class-node step write-back', () => {
  it('writes confirmed steps onto the matching class node by typeId and clears consumed ones', () => {
    const child = classNode('child');
    const other = classNode('other', { migrate: [{ kind: 'remove-field', field: 'x' }] });
    const nodes = [child, other];
    writeTypeMigrationSteps(nodes, {
      child: [{ kind: 'rename-field', from: 'anythin', to: 'anything' }]
    });
    expect(child.data.migrate).toEqual([{ kind: 'rename-field', from: 'anythin', to: 'anything' }]);
    expect(other.data.migrate).toEqual([{ kind: 'remove-field', field: 'x' }]);
    clearTypeMigrationSteps(nodes, 'child');
    expect(child.data.migrate).toBeUndefined();
    expect(other.data.migrate).toEqual([{ kind: 'remove-field', field: 'x' }]);
    clearTypeMigrationSteps(nodes);
    expect(other.data.migrate).toBeUndefined();
  });

  it('an explicitly empty step list clears carried steps (stale-set consent)', () => {
    const child = classNode('child', { migrate: [{ kind: 'remove-field', field: 'x' }] });
    writeTypeMigrationSteps([child], { child: [] });
    expect(child.data.migrate).toBeUndefined();
  });
});

describe('declaration post failure extraction', () => {
  // ofetch puts the whole h3 body in error.data; createError nests its
  // payload one level deeper — the plan lives at error.data.data.plan
  // (the same nesting the types pane reads for boundBy). Pinned after a
  // wrong-nesting regression flattened every refusal back to a string.
  it('keeps a plan refusal structured at the ofetch nesting', () => {
    const error = {
      data: {
        statusCode: 400,
        message: 'breaking change to child without a covering declared migration (retype-field anythin requires a retype-field step)',
        data: {
          boundBy: [],
          plan: {
            changes: [{ severity: 'breaking', kind: 'retype-field', field: 'anythin' }],
            requiredSteps: ['retype-field anythin requires a retype-field step']
          }
        }
      }
    };
    expect(declarationPostFailure(error, { typeId: 'child', typeName: 'Child' })).toEqual({
      typeId: 'child',
      typeName: 'Child',
      plan: {
        changes: [{ severity: 'breaking', kind: 'retype-field', field: 'anythin' }],
        requiredSteps: ['retype-field anythin requires a retype-field step']
      }
    });
  });

  it('flattens refusals without a plan through the labeler', () => {
    const error = { data: { statusCode: 400, message: 'nope' } };
    expect(declarationPostFailure(error, { typeId: 'child', typeName: 'Child', labeler: () => 'labeled' })).toBe('Child: labeled');
    expect(declarationPostFailure(null, { typeId: 'child', typeName: 'Child' })).toBe('Child: ');
  });
});
