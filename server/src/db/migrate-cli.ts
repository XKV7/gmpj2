import { config } from '../config.ts';
import { openDatabase, migrate } from './index.ts';

const db = openDatabase(config.dbFile);
const n = migrate(db);
console.log(n ? `✔ 마이그레이션 ${n}개를 적용했어요.` : '✔ 데이터베이스가 이미 최신이에요.');
db.close();
