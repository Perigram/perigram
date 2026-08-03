<template>
  <div
    ref="rootRef"
    class="relative flex min-w-0 flex-col gap-2"
    @focusin="activatePanel"
    @focusout="deactivatePanelIfOutside"
  >
    <div class="flex min-w-0 items-center gap-1">
      <div
        ref="editorRef"
        class="h-8 min-w-0 flex-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-ui border border-content-border bg-content px-2 py-1 font-mono text-sm outline-none focus:border-primary"
        contenteditable="true"
        role="textbox"
        spellcheck="false"
        :aria-label="t('cassette.v2.expression.label')"
        @input="handleEditorInput"
        @focus="captureSelection"
        @mouseup="captureSelection"
        @keyup="captureSelection"
        @keydown.enter.prevent
        @paste.prevent="handlePaste"
      />
      <Button
        icon="pi pi-question-circle"
        severity="secondary"
        text
        rounded
        size="small"
        :aria-label="t('cassette.v2.expression.guideTitle')"
        v-tooltip.top="guideText"
        @mousedown.prevent
      />
    </div>

    <div
      v-if="showTokenPanel"
      class="absolute left-0 right-0 top-full z-30 mt-1 flex flex-col gap-1 rounded-ui border border-content-border bg-content p-2 [box-shadow:var(--ck-shadow-overlay)]"
    >
      <div
        v-for="group in tokenGroups"
        :key="group.key"
        class="flex min-w-0 flex-wrap items-center gap-1"
      >
        <small class="min-w-16 text-muted-color">{{ group.label }}</small>
        <Button
          v-for="token in group.tokens"
          :key="token.key"
          :label="token.label"
          severity="secondary"
          outlined
          size="small"
          :aria-label="token.ariaLabel || token.label"
          v-tooltip.top="token.tooltip || token.insert"
          @mousedown.prevent
          @click="insertToken(token)"
        />
      </div>
    </div>

    <Message v-if="validationError" severity="error" size="small" :closable="false">
      {{ validationError }}
    </Message>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Message from 'primevue/message';
import {
  resolveCassetteV2AngleExpression,
  resolveCassetteV2Expression
} from '~/utils/cassetteV2Renderer.js';

const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: ''
  },
  parameters: {
    type: Object,
    default: () => ({})
  },
  parameterNames: {
    type: Array,
    default: () => []
  },
  contextTokens: {
    type: Array,
    default: () => []
  },
  allowAngleSuffix: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();
const rootRef = ref(null);
const editorRef = ref(null);
const internalText = ref(String(props.modelValue ?? ''));
const lastSelection = ref({ start: internalText.value.length, end: internalText.value.length });
const isPanelActive = ref(false);
let deactivateTimer = null;

const guideText = computed(() => [
  t('cassette.v2.expression.guide'),
  props.allowAngleSuffix ? t('cassette.v2.expression.angleGuide') : null
].filter(Boolean).join('\n'));

const normalizeToken = (item, prefix = 'token') => {
  const key = typeof item === 'string' ? item : item.key;
  const insert = typeof item === 'string' ? item : (item.insert || item.key);
  const label = typeof item === 'string'
    ? item
    : [item.iconText, item.label || item.key].filter(Boolean).join(' ');

  return {
    key: `${prefix}:${key}`,
    label,
    insert,
    tooltip: typeof item === 'string' ? item : item.tooltip,
    ariaLabel: typeof item === 'string' ? item : item.ariaLabel,
    cursorOffset: typeof item === 'string' ? null : item.cursorOffset
  };
};

const parameterTokens = computed(() => props.parameterNames.map(item => normalizeToken(item, 'param')));
const contextTokens = computed(() => props.contextTokens.map(item => normalizeToken(item, 'context')));
const operatorTokens = computed(() => [
  { key: 'op:add', label: '+', insert: ' + ' },
  { key: 'op:sub', label: '-', insert: ' - ' },
  { key: 'op:mul', label: '*', insert: ' * ' },
  { key: 'op:div', label: '/', insert: ' / ' },
  { key: 'op:open', label: '(', insert: '(' },
  { key: 'op:close', label: ')', insert: ')' }
]);
const trigTokens = computed(() => ['sin', 'cos', 'tan'].map(name => ({
  key: `trig:${name}`,
  label: `${name}()`,
  insert: `${name}()`,
  cursorOffset: `${name}()`.length - 1,
  tooltip: t('cassette.v2.expression.trigTooltip', { name })
})));
const tokenGroups = computed(() => [
  {
    key: 'parameters',
    label: t('cassette.v2.expression.groups.parameters'),
    tokens: parameterTokens.value
  },
  {
    key: 'context',
    label: t('cassette.v2.expression.groups.context'),
    tokens: contextTokens.value
  },
  {
    key: 'operators',
    label: t('cassette.v2.expression.groups.operators'),
    tokens: operatorTokens.value
  },
  {
    key: 'trig',
    label: t('cassette.v2.expression.groups.trig'),
    tokens: trigTokens.value
  }
].filter(group => group.tokens.length));
const showTokenPanel = computed(() => isPanelActive.value && tokenGroups.value.length > 0);
const allTokens = computed(() => [
  ...parameterTokens.value,
  ...contextTokens.value,
  ...operatorTokens.value,
  ...trigTokens.value
]);

