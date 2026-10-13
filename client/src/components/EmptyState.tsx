import type { ReactNode } from 'react';

/** 빈 상태 일러스트(인라인 SVG) + 문구 */
export function EmptyState({ art, title, description, action }: { art: 'friends' | 'chat' | 'search' | 'pins' | 'pending' | 'blocked' | 'channel'; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-art">{ART[art]}</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

const blob = (fill: string) => <path d="M60 8c26 0 50 16 52 44 2 30-20 56-52 58S6 92 8 60 34 8 60 8z" fill={fill} />;

const ART: Record<string, ReactNode> = {
  friends: (
    <svg viewBox="0 0 120 120" width="140" height="140">
      {blob('var(--accent-soft)')}
      <circle cx="46" cy="52" r="14" fill="var(--accent)" opacity=".9" />
      <circle cx="76" cy="56" r="12" fill="#5DB7C9" />
      <path d="M24 92c4-16 16-22 22-22s18 6 22 22z" fill="var(--accent)" opacity=".9" />
      <path d="M58 92c3-12 12-18 18-18s15 6 18 18z" fill="#5DB7C9" />
      <path d="M86 30l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="#F5A524" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 120 120" width="140" height="140">
      {blob('var(--accent-soft)')}
      <rect x="22" y="34" width="56" height="38" rx="14" fill="var(--accent)" />
      <path d="M34 72l-6 12 16-12z" fill="var(--accent)" />
      <rect x="50" y="56" width="50" height="32" rx="12" fill="#A47CF2" />
      <path d="M88 88l6 10-14-10z" fill="#A47CF2" />
      <circle cx="40" cy="53" r="3.5" fill="#fff" /><circle cx="50" cy="53" r="3.5" fill="#fff" /><circle cx="60" cy="53" r="3.5" fill="#fff" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 120 120" width="120" height="120">
      {blob('var(--surface-3)')}
      <circle cx="54" cy="54" r="20" fill="none" stroke="var(--accent)" strokeWidth="7" />
      <path d="M69 69l16 16" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" />
    </svg>
  ),
  pins: (
    <svg viewBox="0 0 120 120" width="120" height="120">
      {blob('var(--surface-3)')}
      <path d="M60 86V68M48 42v-8a12 12 0 0 1 24 0v8l8 14H40z" fill="var(--accent)" stroke="var(--accent)" strokeWidth="5" strokeLinejoin="round" />
    </svg>
  ),
  pending: (
    <svg viewBox="0 0 120 120" width="140" height="140">
      {blob('var(--accent-soft)')}
      <rect x="30" y="38" width="60" height="44" rx="10" fill="var(--accent)" />
      <path d="M30 46l30 20 30-20" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
      <circle cx="88" cy="38" r="10" fill="#F5A524" />
    </svg>
  ),
  blocked: (
    <svg viewBox="0 0 120 120" width="120" height="120">
      {blob('var(--surface-3)')}
      <circle cx="60" cy="60" r="24" fill="none" stroke="var(--text-3)" strokeWidth="7" />
      <path d="M43 77l34-34" stroke="var(--text-3)" strokeWidth="7" strokeLinecap="round" />
    </svg>
  ),
  channel: (
    <svg viewBox="0 0 120 120" width="140" height="140">
      {blob('var(--accent-soft)')}
      <text x="60" y="78" textAnchor="middle" fontSize="54" fontWeight="800" fill="var(--accent)">#</text>
    </svg>
  ),
};
