import { api } from './api';

/*
 * 기기 알림(웹 푸시).
 * 켜 두면 앱(탭)을 닫아도 휴대폰·태블릿·PC의 알림창에 새 메시지가 뜬다.
 * 서비스 워커(/sw.js)가 알림을 받아 띄우고, 이 파일은 켜기·끄기·상태 확인을 맡는다.
 */

export type PushState =
  | 'on'
  | 'off'
  /** 브라우저에서 알림을 차단함 — 사이트 설정에서 풀어야 함 */
  | 'denied'
  /** 아이폰·아이패드: 홈 화면에 추가한 앱에서만 켤 수 있음 */
  | 'needs-install'
  | 'unsupported';

const FLAG = 'moyeo:push';

export function isAppleMobile(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
}

/** 이 기기에서 기기 알림이 켜져 있는지 (화면 안 알림과 겹치지 않게 할 때 씀) */
export function pushOnHere(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

function setFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isAppleMobile() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  return (await currentSubscription()) ? 'on' : 'off';
}

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(sub: PushSubscription, key: Uint8Array): boolean {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

/** 서버 키로 구독을 만들거나(이미 있으면 그대로) 서버에 이 기기를 등록한다 */
async function subscribeHere(): Promise<void> {
  const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.getRegistration('/'));
  if (!reg) throw new Error('알림을 받을 준비를 하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
  await navigator.serviceWorker.ready;
  const { publicKey } = await api.get<{ publicKey: string }>('/api/push/key');
  const key = keyToBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // 서버 키가 바뀌었으면(서버를 새로 만든 경우 등) 예전 구독은 버리고 다시 만든다
  if (sub && !sameKey(sub, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api.post('/api/push/subscribe', sub.toJSON());
  setFlag(true);
}

/** 켜기: 권한을 묻고 이 기기를 등록한다. 실패하면 이유를 담은 오류를 던진다. */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) {
    throw new Error(
      isAppleMobile() && !isStandalone()
        ? '아이폰·아이패드는 Safari에서 공유 버튼 → "홈 화면에 추가"를 한 뒤, 홈 화면의 모여 앱에서 켜 주세요.'
        : '이 브라우저는 기기 알림을 지원하지 않아요. Chrome, Edge, Firefox, Safari 최신 버전을 써 주세요.',
    );
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error(perm === 'denied' ? '알림이 차단되어 있어요. 브라우저(또는 기기)의 사이트 설정에서 알림을 허용해 주세요.' : '알림 권한을 허용해야 켤 수 있어요.');
  }
  await subscribeHere();
}

/** 끄기: 이 기기 구독을 서버와 브라우저 양쪽에서 지운다 */
export async function disablePush(): Promise<void> {
  setFlag(false);
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** 로그인할 때마다: 이 기기에서 켜 둔 적이 있으면 현재 계정으로 다시 등록 (서버 데이터가 초기화돼도 복구) */
export async function syncPush(): Promise<void> {
  try {
    await registerServiceWorker();
    if (!pushOnHere() || !(await currentSubscription())) return;
    await subscribeHere();
  } catch {
    /* 다음 로그인 때 다시 시도 */
  }
}

/** 서버에 테스트 알림을 요청한다. 보낸 기기 수를 돌려준다. */
export async function sendTestPush(): Promise<number> {
  const { sent } = await api.post<{ sent: number }>('/api/push/test');
  return sent;
}
