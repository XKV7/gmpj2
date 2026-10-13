import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
import httpProxy from 'http-proxy';
import selfsigned from 'selfsigned';
import { config } from './config.ts';
import { lanAddresses } from './lan.ts';
import { logger } from './lib/logger.ts';

/** 자체 서명 인증서 — 한 번 만들어 data/certs 에 보관한다 */
async function loadCert(): Promise<{ key: string; cert: string }> {
  const keyFile = path.join(config.certDir, 'key.pem');
  const certFile = path.join(config.certDir, 'cert.pem');
  const metaFile = path.join(config.certDir, 'hosts.json');
  const hosts = ['localhost', '127.0.0.1', ...lanAddresses()];
  if (fs.existsSync(keyFile) && fs.existsSync(certFile) && fs.existsSync(metaFile)) {
    const prev = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as { hosts: string[]; expires: number };
    if (hosts.every((h) => prev.hosts.includes(h)) && prev.expires > Date.now() + 7 * 864e5) {
      return { key: fs.readFileSync(keyFile, 'utf8'), cert: fs.readFileSync(certFile, 'utf8') };
    }
  }
  const notAfter = new Date(Date.now() + 365 * 864e5);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Moyeo Local' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: hosts.map((h) => (/^\d+\.\d+\.\d+\.\d+$/.test(h) ? { type: 7, ip: h } : { type: 2, value: h })),
      },
    ],
  });
  fs.mkdirSync(config.certDir, { recursive: true });
  fs.writeFileSync(keyFile, pems.private);
  fs.writeFileSync(certFile, pems.cert);
  fs.writeFileSync(metaFile, JSON.stringify({ hosts, expires: notAfter.getTime() }));
  return { key: pems.private, cert: pems.cert };
}

const isBackendPath = (url = '') => url.startsWith('/api/') || url.startsWith('/socket.io/') || url.startsWith('/uploads/');

/**
 * HTTPS 게이트웨이. 브라우저는 HTTPS(또는 localhost)에서만 마이크/카메라를 허용하므로,
 * 같은 와이파이의 다른 기기에서 통화하려면 이 주소로 접속한다.
 * /api, /socket.io, /uploads 는 API 서버로, 나머지는 클라이언트(개발: Vite, 운영: API 서버)로 보낸다.
 */
export async function startHttpsGateway(): Promise<number | null> {
  try {
    const { key, cert } = await loadCert();
    const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
    proxy.on('error', (err, _req, res) => {
      logger.warn('HTTPS 게이트웨이 전달 실패:', (err as Error).message);
      if (res && 'writeHead' in res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('모여 서버가 아직 준비 중이에요. 잠시 후 새로고침해 주세요.');
      } else if (res && 'destroy' in res) {
        res.destroy();
      }
    });
    const api = `http://127.0.0.1:${config.port}`;
    const web = config.isProd ? api : `http://127.0.0.1:${config.clientDevPort}`;
    const target = (req: IncomingMessage) => (isBackendPath(req.url) ? api : web);
    const server = https.createServer({ key, cert }, (req, res) => proxy.web(req, res, { target: target(req) }));
    server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head, { target: target(req) }));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.httpsPort, config.host, () => resolve());
    });
    return config.httpsPort;
  } catch (err) {
    logger.warn(`HTTPS 게이트웨이를 열지 못했어요 (포트 ${config.httpsPort}):`, (err as Error).message);
    return null;
  }
}
