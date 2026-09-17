// Units (SPEC §2): closed set, declared conversions, never implicit.
export const UNITS = Object.freeze(['mm', 'm', 'm2', 'min', 'deg', 'percent', 'currency', 'count']);

const CONVERSIONS = Object.freeze({
  'mm>m': Object.freeze({ factor: 0.001 }),
  'm>mm': Object.freeze({ factor: 1000 })
});

export function quantity(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Quantity value must be a finite number, got ${typeof value}`);
  }
  if (!UNITS.includes(unit)) throw new Error(`Unknown unit ${unit}`);
  return Object.freeze({ value, unit });
}

export function convert(q, to) {
  if (q?.unit === to) return q;
  const rule = CONVERSIONS[`${q?.unit}>${to}`];
  if (!rule) throw new Error(`No declared conversion ${q?.unit} -> ${to}`);
  return quantity(q.value * rule.factor, to);
}

// R3: arithmetic unifies units; mismatch without a declared conversion is an error.
export function unify(a, b) {
  if (a?.unit === b?.unit) return { a, b };
  try {
    return { a: convert(a, b.unit), b };
  } catch {
    throw new Error(`Unit mismatch: ${a?.unit} vs ${b?.unit} (no declared conversion)`);
  }
}
