import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { ALLOWED_UPLOAD_TYPES, LIMITS, type Attachment } from '@moyeo/shared';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { badRequest } from '../lib/errors.ts';
import { toAttachment } from './messages.ts';
import { now } from './util.ts';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const randomName = (ext: string) => `${crypto.randomBytes(16).toString('hex')}.${ext}`;

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'log', 'csv', 'json']);

/** 사용자에게 보여줄 파일명을 안전하게 다듬는다 (경로 구분자/제어문자 제거) */
export function cleanFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').trim().slice(0, 120);
  return cleaned || 'file';
}

/** 내용(매직 넘버)으로 형식을 판별한다. 확장자는 믿지 않는다. */
export async function detectType(buf: Buffer, originalName: string): Promise<{ mime: string; ext: string } | null> {
  const ft = await fileTypeFromBuffer(buf);
  if (ft) {
    const ext = ALLOWED_UPLOAD_TYPES[ft.mime];
    if (ext) return { mime: ft.mime, ext };
    // m4a/mp4 오디오 같이 MIME이 여러 가지인 경우
    if (ft.mime === 'audio/x-m4a') return { mime: 'audio/mp4', ext: 'm4a' };
    if (ft.mime === 'audio/x-wav' || ft.mime === 'audio/vnd.wave') return { mime: 'audio/wav', ext: 'wav' };
    return null;
  }
  // 형식 시그니처가 없는 텍스트 파일: 확장자 + NUL 바이트 없음 + UTF-8 유효성으로 확인
  const ext = path.extname(originalName).slice(1).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext) && !buf.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { mime: 'text/plain', ext: 'txt' };
    } catch {
      return null;
    }
  }
  return null;
}

const REENCODE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function saveAttachment(uploaderId: number, buf: Buffer, originalName: string): Promise<Attachment> {
  if (buf.length === 0) throw badRequest('빈 파일은 올릴 수 없어요.');
  if (buf.length > LIMITS.UPLOAD_MAX_BYTES) throw badRequest(`파일은 ${LIMITS.UPLOAD_MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요.`);
  const type = await detectType(buf, originalName);
  if (!type) throw badRequest('지원하지 않는 파일 형식이에요. 이미지, PDF, 문서, 압축 파일, 음악·동영상을 올릴 수 있어요.');
  let data = buf;
  let width: number | null = null;
  let height: number | null = null;
  if (type.mime.startsWith('image/')) {
    try {
      const img = sharp(buf, { animated: type.mime === 'image/gif' || type.mime === 'image/webp', limitInputPixels: 80_000_000 });
      if (REENCODE.has(type.mime)) {
        // 회전 정보 반영 + 위치정보 등 메타데이터 제거
        const out = await sharp(buf, { limitInputPixels: 80_000_000, animated: type.mime === 'image/webp' }).rotate().toBuffer({ resolveWithObject: true });
        data = out.data;
        width = out.info.width;
        height = out.info.pageHeight ?? out.info.height;
      } else {
        const meta = await img.metadata();
        width = meta.width ?? null;
        height = meta.pageHeight ?? meta.height ?? null;
      }
    } catch {
      throw badRequest('이미지 파일이 손상되었거나 읽을 수 없어요.');
    }
  }
  const stored = randomName(type.ext);
  await fs.promises.writeFile(path.join(config.uploadsDir, stored), data);
  // 표시 이름의 확장자도 실제 형식에 맞춘다 (예: 그림인데 .pdf 로 올린 경우)
  let name = cleanFileName(originalName);
  const ext = path.extname(name).slice(1).toLowerCase();
  const same = ext === type.ext || (type.ext === 'jpg' && ext === 'jpeg') || (type.mime === 'text/plain' && TEXT_EXTENSIONS.has(ext));
  if (!same) name = `${ext ? name.slice(0, -(ext.length + 1)) : name}.${type.ext}`;
  const id = Number(
    db().prepare('INSERT INTO attachments (uploader_id, name, stored_name, mime, size, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uploaderId, name, stored, type.mime, data.length, width, height, now()).lastInsertRowid,
  );
  return toAttachment(db().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as Parameters<typeof toAttachment>[0]);
}

/** 프로필/방/서버 아이콘: 정사각형으로 잘라 256px WebP로 저장. 저장된 URL을 돌려준다. */
export async function saveIcon(buf: Buffer): Promise<string> {
  if (buf.length > LIMITS.AVATAR_MAX_BYTES) throw badRequest('이미지는 8MB까지 올릴 수 있어요.');
  const type = await detectType(buf, 'image');
  if (!type || !type.mime.startsWith('image/')) throw badRequest('이미지 파일만 올릴 수 있어요.');
  let out: Buffer;
  try {
    out = await sharp(buf, { limitInputPixels: 80_000_000 }).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 86 }).toBuffer();
  } catch {
    throw badRequest('이미지 파일이 손상되었거나 읽을 수 없어요.');
  }
  const stored = randomName('webp');
  await fs.promises.writeFile(path.join(config.uploadsDir, stored), out);
  return `/uploads/${stored}`;
}

/** 더 이상 쓰지 않는 아이콘 파일 삭제 */
export function removeIconFile(url: string | null) {
  if (!url?.startsWith('/uploads/')) return;
  const name = path.basename(url);
  fs.promises.unlink(path.join(config.uploadsDir, name)).catch(() => undefined);
}

/** 하루 이상 메시지에 붙지 않은 업로드 정리 */
export function purgeOrphanUploads() {
  const cutoff = now() - 24 * 60 * 60 * 1000;
  const rows = db().prepare('SELECT id, stored_name FROM attachments WHERE message_id IS NULL AND created_at < ?').all(cutoff) as { id: number; stored_name: string }[];
  for (const r of rows) {
    fs.promises.unlink(path.join(config.uploadsDir, r.stored_name)).catch(() => undefined);
    db().prepare('DELETE FROM attachments WHERE id = ?').run(r.id);
  }
}
