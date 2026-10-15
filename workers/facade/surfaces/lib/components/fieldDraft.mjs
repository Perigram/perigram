// The authoring-field draft, created by the surface modules with the
// host-injected vue. Authoring fields carry numbers and expression
// strings that normalize on commit ('' -> 0, '42.' -> 42) and whose
// single-identifier values adopt a parameter; committing each keystroke
// would therefore rewrite the field under the caret and mint parameters
// from half-typed identifiers. The field holds the raw typed text while
// focused instead, and commits it on blur or Enter — Escape abandons it.
export default function createFieldDraft({ vue }) {
  const { ref } = vue;
  const draft = ref(null);
  const asText = (value) => (value === null || value === undefined ? '' : String(value));

  return {
    // The text a field shows: its own draft while focused, the model
    // value otherwise. `key` is the field's stable identity.
    text: (key, value) => (draft.value?.key === key ? draft.value.text : asText(value)),
    // Input listeners for one field: `commit(text)` runs on blur/Enter.
    handlers: (key, value, commit) => ({
      onFocus: () => { draft.value = { key, text: asText(value) }; },
      'onUpdate:modelValue': next => { draft.value = { key, text: next }; },
      onBlur: () => {
        const held = draft.value;
        if (!held || held.key !== key) return;
        draft.value = null;
        commit(held.text);
      },
      onKeydown: event => {
        if (event.key === 'Enter') event.currentTarget?.blur?.();
        if (event.key === 'Escape') {
          draft.value = null;
          event.currentTarget?.blur?.();
        }
      }
    }),
    // Drops the draft without committing it — for a field whose owning
    // selection or panel is going away.
    clear: () => { draft.value = null; }
  };
}
