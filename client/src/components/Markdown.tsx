import { memo, useMemo, useState, type ReactNode } from 'react';
import { highlight } from '../lib/highlight';
import { isJumboEmoji, parseMarkdown, type MdNode } from '../lib/markdown';
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
          <a key={key} href={n.href} target="_blank" rel="noopener noreferrer nofollow">
            {n.href}
          </a>
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

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  const jumbo = useMemo(() => isJumboEmoji(content), [content]);
  if (jumbo) return <div className="md jumbo">{content.trim()}</div>;
  return (
    <div className="md">
      {blocks.map((b, i) =>
        b.t === 'codeblock' ? (
          <CodeBlock key={i} lang={b.lang} code={b.code} />
        ) : b.t === 'quote' ? (
          <blockquote key={i} className="md-quote">{renderInline(b.c)}</blockquote>
        ) : (
          <p key={i} className="md-p">{renderInline(b.c)}</p>
        ),
      )}
    </div>
  );
});
