// The demo engine's scripting layer: a stack-machine expression
// evaluator. Node configurations carry expressions as strings; the
// worker interprets them at dispatch time, so authored parameters
// reach the WASM kernel as evaluated numbers.

const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max
};

const CONSTANTS = { pi: Math.PI, tau: Math.PI * 2, e: Math.E };

const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

export function evaluateExpression(source) {
  const tokens = tokenize(String(source ?? ''));
  const output = [];
  const operators = [];
  let expectOperand = true;
  for (const token of tokens) {
    if (token.type === 'number') {
      output.push(token);
    } else if (token.type === 'identifier') {
      output.push(token);
    } else if (token.type === 'function') {
      operators.push(token);
    } else if (token.value === ',') {
      while (operators.length && operators.at(-1).value !== '(') operators.pop();
      if (!operators.length) throw new Error(`Expression has a comma outside a call: ${source}`);
    } else if (token.value === '(') {
      operators.push(token);
      expectOperand = true;
      continue;
    } else if (token.value === ')') {
      while (operators.length && operators.at(-1).value !== '(') output.push(operators.pop());
      if (!operators.length) throw new Error(`Expression has an unbalanced parenthesis: ${source}`);
      operators.pop();
      if (operators.length && operators.at(-1).type === 'function') output.push(operators.pop());
    } else if (token.value === '-') {
      if (expectOperand) {
        operators.push({ type: 'operator', value: 'u-' });
      } else {
        popOperators('u-', output, operators);
        operators.push({ type: 'operator', value: token.value });
      }
    } else {
      popOperators(token.value, output, operators);
      operators.push({ type: 'operator', value: token.value });
    }
    expectOperand = token.type === 'operator' || token.value === '(' || token.value === ',';
  }
  while (operators.length) {
    const operator = operators.pop();
    if (operator.value === '(') throw new Error(`Expression has an unbalanced parenthesis: ${source}`);
    output.push(operator);
  }

  const stack = [];
  for (const token of output) {
    if (token.type === 'number') {
      stack.push(token.value);
    } else if (token.type === 'identifier') {
      if (!Object.hasOwn(CONSTANTS, token.value)) throw new Error(`Expression references unknown name ${token.value}`);
      stack.push(CONSTANTS[token.value]);
    } else if (token.type === 'function') {
      const fn = FUNCTIONS[token.value];
      const arity = fn.length;
      if (stack.length < arity) throw new Error(`Expression calls ${token.value} with too few arguments`);
      stack.push(fn(...stack.splice(stack.length - arity, arity)));
    } else if (token.value === 'u-') {
      if (!stack.length) throw new Error(`Expression ends with a dangling operator: ${source}`);
      stack.push(-stack.pop());
    } else {
      if (stack.length < 2) throw new Error(`Expression ends with a dangling operator: ${source}`);
      const right = stack.pop();
      const left = stack.pop();
      stack.push(applyOperator(token.value, left, right));
    }
  }
  if (stack.length !== 1 || typeof stack[0] !== 'number' || !Number.isFinite(stack[0])) {
    throw new Error(`Expression does not evaluate to a finite number: ${source}`);
  }
  return stack[0];
}

function popOperators(incoming, output, operators) {
  const rightAssociative = incoming === '^' || incoming === 'u-';
  while (operators.length) {
    const top = operators.at(-1);
    if (top.value === '(' || top.type === 'function') break;
    const topPrecedence = PRECEDENCE[top.value] || 0;
    const incomingPrecedence = PRECEDENCE[incoming] || 0;
    if (topPrecedence > incomingPrecedence
      || (topPrecedence === incomingPrecedence && !rightAssociative)) {
      output.push(operators.pop());
    } else {
      break;
    }
  }
}

function applyOperator(operator, left, right) {
  switch (operator) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return left / right;
    case '%': return left % right;
    case '^': return left ** right;
    default: throw new Error(`Unknown operator ${operator}`);
  }
}

function tokenize(source) {
  const tokens = [];
  let position = 0;
  while (position < source.length) {
    const character = source[position];
    if (/\s/.test(character)) {
      position += 1;
      continue;
    }
    if (/[0-9.]/.test(character)) {
      const match = /^\d*\.?\d+(?:[eE][+-]?\d+)?/.exec(source.slice(position));
      if (!match) throw new Error(`Expression has a malformed number at ${position}: ${source}`);
      tokens.push({ type: 'number', value: Number(match[0]) });
      position += match[0].length;
      continue;
    }
    if (/[a-zA-Z_]/.test(character)) {
      const match = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(source.slice(position));
      const name = match[0];
      tokens.push({ type: Object.hasOwn(FUNCTIONS, name) ? 'function' : 'identifier', value: name });
      position += name.length;
      continue;
    }
    if ('+-*/%^(),'.includes(character)) {
      tokens.push({ type: 'operator', value: character });
      position += 1;
      continue;
    }
    throw new Error(`Expression has an unexpected character ${character}: ${source}`);
  }
  if (!tokens.length) throw new Error(`Expression is empty: ${source}`);
  return tokens;
}
