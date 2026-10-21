/**
 * 메시지 서식 파서. 문자열을 노드 트리로 바꾸기만 하고, 화면 출력은 React 텍스트 노드로 한다.
 * (dangerouslySetInnerHTML 같은 HTML 삽입은 어디에서도 쓰지 않는다)
 *
 *  - 일반 메시지(plain): 쓴 그대로. 멘션, 링크 자동 인식, 줄바꿈만 처리
 *  - 마크다운 메시지(full): 제목, 목록, 체크리스트, 표, 구분선, 인용, 코드 블록,
 *    굵게/기울임/취소선/코드, [텍스트](링크). 외부 이미지 ![](주소)는 불러오지 않고 막는다.
 */
export type MdNode =
  | { t: 'text'; v: string }
  | { t: 'bold' | 'italic' | 'strike'; c: MdNode[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c?: MdNode[] }
  | { t: 'image'; alt: string }
  | { t: 'mention'; id: number }
  | { t: 'everyone' }
  | { t: 'br' };

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem { c: MdNode[]; checked: boolean | null; children: MdBlock[] }

export type MdBlock =
  | { t: 'para'; c: MdNode[] }
  | { t: 'codeblock'; lang: string; code: string }
  | { t: 'quote'; children: MdBlock[] }
  | { t: 'heading'; level: number; c: MdNode[] }
  | { t: 'hr' }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'table'; align: Align[]; head: MdNode[][]; rows: MdNode[][][] };

