import { z } from 'zod';
import { LIMITS } from './constants.ts';

const id = z.number().int().positive();
const trimmed = (max: number) => z.string().trim().max(max);

export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.USERNAME_MIN, `아이디는 ${LIMITS.USERNAME_MIN}자 이상이어야 해요.`)
  .max(LIMITS.USERNAME_MAX, `아이디는 ${LIMITS.USERNAME_MAX}자 이하여야 해요.`)
  .regex(/^[a-zA-Z0-9_.]+$/, '아이디는 영문, 숫자, 밑줄(_), 점(.)만 쓸 수 있어요.')
  .transform((s) => s.toLowerCase());

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, '닉네임을 입력해 주세요.')
  .max(LIMITS.NICKNAME_MAX, `닉네임은 ${LIMITS.NICKNAME_MAX}자 이하여야 해요.`);

export const passwordSchema = z
  .string()
  .min(LIMITS.PASSWORD_MIN, `비밀번호는 ${LIMITS.PASSWORD_MIN}자 이상이어야 해요.`)
  .max(LIMITS.PASSWORD_MAX, '비밀번호가 너무 길어요.');

export const registerSchema = z.object({
  username: usernameSchema,
  nickname: nicknameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1, '아이디를 입력해 주세요.').transform((s) => s.toLowerCase()),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '색상 형식이 올바르지 않아요.');

export const profileUpdateSchema = z.object({
  nickname: nicknameSchema.optional(),
  statusMessage: trimmed(LIMITS.STATUS_MAX).optional(),
  bannerColor: hexColor.optional(),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, '현재 비밀번호를 입력해 주세요.'),
  newPassword: passwordSchema,
});

export const presencePrefSchema = z.enum(['online', 'idle', 'dnd', 'invisible']);

export const friendRequestSchema = z.object({ username: z.string().trim().min(1, '아이디를 입력해 주세요.').transform((s) => s.toLowerCase()) });

export const createGroupSchema = z.object({
  name: trimmed(LIMITS.NAME_MAX).optional(),
  userIds: z.array(id).min(1, '함께할 친구를 골라 주세요.').max(LIMITS.GROUP_MAX_MEMBERS - 1),
});

export const updateConversationSchema = z.object({
  name: trimmed(LIMITS.NAME_MAX).optional(),
  topic: trimmed(LIMITS.TOPIC_MAX).optional(),
});

export const conversationPrefsSchema = z.object({
  pinned: z.boolean().optional(),
  muted: z.boolean().optional(),
});

export const inviteMembersSchema = z.object({ userIds: z.array(id).min(1).max(LIMITS.GROUP_MAX_MEMBERS) });

export const sendMessageSchema = z.object({
  conversationId: id,
  content: z.string().max(LIMITS.MESSAGE_MAX, `메시지는 ${LIMITS.MESSAGE_MAX}자까지 보낼 수 있어요.`),
  clientId: z.string().min(8).max(64),
  replyToId: id.nullish(),
  attachmentIds: z.array(id).max(LIMITS.ATTACHMENTS_PER_MESSAGE).default([]),
  markdown: z.boolean().default(false),
});

export const editMessageSchema = z.object({
  messageId: id,
  content: z.string().trim().min(1, '빈 메시지로 바꿀 수 없어요.').max(LIMITS.MESSAGE_MAX),
});

export const messageIdSchema = z.object({ messageId: id });

export const reactionSchema = z.object({
  messageId: id,
  emoji: z.string().min(1).max(32),
});

export const readSchema = z.object({ conversationId: id, messageId: z.number().int().nonnegative() });
export const typingSchema = z.object({ conversationId: id });

export const syncSchema = z.object({
  cursors: z.array(z.object({ conversationId: id, lastId: z.number().int().nonnegative() })).max(500),
  since: z.number().int().nonnegative(),
});

export const createServerSchema = z.object({ name: z.string().trim().min(1, '서버 이름을 입력해 주세요.').max(LIMITS.NAME_MAX) });
export const updateServerSchema = z.object({ name: z.string().trim().min(1).max(LIMITS.NAME_MAX).optional() });

export const createChannelSchema = z.object({
  name: z.string().trim().min(1, '채널 이름을 입력해 주세요.').max(LIMITS.NAME_MAX),
  kind: z.enum(['text', 'voice']),
  categoryId: id.nullable(),
  topic: trimmed(LIMITS.TOPIC_MAX).optional(),
});

export const createCategorySchema = z.object({ name: z.string().trim().min(1, '카테고리 이름을 입력해 주세요.').max(LIMITS.NAME_MAX) });

export const reorderSchema = z.object({
  categories: z.array(id),
  channels: z.array(z.object({ id, categoryId: id.nullable() })),
});

export const roleSchema = z.object({
  name: z.string().trim().min(1, '역할 이름을 입력해 주세요.').max(LIMITS.NAME_MAX),
  color: hexColor.nullable(),
  permissions: z.number().int().nonnegative(),
});

export const roleOrderSchema = z.object({ roleIds: z.array(id) });
export const memberRolesSchema = z.object({ roleIds: z.array(id) });

/** 활동 제한 기간 선택지(초). null = 직접 해제할 때까지 */
export const RESTRICT_DURATIONS: { sec: number | null; label: string }[] = [
  { sec: 60, label: '1분' },
  { sec: 5 * 60, label: '5분' },
  { sec: 10 * 60, label: '10분' },
  { sec: 60 * 60, label: '1시간' },
  { sec: 24 * 60 * 60, label: '1일' },
  { sec: 7 * 24 * 60 * 60, label: '1주' },
  { sec: null, label: '해제할 때까지' },
];

export const restrictMemberSchema = z
  .object({
    text: z.boolean(),
    voice: z.boolean(),
    durationSec: z.number().int().min(60).max(60 * 60 * 24 * 28).nullable(),
    reason: z.string().trim().max(200, '사유는 200자까지 쓸 수 있어요.').default(''),
  })
  .refine((v) => v.text || v.voice, { message: '제한할 활동을 하나 이상 골라 주세요.' });

export const createInviteSchema = z.object({
  expiresInSec: z.number().int().positive().max(60 * 60 * 24 * 30).nullable(),
  maxUses: z.number().int().positive().max(1000).nullable(),
});

export const searchSchema = z.object({
  q: z.string().trim().max(100).default(''),
  authorId: z.coerce.number().int().positive().optional(),
});

export const voiceJoinSchema = z.object({
  room: z.string().regex(/^(ch|dm):\d+$/),
  muted: z.boolean(),
  deafened: z.boolean(),
  video: z.boolean(),
});

export const voiceStateSchema = z.object({
  muted: z.boolean(),
  deafened: z.boolean(),
  video: z.boolean(),
  screen: z.boolean(),
});

export const voiceSignalSchema = z.object({
  to: z.string().min(1).max(64),
  data: z.object({
    description: z.object({ type: z.enum(['offer', 'answer', 'pranswer', 'rollback']), sdp: z.string().max(200_000).optional() }).optional(),
    candidate: z.any().optional(),
  }),
});

export const callStartSchema = z.object({ conversationId: id, video: z.boolean() });
export const callIdSchema = z.object({ conversationId: id });
