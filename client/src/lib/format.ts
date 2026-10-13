const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${pad(d.getMinutes())}`;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function formatDateDivider(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

/** 채팅 목록용 짧은 시간 표시 */
export function formatShort(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (sameDay(d, now)) return formatTime(ts);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return '어제';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export function formatFull(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${formatTime(ts)}`;
}

export function isSameDay(a: number, b: number) {
  return sameDay(new Date(a), new Date(b));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${pad(m % 60)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatRelativeFuture(ts: number | null): string {
  if (ts === null) return '만료 없음';
  const diff = ts - Date.now();
  if (diff <= 0) return '만료됨';
  const min = Math.round(diff / 60000);
  if (min < 60) return `${min}분 후 만료`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}시간 후 만료`;
  return `${Math.round(h / 24)}일 후 만료`;
}

/** 한국어 조사: 받침 여부에 따라 이/가, 을/를 등 */
export function josa(word: string, pair: '이가' | '을를' | '은는' | '와과'): string {
  const last = word.charCodeAt(word.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 ? (last - 0xac00) % 28 !== 0 : false;
  const [withB, without] = pair === '이가' ? ['이', '가'] : pair === '을를' ? ['을', '를'] : pair === '은는' ? ['은', '는'] : ['과', '와'];
  return word + (hasBatchim ? withB : without);
}
