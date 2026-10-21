import { describe, expect, it } from 'vitest';
import { parseMarkdown, toPlainText, type MdBlock, type MdNode } from '../../client/src/lib/markdown.ts';

const text = (nodes: MdNode[]): string =>
  nodes.map((n) => (n.t === 'text' ? n.v : n.t === 'code' ? n.v : 'c' in n && n.c ? text(n.c) : n.t === 'link' ? n.href : '')).join('');

const TIER = `### 티어리스트
| 티어 | 영웅 | 광역 DPS | 단일 DPS | 첫 6초 순간 화력 | 지난번 대비 | 이유 |
|---|---|---|---|---|---|---|
| **S** | 아셴 ★7 | **2411** | 870 | **29.4k** | = | 광역·순간 화력 1위. 패시브 창과 궁극기가 그대로 강함 |
| **A** | 노엘 ★7 | 1773 | 718 | 16.7k | 1075 → 1773 ↑ | 배율 상향으로 ★7다워짐. 무적이 가장 많아 생존력 1위 |
| **C** | 잭 ★6 | 619 | 332 | 4.5k | = | 룰렛·카드 운에 따라 크게 흔들림. 이번엔 운이 나빴음(이전 측정 단일 442)|





`;

describe('마크다운 파서', () => {
  it('제목 + 표 (사용자 예시 티어리스트)', () => {
    const blocks = parseMarkdown(TIER, true);
    expect(blocks.map((b) => b.t)).toEqual(['heading', 'table']);
    const h = blocks[0] as Extract<MdBlock, { t: 'heading' }>;
    expect(h.level).toBe(3);
    expect(text(h.c)).toBe('티어리스트');
    const t = blocks[1] as Extract<MdBlock, { t: 'table' }>;
    expect(t.head.map(text)).toEqual(['티어', '영웅', '광역 DPS', '단일 DPS', '첫 6초 순간 화력', '지난번 대비', '이유']);
    expect(t.rows).toHaveLength(3);
    expect(t.rows[0]![0]![0]).toMatchObject({ t: 'bold' });
    expect(text(t.rows[0]![2]!)).toBe('2411');
    // 끝에 | 앞 공백이 없어도 칸이 맞게 나뉜다
    expect(text(t.rows[2]![6]!)).toBe('룰렛·카드 운에 따라 크게 흔들림. 이번엔 운이 나빴음(이전 측정 단일 442)');
  });

  it('목록 · 중첩 · 체크리스트 · 구분선', () => {
    const blocks = parseMarkdown('- 하나\n- 둘\n  - 둘의 하위\n1. 첫째\n2. 둘째\n\n- [x] 완료\n- [ ] 할 일\n\n---\n끝', true);
    expect(blocks.map((b) => b.t)).toEqual(['list', 'list', 'list', 'hr', 'para']);
    const ul = blocks[0] as Extract<MdBlock, { t: 'list' }>;
    expect(ul.ordered).toBe(false);
    expect(ul.items).toHaveLength(2);
    expect(ul.items[1]!.children[0]).toMatchObject({ t: 'list' });
    expect((blocks[1] as Extract<MdBlock, { t: 'list' }>).ordered).toBe(true);
    const tasks = blocks[2] as Extract<MdBlock, { t: 'list' }>;
    expect(tasks.items.map((x) => x.checked)).toEqual([true, false]);
  });

  it('[텍스트](링크)는 http(s)만, 외부 이미지는 막는다', () => {
    const [p] = parseMarkdown('[모여](https://example.com) [위험](javascript:alert(1)) ![고양이](https://evil.example/c.png)', true) as Extract<MdBlock, { t: 'para' }>[];
    const kinds = p!.c.map((n) => n.t);
    expect(kinds).toContain('link');
    expect(kinds).toContain('image');
    expect(p!.c.find((n) => n.t === 'link')).toMatchObject({ href: 'https://example.com' });
    expect(JSON.stringify(p)).not.toContain('javascript:');
    expect(JSON.stringify(p)).not.toContain('evil.example');
  });

  it('일반 메시지는 쓴 그대로 (서식 없이 멘션·링크만)', () => {
    const [p] = parseMarkdown('**굵게 아님** # 제목 아님 <@3> https://a.com', false) as Extract<MdBlock, { t: 'para' }>[];
    expect(p!.c.map((n) => n.t)).toEqual(['text', 'mention', 'text', 'link']);
    expect((p!.c[0] as { v: string }).v).toContain('**굵게 아님**');
  });

  it('코드 블록 안의 # 나 | 는 서식으로 보지 않는다', () => {
    const blocks = parseMarkdown('```ts\n# 주석 아님\n| a | b |\n```\n본문', true);
    expect(blocks[0]).toMatchObject({ t: 'codeblock', lang: 'ts', code: '# 주석 아님\n| a | b |' });
    expect(blocks[1]).toMatchObject({ t: 'para' });
  });

  it('미리보기 평문에서 표·제목 기호를 걷어낸다', () => {
    const plain = toPlainText(TIER, () => '?');
    expect(plain.startsWith('티어리스트 티어 영웅')).toBe(true);
    expect(plain).not.toContain('|');
    expect(plain).not.toContain('---');
  });
});
