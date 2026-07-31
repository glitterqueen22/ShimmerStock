/**
 * ShimmerStock Calculation Engine — Safe Expression Evaluator
 * ============================================================
 * Industry-agnostic formula evaluation. No eval(), no code injection.
 * Supports: +, -, *, /, %, parentheses, decimal numbers, variable substitution.
 *
 * Grammar (recursive descent):
 *   expr     → term (('+' | '-') term)*
 *   term     → factor (('*' | '/' | '%') factor)*
 *   factor   → ('+' | '-') factor | '(' expr ')' | number | identifier
 */

// ── Tokenizer ────────────────────────────────────────────────────────────

const TOKEN_TYPES = {
  NUMBER: "NUMBER",
  IDENT: "IDENT",
  PLUS: "PLUS",
  MINUS: "MINUS",
  STAR: "STAR",
  SLASH: "SLASH",
  PERCENT: "PERCENT",
  LPAREN: "LPAREN",
  RPAREN: "RPAREN",
  EOF: "EOF",
};

function tokenize(expression) {
  const tokens = [];
  let i = 0;
  const src = expression.replace(/\s+/g, ""); // strip whitespace

  while (i < src.length) {
    const ch = src[i];

    // Numbers (including decimals)
    if (/[0-9]/.test(ch) || (ch === "." && i + 1 < src.length && /[0-9]/.test(src[i + 1]))) {
      let num = "";
      while (i < src.length && (/[0-9]/.test(src[i]) || src[i] === ".")) {
        num += src[i];
        i++;
      }
      tokens.push({ type: TOKEN_TYPES.NUMBER, value: parseFloat(num) });
      continue;
    }

    // Identifiers (variables) — letters and underscore
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < src.length && /[a-zA-Z0-9_]/.test(src[i])) {
        id += src[i];
        i++;
      }
      tokens.push({ type: TOKEN_TYPES.IDENT, value: id });
      continue;
    }

    // Single-char tokens
    switch (ch) {
      case "+": tokens.push({ type: TOKEN_TYPES.PLUS }); i++; break;
      case "-": tokens.push({ type: TOKEN_TYPES.MINUS }); i++; break;
      case "*": tokens.push({ type: TOKEN_TYPES.STAR }); i++; break;
      case "/": tokens.push({ type: TOKEN_TYPES.SLASH }); i++; break;
      case "%": tokens.push({ type: TOKEN_TYPES.PERCENT }); i++; break;
      case "(": tokens.push({ type: TOKEN_TYPES.LPAREN }); i++; break;
      case ")": tokens.push({ type: TOKEN_TYPES.RPAREN }); i++; break;
      default:
        throw Object.assign(
          new Error(`Unexpected character '${ch}' at position ${i}`),
          { statusCode: 400 }
        );
    }
  }

  tokens.push({ type: TOKEN_TYPES.EOF });
  return tokens;
}

// ── Recursive Descent Parser + Evaluator ─────────────────────────────────

