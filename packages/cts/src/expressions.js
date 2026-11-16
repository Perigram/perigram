// Expressions (SPEC §18): CEL semantics — total, no recursion, iteration only
// as comprehensions. Expressions are JSON ASTs (no parser by design); the
// evaluator enforces a step budget so totality is mechanical, not aspirational.
import { unify } from './units.js';

export const MAX_STEPS = 10000;
export const MAX_COLLECTION_ITEMS = 10000;

// AST nodes:
// { op: 'lit', value }
// { op: 'field', path: ['a','b'] }
// { op: 'var', name }                      -- bound by comprehensions
// { op: 'eq'|'ne'|'lt'|'lte'|'gt'|'gte'|'and'|'or', args: [e, e] }
// { op: 'not', arg: e }
// { op: 'add'|'sub'|'mul'|'div', args: [e, e] }   -- unit-unified (R3)
// { op: 'map'|'filter', list: e, var: 'x', body: e }
// { op: 'exists'|'all'|'none'|'one', list: e, var: 'x', body: e }
// { op: 'count', list: e, var?: 'x', body?: e }
// { op: 'sum'|'min'|'max', list: e, var: 'x', body: e }
// { op: 'related', of: e, key: relationId } | { op: 'children'|'descendants', of: e }
// { op: 'match', expr: e, arms: { tag: e }, subjectType } -- exhaustive (R-match)
export function evaluate(ast, scope = {}, budget = { steps: MAX_STEPS }) {
  budget.steps = Number.isFinite(budget.steps) ? budget.steps : MAX_STEPS;
  spend(budget, ast);
  switch (ast?.op) {
    case 'lit': return ast.value;
    case 'var': {
      if (!(ast.name in scope)) throw new Error(`unbound variable ${ast.name}`);
      return scope[ast.name];
    }
    case 'field': {
      let current = ast.of ? evaluate(ast.of, scope, budget) : scope;
      for (const key of ast.path || []) {
        if (current === null || current === undefined) return null;
        if (typeof current !== 'object') throw new Error(`field ${key}: not navigable`);
        current = current[key];
      }
      return current;
    }
    case 'eq': return deepEqual(evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget));
    case 'ne': return !deepEqual(evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget));
    case 'in': {
      // CEL membership: scalar in list (deep-equal items).
      const [member, list] = [evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget)];
      finiteList(list, 'in');
      return list.some(item => deepEqual(item, member));
    }
    case 'lt': case 'lte': case 'gt': case 'gte': {
      const [a, b] = [evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget)];
      if (isQuantity(a) || isQuantity(b)) {
        const unified = unify(a, b);
        return compare(unified.a.value, unified.b.value, ast.op);
      }
      return compare(a, b, ast.op);
    }
    case 'and': return Boolean(evaluate(ast.args[0], scope, budget)) && Boolean(evaluate(ast.args[1], scope, budget));
    case 'or': return Boolean(evaluate(ast.args[0], scope, budget)) || Boolean(evaluate(ast.args[1], scope, budget));
    case 'not': return !Boolean(evaluate(ast.arg, scope, budget));
    case 'add': case 'sub': case 'mul': case 'div': {
      const [a, b] = [evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget)];
      if (isQuantity(a) || isQuantity(b)) {
        const unified = unify(a, b);
        const value = arithmetic(unified.a.value, unified.b.value, ast.op);
        // Minor-unit money (SPEC §2): currency arithmetic that would lose
        // minor units (fractional results) is refused, not rounded.
        if (unified.a.unit === 'currency' && !Number.isInteger(value)) {
          throw new Error('currency arithmetic must stay in integer minor units');
        }
        return { value, unit: unified.a.unit };
      }
      return arithmetic(a, b, ast.op);
    }
    case 'related': case 'children': case 'descendants': {
      const owner = ast.of ? evaluate(ast.of, scope, budget) : scope.value;
      const resolver = ast.op === 'related'
        ? budget.resolveRelation
        : ast.op === 'children' ? budget.resolveChildren : budget.resolveDescendants;
      if (typeof resolver !== 'function') throw new Error(`${ast.op} requires an authorized collection resolver`);
      const resolved = ast.op === 'related'
        ? resolver(owner, String(ast.key || ''), scope)
        : resolver(owner, scope);
      return finiteList(resolved, ast.op);
    }
    case 'exists': case 'all': case 'none': case 'one': {
      const list = evaluate(ast.list, scope, budget);
      finiteList(list, ast.op);
      const variable = String(ast.var || '');
      if (!variable) throw new Error(`${ast.op} requires a bound variable`);
      let matches = 0;
      for (const item of list) {
        const matched = Boolean(evaluate(ast.body, { ...scope, [variable]: item }, budget));
        if (matched) matches += 1;
        if (ast.op === 'exists' && matched) return true;
        if (ast.op === 'all' && !matched) return false;
        if (ast.op === 'none' && matched) return false;
        if (ast.op === 'one' && matches > 1) return false;
      }
      if (ast.op === 'exists') return false;
      if (ast.op === 'all' || ast.op === 'none') return true;
      return matches === 1;
    }
    case 'count': case 'sum': case 'min': case 'max': {
      const list = evaluate(ast.list, scope, budget);
      finiteList(list, ast.op);
      if (ast.op === 'count' && ast.body == null) return list.length;
      const variable = String(ast.var || '');
      if (!variable) throw new Error(`${ast.op} requires a bound variable`);
      const values = list.map(item => evaluate(ast.body, { ...scope, [variable]: item }, budget));
      if (ast.op === 'count') return values.filter(Boolean).length;
      if (!values.length) return ast.op === 'sum' ? 0 : null;
      if (ast.op === 'sum') {
        return values.slice(1).reduce((total, value) => {
          if (isQuantity(total) || isQuantity(value)) {
            const unified = unify(total, value);
            return { value: unified.a.value + unified.b.value, unit: unified.a.unit };
          }
          if (typeof total !== 'number' || typeof value !== 'number') throw new Error('sum requires numeric values');
          return total + value;
        }, values[0]);
      }
      let selected = values[0];
      for (const value of values.slice(1)) {
        if (isQuantity(selected) || isQuantity(value)) {
          const unified = unify(selected, value);
          if ((ast.op === 'min' && unified.b.value < unified.a.value)
            || (ast.op === 'max' && unified.b.value > unified.a.value)) selected = value;
        } else {
          if (typeof selected !== typeof value || !['number', 'string'].includes(typeof value)) {
            throw new Error(`${ast.op} requires comparable homogeneous values`);
          }
          if ((ast.op === 'min' && value < selected) || (ast.op === 'max' && value > selected)) selected = value;
        }
      }
      return selected;
    }
    case 'map': {
      const list = evaluate(ast.list, scope, budget);
      finiteList(list, 'map');
      return list.map(item => evaluate(ast.body, { ...scope, [ast.var]: item }, budget));
    }
    case 'filter': {
      const list = evaluate(ast.list, scope, budget);
      finiteList(list, 'filter');
      return list.filter(item => Boolean(evaluate(ast.body, { ...scope, [ast.var]: item }, budget)));
    }
    case 'match': {
      const subject = evaluate(ast.expr, scope, budget);
      const tag = subject?.tag;
      if (!(tag in (ast.arms || {}))) throw new Error(`match not exhaustive: no arm for ${tag}`);
      return evaluate(ast.arms[tag], scope, budget);
    }
    default:
      throw new Error(`unknown expression op ${ast?.op}`);
  }
}

