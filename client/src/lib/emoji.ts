/** 이모지 데이터(한국어 이름/태그)는 피커를 처음 열 때 불러온다 */
export interface EmojiItem { e: string; label: string; tags: string[]; group: number }
export interface EmojiGroup { id: number; name: string; icon: string }

export const EMOJI_GROUPS: EmojiGroup[] = [
  { id: 0, name: '스마일리 & 감정', icon: '😀' },
  { id: 1, name: '사람 & 몸', icon: '👋' },
  { id: 3, name: '동물 & 자연', icon: '🐻' },
  { id: 4, name: '음식 & 음료', icon: '🍔' },
  { id: 5, name: '여행 & 장소', icon: '✈️' },
  { id: 6, name: '활동', icon: '⚽' },
  { id: 7, name: '사물', icon: '💡' },
  { id: 8, name: '기호', icon: '❤️' },
  { id: 9, name: '깃발', icon: '🏳️' },
];

let cache: Promise<EmojiItem[]> | null = null;

export function loadEmojis(): Promise<EmojiItem[]> {
  cache ??= import('emojibase-data/ko/compact.json').then((mod) => {
    const data = (mod.default ?? mod) as unknown as { unicode: string; label: string; tags?: string[]; group?: number; order?: number }[];
    return data
      .filter((d) => d.group !== undefined && d.group !== 2)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((d) => ({ e: d.unicode, label: d.label, tags: d.tags ?? [], group: d.group! }));
  });
  return cache;
}

const RECENT_KEY = 'moyeo:recent-emoji';
const DEFAULT_RECENT = ['👍', '❤️', '😂', '🎉', '🙏', '😮', '😢', '🔥'];

export function getRecentEmojis(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null');
    return Array.isArray(v) && v.length ? v.slice(0, 24) : DEFAULT_RECENT;
  } catch {
    return DEFAULT_RECENT;
  }
}

export function pushRecentEmoji(e: string) {
  const list = [e, ...getRecentEmojis().filter((x) => x !== e)].slice(0, 24);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* 저장 공간이 없으면 무시 */
  }
}
