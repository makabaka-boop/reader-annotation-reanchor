import { describe, expect, it } from 'vitest';
import { buildChapterText } from '../src/lib/text';
import { makeAnchor } from '../src/lib/anchor';
import { offsetWithinParagraph, selectionToChapterRange } from '../src/lib/selection';

const P0 = '清晨的雾还没有散尽。山路蜿蜒。';
const P1 = '老王走在最前面。太阳升起来。';

/** 构造与阅读器一致的 DOM：段落文本被 mark 拆成多个文本节点 */
function buildChapterDom() {
  document.body.innerHTML = '';
  const chapter = document.createElement('div');
  chapter.dataset.chapterId = 'ch1';

  const p0 = document.createElement('p');
  p0.dataset.pIdx = '0';
  p0.append('清晨的雾');
  const mark = document.createElement('mark');
  mark.dataset.aid = 'existing';
  mark.textContent = '还没有';
  p0.append(mark);
  p0.append('散尽。山路蜿蜒。');

  const p1 = document.createElement('p');
  p1.dataset.pIdx = '1';
  p1.textContent = P1;

  chapter.append(p0, p1);
  document.body.append(chapter);
  return { chapter, p0, p1, mark };
}

function textNode(el: Node, index = 0): Text {
  const walker = document.createTreeWalker(el as Element, NodeFilter.SHOW_TEXT);
  let i = 0;
  let cur = walker.nextNode();
  while (cur) {
    if (i === index) return cur as Text;
    i++;
    cur = walker.nextNode();
  }
  throw new Error('text node not found');
}

describe('offsetWithinParagraph', () => {
  it('文本节点：累加 mark 之前的文本长度', () => {
    const { p0, mark } = buildChapterDom();
    expect(offsetWithinParagraph(p0, textNode(mark), 1)).toBe(4 + 1);
    expect(offsetWithinParagraph(p0, textNode(p0, 2), 2)).toBe(4 + 3 + 2);
  });

  it('元素节点：offset 为子节点下标', () => {
    const { p0 } = buildChapterDom();
    expect(offsetWithinParagraph(p0, p0, 0)).toBe(0);
    expect(offsetWithinParagraph(p0, p0, 1)).toBe(4); // 跳过 '清晨的雾'
    expect(offsetWithinParagraph(p0, p0, 2)).toBe(7); // 再跳过 mark '还没有'
  });
});

describe('selectionToChapterRange：跨文本节点选择', () => {
  it('从 mark 内文本节点跨段落到下一段', () => {
    const { chapter, p1, mark } = buildChapterDom();
    const ct = buildChapterText([P0, P1]);

    const sel = window.getSelection()!;
    sel.setBaseAndExtent(textNode(mark), 1, textNode(p1), 3);
    const range = selectionToChapterRange(chapter, ct, sel);
    expect(range).toEqual({ start: 5, end: ct.paraStarts[1] + 3 });

    // 锚点 exact 取自章节全文，跨段落处包含段落连接符
    const anchor = makeAnchor(ct.text, {
      bookId: 'b',
      chapterId: 'ch1',
      start: range!.start,
      end: range!.end,
    });
    expect(anchor.exact).toBe('没有散尽。山路蜿蜒。\n\n老王走');
    expect(anchor.prefix.endsWith('清晨的雾还')).toBe(true);
    expect(anchor.suffix.startsWith('在最前面')).toBe(true);
  });

  it('反向选区（从下往上选）同样规范化为升序区间', () => {
    const { chapter, p0, p1 } = buildChapterDom();
    const ct = buildChapterText([P0, P1]);
    const sel = window.getSelection()!;
    sel.setBaseAndExtent(textNode(p1), 2, textNode(p0), 1);
    const range = selectionToChapterRange(chapter, ct, sel);
    expect(range).toEqual({ start: 1, end: ct.paraStarts[1] + 2 });
  });

  it('空选区与章节外选区返回 null', () => {
    const { chapter, p0 } = buildChapterDom();
    const ct = buildChapterText([P0, P1]);
    const sel = window.getSelection()!;
    sel.setBaseAndExtent(textNode(p0), 1, textNode(p0), 1);
    expect(selectionToChapterRange(chapter, ct, sel)).toBeNull();

    const outside = document.createElement('div');
    outside.textContent = '章节外';
    document.body.append(outside);
    sel.setBaseAndExtent(textNode(outside), 0, textNode(outside), 2);
    expect(selectionToChapterRange(chapter, ct, sel)).toBeNull();
  });
});
