const numeric = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const degreesToRadians = (value) => value * Math.PI / 180;

const OCCS_EXPRESSION_FUNCTIONS = Object.freeze({
  sin: value => Math.sin(degreesToRadians(value)),
  cos: value => Math.cos(degreesToRadians(value)),
  tan: value => Math.tan(degreesToRadians(value))
});

export const tokenizeOccsExpression = (value) => {
  const source = String(value ?? '').trim();
  const tokens = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ('+-*/()'.includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const start = index;
      let dots = 0;
      while (index < source.length && /[0-9.]/.test(source[index])) {
        if (source[index] === '.') dots += 1;
        index += 1;
      }
      const text = source.slice(start, index);
      if (dots > 1 || text === '.' || !Number.isFinite(Number(text))) {
        throw new Error(`Invalid OCCS expression number: ${text}`);
      }
      tokens.push({ type: 'number', value: Number(text) });
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) index += 1;
      tokens.push({ type: 'identifier', value: source.slice(start, index) });
      continue;
    }

    throw new Error(`Invalid OCCS expression token: ${char}`);
  }

  return tokens;
};

const parseOccsExpression = (value, resolveIdentifier) => {
  const tokens = tokenizeOccsExpression(value);
  let index = 0;

  const peek = () => tokens[index] || null;
  const consume = (type) => {
    if (peek()?.type !== type) return null;
    index += 1;
    return tokens[index - 1];
  };

  const parsePrimary = () => {
    const token = peek();
    if (!token) throw new Error('Incomplete OCCS expression');

    if (consume('number')) return token.value;
    if (consume('identifier')) {
      if (consume('(')) {
        const fn = OCCS_EXPRESSION_FUNCTIONS[token.value.toLowerCase()];
        if (!fn) throw new Error(`Unknown OCCS expression function: ${token.value}`);
        const argument = parseExpression();
        if (!consume(')')) throw new Error('Unclosed OCCS expression function');
        return fn(argument);
      }
      return resolveIdentifier(token.value);
    }
    if (consume(')')) throw new Error(`Unexpected OCCS expression token: ${token.value}`);
    if (consume('(')) {
      const value = parseExpression();
      if (!consume(')')) throw new Error('Unclosed OCCS expression group');
      return value;
    }

    throw new Error(`Unexpected OCCS expression token: ${token.value}`);
  };

  const parseUnary = () => {
    if (consume('-')) return -parseUnary();
    if (consume('+')) return parseUnary();
    return parsePrimary();
  };

  const parseTerm = () => {
    let value = parseUnary();
    while (peek()?.type === '*' || peek()?.type === '/') {
      const operator = consume(peek().type).type;
      const right = parseUnary();
      if (operator === '*') {
        value *= right;
      } else {
        if (right === 0) throw new Error('Division by zero in OCCS expression');
        value /= right;
      }
    }
    return value;
  };

  const parseExpression = () => {
    let value = parseTerm();
    while (peek()?.type === '+' || peek()?.type === '-') {
      const operator = consume(peek().type).type;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const result = parseExpression();
  if (index < tokens.length) throw new Error(`Unexpected OCCS expression token: ${peek().value}`);
  return result;
};

const evaluateOccsExpressionValue = (value, parameters = {}, stack = []) => {
  if (value === 'inherit') throw new Error('Cannot evaluate OCCS inherit as a number');
  if (value === null || value === undefined || value === '') throw new Error('Empty OCCS expression');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid OCCS expression number');
    return value;
  }

  return parseOccsExpression(value, (identifier) => {
    if (!Object.prototype.hasOwnProperty.call(parameters, identifier)) {
      throw new Error(`Unknown OCCS parameter: ${identifier}`);
    }
    if (stack.includes(identifier)) {
      throw new Error(`Cyclic OCCS parameter reference: ${[...stack, identifier].join(' -> ')}`);
    }
    return evaluateOccsExpressionValue(parameters[identifier], parameters, [...stack, identifier]);
  });
};

export const resolveOccsExpression = (value, parameters = {}, fallback = 0) => {
  if (value === 'inherit' || value === null || value === undefined || value === '') {
    return numeric(fallback, 0);
  }
  return evaluateOccsExpressionValue(value, parameters);
};

export const resolveOccsAngleExpression = (value, parameters = {}, fallback = 90) => {
  if (typeof value === 'number') return resolveOccsExpression(value, parameters, fallback);
  const source = String(value ?? '').trim();
  if (!source) return numeric(fallback, 0);
  return resolveOccsExpression(source.replace(/\s*deg\s*$/i, ''), parameters, fallback);
};

export const collectOccsExpressionIdentifiers = (value) => {
  if (typeof value === 'number' || value === 'inherit' || value === null || value === undefined || value === '') return [];
  const tokens = tokenizeOccsExpression(value);
  return tokens
    .filter((token, index) => (
      token.type === 'identifier' &&
      !(tokens[index + 1]?.type === '(' && OCCS_EXPRESSION_FUNCTIONS[token.value.toLowerCase()])
    ))
    .map(token => token.value);
};

const escapeOccsIdentifierPattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Rewrites whole identifier tokens by name — a rename refactors every
// reference; substring matches never count, and the authored text's
// spacing and number formatting survive untouched.
export const rewriteOccsExpressionIdentifiers = (value, renames = {}) => {
  if (typeof value !== 'string' || !value || value === 'inherit') return value;
  const names = Object.keys(renames).filter(name => name !== renames[name]);
  if (!names.length) return value;
  return value.replace(
    new RegExp(`(?<![A-Za-z0-9_])(?:${names.map(escapeOccsIdentifierPattern).join('|')})(?![A-Za-z0-9_])`, 'g'),
    name => renames[name]
  );
};
