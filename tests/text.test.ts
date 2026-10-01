import { describe, expect, it } from 'vitest';
import { buildChapterText, normalizeText, paragraphIndexAt, PARAGRAPH_JOIN } from '../src/lib/text';

describe('normalizeText', () => {
  it('折叠空白并去首尾', () => {
    expect(normalizeText('  你好   世界\n\t。 ')).toBe('你好 世界 。');
  });

  it('Unicode NFC 归一', () => {
    // é 的组合形式（e + 组合音符）归一为预组合形式
    expect(normalizeText('cafe\u0301')).toBe('caf\u00e9');
    expect(normalizeText('e\u0301')).toHaveLength(1);
  });
});

describe('buildChapterText', () => {
  it('段落以连接符合并，起始偏移正确', () => {
    const ct = buildChapterText(['第一段。', '第二段文字。', '三。']);
    expect(ct.text).toBe(['第一段。', '第二段文字。', '三。'].join(PARAGRAPH_JOIN));
    expect(ct.paraStarts).toEqual([0, 4 + PARAGRAPH_JOIN.length, 4 + PARAGRAPH_JOIN.length + 6 + PARAGRAPH_JOIN.length]);
    expect(ct.text.slice(ct.paraStarts[1], ct.paraStarts[1] + 6)).toBe('第二段文字。');
  });

  it('段落拆分后全文随之变化，偏移可重新计算', () => {
    const before = buildChapterText(['甲。乙。丙。']);
    const after = buildChapterText(['甲。', '乙。丙。']);
    expect(before.text).toBe('甲。乙。丙。');
    expect(after.text).toBe('甲。\n\n乙。丙。');
    expect(after.paraStarts[1]).toBe(2 + PARAGRAPH_JOIN.length);
  });

  it('paragraphIndexAt 定位段落与间隙', () => {
    const ct = buildChapterText(['ab', 'cde']);
    expect(paragraphIndexAt(ct, 0)).toBe(0);
    expect(paragraphIndexAt(ct, 1)).toBe(0);
    expect(paragraphIndexAt(ct, 2)).toBe(1); // 落在连接符上 → 下一段
    expect(paragraphIndexAt(ct, 4)).toBe(1);
  });
});