const URL_RE = /^https?:\/\/[^\s<>"']+/;

function trimUrl(url: string): string {
  // 문장 끝 구두점과 짝이 안 맞는 닫는 괄호는 링크에서 뺀다
  let u = url.replace(/[.,!?;:'"]+$/, '');
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
  return u;
}

const safeHref = (url: string) => (/^https?:\/\//i.test(url.trim()) ? url.trim() : null);

function findClose(s: string, from: number, delim: string): number {
  let i = from;
  while (i < s.length) {
    if (s[i] === '\\') {
      i += 2;
      continue;
    }
    if (s.startsWith(delim, i)) {
      // 닫는 구분자 앞이 공백이면 안 됨
      if (i > from && !/\s/.test(s[i - 1]!)) return i;
    }
    if (s[i] === '`') {
      const end = s.indexOf('`', i + 1);
      if (end !== -1) {
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  return -1;
}

/** [텍스트](주소) — 대괄호 짝을 맞춰 찾는다 */
function matchBracketLink(s: string, i: number): { text: string; url: string; end: number } | null {
  if (s[i] !== '[') return null;
  let depth = 0;
  let j = i;
  for (; j < s.length; j++) {
    if (s[j] === '\\') {
      j++;
      continue;
    }
    if (s[j] === '[') depth++;
    else if (s[j] === ']' && --depth === 0) break;
    else if (s[j] === '\n') return null;
  }
  if (j >= s.length || s[j + 1] !== '(') return null;
  const close = s.indexOf(')', j + 2);
  if (close === -1) return null;
  const url = s.slice(j + 2, close).trim().split(/\s+/)[0] ?? '';
  return { text: s.slice(i + 1, j), url, end: close + 1 };
}

export function parseInline(s: string, full = true): MdNode[] {
  const out: MdNode[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    const rest = s.slice(i);
    if (full && ch === '\\' && i + 1 < s.length && /[\\*_~`<>|[\]()#!-]/.test(s[i + 1]!)) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === '\n') {
      flush();
      out.push({ t: 'br' });
      i++;
      continue;
    }
    if (full && ch === '`') {
      const end = s.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'code', v: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '<') {
      const m = /^<@(\d+)>/.exec(rest);
      if (m) {
        flush();
        out.push({ t: 'mention', id: Number(m[1]) });
        i += m[0].length;
        continue;
      }
      if (rest.startsWith('<@everyone>')) {
        flush();
        out.push({ t: 'everyone' });
        i += '<@everyone>'.length;
        continue;
      }
    }
    if (full && ch === '!' && s[i + 1] === '[') {
      const m = matchBracketLink(s, i + 1);
      if (m) {
        // 외부 이미지는 보는 사람을 추적할 수 있어 불러오지 않는다
        flush();
        out.push({ t: 'image', alt: m.text });
        i = m.end;
        continue;
      }
    }
    if (full && ch === '[') {
      const m = matchBracketLink(s, i);
      if (m) {
        const href = safeHref(m.url);
        flush();
        if (href) out.push({ t: 'link', href, c: parseInline(m.text, true) });
        else out.push(...parseInline(m.text, true)); // http(s)가 아닌 주소는 링크로 만들지 않는다
        i = m.end;
        continue;
      }
    }
    if (ch === 'h' && (i === 0 || !/[\w/]/.test(s[i - 1]!))) {
      const m = URL_RE.exec(rest);
      if (m) {
        const url = trimUrl(m[0]);
        flush();
        out.push({ t: 'link', href: url });
        i += url.length;
        continue;
      }
    }
    if (full) {
      const tryDelim = (delim: string, type: 'bold' | 'italic' | 'strike', wordBoundary = false): boolean => {
        if (!rest.startsWith(delim)) return false;
        const inner = i + delim.length;
        if (inner >= s.length || /\s/.test(s[inner]!)) return false;
        if (wordBoundary && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1]!)) return false;
        const close = findClose(s, inner, delim);
        if (close === -1) return false;
        if (wordBoundary && close + delim.length < s.length && /[\p{L}\p{N}]/u.test(s[close + delim.length]!)) return false;
        flush();
        out.push({ t: type, c: parseInline(s.slice(inner, close), true) });
        i = close + delim.length;
        return true;
      };
      if (ch === '*' && (tryDelim('**', 'bold') || tryDelim('*', 'italic'))) continue;
      if (ch === '_' && (tryDelim('__', 'bold', true) || tryDelim('_', 'italic', true))) continue;
      if (ch === '~' && tryDelim('~~', 'strike')) continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// ───── 블록 ─────

const FENCE_RE = /^\s{0,3}```/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE_RE = /^\s{0,3}>\s?/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.replace(/\t/g, '    ').match(/^ */)![0].length;

/** 표의 한 줄을 칸으로 나눈다 (코드 안의 | 와 \| 는 나누지 않음) */
function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === '\\' && t[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (c === '`') inCode = !inCode;
    if (c === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

const isTableStart = (lines: string[], i: number) =>
  i + 1 < lines.length && lines[i]!.includes('|') && TABLE_SEP_RE.test(lines[i + 1]!) && lines[i + 1]!.includes('-');

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i]!;
  return FENCE_RE.test(l) || HEADING_RE.test(l) || HR_RE.test(l) || QUOTE_RE.test(l) || LIST_RE.test(l) || isTableStart(lines, i);
}

function parseList(lines: string[]): MdBlock {
  const base = indentOf(lines[0]!);
  const first = LIST_RE.exec(lines[0]!)!;
  const ordered = /\d/.test(first[2]!);
  const start = ordered ? parseInt(first[2]!, 10) : 1;
  const items: ListItem[] = [];
  let cur: { text: string[]; sub: string[] } | null = null;
  const finish = () => {
    if (!cur) return;
    let text = cur.text.join('\n');
    let checked: boolean | null = null;
    const task = /^\[( |x|X)\]\s+/.exec(text);
    if (task) {
      checked = task[1] !== ' ';
      text = text.slice(task[0].length);
    }
    const minIndent = Math.min(...cur.sub.filter((l) => l.trim()).map(indentOf));
    const sub = cur.sub.map((l) => l.slice(Math.min(indentOf(l), Number.isFinite(minIndent) ? minIndent : 0)));
    items.push({ c: parseInline(text, true), checked, children: sub.some((l) => l.trim()) ? parseBlocks(sub) : [] });
  };
  for (const line of lines) {
    const m = LIST_RE.exec(line);
    if (m && indentOf(line) <= base + 1) {
      finish();
      cur = { text: [m[3]!], sub: [] };
    } else if (cur) {
      if (indentOf(line) > base + 1 || cur.sub.length) cur.sub.push(line);
      else cur.text.push(line.trim());
    }
  }
  finish();
  return { t: 'list', ordered, start, items };
}

export function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    // 코드 블록 (```언어 … ```)
    if (line.trimStart().startsWith('```')) {
      const after = line.trim().slice(3);
      if (after.endsWith('```') && after.length > 3) {
        // ```코드``` 처럼 한 줄에 열고 닫은 경우
        blocks.push({ t: 'codeblock', lang: '', code: after.slice(0, -3) });
        i++;
        continue;
      }
      const isLang = /^[\w+#.-]*$/.test(after);
      const code: string[] = isLang ? [] : [after];
      i++;
      while (i < lines.length) {
        const l = lines[i]!;
        i++;
        if (/^\s*```\s*$/.test(l)) break;
        if (l.trimEnd().endsWith('```')) {
          code.push(l.trimEnd().slice(0, -3));
          break;
        }
        code.push(l);
      }
      blocks.push({ t: 'codeblock', lang: isLang ? after : '', code: code.join('\n') });
      continue;
    }
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ t: 'heading', level: h[1]!.length, c: parseInline(h[2]!, true) });
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : null));
      i += 2;
      const rows: MdNode[][][] = [];
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) {
        const cells = splitRow(lines[i]!);
        rows.push(head.map((_, k) => parseInline(cells[k] ?? '', true)));
        i++;
      }
      blocks.push({ t: 'table', align: head.map((_, k) => align[k] ?? null), head: head.map((c) => parseInline(c, true)), rows });
      continue;
    }
    if (HR_RE.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i]!)) inner.push(lines[i++]!.replace(QUOTE_RE, ''));
      blocks.push({ t: 'quote', children: parseBlocks(inner) });
      continue;
    }
    if (LIST_RE.test(line)) {
      const base = indentOf(line);
      const ordered = /\d/.test(LIST_RE.exec(line)![2]!);
      // 같은 높이에서 글머리(-)와 번호(1.)가 바뀌면 새 목록
      const sameKind = (l: string) => {
        const m = LIST_RE.exec(l);
        return !m || indentOf(l) > base + 1 || /\d/.test(m[2]!) === ordered;
      };
      const chunk: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!;
        if (chunk.length && !sameKind(l)) break;
        if (!l.trim()) {
          // 빈 줄 뒤에 같은 목록이 이어지거나 들여쓴 내용이 오면 계속
          const next = lines[i + 1];
          if (next !== undefined && next.trim() && sameKind(next) && (LIST_RE.test(next) ? indentOf(next) >= base : indentOf(next) > base)) {
            chunk.push(l);
            i++;
            continue;
          }
          break;
        }
        if (chunk.length && indentOf(l) <= base && !LIST_RE.test(l) && startsBlock(lines, i)) break;
        if (chunk.length && indentOf(l) < base) break;
        chunk.push(l);
        i++;
      }
      blocks.push(parseList(chunk));
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++]!);
    blocks.push({ t: 'para', c: parseInline(para.join('\n'), true) });
  }
  return blocks;
}

