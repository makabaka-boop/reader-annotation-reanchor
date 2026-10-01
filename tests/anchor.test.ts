import { describe, expect, it } from 'vitest';
import {
  CONTEXT_LENGTH,
  adjudicate,
  findOccurrences,
  locate,
  makeAnchor,
  reanchorAnnotations,
  resolvePosition,
} from '../src/lib/anchor';
import { buildChapterText } from '../src/lib/text';
import type { Annotation, Book } from '../src/types';

const NOW = 1_700_000_000_000;

function mkBook(id: string, chapters: [string, string[]][]): Book {
  return {
    id,
    title: id,
    chapters: chapters.map(([cid, paragraphs]) => ({ id: cid, title: cid, paragraphs })),
  };
}

function mkAnnotation(book: Book, chapterId: string, exact: string, occurrence = 0): Annotation {
  const ch = book.chapters.find((c) => c.id === chapterId)!;
  const text = buildChapterText(ch.paragraphs).text;
  const positions = findOccurrences(text, exact);
  const start = positions[occurrence];
  if (start === undefined) throw new Error(`找不到 ${exact} 的第 ${occurrence} 次出现`);
  const anchor = makeAnchor(text, { bookId: book.id, chapterId, start, end: start + exact.length, now: NOW });
  return { ...anchor, status: 'anchored' };
}

describe('makeAnchor', () => {
  it('记录章节身份、规范化位置、选中文字与两侧上下文', () => {
    const book = mkBook('b1', [['ch1', ['甲。乙。丙。丁。']]]);
    const text = buildChapterText(book.chapters[0].paragraphs).text;
    const a = makeAnchor(text, { bookId: 'b1', chapterId: 'ch1', start: 2, end: 5, now: NOW });
    expect(a.chapterId).toBe('ch1');
    expect(a.exact).toBe('乙。丙');
    expect(a.prefix).toBe('甲。');
    expect(a.suffix).toBe('。丁。');
    expect(a.start).toBe(2);
    expect(a.end).toBe(5);
  });

  it('上下文最长 32 字符', () => {
    const long = '前'.repeat(100) + '目标' + '后'.repeat(100);
    const a = makeAnchor(long, { bookId: 'b', chapterId: 'c', start: 100, end: 102 });
    expect(a.prefix).toHaveLength(CONTEXT_LENGTH);
    expect(a.suffix).toHaveLength(CONTEXT_LENGTH);
    expect(a.prefix.endsWith('前')).toBe(true);
    expect(a.suffix.startsWith('后')).toBe(true);
  });

  it('拒绝空选区', () => {
    expect(() => makeAnchor('abc', { bookId: 'b', chapterId: 'c', start: 1, end: 1 })).toThrow();
  });
});

describe('findOccurrences', () => {
  it('找出全部出现位置（含重叠）', () => {
    expect(findOccurrences('aaaa', 'aa')).toEqual([0, 1, 2]);
    expect(findOccurrences('好。好。好。', '好。')).toEqual([0, 2, 4]);
  });
});

describe('重锚：段落拆分', () => {
  const v1 = mkBook('book', [['ch1', ['清晨的雾还没有散尽。山路蜿蜒。', '老王走在最前面。太阳升起来之后，雾气散去。']]]);
  const v2 = mkBook('book', [
    ['ch1', ['清晨的雾还没有散尽。山路蜿蜒。', '老王走在最前面。', '太阳升起来之后，雾气散去。']],
  ]);

  it('拆分点之后的批注自动迁移到正确位置', () => {
    const ann = mkAnnotation(v1, 'ch1', '太阳升起来之后');
    const { annotations, report } = reanchorAnnotations([ann], v2, NOW);
    expect(report.migrated).toEqual([ann.id]);
    expect(report.ambiguous).toEqual([]);
    expect(report.orphan).toEqual([]);

    const next = annotations[0];
    expect(next.status).toBe('anchored');
    // 段落拆分在目标前插入了 "\n\n"，偏移应后移 2
    expect(next.start).toBe(ann.start + 2);
    const newText = buildChapterText(v2.chapters[0].paragraphs).text;
    expect(newText.slice(next.start, next.end)).toBe('太阳升起来之后');
    // 上下文随新版本更新：目标段成为新段落，前缀以段落连接符结尾
    expect(next.prefix.endsWith('。\n\n')).toBe(true);
  });
});

