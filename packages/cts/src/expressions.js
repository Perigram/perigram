// Expressions (SPEC §18): CEL semantics — total, no recursion, iteration only
// as comprehensions. Expressions are JSON ASTs (no parser by design); the
// evaluator enforces a step budget so totality is mechanical, not aspirational.
import { unify } from './units.js';

export const MAX_STEPS = 10000;

// AST nodes:
// { op: 'lit', value }
// { op: 'field', path: ['a','b'] }
// { op: 'var', name }                      -- bound by comprehensions
// { op: 'eq'|'ne'|'lt'|'lte'|'gt'|'gte'|'and'|'or', args: [e, e] }
// { op: 'not', arg: e }
// { op: 'add'|'sub'|'mul'|'div', args: [e, e] }   -- unit-unified (R3)
// { op: 'map', list: e, var: 'x', body: e }
// { op: 'filter', list: e, var: 'x', body: e }
// { op: 'match', expr: e, arms: { tag: e }, subjectType } -- exhaustive (R-match)
export function evaluate(ast, scope = {}, budget = { steps: MAX_STEPS }) {
  spend(budget, ast);
  switch (ast?.op) {
    case 'lit': return ast.value;
    case 'var': {
      if (!(ast.name in scope)) throw new Error(`unbound variable ${ast.name}`);
      return scope[ast.name];
    }
    case 'field': {
      let current = evaluate(ast.of || { op: 'lit', value: scope }, scope, budget);
      if (ast.of) current = evaluate(ast.of, scope, budget);
      for (const key of ast.path || []) {
        if (current === null || current === undefined) return null;
        if (typeof current !== 'object') throw new Error(`field ${key}: not navigable`);
        current = current[key];
      }
      return current;
    }
    case 'eq': return deepEqual(evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget));
    case 'ne': return !deepEqual(evaluate(ast.args[0], scope, budget), evaluate(ast.args[1], scope, budget));
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
    case 'map': {
      const list = evaluate(ast.list, scope, budget);
      if (!Array.isArray(list)) throw new Error('map requires a list');
      return list.map(item => evaluate(ast.body, { ...scope, [ast.var]: item }, budget));
    }
    case 'filter': {
      const list = evaluate(ast.list, scope, budget);
      if (!Array.isArray(list)) throw new Error('filter requires a list');
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
