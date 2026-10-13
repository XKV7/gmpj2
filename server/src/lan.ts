import os from 'node:os';

/** 같은 네트워크에서 접속 가능한 IPv4 주소 목록 */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (/^(docker|br-|veth|vmnet|utun|lo)/i.test(name)) continue;
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return out;
}