// Exhaustiveness checked at compile time against the variant descriptor.
export function checkMatch(ast, variantDescriptor) {
  if (ast?.op !== 'match') return [];
  const arms = Object.keys(ast.arms || {});
  const missing = (variantDescriptor?.tags || []).filter(tag => !arms.includes(tag));
  return missing.map(tag => `match missing arm for ${tag}`);
}

// The boolean-subset checker (SPEC §7 guards, SPEC §6 relation target
// domains): comparisons, membership, and/or/not, field paths rooted at
// `value`, literals. Row-checking is best-effort — callers without a
// declared row skip the path check. One home for every boolean authoring
// surface; error lines carry the caller's path prefix.
const BOOLEAN_COMPARISON_OPS = new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in']);

export function checkBooleanExpression(ast, rowNames = null, path = 'expression') {
  const errors = [];
  visit(ast, 0, new Set());
  return errors;

  function visit(node, depth, bound = new Set()) {
    if (!node || typeof node !== 'object' || typeof node.op !== 'string') {
      errors.push(`${path}: expression nodes must carry an op`);
      return;
    }
    if (depth > 32) {
      errors.push(`${path}: expression nesting exceeds 32 levels`);
      return;
    }
    const { op } = node;
    if (op === 'lit') return;
    if (op === 'var') {
      if (!bound.has(String(node.name || ''))) errors.push(`${path}: unbound variable ${node.name || ''}`);
      return;
    }
    if (op === 'field') {
      const fieldPath = node.path;
      if (node.of) {
        visit(node.of, depth + 1, bound);
        if (!Array.isArray(fieldPath) || !fieldPath.length) errors.push(`${path}: nested field path must not be empty`);
      } else if (!Array.isArray(fieldPath) || fieldPath[0] !== 'value' || fieldPath.length < 2) {
        errors.push(`${path}: field path must start at 'value'`);
      } else if (rowNames && !rowNames.has(String(fieldPath[1]))) {
        errors.push(`${path}: field ${fieldPath.slice(1).join('.')} outside the row`);
      }
      return;
    }
    if (op === 'related' || op === 'children' || op === 'descendants') {
      if (node.of) visit(node.of, depth + 1, bound);
      if (op === 'related' && !String(node.key || '').trim()) errors.push(`${path}: related requires a relation key`);
      return;
    }
    if (['exists', 'all', 'none', 'one', 'count', 'sum', 'min', 'max'].includes(op)) {
      visit(node.list, depth + 1, bound);
      const variable = String(node.var || '');
      if (!variable && !(op === 'count' && !node.body)) errors.push(`${path}: ${op} requires a bound variable`);
      if (node.body) visit(node.body, depth + 1, new Set([...bound, variable]));
      else if (op !== 'count') errors.push(`${path}: ${op} requires a body expression`);
      return;
    }
    if (op === 'not') {
      visit(node.arg, depth + 1, bound);
      return;
    }
    if (!BOOLEAN_COMPARISON_OPS.has(op) && op !== 'and' && op !== 'or') {
      errors.push(`${path}: op ${op} is not boolean vocabulary`);
      return;
    }
    const args = Array.isArray(node.args) ? node.args : [];
    if (args.length !== 2) {
      errors.push(`${path}: ${op} requires two arguments`);
      return;
    }
    for (const arg of args) visit(arg, depth + 1, bound);
  }
}

function finiteList(value, operation) {
  if (!Array.isArray(value)) throw new Error(`${operation} requires a list`);
  if (value.length > MAX_COLLECTION_ITEMS) {
    throw new Error(`${operation} exceeds collection item limit (${MAX_COLLECTION_ITEMS})`);
  }
  return value;
}

function spend(budget, ast) {
  budget.steps -= 1;
  if (budget.steps <= 0) {
    throw new Error(`expression exceeded step budget (${MAX_STEPS}) — totality violation`);
  }
  return ast;
}

function isQuantity(value) {
  return value && typeof value === 'object' && typeof value.value === 'number' && typeof value.unit === 'string';
}

function compare(a, b, op) {
  switch (op) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    default: return false;
  }
}

function arithmetic(a, b, op) {
  switch (op) {
    case 'add': return a + b;
    case 'sub': return a - b;
    case 'mul': return a * b;
    case 'div': {
      if (b === 0) throw new Error('division by zero');
      return a / b;
    }
    default: throw new Error(`unknown arithmetic op ${op}`);
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (isQuantity(a) && isQuantity(b)) {
    const unified = unify(a, b);
    return unified.a.value === unified.b.value;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every(key => deepEqual(a[key], b[key]));
  }
  return false;
}
