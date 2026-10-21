import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { create } from 'zustand';
import { ALLOWED_UPLOAD_TYPES, LIMITS, Perm, type PublicUser } from '@moyeo/shared';
import { formatBytes } from '../lib/format';
import { encodeMentions } from '../lib/mentions';
import { toPlainText } from '../lib/markdown';
import { queueMessage, sendTyping } from '../store/actions';
import { useData } from '../store/data';
import { nameOf, dmPartner } from '../store/selectors';
import { ui, useUI } from '../store/ui';
import { useChatContext } from '../hooks/useChatContext';
import { Avatar } from './Avatar';
import { EmojiPicker } from './EmojiPicker';
import { Icon } from './Icon';
import { Markdown } from './Markdown';

// ───── 보내기 전 첨부 파일 (대화방별) ─────
export const useComposerFiles = create<Record<number, File[]>>(() => ({}));

const ALLOWED_EXT = new Set([...Object.values(ALLOWED_UPLOAD_TYPES), 'jpeg', 'md', 'log', 'csv', 'json']);

export function addComposerFiles(convId: number, files: File[]) {
  const current = useComposerFiles.getState()[convId] ?? [];
  const accepted: File[] = [];
  for (const f of files) {
    const ext = (f.name.split('.').pop() ?? '').toLowerCase();
    const okType = (f.type && ALLOWED_UPLOAD_TYPES[f.type]) || ALLOWED_EXT.has(ext);
    if (!okType) {
      ui.toast(`'${f.name}'은(는) 보낼 수 없는 형식이에요.`, 'error');
      continue;
    }
    if (f.size > LIMITS.UPLOAD_MAX_BYTES) {
      ui.toast(`'${f.name}'이(가) 너무 커요. ${LIMITS.UPLOAD_MAX_BYTES / 1024 / 1024}MB까지 보낼 수 있어요.`, 'error');
      continue;
    }
    if (f.size === 0) {
      ui.toast(`'${f.name}'은(는) 빈 파일이에요.`, 'error');
      continue;
    }
    accepted.push(f);
  }
  const next = [...current, ...accepted];
  if (next.length > LIMITS.ATTACHMENTS_PER_MESSAGE) ui.toast(`한 번에 ${LIMITS.ATTACHMENTS_PER_MESSAGE}개까지 보낼 수 있어요.`, 'error');
  useComposerFiles.setState({ [convId]: next.slice(0, LIMITS.ATTACHMENTS_PER_MESSAGE) });
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith('image/')) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="file-chip">
      {url ? <img src={url} alt="" /> : <span className="attach-file-icon"><Icon name="file" size={22} /></span>}
      <div className="file-chip-meta">
        <span className="ellipsis">{file.name || '붙여넣은 이미지'}</span>
        <small>{formatBytes(file.size)}</small>
      </div>
      <button className="file-chip-x" onClick={onRemove} aria-label="첨부 취소"><Icon name="x" size={14} /></button>
    </div>
  );
}

interface Suggest { query: string; start: number; items: (PublicUser | 'everyone')[]; index: number }

