import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const readComponent = path => readFile(new URL(path, import.meta.url), 'utf8');

describe('process node canvas authoring boundary', () => {
  it('keeps node cards as socket manifests: the name on the row, the socket contract on hover', async () => {
    const source = await readComponent('./ProcessNode.vue');

    expect(source).not.toMatch(/TypedValueControl|hasInlineConfiguration|showInlineFallback|<InputText|<Textarea|<Select/);
    expect(source).not.toMatch(/pi-link|pi-unlink/);
    expect(source).not.toMatch(/row\.(input|output)\.typeLabel/);
    expect(source).toContain('socketTitle(row.input)');
    expect(source).toContain('socketTitle(row.output)');
    expect(source).toContain('item.access && item.access !== \'item\'');
  });

  it('collapses to the name once with sockets on the top and bottom rails', async () => {
    const source = await readComponent('./ProcessNode.vue');

    expect(source).toContain('collapseInputs');
    expect(source).toContain('collapseOutputs');
    expect(source).toContain('side="top"');
    expect(source).toContain('side="bottom"');
    expect(source.match(/v-if="collapsed"/g)).toHaveLength(1);
  });

  it('keeps typed authoring controls in the selected-node inspector', async () => {
    const source = await readComponent('./inspector/ProcessNodeInspector.vue');

    expect(source).toContain('TypedValueControl');
    expect(source).toContain('editableInputs');
    expect(source).toContain('base="json"');

    const typedControl = await readComponent('./TypedValueControl.vue');
    expect(typedControl).toContain('editStructuredValue');
  });
});
