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

async function main() {
  initDb(config.dbFile);
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
  const ips = lanAddresses();
  const line = '─'.repeat(64);
  const out = [
    '',
    `  ${line}`,
    `   🫶  모여(Moyeo) 서버가 시작됐어요!  ${config.isProd ? '(운영 모드)' : '(개발 모드)'}`,
    `  ${line}`,
    `   이 컴퓨터에서         →  http://localhost:${webPort}`,
  ];
  if (ips.length) {
    out.push('', '   같은 와이파이의 친구는 아래 주소로 접속하세요:');
    for (const ip of ips) {
      if (httpsPort) out.push(`     📞 통화까지  →  https://${ip}:${httpsPort}   (인증서 경고 → '고급' → '계속')`);
      out.push(`     💬 채팅만    →  http://${ip}:${webPort}`);
    }
  } else {
    out.push('', '   (LAN 주소를 찾지 못했어요. 와이파이 연결을 확인해 주세요.)');
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
