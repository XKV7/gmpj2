import { ZodError } from 'zod';

/** 사용자에게 그대로 보여줄 한국어 메시지를 가진 오류 */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new AppError(400, msg);
export const unauthorized = (msg = '로그인이 필요해요.') => new AppError(401, msg);
export const forbidden = (msg = '이 작업을 할 권한이 없어요.') => new AppError(403, msg);
export const notFound = (msg = '찾을 수 없어요.') => new AppError(404, msg);
export const conflict = (msg: string) => new AppError(409, msg);
export const tooMany = (msg = '요청이 너무 많아요. 잠시 후 다시 시도해 주세요.') => new AppError(429, msg);

/** zod/AppError/기타 오류를 사용자 메시지로 바꾼다 */
export function toUserError(err: unknown): { status: number; message: string } {
  if (err instanceof AppError) return { status: err.status, message: err.message };
  if (err instanceof ZodError) return { status: 400, message: err.issues[0]?.message ?? '입력값이 올바르지 않아요.' };
  return { status: 500, message: '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' };
}

export function parse<T>(schema: { parse: (v: unknown) => T }, value: unknown): T {
  return schema.parse(value);
}
