// The pane dispatcher keys its hosted content by the tab identity
// (SPEC §22.3): every tab switch remounts the header-bearing surface,
// so no page inherits the previous tab's header, editor, or comments.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.join(__dirname, 'GeneratedWorkspacePane.vue'), 'utf8');

describe('workspace pane tab identity', () => {
  it('keys the screen branch by the tab item', () => {
    const mount = source.match(/<GeneratedScreenPane[\s\S]*?>/)?.[0] || '';
    expect(mount).toContain(':key=');
  });

  it('keys the page branch by the tab item', () => {
    const mount = source.match(/<GeneratedWorkspacePage[\s\S]*?>/)?.[0] || '';
    expect(mount).toContain(':key=');
  });
});
