// FactRows renders semantic value typography resolved by the fact
// derivation: measured/code values wear the technical mono face with
// tabular numerals, ordinary text wears the body face (shared/README.md
// → FactRows).
import { describe, it, expect } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import FactRows from '~/components/shared/FactRows.vue';

async function mount(rows, variant = 'default') {
  const app = createSSRApp({ render: () => h(FactRows, { rows, variant }) });
  return renderToString(app);
}

describe('FactRows semantic value typography', () => {
  it('renders technical values in the mono tabular face and text values in the body face', async () => {
    const html = await mount([
      { label: 'Mass', display: '12.5 kg', role: 'technical' },
      { label: 'Note', display: 'Handles roughing passes', role: 'body' },
      { label: 'Legacy', display: 'no role declared' }
    ]);
    expect(html).toMatch(/Mass<\/dt><dd[^>]*text-technical tabular-nums/);
    expect(html).toMatch(/Note<\/dt><dd[^>]*text-body/);
    expect(html).toMatch(/Legacy<\/dt><dd[^>]*text-body/);
  });

  it('keeps the compact variant inline', async () => {
    const html = await mount([{ label: 'Mass', display: '12.5 kg', role: 'technical' }], 'compact');
    expect(html).toContain('flex flex-wrap');
    expect(html).toMatch(/text-technical tabular-nums/);
  });
});
