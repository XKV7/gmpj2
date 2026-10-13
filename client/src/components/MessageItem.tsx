import { memo, useEffect, useRef, useState } from 'react';
import { LIMITS, QUICK_REACTIONS, unreadReaderCount, type Attachment, type Conversation, type Message, type Server } from '@moyeo/shared';
import { formatBytes, formatFull, formatTime } from '../lib/format';
import { decodeMentions, encodeMentions } from '../lib/mentions';
import { toPlainText } from '../lib/markdown';
import { deleteMessage, editMessage, jumpToMessage, openThreadFor, pinMessage, toggleReaction, discardOutbox, retryOutbox } from '../store/actions';
import { useData, type OutboxItem } from '../store/data';
import { nameOf, roleColorOf } from '../store/selectors';
import { ui, useUI } from '../store/ui';
import { Avatar } from './Avatar';
import { EmojiPicker } from './EmojiPicker';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { useMenu, type MenuItem } from './Menu';

export interface MessageCtx {
  conv: Conversation;
  server?: Server;
  meId: number;
  canManageMessages: boolean;
  inThread: boolean;
  mentionCandidates: () => import('@moyeo/shared').PublicUser[];
}

function Attachments({ list }: { list: Attachment[] }) {
  const images = list.filter((a) => a.kind === 'image');
  const files = list.filter((a) => a.kind !== 'image');
  return (
    <div className="attachments">
      {images.length > 0 && (
        <div className={`attach-images n${Math.min(images.length, 4)}`}>
          {images.map((a) => {
            const ratio = a.width && a.height ? a.width / a.height : 4 / 3;
            const w = images.length === 1 ? Math.min(360, a.width ?? 360, 280 * ratio) : undefined;
            return (
              <button key={a.id} className="attach-image" style={{ width: w, aspectRatio: images.length === 1 ? `${ratio}` : undefined }} onClick={() => useUI.setState({ lightbox: { url: a.url, name: a.name } })}>
                <img src={a.url} alt={a.name} loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
      {files.map((a) =>
        a.mime.startsWith('video/') ? (
          <video key={a.id} className="attach-video" src={a.url} controls preload="metadata" />
        ) : a.mime.startsWith('audio/') ? (
          <div key={a.id} className="attach-file audio">
            <Icon name="file" size={22} />
            <div className="grow">
              <div className="ellipsis attach-name">{a.name}</div>
              <audio src={a.url} controls preload="none" />
            </div>
          </div>
        ) : (
          <a key={a.id} className="attach-file" href={a.url} download={a.name} target="_blank" rel="noopener noreferrer">
            <span className="attach-file-icon"><Icon name="file" size={22} /></span>
            <span className="grow">
              <span className="ellipsis attach-name">{a.name}</span>
              <span className="attach-size">{formatBytes(a.size)}</span>
            </span>
            <Icon name="download" size={18} />
          </a>
        ),
      )}
    </div>
  );
}

function Reactions({ m, meId }: { m: Message; meId: number }) {
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const users = useData((s) => s.users);
  return (
    <div className="reactions">
      {m.reactions.map((r) => {
        const mine = r.userIds.includes(meId);
        const names = r.userIds.map((u) => users[u]?.nickname ?? '?');
        return (
          <button key={r.emoji} className={`reaction ${mine ? 'mine' : ''}`} onClick={() => toggleReaction(m.id, r.emoji).catch(ui.error)} aria-label={`${r.emoji} ${r.userIds.length}명: ${names.join(', ')}`}>
            <span className="reaction-emoji">{r.emoji}</span>
            <span className="reaction-count">{r.userIds.length}</span>
            <span className="reaction-tip" role="tooltip">
              <span className="reaction-tip-emoji">{r.emoji}</span>
              {names.slice(0, 12).join(', ')}
              {names.length > 12 ? ` 외 ${names.length - 12}명` : ''}님이 반응했어요
            </span>
          </button>
        );
      })}
      <button className="reaction add" onClick={(e) => setPicker(e.currentTarget)} aria-label="반응 추가">
        <Icon name="smilePlus" size={16} />
      </button>
      {picker && (
        <EmojiPicker anchor={picker} onClose={() => setPicker(null)} onPick={(e) => { setPicker(null); toggleReaction(m.id, e).catch(ui.error); }} />
      )}
    </div>
  );
}

function EditBox({ m, ctx }: { m: Message; ctx: MessageCtx }) {
  const [text, setText] = useState(() => decodeMentions(m.content, nameOf));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
  }, [text]);
  const save = async () => {
    const encoded = encodeMentions(text.trim(), ctx.mentionCandidates(), ctx.conv.kind !== 'dm');
    if (!encoded) {
      ui.toast('빈 메시지로 바꿀 수 없어요. 지우려면 삭제를 눌러 주세요.', 'error');
      return;
    }
    ui.setEditing(null);
    if (encoded === m.content) return;
    try {
      await editMessage(m.id, encoded);
    } catch (err) {
      ui.error(err);
    }
  };
  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        value={text}
        maxLength={LIMITS.MESSAGE_MAX}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            ui.setEditing(null);
          }
        }}
      />
      <div className="edit-hint">
        Esc로 <button onClick={() => ui.setEditing(null)}>취소</button> · Enter로 <button onClick={() => void save()}>저장</button>
      </div>
    </div>
  );
}

