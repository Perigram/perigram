import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./GeneratedProjectWorkspace.vue', import.meta.url), 'utf8');
const entityPageSource = readFileSync(new URL('../shared/EntityPage.vue', import.meta.url), 'utf8');

describe('generated project workspace architecture', () => {
  it('composes the generated entity detail inside canonical workspace primitives', () => {
    expect(source).toContain('<GeneratedEntityDetail');
    expect(source).toContain('<WorkspaceLanes');
    expect(source).toContain('<ScrollablePanel');
    expect(source).toContain('<Tree');
    expect(source).not.toContain('<EntityCard');
  });

  it('stays inside compiled screen sources and actions', () => {
    expect(source).toContain('sourceStateForRegion');
    expect(source).toContain('section.region.actions');
    expect(source).not.toContain('cncRelations');
    expect(source).not.toContain('relationKeysForAction');
  });

  it('does not add overload-specific behavior to EntityPage', () => {
    expect(source).not.toContain('variant="workspace"');
    expect(entityPageSource).not.toContain("variant: { type: String");
    expect(entityPageSource).not.toContain("props.variant === 'workspace'");
  });
});
