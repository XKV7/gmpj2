import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * 브라우저 컨텍스트 3개(A: 데스크톱 라이트, B: 데스크톱 다크, C: 모바일)로
 * 서로 다른 계정이 실시간으로 대화하는 전체 흐름을 검증한다.
 */

interface Player { ctx: BrowserContext; page: Page; username: string; nickname: string; errors: string[] }

const stamp = Date.now().toString(36).slice(-5);
const SHOTS = 'e2e/screenshots';

/** 화면 전환/등장 애니메이션이 끝난 뒤 스크린샷 */
async function shot(p: Page, name: string) {
  await p.waitForTimeout(450);
  await p.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function newPlayer(browser: Browser, key: string, nickname: string, opts: { dark?: boolean; mobile?: boolean } = {}): Promise<Player> {
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1360, height: 860 },
    deviceScaleFactor: opts.mobile ? 2 : 1,
    isMobile: opts.mobile,
    hasTouch: opts.mobile,
    colorScheme: opts.dark ? 'dark' : 'light',
    permissions: ['microphone', 'camera'],
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${nickname}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${nickname}] pageerror: ${e.message}`));
  const username = `${key}_${stamp}`;
  await page.goto('/');
  await page.getByRole('button', { name: '회원가입' }).click();
  await page.locator('input[name=username]').fill(username);
  await page.locator('input[name=nickname]').fill(nickname);
  await page.locator('input[name=password]').fill('secret1234');
  await page.locator('input[name=password2]').fill('secret1234');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();
  await expect(page.locator('.user-chip').first()).toContainText(nickname);
  return { ctx, page, username, nickname, errors };
}

const composer = (p: Page) => p.locator('.chat .composer-input, .main-pane .composer-input').first();

async function send(p: Page, text: string) {
  const box = composer(p);
  await box.click();
  await box.fill(text);
  await box.press('Enter');
}

const msg = (p: Page, text: string) => p.locator('.main-pane .msg').filter({ hasText: text });

async function openFriendsTab(p: Page, tab: string, mobile = false) {
  if (mobile) await p.locator('.nav-item', { hasText: '친구' }).click();
  await p.getByRole('tab', { name: tab }).click();
}

test.describe.configure({ mode: 'serial' });

let A: Player;
let B: Player;
let C: Player;
let serverName = '';

test.beforeAll(async ({ browser }) => {
  A = await newPlayer(browser, 'alice', '앨리스');
  B = await newPlayer(browser, 'bob', '보브', { dark: true });
  C = await newPlayer(browser, 'chloe', '클로이', { mobile: true });
});

test.afterAll(async () => {
  const all = [...A.errors, ...B.errors, ...C.errors];
  for (const p of [A, B, C]) await p.ctx.close();
  expect(all, `콘솔 에러가 없어야 해요:\n${all.join('\n')}`).toEqual([]);
});

test('친구 추가 → 수락', async () => {
  await shot(A.page, 'desktop-light-empty-friends');
  for (const target of [B, C]) {
    await openFriendsTab(A.page, '친구 추가');
    await A.page.getByLabel('친구 아이디').fill(target.username);
    await A.page.getByRole('button', { name: '친구 요청 보내기' }).click();
    await expect(A.page.locator('.form-ok')).toContainText(target.nickname);
  }
  // B: 데스크톱에서 대기 중 탭으로 수락
  await openFriendsTab(B.page, '대기 중');
  await B.page.locator('.friend-row', { hasText: A.nickname }).getByLabel('수락').click();
  // C: 모바일에서 수락
  await openFriendsTab(C.page, '대기 중', true);
  await C.page.locator('.friend-row', { hasText: A.nickname }).getByLabel('수락').click();
  await openFriendsTab(A.page, '모든 친구');
  await expect(A.page.locator('.friend-row')).toHaveCount(2);
  // 친구가 되면 온라인 상태가 실시간으로 보인다
  await openFriendsTab(A.page, '온라인');
  await expect(A.page.locator('.friend-row', { hasText: B.nickname })).toBeVisible();
  await shot(A.page, 'desktop-light-friends');
});

test('DM 전송 → 실시간 수신, 읽음 숫자 감소, 입력 중 표시', async () => {
  await A.page.locator('.friend-row', { hasText: B.nickname }).click();
  await expect(A.page.locator('.chat-header')).toContainText(B.nickname);
  await send(A.page, '안녕 보브! **반가워** 👋');
  // B: 채팅 목록에 안 읽은 배지
  const row = B.page.locator('.chat-row', { hasText: A.nickname });
  await expect(row.locator('.badge')).toHaveText('1');
  // A: 아직 안 읽은 사람 수 1
  await expect(msg(A.page, '안녕 보브!').locator('.msg-readcount')).toHaveText('1');
  await shot(B.page, 'desktop-dark-unread');
  // B가 열어서 읽으면 A 쪽 숫자가 사라진다
  await row.click();
  await expect(msg(B.page, '안녕 보브!')).toBeVisible();
  await expect(msg(A.page, '안녕 보브!').locator('.msg-readcount')).toHaveCount(0);
  // 입력 중 표시
  await composer(B.page).click();
  await composer(B.page).pressSequentially('지금 쓰는 중', { delay: 30 });
  await expect(A.page.locator('.typing-line')).toContainText(`${B.nickname}님이 입력 중`);
  await composer(B.page).fill('');
});

test('답장 · 반응 · 수정 · 삭제', async () => {
  // B가 A의 메시지에 답장
  await msg(B.page, '안녕 보브!').hover();
  await msg(B.page, '안녕 보브!').locator('button[data-tip="답장"]').click();
  await expect(B.page.locator('.composer-reply')).toContainText(A.nickname);
  await send(B.page, '나도 반가워 앨리스!');
  const reply = msg(A.page, '나도 반가워 앨리스!');
  await expect(reply.locator('.msg-reply')).toContainText('안녕 보브!');
  // 답장 인용을 누르면 원문으로 이동 + 하이라이트
  await reply.locator('.msg-reply').click();
  await expect(msg(A.page, '안녕 보브!').first()).toHaveClass(/flash/);

  // 이동한 뒤 맨 아래로 내려오면, 새 메시지가 와도 원문 쪽으로 다시 끌려 올라가지 않는다
  const list = A.page.locator('.main-pane .messages');
  for (let i = 1; i <= 15; i++) await send(B.page, `채워 넣기 ${i}`);
  await expect(msg(A.page, '채워 넣기 15')).toBeVisible();
  await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await A.page.waitForTimeout(300);
  for (const t of ['새 메시지 하나', '새 메시지 둘']) {
    await send(B.page, t);
    await expect(msg(A.page, t)).toBeVisible();
    await A.page.waitForTimeout(400);
    expect(await list.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(60);
  }

  // A가 B의 메시지에 👍 반응 → B에게 실시간 반영
  await reply.hover();
  await reply.locator('button[title="👍 반응"]').click();
  await expect(msg(B.page, '나도 반가워 앨리스!').locator('.reaction:not(.add)')).toContainText('1');
  await expect(msg(B.page, '나도 반가워 앨리스!').locator('.reaction-tip')).toContainText(A.nickname);

  // A가 위 방향키로 마지막 내 메시지 수정
  await send(A.page, '고칠 메시지');
  await expect(msg(B.page, '고칠 메시지')).toBeVisible();
  await composer(A.page).click();
  await composer(A.page).press('ArrowUp');
  const edit = A.page.locator('.edit-box textarea');
  await expect(edit).toHaveValue('고칠 메시지');
  await edit.fill('고친 메시지입니다');
  await edit.press('Enter');
  await expect(msg(B.page, '고친 메시지입니다').locator('.msg-edited')).toBeVisible();

  // A가 모두에게서 삭제
  const target = msg(A.page, '고친 메시지입니다');
  await target.hover();
  await target.getByLabel('더 보기').click();
  await A.page.getByRole('menuitem', { name: '모두에게서 삭제' }).click();
  await A.page.locator('.modal').getByRole('button', { name: '삭제' }).click();
  await expect(B.page.locator('.main-pane .msg-deleted')).toBeVisible();
  await expect(msg(B.page, '고친 메시지입니다')).toHaveCount(0);
  await shot(A.page, 'desktop-light-dm');
  await shot(B.page, 'desktop-dark-dm');
});

test('그룹 채팅방 만들기', async () => {
  await A.page.getByLabel('새 채팅').click();
  const modal = A.page.locator('.modal');
  await modal.locator('.picker-row', { hasText: B.nickname }).locator('input').check();
  await modal.locator('.picker-row', { hasText: C.nickname }).locator('input').check();
  await modal.getByPlaceholder('비워 두면 멤버 이름으로 표시돼요').fill('E2E 그룹');
  await modal.getByRole('button', { name: /그룹 만들고/ }).click();
  await expect(A.page.locator('.chat-header')).toContainText('E2E 그룹');
  // 초대받은 사람은 동의하기 전까지 방에 들어가지 않는다 → 초대 카드만 보인다
  await expect(B.page.locator('.invite-card', { hasText: 'E2E 그룹' })).toBeVisible();
  await expect(B.page.locator('.chat-row', { hasText: 'E2E 그룹' })).toHaveCount(0);
  await B.page.locator('.invite-card', { hasText: 'E2E 그룹' }).getByRole('button', { name: '수락하고 들어가기' }).click();
  await expect(B.page.locator('.chat-header')).toContainText('E2E 그룹');
  await B.page.locator(`.chat-row:has(strong:text-is("${A.nickname}"))`).click();
  // C(모바일): 초대 카드에서 수락
  await C.page.getByLabel('목록으로').first().click().catch(() => undefined);
  const inviteCard = C.page.locator('.invite-card', { hasText: 'E2E 그룹' });
  await expect(inviteCard).toBeVisible();
  await expect(C.page.locator('.chat-row', { hasText: 'E2E 그룹' })).toHaveCount(0);
  await shot(C.page, 'mobile-light-chat-list');
  await inviteCard.getByRole('button', { name: '수락하고 들어가기' }).click();
  await expect(C.page.locator('.main-pane .chat-header')).toContainText('E2E 그룹');
  await send(C.page, '그룹 안녕! 모바일에서 왔어요 📱');
  await expect(msg(A.page, '그룹 안녕!')).toBeVisible();
  await expect(B.page.locator('.chat-row', { hasText: 'E2E 그룹' })).toContainText('그룹 안녕!');
  // 그룹 메시지의 안 읽은 사람 수: A는 읽음, B는 아직 → 1
  await expect(msg(C.page, '그룹 안녕!').locator('.msg-readcount')).toHaveText('1');
  await shot(C.page, 'mobile-light-group-chat');
});

test('서버 생성 → 초대 링크로 참가 → 채널 메시지', async () => {
  serverName = `E2E 서버 ${stamp}`;
  await A.page.getByLabel('서버 추가').click();
  const modal = A.page.locator('.modal');
  await modal.getByLabel('서버 이름').fill(serverName);
  await modal.getByRole('button', { name: '만들기', exact: true }).click();
  await expect(A.page.locator('.server-header')).toContainText(serverName);
  await expect(A.page.locator('.chat-header')).toContainText('일반');

  // 초대 링크 만들기
  await A.page.locator('.server-header').click();
  await A.page.getByRole('menuitem', { name: '친구 초대하기' }).click();
  const linkInput = A.page.getByLabel('초대 링크');
  await expect(linkInput).toHaveValue(/\/invite\/[A-Za-z0-9]+$/);
  const link = await linkInput.inputValue();
  await A.page.keyboard.press('Escape');

  // B: 링크로 접속해서 참가
  await B.page.goto(new URL(link).pathname);
  await expect(B.page.locator('.invite-preview')).toContainText(serverName);
  await B.page.getByRole('button', { name: '참가하기', exact: true }).click();
  await expect(B.page.locator('.server-header')).toContainText(serverName);

  // C(모바일): 코드로 참가
  await C.page.getByLabel('목록으로').first().click();
  await C.page.getByLabel('서버 추가').click();
  await C.page.getByRole('button', { name: '초대로 참가' }).click();
  await C.page.getByLabel('초대 링크 또는 코드').fill(link);
  await C.page.locator('.modal').getByRole('button', { name: '참가하기', exact: true }).click();
  await expect(C.page.locator('.main-pane .chat-header')).toContainText('일반');

  // 멤버 목록에 실시간 반영
  await A.page.getByLabel('멤버 목록').click();
  await expect(A.page.locator('.right-panel .member-row')).toHaveCount(3);

  await send(B.page, '채널에 첫 메시지! @앨리스 안녕');
  await expect(msg(A.page, '채널에 첫 메시지!')).toBeVisible();
  await expect(msg(A.page, '채널에 첫 메시지!').locator('.mention-me')).toHaveText(`@${A.nickname}`);
  await expect(msg(C.page, '채널에 첫 메시지!')).toBeVisible();
  await shot(A.page, 'desktop-light-server');
  await shot(B.page, 'desktop-dark-server');
  await shot(C.page, 'mobile-light-server-channel');
});

test('연결이 끊겼다가 다시 연결되면 놓친 메시지를 동기화', async () => {
  await send(A.page, '나중에 고칠 메시지');
  await expect(msg(C.page, '나중에 고칠 메시지')).toBeVisible();

  // C의 연결을 끊는다
  await C.page.evaluate(() => (window as unknown as { __moyeo: { socket: { disconnect: () => void } } }).__moyeo.socket.disconnect());
  await expect.poll(() => C.page.evaluate(() => (window as unknown as { __moyeo: { socket: { connected: boolean } } }).__moyeo.socket.connected)).toBe(false);

  // 끊긴 동안: A가 새 메시지 2개 + 기존 메시지 수정, B가 반응
  await send(A.page, '놓친 메시지 하나');
  await send(A.page, '놓친 메시지 둘');
  await composer(A.page).click();
  await composer(A.page).press('ArrowUp');
  await A.page.locator('.edit-box textarea').fill('놓친 메시지 둘 (수정됨)');
  await A.page.locator('.edit-box textarea').press('Enter');
  await expect(msg(A.page, '놓친 메시지 둘 (수정됨)')).toBeVisible();
  const first = msg(B.page, '놓친 메시지 하나');
  await first.hover();
  await first.locator('button[title="❤️ 반응"]').click();

  // C는 오프라인 상태에서 메시지를 보낸다 → 대기열에 쌓임
  await send(C.page, '오프라인에서 쓴 메시지');
  await expect(C.page.locator('.msg.pending', { hasText: '오프라인에서 쓴 메시지' })).toContainText('연결되면 보낼게요');
  await expect(msg(C.page, '놓친 메시지 하나')).toHaveCount(0);

  // 다시 연결
  await C.page.evaluate(() => (window as unknown as { __moyeo: { socket: { connect: () => void } } }).__moyeo.socket.connect());
  await expect(msg(C.page, '놓친 메시지 하나')).toBeVisible();
  await expect(msg(C.page, '놓친 메시지 하나').locator('.reaction:not(.add)')).toContainText("❤️");
  await expect(msg(C.page, '놓친 메시지 둘 (수정됨)')).toBeVisible();
  await expect(C.page.locator('.msg.pending')).toHaveCount(0);
  await expect(msg(A.page, '오프라인에서 쓴 메시지')).toBeVisible();
  await expect(msg(B.page, '오프라인에서 쓴 메시지')).toBeVisible();
  // 순서: 놓친 메시지들 뒤에 오프라인 메시지
  const texts = await C.page.locator('.main-pane .msg .md').allInnerTexts();
  const iMissed = texts.findIndex((t) => t.includes('놓친 메시지 하나'));
  const iOffline = texts.findIndex((t) => t.includes('오프라인에서 쓴 메시지'));
  expect(iMissed).toBeGreaterThanOrEqual(0);
  expect(iOffline).toBeGreaterThan(iMissed);
  await shot(C.page, 'mobile-light-after-resync');
});

test('음성 채널: 두 사람이 WebRTC로 연결된다', async () => {
  await A.page.locator('.channel-row', { hasText: '라운지' }).click();
  await A.page.getByRole('button', { name: '음성 채널 참여' }).click();
  await B.page.locator('.channel-row', { hasText: '라운지' }).click();
  await B.page.getByRole('button', { name: '음성 채널 참여' }).click();
  for (const p of [A.page, B.page]) {
    await expect(p.locator('.voice-tile')).toHaveCount(2);
    await expect(p.locator('.voice-tile-state')).toHaveCount(0, { timeout: 20_000 });
  }
  // 사이드바에서 음성방 참가자가 보인다 (C는 참가하지 않았지만 볼 수 있음)
  await C.page.getByLabel('목록으로').first().click();
  await expect(C.page.locator('.voice-member')).toHaveCount(2);
  // 음소거 상태가 상대에게 반영
  await B.page.locator('.voice-controls').getByLabel('마이크 끄기').click();
  await expect(A.page.locator('.voice-tile', { hasText: B.nickname }).locator('.voice-tile-label .danger')).toBeVisible();
  await shot(A.page, 'desktop-light-voice');
  await B.page.locator('.voice-controls').getByLabel('나가기').click();
  await A.page.locator('.voice-controls').getByLabel('나가기').click();
  await expect(C.page.locator('.voice-member')).toHaveCount(0);
});

test('1:1 영상통화: 걸기 → 받기 → 끊기', async () => {
  await A.page.getByLabel('홈').click();
  await A.page.locator('.chat-row', { hasText: B.nickname }).click();
  await A.page.getByLabel('영상 통화').click();
  await expect(B.page.locator('.incoming-call')).toContainText(A.nickname);
  await shot(B.page, 'desktop-dark-incoming-call');
  await B.page.getByLabel('받기').click();
  for (const p of [A.page, B.page]) {
    await expect(p.locator('.call-stage .voice-tile')).toHaveCount(2);
    await expect(p.locator('.call-stage-top')).toContainText('통화 중');
  }
  await shot(A.page, 'desktop-light-call');
  await A.page.locator('.call-stage').getByLabel('나가기').click();
  await expect(B.page.locator('.call-stage')).toHaveCount(0);
  await expect(A.page.locator('.msg-system', { hasText: '통화 종료' })).toBeVisible();
});

test('검색 · 고정 · 빠른 이동 · 설정 화면', async () => {
  // 메시지 검색
  await A.page.getByLabel('메시지 검색').click();
  await A.page.getByPlaceholder('키워드로 검색').fill('반가워');
  await expect(A.page.locator('.search-result')).toHaveCount(2);
  await A.page.locator('.search-result').last().click();
  await expect(msg(A.page, '안녕 보브!').first()).toHaveClass(/flash/);
  // 메시지 고정
  const m = msg(A.page, '나도 반가워 앨리스!');
  await m.hover();
  await m.getByLabel('더 보기').click();
  await A.page.getByRole('menuitem', { name: '메시지 고정' }).click();
  await A.page.getByLabel('고정 메시지').click();
  await expect(A.page.locator('.pin-card')).toContainText('나도 반가워 앨리스!');
  await expect(msg(B.page, '메시지를 고정했어요').or(B.page.locator('.msg-system', { hasText: '메시지를 고정했어요' }))).toBeVisible();
  // Ctrl+K 빠른 이동
  await A.page.keyboard.press('Control+k');
  await A.page.getByPlaceholder(/어디로 갈까요/).fill('E2E 그룹');
  await A.page.keyboard.press('Enter');
  await expect(A.page.locator('.chat-header')).toContainText('E2E 그룹');
  // 설정
  await A.page.getByLabel('설정').click();
  await expect(A.page.locator('.settings-modal')).toContainText('내 프로필');
  await shot(A.page, 'desktop-light-settings');
  await A.page.locator('.settings-nav').getByRole('button', { name: '테마' }).click();
  await A.page.locator('.theme-card', { hasText: '다크' }).click();
  await expect(A.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await A.page.keyboard.press('Escape');
  await shot(A.page, 'desktop-dark-group');
  // 모바일 다크
  await C.page.emulateMedia({ colorScheme: 'dark' });
  await C.page.getByLabel('홈').click();
  await C.page.locator('.chat-row', { hasText: 'E2E 그룹' }).click();
  await expect(C.page.locator('.main-pane .chat-header')).toContainText('E2E 그룹');
  await shot(C.page, 'mobile-dark-group');
});

test('파일 전송(진행률·미리보기) · 통화 거절', async () => {
  // 작은 PNG를 즉석에서 만들어 그룹방에 보낸다
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAfElEQVRoge2SAQkAURTCzLkk134XQx5fWIBNjB+nSd3ABVBf0V2Iu6Ru4AKor+guxF1SN3AB1Fd0F+IuqRu4AOorugtxl9QNXAD1Fd2FuEvqBi6A+oruQtwldQMXQH1FdyHukrqBC6C+orsQd0ndwAVQX9FdiLukbuDjAT8dzs08x3g5EQAAAABJRU5ErkJggg==',
    'base64',
  );
  await A.page.locator('.chat-header').waitFor();
  const [chooser] = await Promise.all([A.page.waitForEvent('filechooser'), A.page.getByLabel('파일 첨부').click()]);
  await chooser.setFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: png },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('메모 내용입니다') },
  ]);
  await expect(A.page.locator('.file-chip')).toHaveCount(2);
  await send(A.page, '사진과 메모 보내요');
  await B.page.locator('.chat-row', { hasText: 'E2E 그룹' }).click();
  const sent = msg(B.page, '사진과 메모 보내요');
  await expect(sent.locator('.attach-image img')).toBeVisible();
  await expect(sent.locator('.attach-file')).toContainText('notes.txt');
  // 라이트박스
  await msg(A.page, '사진과 메모 보내요').locator('.attach-image').click();
  await expect(A.page.locator('.lightbox img')).toBeVisible();
  await A.page.keyboard.press('Escape');
  await expect(A.page.locator('.lightbox')).toHaveCount(0);

  // B가 A에게 음성통화 → A가 거절
  await B.page.getByLabel('홈').click();
  await B.page.locator(`.chat-row:has(strong:text-is("${A.nickname}"))`).click();
  await B.page.getByLabel('음성 통화').click();
  await expect(A.page.locator('.incoming-call')).toBeVisible();
  await A.page.getByLabel('거절').click();
  await expect(B.page.locator('.toast', { hasText: '거절' })).toBeVisible();
  await expect(B.page.locator('.call-stage')).toHaveCount(0);
  await expect(B.page.locator('.msg-system', { hasText: '통화를 거절했어요' })).toBeVisible();
});

const TIER_TABLE = `### 티어리스트
| 티어 | 영웅 | 광역 DPS | 단일 DPS | 첫 6초 순간 화력 | 지난번 대비 | 이유 |
|---|---|---|---|---|---|---|
| **S** | 아셴 ★7 | **2411** | 870 | **29.4k** | = | 광역·순간 화력 1위. 패시브 창과 궁극기가 그대로 강함 |
| **S** | 카일루스 ★7 | 2400 | 893 | 20.1k | 순간 화력 13k → 20k | 새 궁극기 「천구의 심판」(시간 정지 + 장검 비)으로 순간 화력이 크게 오름 |
| **S** | 한별 ★7 | 2037 | **1018** | 15.2k | = | 단일 1위. 표식(받는 피해 2배·피해 공유)으로 보스전 최강 |
| **A** | 노엘 ★7 | 1773 | 718 | 16.7k | 1075 → 1773 ↑ | 배율 상향으로 ★7다워짐. 무적이 가장 많아 생존력 1위 |
| **B** | 아스트랄 ★7 | 1254 | 570 | 8.1k | = | 화력은 ★7 중 가장 낮음. 결계(받는 피해 -30%)와 궁극기(-50%)로 생존형 |
| **C** | 잭 ★6 | 619 | 332 | 4.5k | = | 룰렛·카드 운에 따라 크게 흔들림. 이번엔 운이 나빴음(이전 측정 단일 442)|