describe('重锚：文字插入', () => {
  const v1 = mkBook('book', [['ch2', ['渡口只有一条小船。船夫看了看天色。']]]);
  const inserted = '渡船每天只开三趟。';
  const v2 = mkBook('book', [['ch2', [`${inserted}渡口只有一条小船。船夫看了看天色。`]]]);

  it('插入点之后的批注偏移随之后移', () => {
    const ann = mkAnnotation(v1, 'ch2', '船夫看了看天色');
    const { annotations, report } = reanchorAnnotations([ann], v2, NOW);
    expect(report.migrated).toEqual([ann.id]);
    const next = annotations[0];
    expect(next.start).toBe(ann.start + inserted.length);
    const newText = buildChapterText(v2.chapters[0].paragraphs).text;
    expect(newText.slice(next.start, next.end)).toBe(ann.exact);
    expect(next.prefix.endsWith('小船。')).toBe(true);
  });
});

describe('重锚：重复短句', () => {
  const para = '他说：好。她说：好。大家说：好。';
  const v1 = mkBook('book', [['ch1', [para]]]);
  const v2 = mkBook('book', [['ch1', [para]]]); // 内容不变

  it('多处匹配 → 待裁决，不自动迁移', () => {
    const ann = mkAnnotation(v1, 'ch1', '好。', 1); // 第二处
    const { annotations, report } = reanchorAnnotations([ann], v2, NOW);
    expect(report.migrated).toEqual([]);
    expect(report.ambiguous).toEqual([ann.id]);

    const next = annotations[0];
    expect(next.status).toBe('ambiguous');
    expect(next.candidates).toHaveLength(3);
    // 候选按上下文得分排序：原位置（第二处）上下文最吻合，应排第一
    const text = buildChapterText(v2.chapters[0].paragraphs).text;
    expect(text.slice(next.candidates![0].start, next.candidates![0].end)).toBe('好。');
    expect(next.candidates![0].start).toBe(ann.start);
    expect(next.candidates![0].score).toBeGreaterThan(next.candidates![1].score);
  });

  it('裁决后锚定到所选候选位置', () => {
    const ann = mkAnnotation(v1, 'ch1', '好。', 1);
    const { annotations } = reanchorAnnotations([ann], v2, NOW);
    const pending = annotations[0];
    const text = buildChapterText(v2.chapters[0].paragraphs).text;
    const resolved = adjudicate(pending, text, pending.candidates![0], NOW);
    expect(resolved.status).toBe('anchored');
    expect(resolved.start).toBe(ann.start);
    expect(resolved.candidates).toBeUndefined();
  });

  it('同一版本渲染期：存储偏移有效时不受重复短句影响', () => {
    const ann = mkAnnotation(v1, 'ch1', '好。', 1);
    const text = buildChapterText(v1.chapters[0].paragraphs).text;
    const pos = resolvePosition(text, ann);
    expect(pos).toEqual({ start: ann.start, end: ann.end });
  });
});

describe('重锚：找不到原文', () => {
  const v1 = mkBook('book', [['ch3', ['山顶的风很大。我们在巨石后避风。下山的路好走。']]]);
  const v2 = mkBook('book', [['ch3', ['山顶的风很大。下山的路好走。']]]);

  it('保留失联批注与原文证据，不猜测位置', () => {
    const ann = mkAnnotation(v1, 'ch3', '我们在巨石后避风');
    const { annotations, report } = reanchorAnnotations([ann], v2, NOW);
    expect(report.orphan).toEqual([ann.id]);

    const next = annotations[0];
    expect(next.status).toBe('orphan');
    // 证据完整保留
    expect(next.exact).toBe('我们在巨石后避风');
    expect(next.prefix).toBe(ann.prefix);
    expect(next.suffix).toBe(ann.suffix);
    // 不猜测新位置：偏移保持原值，仅作历史记录
    expect(next.start).toBe(ann.start);
    expect(next.candidates).toBeUndefined();
    expect(next.orphanSince).toBe(NOW);
  });

  it('章节整体消失同样失联', () => {
    const ann = mkAnnotation(v1, 'ch3', '山顶的风很大');
    const noCh3 = mkBook('book', [['ch1', ['别的章节。']]]);
    const { annotations } = reanchorAnnotations([ann], noCh3, NOW);
    expect(annotations[0].status).toBe('orphan');
    expect(annotations[0].exact).toBe('山顶的风很大');
  });
});

describe('locate / resolvePosition', () => {
  it('唯一匹配返回位置', () => {
    const r = locate('abc def abc', { exact: 'def', prefix: '', suffix: '' });
    expect(r).toEqual({ kind: 'unique', start: 4, end: 7 });
  });

  it('存储偏移失效且存在唯一匹配时自愈', () => {
    const text = '插入的前缀。原来的句子。';
    const a = { start: 0, end: 5, exact: '原来的句子。', prefix: '', suffix: '' };
    expect(resolvePosition(text, a)).toEqual({ start: 6, end: 12 });
  });

  it('存储偏移失效且多处匹配时不猜测', () => {
    const text = '好。好。';
    const a = { start: 10, end: 12, exact: '好。', prefix: '', suffix: '' };
    expect(resolvePosition(text, a)).toBeNull();
  });
});