export function Composer({ convId, placeholder }: { convId: number; placeholder?: string }) {
  const { conv, server, meId, can } = useChatContext(convId);
  const users = useData((s) => s.users);
  const relationships = useData((s) => s.relationships);
  const text = useUI((s) => s.drafts[convId] ?? '');
  const replyId = useUI((s) => s.replyTo[convId] ?? null);
  const enterToSend = useUI((s) => s.settings.enterToSend);
  const mdMode = useUI((s) => s.settings.markdownMode);
  const [preview, setPreview] = useState(false);
  const replyMsg = useData((s) => (replyId ? s.chats[convId]?.messages.find((m) => m.id === replyId) : undefined));
  const files = useComposerFiles((s) => s[convId]) ?? [];
  const typing = useData((s) => s.typing[convId]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [suggest, setSuggest] = useState<Suggest | null>(null);

  const candidates: PublicUser[] = useMemo(() => {
    const ids = server ? server.members.map((m) => m.userId) : (conv?.members ?? []).map((m) => m.userId);
    return ids.map((id) => users[id]).filter((u): u is PublicUser => !!u);
  }, [server, conv, users]);
  const allowEveryone = conv?.kind !== 'dm' && can(Perm.MENTION_EVERYONE);

  // 권한/차단 상태에 따른 입력 불가 사유
  let disabledReason: string | null = null;
  if (conv?.kind === 'dm') {
    const other = dmPartner(conv, meId);
    if (other && relationships[other]?.type === 'blocked') disabledReason = '차단한 사용자예요. 차단을 해제하면 다시 대화할 수 있어요.';
  }
  if (server && !can(Perm.SEND_MESSAGES)) disabledReason = '이 채널에 메시지를 보낼 권한이 없어요.';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);

  // 답장을 누르거나 대화방을 바꾸면 입력창에 포커스
  useEffect(() => {
    if (window.innerWidth > 768 || replyId) ref.current?.focus();
  }, [convId, replyId]);

  const setText = (v: string) => ui.setDraft(convId, v);

  const updateSuggest = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(^|\s)@([^\s@]{0,24})$/.exec(before);
    if (!m) {
      setSuggest(null);
      return;
    }
    const q = m[2]!.toLowerCase();
    const items: (PublicUser | 'everyone')[] = candidates
      .filter((u) => u.id !== meId && (u.nickname.toLowerCase().includes(q) || u.username.includes(q)))
      .sort((a, b) => Number(!a.nickname.toLowerCase().startsWith(q)) - Number(!b.nickname.toLowerCase().startsWith(q)))
      .slice(0, 8);
    if (allowEveryone && ('모두'.startsWith(q) || 'everyone'.startsWith(q))) items.push('everyone');
    setSuggest(items.length ? { query: q, start: caret - m[2]!.length - 1, items, index: 0 } : null);
  };

  const applySuggest = (item: PublicUser | 'everyone') => {
    if (!suggest) return;
    const el = ref.current!;
    const caret = el.selectionStart;
    const insert = `@${item === 'everyone' ? '모두' : item.nickname} `;
    const next = text.slice(0, suggest.start) + insert + text.slice(caret);
    // 바로 이어서 입력해도 글자가 섞이지 않도록 커서 위치를 동기적으로 맞춘다
    flushSync(() => {
      setText(next);
      setSuggest(null);
    });
    el.focus();
    const pos = suggest.start + insert.length;
    el.setSelectionRange(pos, pos);
  };

  const send = () => {
    if (disabledReason) return;
    const trimmed = text.trim();
    if (!trimmed && !files.length) return;
    if (trimmed.length > LIMITS.MESSAGE_MAX) {
      ui.toast(`메시지는 ${LIMITS.MESSAGE_MAX}자까지 보낼 수 있어요.`, 'error');
      return;
    }
    const content = encodeMentions(trimmed, candidates, allowEveryone);
    queueMessage(convId, content, files, replyId, mdMode);
    setPreview(false);
    setText('');
    useComposerFiles.setState({ [convId]: [] });
    ui.setReply(convId, null);
    setSuggest(null);
  };

  const editLast = () => {
    const msgs = useData.getState().chats[convId]?.messages ?? [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!;
      if (m.authorId === meId && m.type === 'text' && !m.deleted) {
        ui.setEditing(m.id);
        return true;
      }
    }
    return false;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const composing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (suggest && !composing) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSuggest({ ...suggest, index: (suggest.index + d + suggest.items.length) % suggest.items.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggest(suggest.items[suggest.index]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSuggest(null);
        return;
      }
    }
    if (e.key === 'Enter' && !composing) {
      const wantsSend = enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey;
      if (wantsSend) {
        e.preventDefault();
        send();
        return;
      }
    }
    if (e.key === 'Escape' && replyId) {
      e.preventDefault();
      ui.setReply(convId, null);
      return;
    }
    if (e.key === 'ArrowUp' && !text && !composing && !e.shiftKey) {
      if (editLast()) e.preventDefault();
    }
  };

  const typingIds = Object.keys(typing ?? {}).map(Number).filter((id) => id !== meId);
  const typingText = (() => {
    if (!typingIds.length) return null;
    const names = typingIds.map((id) => users[id]?.nickname ?? '누군가');
    if (names.length === 1) return <><strong>{names[0]}</strong>님이 입력 중</>;
    if (names.length === 2) return <><strong>{names[0]}</strong>님과 <strong>{names[1]}</strong>님이 입력 중</>;
    return <><strong>{names[0]}</strong>님 외 {names.length - 1}명이 입력 중</>;
  })();

  if (disabledReason) {
    return (
      <div className="composer-wrap">
        <div className="composer disabled"><Icon name="lock" size={18} /> {disabledReason}</div>
      </div>
    );
  }

  const target = conv ? (conv.kind === 'text' ? `#${conv.name}` : conv.kind === 'thread' ? '스레드' : conv.kind === 'dm' ? nameOf(dmPartner(conv, meId) ?? 0) : '그룹') : '';

  return (
    <div className="composer-wrap">
      <div className="typing-line" aria-live="polite">
        {typingText && (
          <>
            <span className="typing-dots"><i /><i /><i /></span>
            <span>{typingText}…</span>
          </>
        )}
      </div>
      {suggest && (
        <div className="mention-suggest" role="listbox">
          <div className="mention-suggest-title">멤버 — '@{suggest.query}'</div>
          {suggest.items.map((it, i) => (
            <button key={it === 'everyone' ? 'everyone' : it.id} role="option" aria-selected={i === suggest.index} className={i === suggest.index ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); applySuggest(it); }}>
              {it === 'everyone' ? (
                <>
                  <span className="mention-all-icon"><Icon name="users" size={16} /></span>
                  <span className="grow">@모두</span>
                  <small>모든 멤버에게 알림</small>
                </>
              ) : (
                <>
                  <Avatar src={it.avatar} name={it.nickname} color={it.bannerColor} size={24} presence={it.presence} />
                  <span className="grow">{it.nickname}</span>
                  <small>@{it.username}</small>
                </>
              )}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        {replyMsg && (
          <div className="composer-reply">
            <Icon name="reply" size={16} />
            <span className="grow ellipsis">
              <strong>{nameOf(replyMsg.authorId)}</strong>님에게 답장 · {toPlainText(replyMsg.content, nameOf) || '첨부 파일'}
            </span>
            <button onClick={() => ui.setReply(convId, null)} aria-label="답장 취소"><Icon name="x" size={16} /></button>
          </div>
        )}
        {files.length > 0 && (
          <div className="composer-files">
            {files.map((f, i) => (
              <FileChip key={`${f.name}-${i}-${f.size}`} file={f} onRemove={() => useComposerFiles.setState({ [convId]: files.filter((_, j) => j !== i) })} />
            ))}
          </div>
        )}
        {mdMode && preview && text.trim() && (
          <div className="md-preview">
            <div className="md-preview-title">미리보기 <small>보내면 이렇게 보여요</small></div>
            <Markdown content={encodeMentions(text, candidates, allowEveryone)} full />
          </div>
        )}
        <div className="composer-row">
          <button className="composer-btn" onClick={() => fileRef.current?.click()} aria-label="파일 첨부" data-tip="파일 첨부">
            <Icon name="paperclip" size={20} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              addComposerFiles(convId, Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <textarea
            ref={ref}
            className="composer-input"
            rows={1}
            value={text}
            placeholder={(placeholder ?? `${target}에 메시지 보내기`) + (mdMode ? ' (마크다운)' : '')}
            maxLength={LIMITS.MESSAGE_MAX + 100}
            onChange={(e) => {
              setText(e.target.value);
              updateSuggest(e.target.value, e.target.selectionStart);
              if (e.target.value.trim()) sendTyping(convId);
            }}
            onKeyDown={onKeyDown}
            onClick={(e) => updateSuggest(text, e.currentTarget.selectionStart)}
            onBlur={() => setTimeout(() => setSuggest(null), 150)}
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files);
              if (pasted.length) {
                e.preventDefault();
                addComposerFiles(convId, pasted.map((f, i) => (f.name ? f : new File([f], `붙여넣은-이미지-${i + 1}.png`, { type: f.type }))));
              }
            }}
            aria-label="메시지 입력"
          />
          {mdMode && (
            <button className={`composer-btn ${preview ? 'on' : ''}`} onClick={() => setPreview((v) => !v)} aria-label="마크다운 미리보기" aria-pressed={preview} data-tip="미리보기">
              <Icon name="eye" size={19} />
            </button>
          )}
          <button
            className={`composer-btn md-toggle ${mdMode ? 'on' : ''}`}
            onClick={() => {
              ui.updateSettings({ markdownMode: !mdMode });
              if (mdMode) setPreview(false);
              ui.toast(mdMode ? '마크다운 끔: 쓴 글자 그대로 보내요.' : '마크다운 켬: # 제목, 표, 목록, **굵게** 등이 서식으로 보여요.');
            }}
            aria-label="마크다운 모드"
            aria-pressed={mdMode}
            data-tip={mdMode ? '마크다운 끄기' : '마크다운으로 보내기'}
          >
            MD
          </button>
          <button className="composer-btn" onClick={(e) => setEmojiAnchor(e.currentTarget)} aria-label="이모지" data-tip="이모지">
            <Icon name="smile" size={20} />
          </button>
          <button className={`send-btn ${text.trim() || files.length ? 'ready' : ''}`} onClick={send} aria-label="보내기" disabled={!text.trim() && !files.length}>
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
      {text.length > LIMITS.MESSAGE_MAX - 200 && <div className={`char-count ${text.length > LIMITS.MESSAGE_MAX ? 'over' : ''}`}>{text.length} / {LIMITS.MESSAGE_MAX}</div>}
      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onClose={() => setEmojiAnchor(null)}
          onPick={(emoji) => {
            const el = ref.current;
            const pos = el?.selectionStart ?? text.length;
            const next = text.slice(0, pos) + emoji + text.slice(el?.selectionEnd ?? pos);
            flushSync(() => setText(next));
            el?.focus();
            el?.setSelectionRange(pos + emoji.length, pos + emoji.length);
          }}
        />
      )}
    </div>
  );
}
