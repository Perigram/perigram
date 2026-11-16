import { describe, expect, it } from 'vitest';
import { evaluate, checkBooleanExpression } from './expressions.js';

describe('generalized finite constraint expressions', () => {
  it('supports nested relation traversal with quantifiers', () => {
    const value = {
      accounts: [
        { active: true, invoices: [{ amount: 12 }, { amount: 20 }] },
        { active: false, invoices: [{ amount: 2 }] }
      ]
    };
    const ast = {
      op: 'all',
      list: { op: 'related', of: { op: 'field', path: ['value'] }, key: 'accounts' },
      var: 'account',
      body: {
        op: 'or',
        args: [
          { op: 'not', arg: { op: 'field', of: { op: 'var', name: 'account' }, path: ['active'] } },
          {
            op: 'exists',
            list: { op: 'related', of: { op: 'var', name: 'account' }, key: 'invoices' },
            var: 'invoice',
            body: { op: 'gt', args: [
              { op: 'field', of: { op: 'var', name: 'invoice' }, path: ['amount'] },
              { op: 'lit', value: 10 }
            ] }
          }
        ]
      }
    };
    const result = evaluate(ast, { value }, {
      steps: 1000,
      resolveRelation: (owner, key) => owner[key]
    });
    expect(result).toBe(true);
  });

  it('supports all finite quantifiers and aggregate operations', () => {
    const scope = { value: [1, 2, 3, 4] };
    const list = { op: 'field', path: ['value'] };
    const predicate = { op: 'gt', args: [{ op: 'var', name: 'n' }, { op: 'lit', value: 2 }] };
    expect(evaluate({ op: 'exists', list, var: 'n', body: predicate }, scope)).toBe(true);
    expect(evaluate({ op: 'all', list, var: 'n', body: { op: 'gt', args: [{ op: 'var', name: 'n' }, { op: 'lit', value: 0 }] } }, scope)).toBe(true);
    expect(evaluate({ op: 'none', list, var: 'n', body: { op: 'lt', args: [{ op: 'var', name: 'n' }, { op: 'lit', value: 0 }] } }, scope)).toBe(true);
    expect(evaluate({ op: 'one', list, var: 'n', body: { op: 'eq', args: [{ op: 'var', name: 'n' }, { op: 'lit', value: 3 }] } }, scope)).toBe(true);
    expect(evaluate({ op: 'count', list, var: 'n', body: predicate }, scope)).toBe(2);
    expect(evaluate({ op: 'sum', list, var: 'n', body: { op: 'var', name: 'n' } }, scope)).toBe(10);
    expect(evaluate({ op: 'min', list, var: 'n', body: { op: 'var', name: 'n' } }, scope)).toBe(1);
    expect(evaluate({ op: 'max', list, var: 'n', body: { op: 'var', name: 'n' } }, scope)).toBe(4);
  });

  it('requires finite authorized relation resolvers and rejects unbound variables', () => {
    expect(() => evaluate({ op: 'related', key: 'items' }, { value: {} })).toThrow(/authorized collection resolver/);
    expect(() => evaluate({ op: 'exists', list: { op: 'lit', value: [] }, var: 'x', body: { op: 'var', name: 'y' } })).toThrow(/unbound variable/);
    expect(checkBooleanExpression({
      op: 'exists',
      list: { op: 'related', key: 'items' },
      var: 'item',
      body: { op: 'gt', args: [
        { op: 'field', of: { op: 'var', name: 'item' }, path: ['amount'] },
        { op: 'lit', value: 0 }
      ] }
    })).toEqual([]);
  });
});
