// http-proxy 내부의 오래된 API 사용 경고(util._extend)가 콘솔을 어지럽히지 않도록
process.noDeprecation = true;

import { Server as IOServer } from 'socket.io';
import { buildApp } from './app.ts';
import { config } from './config.ts';
import { initDb } from './db/index.ts';
import { startHttpsGateway } from './gateway.ts';
import { lanAddresses } from './lan.ts';
import { logger } from './lib/logger.ts';
import { setIo, type IO } from './realtime/hub.ts';
import { attachSocketHandlers } from './realtime/socket.ts';
import { purgeExpiredSessions } from './services/auth.ts';
import { purgeOrphanUploads } from './services/uploads.ts';
import { turnConfigured } from './services/ice.ts';

async function main() {
  const db = initDb(config.dbFile);
  // 배포 환경에서 체험용 데이터를 원하면 MOYEO_DEMO=1 (DB가 비어 있을 때 한 번만)
  if (process.env.MOYEO_DEMO === '1' && (db.prepare('SELECT COUNT(*) FROM users').pluck().get() as number) === 0) {
    const { seedDemo } = await import('./seed.ts');
    await seedDemo();
    logger.info('빈 데이터베이스에 데모 데이터를 넣었어요 (비밀번호 moyeo1234).');
  }
  const app = await buildApp();
  const io: IO = new IOServer(app.server, {
    path: '/socket.io/',
    maxHttpBufferSize: 1e6,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    connectionStateRecovery: undefined,
  });
  setIo(io);
  attachSocketHandlers(io);

  await app.listen({ port: config.port, host: config.host });
  const httpsPort = config.httpsEnabled ? await startHttpsGateway() : null;

  setInterval(() => {
    purgeExpiredSessions();
    purgeOrphanUploads();
  }, 60 * 60 * 1000).unref();

  const webPort = config.isProd ? config.port : config.clientDevPort;
  const line = '─'.repeat(64);
  const out = ['', `  ${line}`, `   🫶  모여(Moyeo) 서버가 시작됐어요!  ${config.isProd ? '(운영 모드)' : '(개발 모드)'}`, `  ${line}`];
  if (config.publicUrl) {
    out.push(`   인터넷 주소 →  ${config.publicUrl}`, '   이 주소를 친구에게 보내 주세요. 어느 네트워크에서든 접속할 수 있어요.');
    out.push(turnConfigured() ? '   📞 TURN 서버 설정됨 — 다른 네트워크끼리도 통화가 잘 연결돼요.' : '   ⚠ TURN 서버 미설정 — 채팅은 되지만, 다른 네트워크끼리의 통화는 연결이 안 될 수 있어요 (README 참고).');
  } else {
    out.push(`   이 컴퓨터에서         →  http://localhost:${webPort}`);
    const ips = lanAddresses();
    if (ips.length) {
      out.push('', '   같은 와이파이의 친구는 아래 주소로 접속하세요:');
      for (const ip of ips) {
        if (httpsPort) out.push(`     📞 통화까지  →  https://${ip}:${httpsPort}   (인증서 경고 → '고급' → '계속')`);
        out.push(`     💬 채팅만    →  http://${ip}:${webPort}`);
      }
    } else {
      out.push('', '   (LAN 주소를 찾지 못했어요. 와이파이 연결을 확인해 주세요.)');
    }
  }
  out.push(`  ${line}`, '');
  console.log(out.join('\n'));

  const shutdown = async () => {
    logger.info('서버를 종료하는 중...');
    io.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('서버 시작 실패', err);
  process.exit(1);
});
