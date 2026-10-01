import { describe, expect, it } from 'vitest';
import { appReducer, initialState, type AppState } from '../src/app/store';
import { makeAnchor } from '../src/lib/anchor';
import { buildChapterText } from '../src/lib/text';
import type { Annotation, Book } from '../src/types';

const NOW = 1_700_000_000_000;

const bookV1: Book = {
  id: 'book',
  title: 'v1',
  chapters: [
    { id: 'ch1', title: '一', paragraphs: ['他说：好。她说：好。', '第二段文字。'] },
    { id: 'ch2', title: '二', paragraphs: ['渡口只有一条小船。船夫看了看天色。'] },
  ],
};

const bookV2: Book = {
  id: 'book',
  title: 'v2',
  chapters: [
    { id: 'ch1', title: '一', paragraphs: ['他说：好。她说：好。', '第二段文字。'] },
    { id: 'ch2', title: '二', paragraphs: ['渡船每天只开三趟。渡口只有一条小船。船夫看了看天色。'] },
  ],
};

function mkAnn(book: Book, chapterId: string, exact: string, occurrence = 0, note = ''): Annotation {
  const ch = book.chapters.find((c) => c.id === chapterId)!;
  const text = buildChapterText(ch.paragraphs).text;
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = text.indexOf(exact, start + 1);
  const anchor = makeAnchor(text, {
    bookId: book.id,
    chapterId,
    start,
    end: start + exact.length,
    note,
    now: NOW,
  });
  return { ...anchor, status: 'anchored' };
}

function stateWith(annotations: Annotation[], book: Book = bookV1): AppState {
  return { ...initialState, book, annotations };
}

describe('appReducer：批注增删改', () => {
  it('新增后选中，删除后清除选中', () => {
    const a = mkAnn(bookV1, 'ch2', '船夫看了看天色');
    let s = appReducer(stateWith([]), { type: 'ADD_ANNOTATION', annotation: a });
    expect(s.annotations).toHaveLength(1);
    expect(s.selectedId).toBe(a.id);
    s = appReducer(s, { type: 'DELETE_ANNOTATION', id: a.id });
    expect(s.annotations).toHaveLength(0);
    expect(s.selectedId).toBeNull();
  });

  it('重叠批注相互独立：删除一条不影响另一条', () => {
    const a = mkAnn(bookV1, 'ch2', '渡口只有一条小船。船夫'); // [0, 12)
    const b = mkAnn(bookV1, 'ch2', '一条小船。船夫看了看'); // 与 a 重叠
    let s = stateWith([a, b]);
    s = appReducer(s, { type: 'DELETE_ANNOTATION', id: a.id });
    expect(s.annotations.map((x) => x.id)).toEqual([b.id]);
    expect(s.annotations[0].exact).toBe('一条小船。船夫看了看');
    expect(s.annotations[0].start).toBe(b.start);
  });

  it('更新笔记', () => {
    const a = mkAnn(bookV1, 'ch2', '小船');
    let s = stateWith([a]);
    s = appReducer(s, { type: 'UPDATE_NOTE', id: a.id, note: '重要' });
    expect(s.annotations[0].note).toBe('重要');
  });
});

describe('appReducer：导入与重锚', () => {
  it('不同的书：直接切换，不重锚', () => {
    const other: Book = { id: 'other', title: '别的书', chapters: [{ id: 'x', title: 'x', paragraphs: ['…'] }] };
    const a = mkAnn(bookV1, 'ch2', '小船');
    const s = appReducer(stateWith([a]), { type: 'IMPORT_BOOK', book: other, annotations: [] });
    expect(s.book?.id).toBe('other');
    expect(s.annotations).toEqual([]);
    expect(s.reanchorReport).toBeNull();
  });

  it('同一本书的新版本：唯一匹配自动迁移，重复短句待裁决', () => {
    const moved = mkAnn(bookV1, 'ch2', '船夫看了看天色'); // v2 中唯一 → 迁移
    const repeated = mkAnn(bookV1, 'ch1', '好。', 1); // v2 中仍有两处 → 待裁决
    const s = appReducer(stateWith([moved, repeated]), { type: 'IMPORT_BOOK', book: bookV2, now: NOW });

    expect(s.reanchorReport?.migrated).toEqual([moved.id]);
    expect(s.reanchorReport?.ambiguous).toEqual([repeated.id]);

    const migratedAnn = s.annotations.find((a) => a.id === moved.id)!;
    expect(migratedAnn.status).toBe('anchored');
    expect(migratedAnn.start).toBe(moved.start + '渡船每天只开三趟。'.length);

    const pending = s.annotations.find((a) => a.id === repeated.id)!;
    expect(pending.status).toBe('ambiguous');
    expect(pending.candidates).toHaveLength(2);
  });

  it('裁决：采用候选位置后锚定', () => {
    const repeated = mkAnn(bookV1, 'ch1', '好。', 1);
    let s = appReducer(stateWith([repeated]), { type: 'IMPORT_BOOK', book: bookV2, now: NOW });
    s = appReducer(s, { type: 'ADJUDICATE', id: repeated.id, candidateIndex: 0 });
    const resolved = s.annotations[0];
    expect(resolved.status).toBe('anchored');
    // 得分最高的候选即原位置
    expect(resolved.start).toBe(repeated.start);
    expect(resolved.candidates).toBeUndefined();
    expect(s.selectedId).toBe(repeated.id);
  });

  it('放弃裁决：标记为失联并保留证据', () => {
    const repeated = mkAnn(bookV1, 'ch1', '好。', 1);
    let s = appReducer(stateWith([repeated]), { type: 'IMPORT_BOOK', book: bookV2, now: NOW });
    s = appReducer(s, { type: 'MARK_ORPHAN', id: repeated.id, now: NOW });
    const orphan = s.annotations[0];
    expect(orphan.status).toBe('orphan');
    expect(orphan.exact).toBe('好。');
    expect(orphan.candidates).toBeUndefined();
    expect(orphan.orphanSince).toBe(NOW);
  });
});
