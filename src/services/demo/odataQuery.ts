/**
 * The small part of OData that Timmie's Business Central queries use, evaluated over
 * in-memory rows for the demo: $filter with eq/ne/gt/ge/lt/le, and/or/not and brackets
 * on string, number, boolean and date literals; $orderby; $top. Anything else in a filter
 * is an error, so a query the demo can't answer fails loudly rather than returning
 * the wrong rows.
 */

export type Row = Record<string, unknown>;

type Literal = string | number | boolean | null;
type Comparison = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le';

type FilterNode =
  | { kind: 'and' | 'or'; left: FilterNode; right: FilterNode }
  | { kind: 'not'; operand: FilterNode }
  | { kind: 'compare'; field: string; op: Comparison; value: Literal; isDate: boolean };

type Token =
  | { type: 'string'; value: string }
  | { type: 'word'; value: string }
  | { type: 'open' }
  | { type: 'close' };

const COMPARISONS: readonly string[] = ['eq', 'ne', 'gt', 'ge', 'lt', 'le'];
// A bare date or date-time literal, e.g. 2026-10-19 or 2026-10-19T09:00:00Z
const DATE_LITERAL = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/;

export class ODataQueryError extends Error {}

function tokenize(filter: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < filter.length) {
    const char = filter[i];
    if (/\s/.test(char)) {
      i++;
    } else if (char === '(') {
      tokens.push({ type: 'open' });
      i++;
    } else if (char === ')') {
      tokens.push({ type: 'close' });
      i++;
    } else if (char === "'") {
      // A quoted string; '' is an escaped quote
      let value = '';
      i++;
      for (;;) {
        if (i >= filter.length) throw new ODataQueryError('Unterminated string in $filter');
        if (filter[i] === "'") {
          if (filter[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += filter[i++];
      }
      tokens.push({ type: 'string', value });
    } else {
      const match = /^[^\s()']+/.exec(filter.slice(i));
      const word = match ? match[0] : char;
      tokens.push({ type: 'word', value: word });
      i += word.length;
    }
  }
  return tokens;
}

function parseLiteral(token: Token | undefined): { value: Literal; isDate: boolean } {
  if (!token) throw new ODataQueryError('Missing value in $filter');
  if (token.type === 'string') return { value: token.value, isDate: false };
  if (token.type !== 'word') throw new ODataQueryError('Unexpected bracket in $filter');
  const word = token.value;
  if (word === 'true' || word === 'false') return { value: word === 'true', isDate: false };
  if (word === 'null') return { value: null, isDate: false };
  if (DATE_LITERAL.test(word)) return { value: word, isDate: true };
  if (/^-?\d+(\.\d+)?$/.test(word)) return { value: Number(word), isDate: false };
  throw new ODataQueryError(`Unsupported value in $filter: ${word}`);
}

/** Parse an OData $filter expression */
export function parseFilter(filter: string): FilterNode {
  const tokens = tokenize(filter);
  let pos = 0;

  const peekWord = (): string | null => {
    const token = tokens[pos];
    return token?.type === 'word' ? token.value.toLowerCase() : null;
  };

  const parseOr = (): FilterNode => {
    let node = parseAnd();
    while (peekWord() === 'or') {
      pos++;
      node = { kind: 'or', left: node, right: parseAnd() };
    }
    return node;
  };

  const parseAnd = (): FilterNode => {
    let node = parseUnary();
    while (peekWord() === 'and') {
      pos++;
      node = { kind: 'and', left: node, right: parseUnary() };
    }
    return node;
  };

  const parseUnary = (): FilterNode => {
    const token = tokens[pos];
    if (!token) throw new ODataQueryError('Unexpected end of $filter');
    if (token.type === 'open') {
      pos++;
      const node = parseOr();
      if (tokens[pos]?.type !== 'close') throw new ODataQueryError('Missing ) in $filter');
      pos++;
      return node;
    }
    if (peekWord() === 'not') {
      pos++;
      return { kind: 'not', operand: parseUnary() };
    }
    if (token.type !== 'word') throw new ODataQueryError('Expected a field name in $filter');
    pos++;
    const op = peekWord();
    if (!op || !COMPARISONS.includes(op)) {
      throw new ODataQueryError(`Unsupported operator in $filter after ${token.value}`);
    }
    pos++;
    const literal = parseLiteral(tokens[pos++]);
    return { kind: 'compare', field: token.value, op: op as Comparison, ...literal };
  };

  const node = parseOr();
  if (pos !== tokens.length) throw new ODataQueryError('Unexpected text at the end of $filter');
  return node;
}

function compareValues(actual: unknown, expected: Literal, isDate: boolean): number | null {
  if (expected === null) return actual === null || actual === undefined ? 0 : null;
  if (typeof expected === 'boolean') {
    return actual === expected ? 0 : null;
  }
  if (typeof expected === 'number') {
    const value = typeof actual === 'number' ? actual : Number(actual);
    if (!Number.isFinite(value)) return null;
    return value === expected ? 0 : value < expected ? -1 : 1;
  }
  const text = actual === null || actual === undefined ? '' : String(actual);
  // A date literal against a date-time value compares the date part
  const value = isDate && expected.length === 10 ? text.slice(0, 10) : text;
  return value === expected ? 0 : value < expected ? -1 : 1;
}

function evaluate(node: FilterNode, row: Row): boolean {
  switch (node.kind) {
    case 'and':
      return evaluate(node.left, row) && evaluate(node.right, row);
    case 'or':
      return evaluate(node.left, row) || evaluate(node.right, row);
    case 'not':
      return !evaluate(node.operand, row);
    case 'compare': {
      const result = compareValues(row[node.field], node.value, node.isDate);
      if (node.op === 'ne') return result !== 0;
      if (result === null) return false;
      switch (node.op) {
        case 'eq':
          return result === 0;
        case 'gt':
          return result > 0;
        case 'ge':
          return result >= 0;
        case 'lt':
          return result < 0;
        case 'le':
          return result <= 0;
      }
    }
  }
}

/** The rows a $filter keeps */
export function filterRows<T extends Row>(rows: T[], filter: string | null | undefined): T[] {
  if (!filter?.trim()) return rows;
  const node = parseFilter(filter);
  return rows.filter((row) => evaluate(node, row));
}

/** Rows sorted by an OData $orderby, e.g. "requestedAt desc, entryNo" */
export function orderRows<T extends Row>(rows: T[], orderby: string | null | undefined): T[] {
  if (!orderby?.trim()) return rows;
  const keys = orderby.split(',').map((part) => {
    const [field, direction] = part.trim().split(/\s+/);
    return { field, descending: direction?.toLowerCase() === 'desc' };
  });
  return [...rows].sort((a, b) => {
    for (const { field, descending } of keys) {
      const x = a[field];
      const y = b[field];
      if (x === y) continue;
      const result =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x ?? '').localeCompare(String(y ?? ''));
      if (result !== 0) return descending ? -result : result;
    }
    return 0;
  });
}

/** Apply $filter, $orderby and $top from a query string */
export function queryRows<T extends Row>(rows: T[], params: URLSearchParams): T[] {
  let result = filterRows(rows, params.get('$filter'));
  result = orderRows(result, params.get('$orderby'));
  const top = params.get('$top');
  if (top !== null) {
    const count = Number(top);
    if (!Number.isInteger(count) || count < 0) throw new ODataQueryError('Invalid $top');
    result = result.slice(0, count);
  }
  return result;
}
