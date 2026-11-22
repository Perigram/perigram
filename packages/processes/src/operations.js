// The operation registry — the one home for every polymorphic operation
// (SPEC §8 atomicity law): a kind whose operation is an authored
// discriminator owns, per operation, its socket contract and its
// evaluation here. The catalog's port projection, the evaluator, and the
// authoring defaults derive from this table; nothing else restates
// operation lists. `base: 'configured'` defers the socket type to the
// node's authored type.
import { durationMs } from '@perigram/cts';
import { isMissingField } from './missing-field.js';
import { solveDataTrees } from './data-tree.js';

const num = { base: 'number' };
const str = { base: 'string' };

// `value.convertUnit` factors: the node converts within these units; the
// catalog's authoring picks and the evaluator's arithmetic read the same
// set (run environments may extend it with `context.units`).
export const CONVERT_UNIT_FACTORS = Object.freeze({
  mm: 1, cm: 10, m: 1000, mm2: 1, cm2: 100, m2: 1_000_000,
  minute: 60_000, hour: 3_600_000, degree: 1, radian: 180 / Math.PI
});

const unary = (input, output, run) => ({ inputs: [input], output, run });
const pair = (left, right, output, run) => ({
  inputs: [left, right],
  output,
  run
});

const dateIn = { id: 'date', base: 'dateTime' };
const durationIn = { id: 'duration', base: 'duration' };
const numberOut = { id: 'value', base: 'number' };
const stringOut = { id: 'value', base: 'string' };
const dateTimeOut = { id: 'value', base: 'dateTime' };

const MATH_UNARY = {
  absolute: Math.abs,
  negate: value => -Number(value),
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  trunc: Math.trunc,
  sign: Math.sign,
  sqrt: value => {
    if (Number(value) < 0) throw new Error('Square root requires a non-negative value');
    return Math.sqrt(Number(value));
  }
};

const MATH_BINARY = {
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide: (a, b) => {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
  },
  modulo: (a, b) => a % b,
  power: (a, b) => a ** b,
  min: Math.min,
  max: Math.max
};

const number = value => Number(value);

const DATE_DIFF_DIVISORS = {
  differenceDays: 86_400_000,
  differenceHours: 3_600_000,
  differenceMinutes: 60_000
};

const DATE_AMOUNT_MS = {
  addDays: 86_400_000,
  addHours: 3_600_000,
  addMinutes: 60_000
};

function dateValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date ${value}`);
  return date;
}

function dateArithmetic(date, adjustment, direction, milliseconds) {
  date.setTime(date.getTime() + direction * milliseconds);
  return date.toISOString();
}

const REDUCERS = {
  sum: values => values.reduce((total, value) => total + Number(value), 0),
  average: values => (values.length
    ? values.reduce((total, value) => total + Number(value), 0) / values.length
    : null),
  min: values => (values.length ? Math.min(...values.map(Number)) : null),
  max: values => (values.length ? Math.max(...values.map(Number)) : null)
};

export const PROCESS_OPERATION_REGISTRY = Object.freeze({
  'value.math': Object.freeze({
    ...Object.fromEntries(Object.entries(MATH_UNARY).map(([id, run]) => [
      id,
      unary({ id: 'value', base: 'number' }, numberOut, value => run(Number(value)))
    ])),
    clamp: {
      inputs: [
        { id: 'value', base: 'number' },
        { id: 'min', base: 'number' },
        { id: 'max', base: 'number' }
      ],
      output: numberOut,
      run: (value, min, max) => Math.min(Number(max), Math.max(Number(min), Number(value)))
    },
    ...Object.fromEntries(Object.entries(MATH_BINARY).map(([id, run]) => [
      id,
      pair({ id: 'left', base: 'number' }, { id: 'right', base: 'number' }, numberOut,
        (left, right) => run(number(left), number(right)))
    ]))
  }),

  'value.string': Object.freeze({
    concat: pair({ id: 'left', base: 'string' }, { id: 'right', base: 'string' }, stringOut,
      (left, right) => `${left ?? ''}${right ?? ''}`),
    replace: {
      inputs: [
        { id: 'text', base: 'string' },
        { id: 'search', base: 'string' },
        { id: 'replacement', base: 'string' }
      ],
      output: stringOut,
      run: (text, search, replacement) => String(text).split(String(search)).join(String(replacement))
    },
    substring: {
      inputs: [
        { id: 'text', base: 'string' },
        { id: 'start', base: 'integer' },
        { id: 'end', base: 'integer', optional: true }
      ],
      output: stringOut,
      run: (text, start, end) => String(text).slice(Number(start), end === undefined ? undefined : Number(end))
    },
    split: pair({ id: 'text', base: 'string' }, { id: 'separator', base: 'string' },
      { id: 'value', base: 'string', access: 'list' },
      (text, separator) => String(text).split(String(separator))),
    join: {
      inputs: [{ id: 'items', base: 'string', access: 'list' }, { id: 'separator', base: 'string' }],
      output: stringOut,
      run: (items, separator) => items.join(String(separator))
    },
    length: unary({ id: 'value', base: 'string' }, { id: 'value', base: 'integer' },
      value => String(value).length),
    lower: unary({ id: 'value', base: 'string' }, stringOut, value => String(value).toLowerCase()),
    upper: unary({ id: 'value', base: 'string' }, stringOut, value => String(value).toUpperCase()),
    trim: unary({ id: 'value', base: 'string' }, stringOut, value => String(value).trim()),
    padStart: {
      inputs: [
        { id: 'text', base: 'string' },
        { id: 'length', base: 'integer' },
        { id: 'pad', base: 'string', optional: true }
      ],
      output: stringOut,
      run: (text, length, pad) => String(text).padStart(Number(length), pad === undefined ? ' ' : String(pad))
    },
    padEnd: {
      inputs: [
        { id: 'text', base: 'string' },
        { id: 'length', base: 'integer' },
        { id: 'pad', base: 'string', optional: true }
      ],
      output: stringOut,
      run: (text, length, pad) => String(text).padEnd(Number(length), pad === undefined ? ' ' : String(pad))
    },
    indexOf: pair({ id: 'text', base: 'string' }, { id: 'search', base: 'string' },
      { id: 'value', base: 'integer' },
      (text, search) => String(text).indexOf(String(search))),
    repeat: pair({ id: 'text', base: 'string' }, { id: 'count', base: 'integer' }, stringOut,
      (text, count) => String(text).repeat(Number(count))),
    toNumber: unary({ id: 'value', base: 'string' }, numberOut, value => {
      const parsed = Number(value);
      if (value == null || value === '' || Number.isNaN(parsed)) {
        throw new Error(`Cannot parse ${JSON.stringify(value)} as number`);
      }
      return parsed;
    }),
    toDateTime: unary({ id: 'value', base: 'string' }, dateTimeOut,
      value => dateValue(value).toISOString())
  }),

  'value.dateTime': Object.freeze({
    ...Object.fromEntries(Object.entries(DATE_DIFF_DIVISORS).map(([id, divisor]) => [
      id,
      pair({ id: 'left', base: 'dateTime' }, { id: 'right', base: 'dateTime' }, numberOut,
        (left, right) => (dateValue(left).getTime() - dateValue(right).getTime()) / divisor)
    ])),
    addDuration: {
      inputs: [dateIn, durationIn],
      output: dateTimeOut,
      run: (date, duration) => dateArithmetic(dateValue(date), duration, 1, durationMs(duration))
    },
    subtractDuration: {
      inputs: [dateIn, durationIn],
      output: dateTimeOut,
      run: (date, duration) => dateArithmetic(dateValue(date), duration, -1, durationMs(duration))
    },
    ...Object.fromEntries(Object.entries(DATE_AMOUNT_MS).map(([id, ms]) => [
      id,
      {
        inputs: [dateIn, { id: 'amount', base: 'number' }],
        output: dateTimeOut,
        run: (date, amount) => dateArithmetic(dateValue(date), amount, 1, Number(amount) * ms)
      }
    ])),
    addMonths: {
      inputs: [dateIn, { id: 'amount', base: 'number' }],
      output: dateTimeOut,
      run: (date, amount) => {
        const value = dateValue(date);
        value.setUTCMonth(value.getUTCMonth() + Number(amount));
        return value.toISOString();
      }
    },
    startOfDay: unary({ id: 'value', base: 'dateTime' }, dateTimeOut, value => {
      const date = dateValue(value);
      date.setUTCHours(0, 0, 0, 0);
      return date.toISOString();
    }),
    endOfDay: unary({ id: 'value', base: 'dateTime' }, dateTimeOut, value => {
      const date = dateValue(value);
      date.setUTCHours(23, 59, 59, 999);
      return date.toISOString();
    })
  }),

  'value.compare': Object.freeze({
    eq: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => stableKey(left) === stableKey(right)),
    neq: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => stableKey(left) !== stableKey(right)),
    gt: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => left > right),
    gte: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => left >= right),
    lt: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => left < right),
    lte: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => left <= right),
    contains: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => left?.includes?.(right) || false),
    startsWith: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => String(left).startsWith(String(right))),
    endsWith: pair({ id: 'left', base: 'configured' }, { id: 'right', base: 'configured' },
      { id: 'result', base: 'boolean' }, (left, right) => String(left).endsWith(String(right)))
  }),

  'value.logic': Object.freeze({
    and: booleanPair((a, b) => Boolean(a && b)),
    or: booleanPair((a, b) => Boolean(a || b)),
    xor: booleanPair((a, b) => Boolean(a) !== Boolean(b)),
    nand: booleanPair((a, b) => !Boolean(a && b)),
    nor: booleanPair((a, b) => !Boolean(a || b)),
    xnor: booleanPair((a, b) => Boolean(a) === Boolean(b)),
    not: unary({ id: 'left', base: 'boolean' }, { id: 'result', base: 'boolean' }, value => !value),
    // A missing field is neither null nor a present value: isNull is true
    // only for a present null, isNotNull only for a present non-null value.
    isNull: unary({ id: 'left', base: 'boolean' }, { id: 'result', base: 'boolean' }, value => value === null),
    isNotNull: unary({ id: 'left', base: 'boolean' }, { id: 'result', base: 'boolean' },
      value => value !== null && value !== undefined && !isMissingField(value))
  }),

  'collection.reduce': Object.freeze({
    ...Object.fromEntries(Object.entries(REDUCERS).map(([id, reduce]) => [
      id,
      {
        inputs: [{ id: 'items', base: 'number', access: 'list' }],
        output: numberOut,
        run: items => reduce(items.filter(value => value != null && !isMissingField(value)))
      }
    ]))
  })
});

function booleanPair(run) {
  return pair({ id: 'left', base: 'boolean' }, { id: 'right', base: 'boolean' },
    { id: 'result', base: 'boolean' }, run);
}

export function processOperationIds(kind = '') {
  return Object.keys(PROCESS_OPERATION_REGISTRY[kind] || {});
}

export function processOperation(kind = '', operation = '') {
  return PROCESS_OPERATION_REGISTRY[kind]?.[operation] || null;
}

// Evaluation: every operation is list-aware through the packet tree —
// inputs align per their declared access, one output item per alignment.
export function runProcessOperation(record = {}, packets = {}) {
  const operation = processOperation(record.kind, record.operation);
  if (!operation) {
    throw new Error(`Node ${record.id || record.kind} uses unsupported operation ${record.operation || '(none)'}`);
  }
  const inputs = operation.inputs
    .filter(input => !input.optional || packets[input.id])
    .map(input => ({ tree: requiredPacket(packets, input.id, record), access: input.access || 'item' }));
  return solveDataTrees(inputs, values => operation.run(...values), {
    matching: record.matching,
    outputAccess: operation.output.access || 'item'
  });
}

function requiredPacket(packets, id, record) {
  if (!packets[id]) throw new Error(`Node ${record.id || record.kind} requires input ${id}`);
  return packets[id];
}

// Stable structural equality: two values with the same content match
// regardless of key insertion order. The one home — comparison operations
// and collection distinct/group keys share it.
export function stableKey(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(',')}}`;
}
