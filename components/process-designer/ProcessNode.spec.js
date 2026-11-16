import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readComponent = path => readFile(new URL(path, import.meta.url), 'utf8');

describe('process node canvas authoring boundary', () => {
  it('keeps node cards as socket manifests without inline authoring controls', async () => {
    const source = await readComponent('./ProcessNode.vue');

    expect(source).not.toMatch(/TypedValueControl|hasInlineConfiguration|showInlineFallback|<InputText|<Textarea|<Select/);
    expect(source).toContain('row.input.typeLabel');
    expect(source).toContain('row.output.typeLabel');
    expect(source).toContain('row.input.connected');
    expect(source).toContain('row.output.connected');
  });

  it('keeps typed authoring controls in the selected-node inspector', async () => {
    const source = await readComponent('./inspector/ProcessNodeInspector.vue');

    expect(source).toContain('TypedValueControl');
    expect(source).toContain('editableInputs');
    expect(source).toContain('editStructuredValue');
  });
});
