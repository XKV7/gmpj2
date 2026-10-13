/** 아주 가벼운 자체 구문 강조기 — 토큰 배열을 돌려주고, 렌더링은 React가 텍스트로 한다(HTML 삽입 없음) */
export type TokenType = 'plain' | 'keyword' | 'string' | 'number' | 'comment' | 'func' | 'type' | 'punct';
export interface Token { type: TokenType; text: string }

const KEYWORDS: Record<string, string[]> = {
  js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'class', 'extends', 'import', 'from', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'null', 'undefined', 'true', 'false', 'yield', 'delete', 'void', 'static', 'get', 'set'],
  ts: ['interface', 'type', 'enum', 'implements', 'private', 'public', 'protected', 'readonly', 'as', 'keyof', 'namespace', 'declare', 'abstract', 'satisfies', 'unknown', 'never', 'any'],
  py: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'import', 'from', 'as', 'class', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield', 'pass', 'break', 'continue', 'None', 'True', 'False', 'global', 'nonlocal', 'async', 'await', 'self'],
  c: ['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'struct', 'union', 'typedef', 'static', 'const', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'sizeof', 'include', 'define', 'public', 'private', 'class', 'new', 'delete', 'namespace', 'using', 'template', 'bool', 'true', 'false', 'nullptr', 'auto', 'fn', 'let', 'mut', 'impl', 'pub', 'use', 'match', 'func', 'package', 'go', 'defer', 'var', 'string', 'import', 'extends', 'final', 'this', 'null'],
  sql: ['select', 'from', 'where', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'drop', 'alter', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'having', 'limit', 'offset', 'and', 'or', 'not', 'null', 'as', 'distinct', 'count', 'primary', 'key', 'index', 'unique', 'default', 'integer', 'text'],
  sh: ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'echo', 'export', 'cd', 'sudo', 'npm', 'npx', 'git', 'return', 'local'],
};

const ALIASES: Record<string, string> = {
  javascript: 'js', jsx: 'js', mjs: 'js', typescript: 'ts', tsx: 'ts', python: 'py', cpp: 'c', 'c++': 'c', java: 'c', rust: 'c', rs: 'c',
  go: 'c', kotlin: 'c', kt: 'c', swift: 'c', cs: 'c', csharp: 'c', bash: 'sh', shell: 'sh', zsh: 'sh', json: 'js', css: 'css', html: 'html', xml: 'html',
};

function keywordSet(lang: string): Set<string> {
  const l = ALIASES[lang] ?? lang;
  if (l === 'ts') return new Set([...KEYWORDS.js!, ...KEYWORDS.ts!]);
  if (KEYWORDS[l]) return new Set(KEYWORDS[l]);
  // 언어를 모르면 흔한 키워드들의 합집합
  return new Set([...KEYWORDS.js!, ...KEYWORDS.py!]);
}

export function highlight(code: string, lang: string): Token[] {
  const l = ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  const kw = keywordSet(l);
  const ci = l === 'sql';
  const hashComment = l === 'py' || l === 'sh' || l === 'yaml' || l === 'yml' || l === 'rb';
  const tokens: Token[] = [];
  const push = (type: TokenType, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.text += text;
    else tokens.push({ type, text });
  };
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    const rest = code.slice(i);
    // 주석
    if ((!hashComment && rest.startsWith('//')) || (hashComment && ch === '#') || (l === 'sql' && rest.startsWith('--'))) {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      push('comment', code.slice(i, stop));
      i = stop;
      continue;
    }
    if (rest.startsWith('/*') || (l === 'html' && rest.startsWith('<!--'))) {
      const close = l === 'html' && rest.startsWith('<!--') ? '-->' : '*/';
      const end = code.indexOf(close, i + 2);
      const stop = end === -1 ? n : end + close.length;
      push('comment', code.slice(i, stop));
      i = stop;
      continue;
    }
    // 문자열
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === '\\') j++;
        if (code[j] === '\n' && ch !== '`') break;
        j++;
      }
      push('string', code.slice(i, Math.min(j + 1, n)));
      i = Math.min(j + 1, n);
      continue;
    }
    // 숫자
    if (/[0-9]/.test(ch) && !/[A-Za-z_$]/.test(code[i - 1] ?? '')) {
      const m = /^(0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(rest);
      if (m) {
        push('number', m[0]);
        i += m[0].length;
        continue;
      }
    }
    // 식별자
    if (/[A-Za-z_$À-￿]/.test(ch)) {
      const m = /^[A-Za-z_$À-￿][\w$À-￿]*/.exec(rest)!;
      const word = m[0];
      const next = code.slice(i + word.length).match(/^\s*\(/);
      if (kw.has(ci ? word.toLowerCase() : word)) push('keyword', word);
      else if (next) push('func', word);
      else if (/^[A-Z][a-z0-9]/.test(word) && l !== 'sql') push('type', word);
      else push('plain', word);
      i += word.length;
      continue;
    }
    push(/[{}()[\];,.<>=+\-*/%!&|^~?:]/.test(ch) ? 'punct' : 'plain', ch);
    i++;
  }
  return tokens;
}