class Parser {
  constructor(tokens, inputs) {
    this.tokens = tokens;
    this.inputs = inputs; // { varName: number }
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  consume(expectedType) {
    const tok = this.tokens[this.pos];
    if (expectedType && tok.type !== expectedType) {
      throw Object.assign(
        new Error(`Expected ${expectedType} but got ${tok.type} (${tok.value ?? ""})`),
        { statusCode: 400 }
      );
    }
    this.pos++;
    return tok;
  }

  // expr → term (('+' | '-') term)*
  expr() {
    let left = this.term();
    while (this.peek().type === TOKEN_TYPES.PLUS || this.peek().type === TOKEN_TYPES.MINUS) {
      const op = this.consume();
      const right = this.term();
      if (op.type === TOKEN_TYPES.PLUS) {
        left = left + right;
      } else {
        left = left - right;
      }
    }
    return left;
  }

  // term → factor (('*' | '/' | '%') factor)*
  term() {
    let left = this.factor();
    while (
      this.peek().type === TOKEN_TYPES.STAR ||
      this.peek().type === TOKEN_TYPES.SLASH ||
      this.peek().type === TOKEN_TYPES.PERCENT
    ) {
      const op = this.consume();
      const right = this.factor();
      if (op.type === TOKEN_TYPES.STAR) {
        left = left * right;
      } else if (op.type === TOKEN_TYPES.SLASH) {
        if (right === 0) {
          throw Object.assign(
            new Error("Division by zero"),
            { statusCode: 400 }
          );
        }
        left = left / right;
      } else if (op.type === TOKEN_TYPES.PERCENT) {
        if (right === 0) {
          throw Object.assign(
            new Error("Modulo by zero"),
            { statusCode: 400 }
          );
        }
        left = left % right;
      }
    }
    return left;
  }

  // factor → ('+' | '-') factor | '(' expr ')' | number | identifier
  factor() {
    const tok = this.peek();

    // Unary plus
    if (tok.type === TOKEN_TYPES.PLUS) {
      this.consume();
      return this.factor();
    }

    // Unary minus
    if (tok.type === TOKEN_TYPES.MINUS) {
      this.consume();
      return -this.factor();
    }

    // Parenthesized expression
    if (tok.type === TOKEN_TYPES.LPAREN) {
      this.consume(TOKEN_TYPES.LPAREN);
      const value = this.expr();
      this.consume(TOKEN_TYPES.RPAREN);
      return value;
    }

    // Number literal
    if (tok.type === TOKEN_TYPES.NUMBER) {
      this.consume();
      return tok.value;
    }

    // Identifier (variable)
    if (tok.type === TOKEN_TYPES.IDENT) {
      this.consume();
      if (!(tok.value in this.inputs)) {
        throw Object.assign(
          new Error(`Unknown variable '${tok.value}' — provide a value for it`),
          { statusCode: 400, variable: tok.value }
        );
      }
      const val = this.inputs[tok.value];
      if (typeof val !== "number" || isNaN(val)) {
        throw Object.assign(
          new Error(`Variable '${tok.value}' must be a number`),
          { statusCode: 400 }
        );
      }
      return val;
    }

    // Unexpected token in factor position
    throw Object.assign(
      new Error(`Unexpected token ${tok.type} (${tok.value ?? ""})`),
      { statusCode: 400 }
    );
  }
}

/**
 * Evaluate a formula expression with the given inputs.
 *
 * @param {string} expression — e.g. "(volume * density * molds) * (1 + waste/100)"
 * @param {object} inputs — e.g. { volume: 4, density: 0.8, molds: 12, waste: 5 }
 * @returns {{ result: number }} — the evaluated numeric result
 * @throws Error with statusCode 400 on parse/eval failures
 */
export function evaluate(expression, inputs = {}) {
  if (!expression || typeof expression !== "string" || !expression.trim()) {
    throw Object.assign(new Error("Expression is required"), { statusCode: 400 });
  }

  const tokens = tokenize(expression);
  const parser = new Parser(tokens, inputs);
  const result = parser.expr();

  // Ensure we consumed the entire expression (should end with EOF)
  const remaining = parser.peek();
  if (remaining.type !== TOKEN_TYPES.EOF) {
    throw Object.assign(
      new Error(`Unexpected token '${remaining.value ?? remaining.type}' at end of expression`),
      { statusCode: 400 }
    );
  }

  // Round to a reasonable precision to avoid floating-point noise
  const rounded = Math.round(result * 1e10) / 1e10;

  return rounded;
}

/**
 * Extract variable names from an expression string.
 * Useful for validation: "What inputs does this formula expect?"
 *
 * @param {string} expression
 * @returns {string[]} — sorted unique variable names
 */
export function extractVariables(expression) {
  if (!expression || typeof expression !== "string") return [];

  const tokens = tokenize(expression);
  const vars = new Set();
  for (const tok of tokens) {
    if (tok.type === TOKEN_TYPES.IDENT) {
      vars.add(tok.value);
    }
  }
  return [...vars].sort();
}