function longPress(onLong: (x: number, y: number) => void) {
  let timer: number | null = null;
  let start: { x: number; y: number } | null = null;
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]!;
      start = { x: t.clientX, y: t.clientY };
      timer = window.setTimeout(() => {
        if (start) onLong(start.x, start.y);
        timer = null;
      }, 450);
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0]!;
      if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10 && timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    onTouchEnd: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export const MessageItem = memo(function MessageItem({ m, grouped, ctx, editing }: { m: Message; grouped: boolean; ctx: MessageCtx; editing: boolean }) {
  const author = useData((s) => s.users[m.authorId]);
  const replyAuthor = useData((s) => (m.replyTo ? s.users[m.replyTo.authorId] : undefined));
  const menu = useMenu();
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const mine = m.authorId === ctx.meId;
  const mentioned = !mine && (m.mentions.includes(ctx.meId) || m.mentionsEveryone);
  const color = roleColorOf(ctx.server, m.authorId);
  const readCount = ctx.conv.kind === 'dm' || ctx.conv.kind === 'group' ? unreadReaderCount(ctx.conv.members, m.id, m.authorId) : 0;
  const canThread = ctx.conv.kind === 'text' && !ctx.inThread;

  if (m.type === 'system') {
    return (
      <div className="msg-system" data-mid={m.id}>
        <span>{m.content}</span>
        <time title={formatFull(m.createdAt)}>{formatTime(m.createdAt)}</time>
      </div>
    );
  }
  if (m.deleted) {
    return (
      <div className={`msg deleted ${m.authorId === ctx.meId ? 'mine' : ''} ${grouped ? 'grouped' : ''}`} data-mid={m.id}>
        <div className="msg-row">
          {m.authorId !== ctx.meId && <div className="msg-gutter">{!grouped && <Avatar src={author?.avatar} name={author?.nickname ?? '?'} color={author?.bannerColor} size={36} />}</div>}
          <div className="msg-main">
            {!grouped && m.authorId !== ctx.meId && (
              <div className="msg-head"><span className="msg-author">{author?.nickname ?? '알 수 없음'}</span></div>
            )}
            <div className="msg-line">
              <div className="msg-bubble msg-deleted"><Icon name="slash" size={14} /> 삭제된 메시지예요.</div>
              <div className="msg-meta"><time title={formatFull(m.createdAt)}>{formatTime(m.createdAt)}</time></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const items: MenuItem[] = [
    { label: '답장', icon: 'reply', onClick: () => ui.setReply(m.conversationId, m.id) },
    { label: '반응 추가', icon: 'smilePlus', onClick: () => setTimeout(() => setPicker(document.querySelector<HTMLElement>(`[data-mid="${m.id}"] .msg-actions`) ?? document.body)) },
    ...(canThread ? [{ label: m.thread ? '스레드 보기' : '스레드 만들기', icon: 'thread' as const, onClick: () => (m.thread ? ui.openThread(m.thread.id) : openThreadFor(m.id).catch(ui.error)) }] : []),
    ...(mine ? [{ label: '수정', icon: 'edit' as const, onClick: () => ui.setEditing(m.id) }] : []),
    { label: '텍스트 복사', icon: 'copy', onClick: () => void navigator.clipboard?.writeText(toPlainText(m.content, nameOf)).then(() => ui.toast('복사했어요.', 'success')) },
    ...(!ctx.inThread && (!ctx.server || ctx.canManageMessages)
      ? [{ label: m.pinned ? '고정 해제' : '메시지 고정', icon: 'pin' as const, onClick: () => pinMessage(m.id, !m.pinned).then(() => ui.toast(m.pinned ? '고정을 해제했어요.' : '메시지를 고정했어요.', 'success')).catch(ui.error) }]
      : []),
    ...(mine || ctx.canManageMessages
      ? [
          { separator: true, label: '' },
          {
            label: '모두에게서 삭제', icon: 'trash' as const, danger: true,
            onClick: () => ui.confirm({ title: '메시지 삭제', message: '이 메시지를 모두에게서 삭제할까요? 되돌릴 수 없어요.', confirmLabel: '삭제', danger: true, onConfirm: () => deleteMessage(m.id).then(() => undefined) }),
          },
        ]
      : []),
  ];

  const openMenu = (x: number, y: number) => menu.open({ x, y }, items);
  const lp = longPress((x, y) => {
    navigator.vibrate?.(10);
    openMenu(x, y);
  });

  return (
    <div
      className={`msg ${mine ? 'mine' : ''} ${m.replyTo ? 'has-reply' : ''} ${grouped ? 'grouped' : ''} ${mentioned ? 'mentioned' : ''} ${editing ? 'editing' : ''} ${menu.menu || picker ? 'active' : ''}`}
      data-mid={m.id}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('a, img, video, textarea')) return;
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
      {...lp}
    >
      {m.replyTo && (
        <button className="msg-reply" onClick={() => void jumpToMessage(m.conversationId, m.replyTo!.id)}>
          <span className="reply-spine" />
          {m.replyTo.deleted ? (
            <span className="muted">삭제된 메시지</span>
          ) : (
            <>
              <strong>@{replyAuthor?.nickname ?? '알 수 없음'}</strong>
              <span className="ellipsis">{toPlainText(m.replyTo.content, nameOf) || (m.replyTo.attachmentCount ? '📎 첨부 파일' : '')}</span>
            </>
          )}
        </button>
      )}
      <div className="msg-row">
        {!mine && (
          <div className="msg-gutter">
            {!grouped && (
              <button className="avatar-btn" onClick={() => ui.openModal({ type: 'profile', userId: m.authorId })} aria-label={`${author?.nickname ?? ''} 프로필`}>
                <Avatar src={author?.avatar} name={author?.nickname ?? '?'} color={author?.bannerColor} size={36} />
              </button>
            )}
          </div>
        )}
        <div className="msg-main">
          {!grouped && !mine && (
            <div className="msg-head">
              <button className="msg-author" style={color ? { color } : undefined} onClick={() => ui.openModal({ type: 'profile', userId: m.authorId })}>
                {author?.nickname ?? '알 수 없음'}
              </button>
              {m.pinned && <span className="msg-pinned" title="고정된 메시지"><Icon name="pin" size={12} /></span>}
            </div>
          )}
          {editing ? (
            <EditBox m={m} ctx={ctx} />
          ) : (
            <div className="msg-line">
              {m.content && (
                <div className="msg-bubble">
                  <Markdown content={m.content} />
                </div>
              )}
              <div className="msg-meta">
                {readCount > 0 && <span className="msg-readcount" title="아직 읽지 않은 사람 수">{readCount}</span>}
                {mine && m.pinned && <span className="msg-pinned" title="고정된 메시지"><Icon name="pin" size={11} /></span>}
                {m.editedAt && <span className="msg-edited" title={formatFull(m.editedAt)}>수정됨</span>}
                <time className={grouped ? 'msg-hover-time' : ''} title={formatFull(m.createdAt)}>{formatTime(m.createdAt)}</time>
              </div>
            </div>
          )}
          {m.attachments.length > 0 && <Attachments list={m.attachments} />}
          {m.reactions.length > 0 && <Reactions m={m} meId={ctx.meId} />}
          {m.thread && m.thread.count > 0 && !ctx.inThread && (
            <button className="msg-thread" onClick={() => ui.openThread(m.thread!.id)}>
              <Icon name="thread" size={15} />
              <strong>답글 {m.thread.count}개</strong>
              {m.thread.lastAt && <span className="muted">· 마지막 답글 {formatTime(m.thread.lastAt)}</span>}
              <Icon name="chevronRight" size={14} />
            </button>
          )}
        </div>
      </div>
      {!editing && (
        <div className="msg-actions" role="toolbar" aria-label="메시지 동작">
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} className="quick-react" onClick={() => toggleReaction(m.id, e).catch(ui.error)} title={`${e} 반응`}>{e}</button>
          ))}
          <button onClick={(e) => setPicker(e.currentTarget)} data-tip="반응 추가"><Icon name="smilePlus" size={18} /></button>
          <button onClick={() => ui.setReply(m.conversationId, m.id)} data-tip="답장"><Icon name="reply" size={18} /></button>
          {canThread && <button onClick={() => (m.thread ? ui.openThread(m.thread.id) : openThreadFor(m.id).catch(ui.error))} data-tip="스레드"><Icon name="thread" size={18} /></button>}
          {mine && <button onClick={() => ui.setEditing(m.id)} data-tip="수정"><Icon name="edit" size={18} /></button>}
          <button onClick={(e) => menu.open(e.currentTarget, items)} data-tip="더 보기" aria-label="더 보기"><Icon name="more" size={18} /></button>
        </div>
      )}
      {picker && <EmojiPicker anchor={picker} onClose={() => setPicker(null)} onPick={(e) => { setPicker(null); toggleReaction(m.id, e).catch(ui.error); }} />}
      {menu.render()}
    </div>
  );
});

