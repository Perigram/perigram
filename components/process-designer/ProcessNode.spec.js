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

  it('collapses to one header line with sockets centered on the card edges', async () => {
    const source = await readComponent('./ProcessNode.vue');

    expect(source).toContain('collapseInputs');
    expect(source).toContain('collapseOutputs');
    expect(source).toContain('side="top"');
    expect(source).toContain('side="bottom"');
    // zero-height rails cancel the card padding and spread sockets by
    // percentage across the full card width, riding the borders
    expect(source).toMatch(/class="relative -mx-2\.5 -mt-3 h-0"/);
    expect(source).toMatch(/class="relative -mx-2\.5 -mb-2\.5 h-0"/);
    expect(source).toContain('(index + 1) * 100');
    expect(source).not.toMatch(/v-if="socketRows.length && !collapsed"[\s\S]*?v-if="collapsed"/);
    expect(source.match(/v-if="collapsed"/g)).toHaveLength(2);
  });

  it('keeps typed authoring controls in the selected-node inspector', async () => {
    const source = await readComponent('./inspector/ProcessNodeInspector.vue');

    expect(source).toContain('TypedValueControl');
    expect(source).toContain('editableInputs');
    expect(source).toContain(':base="input.base"');

    const typedControl = await readComponent('./TypedValueControl.vue');
    expect(typedControl).toContain('editStructuredValue');
  });
});
