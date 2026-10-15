import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import createFieldDraft from './fieldDraft.mjs';

const draftFor = () => createFieldDraft({ vue: { ref } });

describe('field draft', () => {
  it('shows the model value until its own field is focused', () => {
    const draft = draftFor();
    expect(draft.text('x p0', 42)).toBe('42');
    expect(draft.text('x p0', '')).toBe('');
    expect(draft.text('x p0', null)).toBe('');
    expect(draft.text('x p0', 'W/2')).toBe('W/2');
  });

  it('holds the typed text and commits it once, on blur', () => {
    const draft = draftFor();
    const committed = [];
    const handlers = draft.handlers('x p0', 42, text => committed.push(text));
    handlers.onFocus();
    // A half-typed value never reaches the model — no commit per
    // keystroke, and the field keeps showing exactly what was typed.
    for (const typed of ['4', '42', '42.']) {
      handlers['onUpdate:modelValue'](typed);
      expect(draft.text('x p0', 42)).toBe(typed);
      expect(committed).toEqual([]);
    }
    handlers.onBlur();
    expect(committed).toEqual(['42.']);
    // The blur that follows the commit is not a second commit.
    handlers.onBlur();
    expect(committed).toEqual(['42.']);
  });

  it('commits an emptied field as typed rather than a fabricated zero', () => {
    const draft = draftFor();
    const committed = [];
    const handlers = draft.handlers('r p0', 3, text => committed.push(text));
    handlers.onFocus();
    handlers['onUpdate:modelValue']('');
    expect(draft.text('r p0', 3)).toBe('');
    handlers.onBlur();
    expect(committed).toEqual(['']);
  });

  it('Enter commits the draft and Escape abandons it', () => {
    const draft = draftFor();
    const committed = [];
    const handlers = draft.handlers('A', 1, text => committed.push(text));
    const input = { blur: () => handlers.onBlur() };

    handlers.onFocus();
    handlers['onUpdate:modelValue']('2');
    handlers.onKeydown({ key: 'Enter', currentTarget: input });
    expect(committed).toEqual(['2']);

    handlers.onFocus();
    handlers['onUpdate:modelValue']('9');
    handlers.onKeydown({ key: 'Escape', currentTarget: input });
    expect(committed).toEqual(['2']);
    expect(draft.text('A', 1)).toBe('1');
  });

  it('a draft belongs to one field at a time, and clear drops it uncommitted', () => {
    const draft = draftFor();
    const committed = [];
    const x = draft.handlers('x p0', 1, text => committed.push(['x', text]));
    const y = draft.handlers('y p0', 2, text => committed.push(['y', text]));
    x.onFocus();
    x['onUpdate:modelValue']('5');
    expect(draft.text('y p0', 2)).toBe('2');
    // The blur of a field that does not hold the draft commits nothing.
    y.onBlur();
    expect(committed).toEqual([]);
    draft.clear();
    x.onBlur();
    expect(committed).toEqual([]);
    expect(draft.text('x p0', 1)).toBe('1');
  });
});