- [x] 측정 완료
- [ ] 궁극기 추가 예정
![스크린샷](https://example.com/tracker.png) [원본 표](https://example.com/tier)`;

test('마크다운 모드: 표·제목·목록 렌더링, 외부 이미지 차단, 끄면 쓴 그대로', async () => {
  await A.page.getByLabel('홈').click();
  await A.page.locator('.chat-row', { hasText: 'E2E 그룹' }).click();
  await B.page.getByLabel('홈').click();
  await B.page.locator('.chat-row', { hasText: 'E2E 그룹' }).click();
  // MD 켜기 + 미리보기
  await A.page.getByLabel('마크다운 모드').click();
  await composer(A.page).fill(TIER_TABLE);
  await A.page.getByLabel('마크다운 미리보기').click();
  await expect(A.page.locator('.md-preview table tbody tr')).toHaveCount(6);
  await composer(A.page).press('Enter');
  // 받는 쪽: 진짜 표로 보인다
  const sent = msg(B.page, '티어리스트');
  await expect(sent.locator('.md-h3')).toHaveText('티어리스트');
  await expect(sent.locator('table thead th')).toHaveCount(7);
  await expect(sent.locator('table tbody tr')).toHaveCount(6);
  await expect(sent.locator('table tbody tr').first().locator('td strong').first()).toHaveText('S');
  await expect(sent.locator('.md-task input')).toHaveCount(2);
  // 외부 이미지는 불러오지 않는다, [텍스트](링크)는 링크
  await expect(sent.locator('img')).toHaveCount(0);
  await expect(sent.locator('.md-image-blocked')).toContainText('스크린샷');
  await expect(sent.getByRole('link', { name: '원본 표' })).toHaveAttribute('href', 'https://example.com/tier');
  await shot(B.page, 'desktop-dark-markdown-table');
  // MD 끄면 쓴 그대로
  await A.page.getByLabel('마크다운 모드').click();
  await send(A.page, '그냥 **별표** 그대로 # 해시');
  await expect(msg(B.page, '그냥 **별표** 그대로 # 해시').locator('strong')).toHaveCount(0);
});

test('추방하면 차단 목록에 올라가 초대 링크로 다시 못 들어온다 → 해제하면 가능', async () => {
  await A.page.getByLabel(serverName).click();
  // 새 초대 링크
  await A.page.locator('.server-header').click();
  await A.page.getByRole('menuitem', { name: '친구 초대하기' }).click();
  await expect(A.page.getByLabel('초대 링크')).toHaveValue(/\/invite\//);
  const link = new URL(await A.page.getByLabel('초대 링크').inputValue()).pathname;
  await A.page.keyboard.press('Escape');
  // 서버 설정 → 멤버 → C 추방
  await A.page.locator('.server-header').click();
  await A.page.getByRole('menuitem', { name: '서버 설정' }).click();
  await A.page.locator('.settings-nav').getByRole('button', { name: '멤버' }).click();
  await A.page.locator('.member-admin', { hasText: C.nickname }).getByRole('button', { name: '추방' }).click();
  await expect(A.page.locator('.modal').last()).toContainText('차단 목록');
  await A.page.locator('.modal').last().getByRole('button', { name: '추방' }).click();
  await expect(A.page.locator('.member-admin', { hasText: C.nickname })).toHaveCount(0);
  // C: 같은 링크로 다시 시도 → 막힘
  await C.page.goto(link);
  await expect(C.page.locator('.invite-preview')).toContainText('추방되어 참가할 수 없어요');
  await expect(C.page.getByRole('button', { name: '참가하기', exact: true })).toHaveCount(0);
  await C.page.keyboard.press('Escape');
  // A: 차단 목록에서 해제
  await A.page.locator('.settings-nav').getByRole('button', { name: '차단 목록' }).click();
  const row = A.page.locator('.ban-item', { hasText: C.nickname });
  await expect(row).toBeVisible();
  await shot(A.page, 'desktop-light-ban-list');
  await row.getByRole('button', { name: '차단 해제' }).click();
  await A.page.locator('.modal').last().getByRole('button', { name: '해제' }).click();
  await expect(row).toHaveCount(0);
  await A.page.keyboard.press('Escape');
  // C: 이제 참가 가능
  await C.page.goto(link);
  await C.page.getByRole('button', { name: '참가하기', exact: true }).click();
  await expect(C.page.locator('.main-pane .chat-header')).toContainText('일반');
});

test('활동 제한: 제한된 멤버는 채팅을 못 하고, 해제하면 바로 다시 쓸 수 있다', async () => {
  // (이전 테스트에서 C가 다시 참가해 #일반을 보고 있음)
  while (await A.page.locator('.modal-backdrop').count()) await A.page.locator('.modal').last().getByRole('button', { name: '닫기' }).click();
  await A.page.getByLabel(serverName).click();
  await A.page.locator('.server-header').click();
  await A.page.getByRole('menuitem', { name: '서버 설정' }).click();
  await A.page.locator('.settings-nav').getByRole('button', { name: '멤버' }).click();
  await A.page.locator('.member-admin', { hasText: C.nickname }).getByRole('button', { name: '활동 제한' }).click();
  const modal = A.page.locator('.modal').last();
  await modal.getByRole('radio', { name: '1시간' }).click();
  await modal.getByPlaceholder('예: 같은 메시지 도배').fill('같은 말 도배');
  await shot(A.page, 'desktop-light-restrict');
  await modal.getByRole('button', { name: '제한하기' }).click();
  await expect(A.page.locator('.member-admin', { hasText: C.nickname }).getByRole('button', { name: '제한 중' })).toBeVisible();

  // C: 입력창이 잠기고 이유가 보인다
  const locked = C.page.locator('.main-pane .composer.disabled');
  await expect(locked).toContainText('활동이 제한되어');
  await expect(locked).toContainText('같은 말 도배');
  await expect(C.page.locator('.main-pane textarea')).toHaveCount(0);
  await shot(C.page, 'mobile-light-restricted');

  // A: 해제
  await A.page.locator('.member-admin', { hasText: C.nickname }).getByRole('button', { name: '제한 중' }).click();
  await A.page.locator('.modal').last().getByRole('button', { name: '제한 해제' }).click();
  await expect(A.page.locator('.member-admin', { hasText: C.nickname }).getByRole('button', { name: '활동 제한' })).toBeVisible();
  await A.page.locator('.modal').last().getByRole('button', { name: '닫기' }).click();

  // C: 다시 보낼 수 있다
  await expect(locked).toHaveCount(0);
  await send(C.page, '이제 조용히 할게요');
  await expect(A.page.locator('.main-pane .msg', { hasText: '이제 조용히 할게요' })).toBeVisible();
});

test('서버 주인 전용 채널: 주인만 쓰고 다른 멤버는 읽기만', async () => {
  const row = A.page.locator('.channel-row', { hasText: '일반' });
  await row.hover();
  await row.getByRole('button', { name: '채널 설정' }).click();
  await A.page.getByRole('checkbox', { name: '서버 주인만 메시지 보내기' }).check();
  await shot(A.page, 'desktop-light-owner-only-setting');
  await A.page.locator('.modal').last().getByRole('button', { name: '저장' }).click();
  await expect(row.locator('.channel-owner-only')).toBeVisible();

  // 다른 멤버(C): 입력창이 잠긴다
  const locked = C.page.locator('.main-pane .composer.disabled');
  await expect(locked).toContainText('서버 주인만 메시지를 보낼 수 있어요');
  await shot(C.page, 'mobile-light-owner-only');
  // 주인(A)은 그대로 보낼 수 있다
  await send(A.page, '📢 공지: 내일 모임은 8시예요');
  await expect(C.page.locator('.main-pane .msg', { hasText: '내일 모임은 8시' })).toBeVisible();

  // 끄면 다시 모두 쓸 수 있다
  await row.hover();
  await row.getByRole('button', { name: '채널 설정' }).click();
  await A.page.getByRole('checkbox', { name: '서버 주인만 메시지 보내기' }).uncheck();
  await A.page.locator('.modal').last().getByRole('button', { name: '저장' }).click();
  await expect(locked).toHaveCount(0);
});
