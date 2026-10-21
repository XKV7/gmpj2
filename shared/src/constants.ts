export const LIMITS = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 20,
  NICKNAME_MAX: 24,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 128,
  STATUS_MAX: 80,
  MESSAGE_MAX: 8000,
  GROUP_MAX_MEMBERS: 50,
  NAME_MAX: 40,
  TOPIC_MAX: 200,
  ATTACHMENTS_PER_MESSAGE: 10,
  UPLOAD_MAX_BYTES: 25 * 1024 * 1024,
  AVATAR_MAX_BYTES: 8 * 1024 * 1024,
  VOICE_MAX_PARTICIPANTS: 8,
  PAGE_SIZE: 50,
  SYNC_MAX_PER_CONVERSATION: 300,
  /** 같은 사람이 이 시간 안에 연속으로 보낸 메시지는 묶어서 보여준다 */
  GROUP_WINDOW_MS: 5 * 60 * 1000,
  IDLE_AFTER_MS: 5 * 60 * 1000,
  TYPING_TTL_MS: 6000,
} as const;

export const BANNER_COLORS = [
  '#F28C6B', '#F2B84B', '#7CC68D', '#5DB7C9', '#6C8EF2', '#A47CF2', '#E879A6', '#8A8F98',
] as const;

export const ROLE_COLORS = [
  '#E5484D', '#F76B15', '#FFB224', '#30A46C', '#12A594', '#0091FF', '#6E56CF', '#D6409F', '#8E8C99',
] as const;

/** 서버가 받아주는 업로드 형식 (MIME → 확장자). 판별은 파일 내용(매직 넘버)으로 한다. */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'application/x-7z-compressed': '7z',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
};

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];
