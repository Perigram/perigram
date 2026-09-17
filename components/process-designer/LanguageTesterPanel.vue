<script setup>
// CTS language tester panel: evaluates real @perigram/cts expressions and
// instance validations in the browser against the strangler-converted CNC
// types. No endpoint — the package is pure and browser-safe by contract
// (SPEC §13), the designer imports the same code the compiler runs.
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { createTypeRegistry, convertCncDomain, evaluate, checkMatch, validateInstance } from '~/packages/cts/src/index.js';
import { cncEntities, cncWorkflows, cncContainment } from '~/packages/domain-cnc/src/index.js';

const props = defineProps({
  initialExpression: { type: String, default: '' }
});

const registry = createTypeRegistry({ id: 'designer-language-tester' });
for (const declaration of convertCncDomain({ entities: cncEntities, workflows: cncWorkflows, containment: cncContainment })) {
  registry.defineType(declaration);
}
const typeOptions = registry.listTypes().map(type => ({ label: `${type.render?.label || type.id} (${type.class})`, value: type.id }));

const EXAMPLES = [
  {
    label: 'map + unit arithmetic',
    ast: {
      op: 'map',
      list: { op: 'lit', value: [{ value: 500, unit: 'mm' }, { value: 0.5, unit: 'm' }] },
      var: 'x',
      body: { op: 'add', args: [{ op: 'var', name: 'x' }, { op: 'lit', value: { value: 250, unit: 'mm' } }] }
    },
    scope: {}
  },
  {
    label: 'filter + comparison',
    ast: {
      op: 'filter',
      list: { op: 'lit', value: [1200, 3100, 900] },
      var: 'x',
      body: { op: 'gt', args: [{ op: 'var', name: 'x' }, { op: 'field', path: [], of: { op: 'var', name: 'limits' } }] }
    },
    scope: { limits: 1000 }
  },
  {
    label: 'match on variant (missing arm shown)',
    ast: {
      op: 'match',
      expr: { op: 'var', name: 'job' },
      arms: { cut: { op: 'lit', value: 'cut arm' } }
    },
    scope: { job: { tag: 'place', value: {} } },
    matchSubject: { base: 'variant', tags: ['cut', 'place'] }
  }
];

const astText = ref(JSON.stringify(EXAMPLES[0].ast, null, 2));
const scopeText = ref(JSON.stringify(EXAMPLES[0].scope, null, 2));
const matchSubjectText = ref('');
const expressionResult = ref(null);

function parseOrNull(text) {
  if (!String(text || '').trim()) return {};
  return JSON.parse(text);
}

function loadExample(example) {
  astText.value = JSON.stringify(example.ast, null, 2);
  scopeText.value = JSON.stringify(example.scope, null, 2);
  matchSubjectText.value = example.matchSubject ? JSON.stringify(example.matchSubject, null, 2) : '';
  expressionResult.value = null;
}

function runExpression() {
  try {
    const ast = JSON.parse(astText.value);
    const scope = parseOrNull(scopeText.value);
    const matchSubject = parseOrNull(matchSubjectText.value);
    const match = matchSubject?.base ? checkMatch(ast, matchSubject) : [];
    try {
      const result = evaluate(ast, scope);
      expressionResult.value = { ok: true, result, match };
    } catch (error) {
      expressionResult.value = { ok: false, error: error?.message || String(error), match };
    }
  } catch (error) {
    expressionResult.value = { ok: false, error: `JSON parse: ${error?.message || error}` };
  }
}

const selectedTypeId = ref(typeOptions[0]?.value || '');

// Scaffold a minimal well-typed instance from the selected type, so the
// checker never starts from a type/id mismatch.
function scaffoldInstance(typeId) {
  const type = registry.getType(typeId);
  if (!type) return { type: typeId, typeVersion: 1, fields: {}, states: {} };
  const fields = {};
  for (const [name, descriptor] of Object.entries(type.fields)) {
    if (descriptor.base === 'json') fields[name] = {};
  }
  return {
    type: type.id,
    typeVersion: type.version,
    fields,
    ...(type.states?.main ? { states: { main: type.states.main.initial } } : {})
  };
}

const instanceText = ref(JSON.stringify(scaffoldInstance(selectedTypeId.value), null, 2));
const instanceResult = ref(null);

watch(selectedTypeId, typeId => {
  instanceText.value = JSON.stringify(scaffoldInstance(typeId), null, 2);
  instanceResult.value = null;
});

function runInstance() {
  try {
    const instance = JSON.parse(instanceText.value);
    const type = registry.getType(selectedTypeId.value);
    if (!type) {
      instanceResult.value = { ok: false, errors: [`unknown type ${selectedTypeId.value}`] };
      return;
    }
    const errors = validateInstance(type, instance);
    instanceResult.value = { ok: errors.length === 0, errors };
  } catch (error) {
    instanceResult.value = { ok: false, errors: [`JSON parse: ${error?.message || error}`] };
  }
}

const resultSummary = computed(() => {
  if (!expressionResult.value) return '';
  return expressionResult.value.ok
    ? JSON.stringify(expressionResult.value.result, null, 2)
    : expressionResult.value.error;
});
</script>

<template>
  <div class="grid gap-4">
    <div class="flex flex-wrap gap-2 align-items-center">
      <Button v-for="example in EXAMPLES" :key="example.label" :label="example.label" size="small" severity="secondary" outlined @click="loadExample(example)" />
    </div>

    <div class="grid gap-2">
      <label class="text-sm font-medium">Expression AST</label>
      <Textarea v-model="astText" rows="10" class="font-mono text-sm" auto-resize />
      <label class="text-sm font-medium">Scope</label>
      <Textarea v-model="scopeText" rows="4" class="font-mono text-sm" auto-resize />
      <label class="text-sm font-medium">Match subject (optional, for exhaustiveness check)</label>
      <Textarea v-model="matchSubjectText" rows="3" class="font-mono text-sm" auto-resize />
      <Button label="Evaluate" icon="pi pi-play" size="small" @click="runExpression" />
    </div>

    <Message v-if="expressionResult?.ok === false" severity="error" :closable="false">{{ resultSummary }}</Message>
    <div v-else-if="expressionResult" class="p-3 border-round surface-100 font-mono text-sm white-space-pre-wrap">{{ resultSummary }}</div>
    <Message v-if="expressionResult?.match?.length" severity="warn" :closable="false">
      Match diagnostics: {{ expressionResult.match.join('; ') }}
    </Message>

    <Divider />

    <div class="grid gap-2">
      <label class="text-sm font-medium">Instance check</label>
      <Select v-model="selectedTypeId" :options="typeOptions" option-label="label" option-value="value" placeholder="Type" />
      <Textarea v-model="instanceText" rows="8" class="font-mono text-sm" auto-resize />
      <Button label="Validate" icon="pi pi-check" size="small" @click="runInstance" />
    </div>
    <Message v-if="instanceResult?.ok" severity="success" :closable="false">instance is well-typed</Message>
    <Message v-else-if="instanceResult" severity="error" :closable="false">{{ instanceResult.errors.join('; ') }}</Message>
  </div>
</template>
