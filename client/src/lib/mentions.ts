import type { PublicUser } from '@moyeo/shared';

/** 입력창의 "@닉네임"을 서버 형식 "<@id>"로 바꾼다. 긴 닉네임부터 맞춰 겹침을 피한다. */
export function encodeMentions(text: string, candidates: PublicUser[], allowEveryone: boolean): string {
  let out = text;
  if (allowEveryone) out = out.replace(/(^|[\s(])@(모두|everyone)(?=$|[\s.,!?)])/g, '$1<@everyone>');
  const sorted = [...candidates].sort((a, b) => b.nickname.length - a.nickname.length);
  for (const u of sorted) {
    const escaped = u.nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[\\s(])@${escaped}(?=$|[\\s.,!?)~:;])`, 'g');
    out = out.replace(re, `$1<@${u.id}>`);
  }
  return out;
}

/** 수정할 때: "<@id>"를 다시 "@닉네임"으로 */
export function decodeMentions(text: string, nameOf: (id: number) => string): string {
  return text.replace(/<@(\d+)>/g, (_, id: string) => `@${nameOf(Number(id))}`).replace(/<@everyone>/g, '@모두');
}
