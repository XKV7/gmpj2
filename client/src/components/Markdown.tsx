import { memo, useMemo, useState, type ReactNode } from 'react';
import { highlight } from '../lib/highlight';
import { isJumboEmoji, parseMarkdown, type MdBlock, type MdNode } from '../lib/markdown';
import { useData } from '../store/data';
import { ui } from '../store/ui';
import { Icon } from './Icon';

function MentionChip({ id }: { id: number }) {
  const user = useData((s) => s.users[id]);
  const meId = useData((s) => s.me?.id);
  return (
    <button type="button" className={`mention ${id === meId ? 'mention-me' : ''}`} onClick={() => ui.openModal({ type: 'profile', userId: id })}>
      @{user?.nickname ?? '알 수 없음'}
    </button>
  );
}

function renderInline(nodes: MdNode[], keyPrefix = ''): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'text':
        return n.v;
      case 'br':
        return <br key={key} />;
      case 'bold':
        return <strong key={key}>{renderInline(n.c, `${key}-`)}</strong>;
      case 'italic':
        return <em key={key}>{renderInline(n.c, `${key}-`)}</em>;
      case 'strike':
        return <s key={key}>{renderInline(n.c, `${key}-`)}</s>;
      case 'code':
        return <code key={key} className="md-code">{n.v}</code>;
      case 'link':
        return (
          <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow" title={n.href}>
            {n.c ? renderInline(n.c, `${key}-`) : n.href}
          </a>
        );
      case 'image':
        // 외부 이미지는 불러오지 않는다 (보는 사람 추적 방지)
        return (
          <span key={key} className="md-image-blocked" title="외부 이미지는 표시하지 않아요">
            🖼 {n.alt || '이미지'} <small>(외부 이미지 차단됨)</small>
          </span>
        );
      case 'mention':
        return <MentionChip key={key} id={n.id} />;
      case 'everyone':
        return <span key={key} className="mention mention-everyone">@모두</span>;
      default:
        return null;
    }
  });
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const tokens = useMemo(() => highlight(code, lang), [code, lang]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="md-codeblock">
      <div className="md-codeblock-bar">
        <span>{lang || '코드'}</span>
        <button
          type="button"
          className="md-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre>
        <code>
          {tokens.map((t, i) => (t.type === 'plain' ? t.text : <span key={i} className={`tok-${t.type}`}>{t.text}</span>))}
        </code>
      </pre>
    </div>
  );
}

function Block({ b }: { b: MdBlock }): ReactNode {
  switch (b.t) {
    case 'codeblock':
      return <CodeBlock lang={b.lang} code={b.code} />;
    case 'quote':
      return <blockquote className="md-quote">{b.children.map((c, i) => <Block key={i} b={c} />)}</blockquote>;
    case 'heading': {
      const level = Math.min(b.level, 3);
      const content = renderInline(b.c);
      return level === 1 ? <h3 className="md-h md-h1">{content}</h3> : level === 2 ? <h4 className="md-h md-h2">{content}</h4> : <h5 className="md-h md-h3">{content}</h5>;
    }
    case 'hr':
      return <hr className="md-hr" />;
    case 'list': {
      const items = b.items.map((it, i) => (
        <li key={i} className={it.checked !== null ? 'md-task' : undefined}>
          {it.checked !== null && <input type="checkbox" checked={it.checked} disabled aria-label={it.checked ? '완료' : '할 일'} />}
          <span>{renderInline(it.c)}</span>
          {it.children.map((c, j) => <Block key={j} b={c} />)}
        </li>
      ));
      return b.ordered ? <ol className="md-list" start={b.start}>{items}</ol> : <ul className="md-list">{items}</ul>;
    }
    case 'table':
      return (
        <div className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>{b.head.map((c, i) => <th key={i} style={b.align[i] ? { textAlign: b.align[i]! } : undefined}>{renderInline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, i) => <td key={i} style={b.align[i] ? { textAlign: b.align[i]! } : undefined}>{renderInline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return <p className="md-p">{renderInline(b.c)}</p>;
  }
}

/** full=true(마크다운 모드로 보낸 메시지)면 서식 전체, 아니면 쓴 그대로 */
export const Markdown = memo(function Markdown({ content, full = false }: { content: string; full?: boolean }) {
  const blocks = useMemo(() => parseMarkdown(content, full), [content, full]);
  const jumbo = useMemo(() => isJumboEmoji(content), [content]);
  if (jumbo) return <div className="md jumbo">{content.trim()}</div>;
  return (
    <div className={`md ${full ? 'md-full' : 'md-plain'}`}>
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
});