/** 아직 서버에 도착하지 않은 내 메시지 (전송 중/실패/업로드 중) */
export function PendingMessage({ item, grouped }: { item: OutboxItem; grouped: boolean }) {
  const me = useData((s) => s.me);
  const online = useData((s) => s.connection === 'online');
  const replyTo = useData((s) => (item.replyToId ? s.chats[item.conversationId]?.messages.find((x) => x.id === item.replyToId) : undefined));
  if (!me) return null;
  const failed = item.status === 'failed';
  return (
    <div className={`msg mine pending ${grouped ? 'grouped' : ''} ${failed ? 'failed' : ''}`}>
      {replyTo && (
        <div className="msg-reply static">
          <span className="reply-spine" />
          <strong>@{nameOf(replyTo.authorId)}</strong>
          <span className="ellipsis">{toPlainText(replyTo.content, nameOf)}</span>
        </div>
      )}
      <div className="msg-row">
        <div className="msg-main">
          {item.content && (
            <div className="msg-line">
              <div className="msg-bubble"><Markdown content={item.content} /></div>
              <div className="msg-meta"><time>{formatTime(item.createdAt)}</time></div>
            </div>
          )}
          {item.uploads.length > 0 && (
            <div className="pending-uploads">
              {item.uploads.map((u) => (
                <div key={u.localId} className={`pending-upload ${u.error ? 'error' : ''}`}>
                  {u.previewUrl ? <img src={u.previewUrl} alt="" /> : <span className="attach-file-icon"><Icon name="file" size={20} /></span>}
                  <div className="grow">
                    <div className="ellipsis attach-name">{u.name}</div>
                    <div className="progress"><span style={{ width: `${Math.round(u.progress * 100)}%` }} /></div>
                    <div className="attach-size">{u.error ?? (u.attachment ? '업로드 완료' : `${formatBytes(u.size)} · ${Math.round(u.progress * 100)}%`)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="pending-status">
            {failed ? (
              <>
                <Icon name="alert" size={14} />
                <span>{item.error ?? '전송하지 못했어요.'}</span>
                <button onClick={() => retryOutbox(item.clientId)}><Icon name="refresh" size={13} /> 재시도</button>
                <button onClick={() => discardOutbox(item.clientId)}><Icon name="trash" size={13} /> 삭제</button>
              </>
            ) : item.status === 'uploading' ? (
              <span>파일 올리는 중…</span>
            ) : (
              <span className="sending"><span className="spinner tiny" /> {online ? '보내는 중…' : '연결되면 보낼게요'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