const validationError = computed(() => {
  if (!internalText.value.trim()) return t('cassette.v2.expression.empty');
  try {
    if (props.allowAngleSuffix) {
      resolveCassetteV2AngleExpression(internalText.value, props.parameters);
    } else {
      resolveCassetteV2Expression(internalText.value, props.parameters);
    }
    return '';
  } catch (error) {
    return t('cassette.v2.expression.invalid', { error: error.message });
  }
});

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const tokenClass = (type) => ({
  parameter: 'rounded border border-content-border bg-subtle px-1',
  context: 'rounded border border-primary px-1 text-[var(--ck-primary-ink)]',
  function: 'rounded bg-subtle px-1 text-[var(--ck-primary-ink)]',
  operator: 'px-0.5 text-muted-color',
  number: '',
  unit: 'text-muted-color',
  unknown: ''
}[type] || '');

const tokenTypeForIdentifier = (value, nextChar) => {
  const lower = value.toLowerCase();
  if (['sin', 'cos', 'tan'].includes(lower) && nextChar === '(') return 'function';
  if (contextTokens.value.some(token => token.insert === value)) return 'context';
  if (parameterTokens.value.some(token => token.insert === value)) return 'parameter';
  return 'unknown';
};

const tokenizeEditorText = (source) => {
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      const start = index;
      while (index < source.length && /\s/.test(source[index])) index += 1;
      tokens.push({ type: 'space', value: source.slice(start, index) });
      continue;
    }

    if ('+-*/()'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      while (index < source.length && /[0-9.]/.test(source[index])) index += 1;
      tokens.push({ type: 'number', value: source.slice(start, index) });
      if (props.allowAngleSuffix && source.slice(index, index + 3).toLowerCase() === 'deg') {
        tokens.push({ type: 'unit', value: source.slice(index, index + 3) });
        index += 3;
      }
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      const value = source.slice(start, index);
      tokens.push({ type: tokenTypeForIdentifier(value, source[index]), value });
      continue;
    }

    tokens.push({ type: 'unknown', value: char });
    index += 1;
  }

  return tokens;
};

const highlightedHtml = () => tokenizeEditorText(internalText.value)
  .map((token) => {
    if (token.type === 'space') return escapeHtml(token.value);
    const className = tokenClass(token.type);
    if (!className) return escapeHtml(token.value);
    return `<span class="${className}">${escapeHtml(token.value)}</span>`;
  })
  .join('');

const findTextPosition = (root, offset) => {
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(root, globalThis.NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();

  while (node) {
    const length = node.textContent.length;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
    node = walker.nextNode();
  }

  return { node: root, offset: root.childNodes.length };
};

const editorHasFocus = () => editorRef.value && globalThis.document?.activeElement === editorRef.value;

const activatePanel = () => {
  if (deactivateTimer && globalThis.window?.clearTimeout) window.clearTimeout(deactivateTimer);
  deactivateTimer = null;
  isPanelActive.value = true;
};

const deactivatePanelIfOutside = () => {
  if (!globalThis.window?.setTimeout) return;
  deactivateTimer = window.setTimeout(() => {
    const activeElement = globalThis.document?.activeElement;
    isPanelActive.value = !!(rootRef.value && activeElement && rootRef.value.contains(activeElement));
    deactivateTimer = null;
  }, 0);
};

const restoreSelection = (selection) => {
  const root = editorRef.value;
  if (!root || !selection || !editorHasFocus() || !window.getSelection) return;

  const start = findTextPosition(root, selection.start);
  const end = findTextPosition(root, selection.end);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const browserSelection = window.getSelection();
  browserSelection.removeAllRanges();
  browserSelection.addRange(range);
  lastSelection.value = selection;
};

const renderEditor = (selection = null) => {
  const root = editorRef.value;
  if (!root) return;
  const shouldRestoreSelection = selection && editorHasFocus();
  root.innerHTML = highlightedHtml() || '<br>';
  if (shouldRestoreSelection) nextTick(() => restoreSelection(selection));
};

const selectionOffsets = () => {
  const root = editorRef.value;
  const browserSelection = window.getSelection?.();
  if (!root || !browserSelection?.rangeCount) return lastSelection.value;

  const range = browserSelection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return lastSelection.value;

  const startRange = document.createRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length
  };
};

const captureSelection = () => {
  lastSelection.value = selectionOffsets();
};

const updateText = (value, selection = null) => {
  internalText.value = value;
  emit('update:modelValue', value);
  renderEditor(selection);
};

const handleEditorInput = () => {
  const root = editorRef.value;
  const selection = selectionOffsets();
  updateText(root?.textContent?.replace(/\n/g, '') || '', selection);
};

const handlePaste = (event) => {
  const pasted = (event.clipboardData?.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ');
  const selection = selectionOffsets();
  const nextValue = `${internalText.value.slice(0, selection.start)}${pasted}${internalText.value.slice(selection.end)}`;
  const cursor = selection.start + pasted.length;
  updateText(nextValue, { start: cursor, end: cursor });
};

const insertToken = (token) => {
  const selection = selectionOffsets();
  const start = Number.isInteger(selection.start) ? selection.start : internalText.value.length;
  const end = Number.isInteger(selection.end) ? selection.end : start;
  const nextValue = `${internalText.value.slice(0, start)}${token.insert}${internalText.value.slice(end)}`;
  const nextCursor = start + (Number.isInteger(token.cursorOffset) ? token.cursorOffset : token.insert.length);
  editorRef.value?.focus?.();
  updateText(nextValue, { start: nextCursor, end: nextCursor });
};

watch(() => props.modelValue, (value) => {
  const nextValue = String(value ?? '');
  if (nextValue === internalText.value) return;
  internalText.value = nextValue;
  nextTick(() => renderEditor());
});

watch(allTokens, () => {
  nextTick(() => renderEditor(editorHasFocus() ? lastSelection.value : null));
});

onMounted(() => renderEditor());

onBeforeUnmount(() => {
  if (deactivateTimer && globalThis.window?.clearTimeout) window.clearTimeout(deactivateTimer);
});
</script>
