import { describe, expect, it } from 'vitest';
import { splitParagraph } from '../src/lib/highlight';

describe('splitParagraph', () => {
  it('无批注时整段一个片段', () => {
    const segs = splitParagraph('abcdef', []);
    expect(segs).toEqual([{ start: 0, end: 6, text: 'abcdef', ids: [] }]);
  });

  it('单个批注切出三段', () => {
    const segs = splitParagraph('abcdef', [{ id: 'a', start: 1, end: 4 }]);
    expect(segs.map((s) => [s.text, s.ids])).toEqual([
      ['a', []],
      ['bcd', ['a']],
      ['ef', []],
    ]);
  });

  it('重叠批注：交集片段携带两个 id，外层顺序稳定', () => {
    const segs = splitParagraph('abcdef', [
      { id: 'a', start: 1, end: 4 },
      { id: 'b', start: 3, end: 6 },
    ]);
    expect(segs.map((s) => [s.text, s.ids])).toEqual([
      ['a', []],
      ['bc', ['a']],
      ['d', ['a', 'b']], // 重叠区：a 先开始，在外层
      ['ef', ['b']],
    ]);
  });

  it('相同起点的重叠：区间更长者在外层', () => {
    const segs = splitParagraph('abcdef', [
      { id: 'short', start: 1, end: 3 },
      { id: 'long', start: 1, end: 5 },
    ]);
    const overlap = segs.find((s) => s.ids.length === 2)!;
    expect(overlap.ids).toEqual(['long', 'short']);
  });

  it('越界区间被裁剪', () => {
    const segs = splitParagraph('abc', [{ id: 'x', start: -5, end: 99 }]);
    expect(segs).toEqual([{ start: 0, end: 3, text: 'abc', ids: ['x'] }]);
  });
});
