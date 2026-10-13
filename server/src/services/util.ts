import crypto from 'node:crypto';

export const inList = (n: number) => Array.from({ length: n }, () => '?').join(',');

export const now = () => Date.now();

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** 혼동하기 쉬운 글자를 뺀 초대 코드 */
export function inviteCode(len = 8): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
