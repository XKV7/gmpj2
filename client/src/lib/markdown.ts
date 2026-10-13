/**
 * 메시지 서식 파서. 문자열을 노드 트리로 바꾸기만 하고, 화면 출력은 React 텍스트 노드로 한다.
 * (dangerouslySetInnerHTML 같은 HTML 삽입은 어디에서도 쓰지 않는다)
 */
export type MdNode =
  | { t: 'text'; v: string }
  | { t: 'bold' | 'italic' | 'strike'; c: MdNode[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string }
  | { t: 'mention'; id: number }
  | { t: 'everyone' }
  | { t: 'br' };

export type MdBlock = { t: 'para'; c: MdNode[] } | { t: 'codeblock'; lang: string; code: string } | { t: 'quote'; c: MdNode[] };

const URL_RE = /^https?:\/\/[^\s<>"']+/;

function trimUrl(url: string): string {
  // 문장 끝 구두점과 짝이 안 맞는 닫는 괄호는 링크에서 뺀다
  let u = url.replace(/[.,!?;:'"]+$/, '');
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1);
  return u;
}

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

export function parseInline(s: string): MdNode[] {
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
    if (ch === '\\' && i + 1 < s.length && /[\\*_~`<>]/.test(s[i + 1]!)) {
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
    if (ch === '`') {
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
    const tryDelim = (delim: string, type: 'bold' | 'italic' | 'strike', wordBoundary = false): boolean => {
      if (!rest.startsWith(delim)) return false;
      const inner = i + delim.length;
      if (inner >= s.length || /\s/.test(s[inner]!)) return false;
      if (wordBoundary && i > 0 && /[\p{L}\p{N}]/u.test(s[i - 1]!)) return false;
      const close = findClose(s, inner, delim);
      if (close === -1) return false;
      if (wordBoundary && close + delim.length < s.length && /[\p{L}\p{N}]/u.test(s[close + delim.length]!)) return false;
      flush();
      out.push({ t: type, c: parseInline(s.slice(inner, close)) });
      i = close + delim.length;
      return true;
    };
    if (ch === '*' && (tryDelim('**', 'bold') || tryDelim('*', 'italic'))) continue;
    if (ch === '_' && (tryDelim('__', 'bold', true) || tryDelim('_', 'italic', true))) continue;
    if (ch === '~' && tryDelim('~~', 'strike')) continue;
    buf += ch;
    i++;
  }
  flush();
  return out;
}

/** 코드 블록(```)과 인용(> )을 먼저 나누고 나머지를 인라인 파싱 */
export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const re = /```([\w+#.-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushText = (text: string) => {
    if (!text) return;
    const lines = text.split('\n');
    let para: string[] = [];
    let quote: string[] = [];
    const flushPara = () => {
      if (para.length) {
        const joined = para.join('\n');
        if (joined.trim() || blocks.length === 0) blocks.push({ t: 'para', c: parseInline(joined) });
      }
      para = [];
    };
    const flushQuote = () => {
      if (quote.length) blocks.push({ t: 'quote', c: parseInline(quote.join('\n')) });
      quote = [];
    };
    for (const line of lines) {
      if (/^>\s?/.test(line)) {
        flushPara();
        quote.push(line.replace(/^>\s?/, ''));
      } else {
        flushQuote();
        para.push(line);
      }
    }
    flushPara();
    flushQuote();
  };
  while ((m = re.exec(src))) {
    pushText(src.slice(last, m.index).replace(/^\n+|\n+$/g, ''));
    blocks.push({ t: 'codeblock', lang: m[1] ?? '', code: (m[2] ?? '').replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  pushText(src.slice(last).replace(/^\n+/, ''));
  return blocks;
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
    .replace(/(\*\*|__|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
