/* 간단한 콘솔 로거 — 테스트 중에는 조용히 */
const quiet = process.env.VITEST === 'true';
const ts = () => new Date().toISOString().slice(11, 19);

export const logger = {
  info: (...args: unknown[]) => { if (!quiet) console.log(`[${ts()}] ℹ`, ...args); },
  warn: (...args: unknown[]) => { if (!quiet) console.warn(`[${ts()}] ⚠`, ...args); },
  error: (...args: unknown[]) => { console.error(`[${ts()}] ✖`, ...args); },
};
