// 모여 공용 데이터 타입 — 서버와 클라이언트가 같은 모양을 공유한다.

export type Presence = 'online' | 'idle' | 'dnd' | 'offline';
/** 사용자가 직접 고르는 상태. invisible = "오프라인으로 표시" */
export type PresencePref = 'online' | 'idle' | 'dnd' | 'invisible';

export interface PublicUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  statusMessage: string;
  bannerColor: string;
  presence: Presence;
}

export interface Me extends PublicUser {
  presencePref: PresencePref;
  createdAt: number;
}

export type RelationType = 'friend' | 'incoming' | 'outgoing' | 'blocked';

export interface Relationship {
  userId: number;
  type: RelationType;
  since: number;
}

export type ConversationKind = 'dm' | 'group' | 'text' | 'voice' | 'thread';

export interface ConversationMember {
  userId: number;
  /** 이 사람이 마지막으로 읽은 메시지 ID */
  lastReadId: number;
  /** 방에 들어오기 직전의 마지막 메시지 ID — 이보다 이전 메시지는 읽음 수 계산에서 제외 */
  joinedAfterId: number;
}

export interface Conversation {
  id: number;
  kind: ConversationKind;
  name: string | null;
  icon: string | null;
  topic: string;
  ownerId: number | null;
  serverId: number | null;
  categoryId: number | null;
  position: number;
  parentId: number | null;
  parentMessageId: number | null;
  createdAt: number;
  /** DM/그룹에서만 채워진다 */
  members: ConversationMember[];
  /** 그룹: 초대를 받았지만 아직 수락하지 않은 사람 */
  invitedIds: number[];
  lastMessage: Message | null;
  /** 정렬 기준이 되는 마지막 활동 시각 */
  lastActivityAt: number;
  // ↓ 요청한 사용자 기준 상태
  lastReadId: number;
  unread: number;
  mentions: number;
  pinned: boolean;
  muted: boolean;
}

export interface Attachment {
  id: number;
  name: string;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  kind: 'image' | 'file';
}

export interface Reaction {
  emoji: string;
  userIds: number[];
}

export interface ReplyPreview {
  id: number;
  authorId: number;
  content: string;
  deleted: boolean;
  attachmentCount: number;
}

export interface ThreadInfo {
  id: number;
  count: number;
  lastAt: number | null;
}

export type MessageType = 'text' | 'system';

export interface Message {
  id: number;
  conversationId: number;
  authorId: number;
  type: MessageType;
  content: string;
  /** 보낸 사람이 마크다운 모드로 보냈는지 (아니면 쓴 그대로 표시) */
  markdown: boolean;
  clientId: string | null;
  replyTo: ReplyPreview | null;
  attachments: Attachment[];
  reactions: Reaction[];
  mentions: number[];
  mentionsEveryone: boolean;
  pinned: boolean;
  thread: ThreadInfo | null;
  editedAt: number | null;
  deleted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Role {
  id: number;
  serverId: number;
  name: string;
  color: string | null;
  permissions: number;
  position: number;
  isDefault: boolean;
}

export interface ServerMember {
  userId: number;
  roleIds: number[];
  joinedAt: number;
}

export interface Category {
  id: number;
  serverId: number;
  name: string;
  position: number;
}

export interface Server {
  id: number;
  name: string;
  icon: string | null;
  ownerId: number;
  createdAt: number;
  roles: Role[];
  categories: Category[];
  channels: Conversation[];
  members: ServerMember[];
}

/** 그룹 채팅 초대장 — 받은 사람이 수락해야 방에 들어간다 */
export interface GroupInvite {
  conversationId: number;
  name: string | null;
  icon: string | null;
  inviterId: number;
  memberIds: number[];
  createdAt: number;
}

export interface Invite {
  code: string;
  serverId: number;
  creatorId: number;
  createdAt: number;
  expiresAt: number | null;
  maxUses: number | null;
  uses: number;
}

export interface InvitePreview {
  code: string;
  server: { id: number; name: string; icon: string | null; memberCount: number };
  expiresAt: number | null;
  alreadyMember: boolean;
}

export interface VoiceParticipant {
  userId: number;
  socketId: string;
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  joinedAt: number;
}

export interface BootstrapData {
  me: Me;
  users: PublicUser[];
  relationships: Relationship[];
  conversations: Conversation[];
  servers: Server[];
  voice: Record<string, VoiceParticipant[]>;
  groupInvites: GroupInvite[];
  /** 서버 기준 현재 시각 — 재접속 동기화의 기준점 */
  serverTime: number;
}

export interface SyncResult {
  messages: Message[];
  users: PublicUser[];
  serverTime: number;
  /** 놓친 메시지가 너무 많아 최신 페이지를 새로 불러와야 하는 대화 */
  resets: number[];
}

export interface MessagePage {
  messages: Message[];
  users: PublicUser[];
  /** 더 이전 메시지가 있는지 */
  hasMore: boolean;
  /** 이후 메시지가 더 있는지 (around 조회 시) */
  hasNewer: boolean;
}

export interface SearchResult {
  messages: Message[];
  users: PublicUser[];
}