/** full=false 면 쓴 그대로(멘션·링크·줄바꿈만), true 면 마크다운 전체 */
export function parseMarkdown(src: string, full = true): MdBlock[] {
  const text = src.replace(/\r\n?/g, '\n');
  if (!full) return [{ t: 'para', c: parseInline(text.replace(/^\n+|\n+$/g, ''), false) }];
  return parseBlocks(text.split('\n'));
}

const EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}(?:️|‍|\p{Emoji_Modifier}|\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}|\s)+$/u;

/** 이모지만 1~3개면 크게 보여준다 */
export function isJumboEmoji(content: string): boolean {
  const t = content.trim();
  if (!t || t.length > 40 || !EMOJI_ONLY_RE.test(t)) return false;
  const count = [...new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(t.replace(/\s/g, ''))].length;
  return count <= 3;
}

/** 미리보기용 평문 (채팅 목록, 알림, 답장 인용) */
export function toPlainText(content: string, nameOf: (id: number) => string): string {
  return content
    .replace(/```[\w+#.-]*\n?([\s\S]*?)```/g, (_, code: string) => code.trim().split('\n')[0] ?? '')
    .replace(/<@(\d+)>/g, (_, id: string) => `@${nameOf(Number(id))}`)
    .replace(/<@everyone>/g, '@모두')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '🖼 $1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
