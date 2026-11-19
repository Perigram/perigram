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
      values.forEach(value => validateAggregateValue(ast.op, value));
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
// Async twin for authoritative server validation. Collection resolvers may
// perform organization-scoped database reads; finite limits and short-circuit
// semantics are identical to the synchronous preview evaluator.
export async function evaluateAsync(ast, scope = {}, budget = { steps: MAX_STEPS }) {
  budget.steps = Number.isFinite(budget.steps) ? budget.steps : MAX_STEPS;
  spend(budget, ast);
  const run = (node, nested = scope) => evaluateAsync(node, nested, budget);
  switch (ast?.op) {
    case 'lit': return ast.value;
    case 'var':
      if (!(ast.name in scope)) throw new Error(`unbound variable ${ast.name}`);
      return scope[ast.name];
    case 'field': {
      let current = ast.of ? await run(ast.of) : scope;
      for (const key of ast.path || []) {
        if (current == null) return null;
        if (typeof current !== 'object') throw new Error(`field ${key}: not navigable`);
        current = current[key];
      }
      return current;
    }
    case 'eq': return deepEqual(await run(ast.args[0]), await run(ast.args[1]));
    case 'ne': return !deepEqual(await run(ast.args[0]), await run(ast.args[1]));
    case 'in': {
      const member = await run(ast.args[0]);
      return finiteList(await run(ast.args[1]), 'in').some(item => deepEqual(item, member));
    }
    case 'lt': case 'lte': case 'gt': case 'gte': {
      const a = await run(ast.args[0]);
      const b = await run(ast.args[1]);
      if (isQuantity(a) || isQuantity(b)) {
        const unified = unify(a, b);
        return compare(unified.a.value, unified.b.value, ast.op);
      }
      return compare(a, b, ast.op);
    }
    case 'and': return Boolean(await run(ast.args[0])) && Boolean(await run(ast.args[1]));
    case 'or': return Boolean(await run(ast.args[0])) || Boolean(await run(ast.args[1]));
    case 'not': return !Boolean(await run(ast.arg));
    case 'add': case 'sub': case 'mul': case 'div': {
      const a = await run(ast.args[0]);
      const b = await run(ast.args[1]);
      if (isQuantity(a) || isQuantity(b)) {
        const unified = unify(a, b);
        const value = arithmetic(unified.a.value, unified.b.value, ast.op);
        if (unified.a.unit === 'currency' && !Number.isInteger(value)) throw new Error('currency arithmetic must stay in integer minor units');
        return { value, unit: unified.a.unit };
      }
      return arithmetic(a, b, ast.op);
    }
    case 'related': case 'children': case 'descendants': {
      const owner = ast.of ? await run(ast.of) : scope.value;
      const resolver = ast.op === 'related' ? budget.resolveRelation
        : ast.op === 'children' ? budget.resolveChildren : budget.resolveDescendants;
      if (typeof resolver !== 'function') throw new Error(`${ast.op} requires an authorized collection resolver`);
      const resolved = ast.op === 'related'
        ? await resolver(owner, String(ast.key || ''), scope)
        : await resolver(owner, scope);
      return finiteList(resolved, ast.op);
    }
    case 'exists': case 'all': case 'none': case 'one': {
      const list = finiteList(await run(ast.list), ast.op);
      const variable = String(ast.var || '');
      if (!variable) throw new Error(`${ast.op} requires a bound variable`);
      let matches = 0;
      for (const item of list) {
        const matched = Boolean(await run(ast.body, { ...scope, [variable]: item }));
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
      const list = finiteList(await run(ast.list), ast.op);
      if (ast.op === 'count' && ast.body == null) return list.length;
      const variable = String(ast.var || '');
      if (!variable) throw new Error(`${ast.op} requires a bound variable`);
      const values = [];
      for (const item of list) values.push(await run(ast.body, { ...scope, [variable]: item }));
      if (ast.op === 'count') return values.filter(Boolean).length;
      if (!values.length) return ast.op === 'sum' ? 0 : null;
      values.forEach(value => validateAggregateValue(ast.op, value));
      if (ast.op === 'sum') return values.slice(1).reduce((total, value) => {
        if (isQuantity(total) || isQuantity(value)) {
          const unified = unify(total, value);
          return { value: unified.a.value + unified.b.value, unit: unified.a.unit };
        }
        if (typeof total !== 'number' || typeof value !== 'number') throw new Error('sum requires numeric values');
        return total + value;
      }, values[0]);
      let selected = values[0];
      for (const value of values.slice(1)) {
        if (isQuantity(selected) || isQuantity(value)) {
          const unified = unify(selected, value);
          if ((ast.op === 'min' && unified.b.value < unified.a.value) || (ast.op === 'max' && unified.b.value > unified.a.value)) selected = value;
        } else {
          if (typeof selected !== typeof value || !['number', 'string'].includes(typeof value)) throw new Error(`${ast.op} requires comparable homogeneous values`);
          if ((ast.op === 'min' && value < selected) || (ast.op === 'max' && value > selected)) selected = value;
        }
      }
      return selected;
    }
    case 'map': {
      const list = finiteList(await run(ast.list), 'map');
      const result = [];
      for (const item of list) result.push(await run(ast.body, { ...scope, [ast.var]: item }));
      return result;
    }
    case 'filter': {
      const list = finiteList(await run(ast.list), 'filter');
      const result = [];
      for (const item of list) if (await run(ast.body, { ...scope, [ast.var]: item })) result.push(item);
      return result;
    }
    case 'match': {
      const subject = await run(ast.expr);
      const tag = subject?.tag;
      if (!(tag in (ast.arms || {}))) throw new Error(`match not exhaustive: no arm for ${tag}`);
      return await run(ast.arms[tag]);
    }
    default: throw new Error(`unknown expression op ${ast?.op}`);
  }
}

// The boolean-subset checker (SPEC §7 guards, SPEC §6 relation target
// domains): comparisons, membership, and/or/not, field paths rooted at
// `value`, literals. Row-checking is best-effort — callers without a
// declared row skip the path check. One home for every boolean authoring
// surface; error lines carry the caller's path prefix.
const BOOLEAN_COMPARISON_OPS = new Set(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in']);

export function checkBooleanExpression(ast, rowNames = null, path = 'expression', initialBindings = []) {
  const errors = [];
  visit(ast, 0, new Set(initialBindings));
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

function validateAggregateValue(operation, value) {
  if (isQuantity(value)) return;
  if (operation === 'sum' && typeof value !== 'number') {
    throw new Error('sum requires numeric values');
  }
  if (operation !== 'sum' && !['number', 'string'].includes(typeof value)) {
    throw new Error(`${operation} requires comparable homogeneous values`);
  }
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


// Static type checking for relation and containment traversal. The runtime
// still resolves collections through organization-scoped authorized readers.
export function checkTypedBooleanExpression(ast, { rootType, types, path = 'expression' } = {}) {
  const errors = checkBooleanExpression(ast, new Set(Object.keys(rootType?.fields || {})), path, ['value']);
  if (!rootType?.id || !(types instanceof Map)) {
    errors.push(path + ': typed traversal requires a root type and compiled type view');
    return errors;
  }
  const scope = new Map([['value', [rootType.id]]]);
  visit(ast, scope);
  requireBoolean(infer(ast, scope), 'predicate');
  return [...new Set(errors)];

  function visit(node, scope) {
    if (!node || typeof node !== 'object') return;
    if (node.op === 'field') {
      resolveFieldDescriptor(node, scope);
      if (node.of) visit(node.of, scope);
      return;
    }
    if (node.op === 'related' || node.op === 'children' || node.op === 'descendants') {
      resolveCollectionTypes(node, scope);
      if (node.of) visit(node.of, scope);
      return;
    }
    if (['exists', 'all', 'none', 'one', 'count', 'sum', 'min', 'max', 'map', 'filter'].includes(node.op)) {
      visit(node.list, scope);
      const variable = String(node.var || '');
      if (variable && node.body) {
        const nested = new Map(scope);
        nested.set(variable, resolveCollectionTypes(node.list, scope));
        visit(node.body, nested);
      }
      return;
    }
    if (node.op === 'match') {
      visit(node.expr, scope);
      for (const arm of Object.values(node.arms || {})) visit(arm, scope);
      return;
    }
    if (node.arg) visit(node.arg, scope);
    for (const argument of node.args || []) visit(argument, scope);
  }

  function infer(node, bindings) {
    if (!node || typeof node !== 'object') return null;
    switch (node.op) {
      case 'lit':
        if (node.value === null) return { base: 'null' };
        if (typeof node.value === 'boolean') return { base: 'boolean' };
        if (typeof node.value === 'number') return { base: 'number' };
        if (typeof node.value === 'string') return { base: 'string' };
        if (Array.isArray(node.value)) return { base: 'list', itemType: null };
        return { base: 'json' };
      case 'var':
        return bindings.has(String(node.name || '')) ? { base: 'entity', types: bindings.get(String(node.name || '')) } : null;
      case 'field':
        return resolveFieldDescriptor(node, bindings);
      case 'related':
      case 'children':
      case 'descendants':
        return { base: 'list', itemType: { base: 'entity', types: resolveCollectionTypes(node, bindings) } };
      case 'exists':
      case 'all':
      case 'none':
      case 'one': {
        const list = infer(node.list, bindings);
        const nested = new Map(bindings);
        nested.set(String(node.var || ''), list?.itemType?.types || []);
        requireBoolean(infer(node.body, nested), node.op + ' body');
        return { base: 'boolean' };
      }
      case 'count':
        if (node.body) {
          const list = infer(node.list, bindings);
          const nested = new Map(bindings);
          nested.set(String(node.var || ''), list?.itemType?.types || []);
          infer(node.body, nested);
        }
        return { base: 'number' };
      case 'sum':
      case 'min':
      case 'max': {
        const list = infer(node.list, bindings);
        const nested = new Map(bindings);
        nested.set(String(node.var || ''), list?.itemType?.types || []);
        const result = infer(node.body, nested);
        if (result && !['number', 'quantity'].includes(result.base)) {
          errors.push(path + ': ' + node.op + ' requires a numeric or quantity body, got ' + result.base);
        }
        return result;
      }
      case 'not':
        requireBoolean(infer(node.arg, bindings), 'not operand');
        return { base: 'boolean' };
      case 'and':
      case 'or':
        (node.args || []).forEach((arg, index) => requireBoolean(infer(arg, bindings), node.op + ' argument ' + (index + 1)));
        return { base: 'boolean' };
      case 'eq':
      case 'ne':
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte': {
        const args = (node.args || []).map(arg => infer(arg, bindings));
        if (args.length === 2 && args[0] && args[1] && !compatible(args[0], args[1])) {
          errors.push(path + ': ' + node.op + ' compares incompatible types ' + args[0].base + ' and ' + args[1].base);
        }
        return { base: 'boolean' };
      }
      case 'in': {
        const args = (node.args || []).map(arg => infer(arg, bindings));
        const collection = args[1];
        if (args.length === 2 && collection && collection.base !== 'list' && collection.base !== 'map') {
          errors.push(path + ': in requires a list or map as its second argument');
        } else if (args.length === 2 && args[0] && collection?.itemType && !compatible(args[0], collection.itemType)) {
          errors.push(path + ': in member type ' + args[0].base + ' does not match collection item type ' + collection.itemType.base);
        }
        return { base: 'boolean' };
      }
      default:
        return null;
    }
  }

  function requireBoolean(descriptor, label) {
    if (descriptor && descriptor.base !== 'boolean') {
      errors.push(path + ': ' + label + ' must be boolean, got ' + descriptor.base);
    }
  }

  function compatible(left, right) {
    if (!left || !right || left.base === 'null' || right.base === 'null') return true;
    if (left.base === right.base) {
      if (left.base === 'quantity') return left.unit === right.unit;
      return true;
    }
    if (left.base === 'enum' && right.base === 'string') return true;
    if (right.base === 'enum' && left.base === 'string') return true;
    return false;
  }

  function resolveCollectionTypes(node, scope) {
    if (!node || typeof node !== 'object') return [];
    if (node.op === 'related') {
      const owners = node.of ? resolveEntityTypes(node.of, scope) : [rootType.id];
      const targets = new Set();
      const key = String(node.key || '');
      for (const ownerId of owners) {
        const owner = types.get(ownerId);
        if (!owner) continue;
        const edge = owner.edges?.relations?.[key];
        if (edge) {
          for (const target of edge.types || []) targets.add(target);
          continue;
        }
        const refs = referenceTargets(owner.fields?.[key]);
        if (!refs.length) {
          errors.push(path + ': related key ' + (key || '(empty)') + ' is not a declared relation or ref field on ' + ownerId);
          continue;
        }
        for (const target of refs) {
          if (!types.has(target)) errors.push(path + ': related ' + key + ' targets unknown type ' + target);
          else targets.add(target);
        }
      }
      if (!owners.length) errors.push(path + ': related traversal owner has no statically known CTS type');
      return [...targets];
    }
    if (node.op === 'children' || node.op === 'descendants') {
      const owners = node.of ? resolveEntityTypes(node.of, scope) : [rootType.id];
      const targets = new Set();
      for (const ownerId of owners) {
        const owner = types.get(ownerId);
        const entries = Object.entries(owner?.edges?.children || {}).filter(([key]) => !node.key || key === String(node.key));
        if (!entries.length) {
          errors.push(path + ': ' + node.op + ' has no declared containment' + (node.key ? ' key ' + node.key : '') + ' on ' + ownerId);
          continue;
        }
        for (const [, edge] of entries) for (const target of edge.types || []) {
          if (!types.has(target)) errors.push(path + ': containment targets unknown type ' + target);
          else targets.add(target);
        }
      }
      if (node.op === 'descendants') {
        const queue = [...targets];
        while (queue.length) {
          const current = queue.shift();
          for (const edge of Object.values(types.get(current)?.edges?.children || {})) {
            for (const target of edge.types || []) if (!targets.has(target)) {
              targets.add(target);
              queue.push(target);
            }
          }
        }
      }
      if (!owners.length) errors.push(path + ': ' + node.op + ' traversal owner has no statically known CTS type');
      return [...targets];
    }
    return resolveEntityTypes(node, scope);
  }

  function resolveEntityTypes(node, scope) {
    if (!node || typeof node !== 'object') return [];
    if (node.op === 'var') return scope.get(String(node.name || '')) || [];
    if (node.op === 'field') return referenceTargets(resolveFieldDescriptor(node, scope)).filter(id => types.has(id));
    return [];
  }

  function resolveFieldDescriptor(node, scope) {
    const fieldPath = Array.isArray(node.path) ? [...node.path] : [];
    let owners;
    if (!node.of) {
      if (fieldPath[0] !== 'value') return null;
      fieldPath.shift();
      owners = [rootType.id];
    } else owners = resolveEntityTypes(node.of, scope);
    if (!owners.length) {
      if (node.of) errors.push(path + ': field traversal owner has no statically known CTS type');
      return null;
    }
    const descriptors = [];
    for (const ownerId of owners) {
      let descriptor = null;
      let row = types.get(ownerId)?.fields || {};
      for (const key of fieldPath) {
        descriptor = row?.[key] || null;
        if (!descriptor) {
          errors.push(path + ': field ' + key + ' is not declared on ' + ownerId);
          break;
        }
        row = descriptor.base === 'record' ? descriptor.fields || {} : null;
      }
      if (descriptor) descriptors.push(descriptor);
    }
    if (!descriptors.length) return null;
    const first = descriptors[0];
    for (const descriptor of descriptors.slice(1)) if (descriptor.base !== first.base) {
      errors.push(path + ': field path has incompatible declared types across traversal targets');
    }
    return first;
  }
}

function referenceTargets(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') return [];
  if (descriptor.base === 'ref') return descriptor.accepts || [];
  if (descriptor.base === 'list' && descriptor.itemType?.base === 'ref') return descriptor.itemType.accepts || [];
  return [];
}
