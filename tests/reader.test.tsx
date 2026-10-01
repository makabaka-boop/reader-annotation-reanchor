import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';
import { reanchorAnnotations } from '../src/lib/anchor';
import { exportAnnotations } from '../src/lib/book';
import { buildChapterText } from '../src/lib/text';
import { makeAnchor } from '../src/lib/anchor';
import type { Annotation, Book } from '../src/types';

const NOW = 1_700_000_000_000;

const book: Book = {
  id: 'test-book',
  title: '测试书',
  chapters: [
    {
      id: 'ch1',
      title: '第一章',
      paragraphs: ['清晨的雾还没有散尽。山路蜿蜒。', '老王走在最前面。太阳升起来。'],
    },
    { id: 'ch2', title: '第二章', paragraphs: ['渡口只有一条小船。'] },
  ],
};

function paraPoint(pEl: Element, offset: number): { node: Text; offset: number } {
  const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let cur = walker.nextNode() as Text | null;
  while (cur) {
    if (acc + cur.data.length >= offset) return { node: cur, offset: offset - acc };
    acc += cur.data.length;
    cur = walker.nextNode() as Text | null;
  }
  throw new Error(`段落内偏移越界: ${offset}`);
}

/** 在渲染出的阅读器中制造跨段落选区并触发 mouseup */
function selectAndAnnotate(
  container: HTMLElement,
  chapterId: string,
  p1: number,
  o1: number,
  p2: number,
  o2: number,
) {
  const chapterEl = container.querySelector(`div[data-chapter-id="${chapterId}"]`)!;
  const a = paraPoint(chapterEl.querySelector(`p[data-p-idx="${p1}"]`)!, o1);
  const b = paraPoint(chapterEl.querySelector(`p[data-p-idx="${p2}"]`)!, o2);
  window.getSelection()!.setBaseAndExtent(a.node, a.offset, b.node, b.offset);
  fireEvent.mouseUp(chapterEl);
}

function storedAnnotations(bookId: string): Annotation[] {
  return JSON.parse(localStorage.getItem(`local-reader:annotations:v1:${bookId}`) ?? '[]');
}

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('批注创建与高亮', () => {
  it('跨段落（跨文本节点）选区创建批注，两个段落都出现高亮', () => {
    const { container } = render(<App initial={{ book }} />);
    selectAndAnnotate(container, 'ch1', 0, 4, 1, 3);

    const marks = [...container.querySelectorAll('mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['还没有散尽。山路蜿蜒。', '老王走']);

    // 面板出现批注卡片，引文含跨段落连接符
    const card = screen.getByTestId(/annotation-card-/);
    expect(card.textContent).toContain('还没有散尽。山路蜿蜒。');
    expect(storedAnnotations(book.id)).toHaveLength(1);
    expect(storedAnnotations(book.id)[0].exact).toBe('还没有散尽。山路蜿蜒。\n\n老王走');
  });

  it('高亮被再次选择时映射仍正确（在已有 mark 上继续选）', () => {
    const { container } = render(<App initial={{ book }} />);
    selectAndAnnotate(container, 'ch1', 0, 0, 0, 4); // '清晨的雾'
    selectAndAnnotate(container, 'ch1', 0, 4, 0, 7); // 紧接其后 '还没有'
    const anns = storedAnnotations(book.id);
    expect(anns).toHaveLength(2);
    expect(anns.map((a) => a.exact).sort()).toEqual(['清晨的雾', '还没有']);
  });
});

describe('重排后的定位', () => {
  it('改变字号与容器宽度后，高亮仍指向原文字，锚点偏移不变', () => {
    const { container } = render(<App initial={{ book, fontSize: 18 }} />);
    selectAndAnnotate(container, 'ch1', 0, 4, 0, 11); // '还没有散尽。山'

    const before = storedAnnotations(book.id)[0];
    const markTextBefore = [...container.querySelectorAll('mark')].map((m) => m.textContent).join('');
    expect(markTextBefore).toBe('还没有散尽。山');

    // 改变字号两次
    fireEvent.click(screen.getByTestId('font-inc'));
    fireEvent.click(screen.getByTestId('font-inc'));
    const reader = screen.getByTestId('reader');
    expect(reader.style.fontSize).toBe('22px');
    // 改变容器宽度（模拟窗口变窄）
    reader.style.maxWidth = '20em';

    // 高亮仍然包裹同一段文字
    const markTextAfter = [...container.querySelectorAll('mark')].map((m) => m.textContent).join('');
    expect(markTextAfter).toBe('还没有散尽。山');

    // 锚点偏移与排版无关，保持原值
    const after = storedAnnotations(book.id)[0];
    expect(after.start).toBe(before.start);
    expect(after.end).toBe(before.end);
    expect(after.exact).toBe('还没有散尽。山');
  });
});

describe('重叠批注', () => {
  it('可分别选择与删除', () => {
    const { container } = render(<App initial={{ book }} />);
    selectAndAnnotate(container, 'ch1', 0, 0, 0, 8); // A: '清晨的雾还没有散'
    selectAndAnnotate(container, 'ch1', 0, 4, 0, 12); // B: '还没有散尽。山路'

    const [a, b] = storedAnnotations(book.id);
    expect(a.exact).toBe('清晨的雾还没有散');
    expect(b.exact).toBe('还没有散尽。山路');

    // 重叠区渲染为嵌套 mark，点击最内层弹出选择器
    const nested = container.querySelector(`mark[data-aid="${a.id}"] mark[data-aid="${b.id}"]`)!;
    expect(nested.textContent).toBe('还没有散');
    fireEvent.click(nested);

    const picker = screen.getByTestId('picker');
    expect(picker.textContent).toContain('2 条批注');
    expect(screen.getByTestId(`picker-item-${a.id}`)).toBeTruthy();
    expect(screen.getByTestId(`picker-item-${b.id}`)).toBeTruthy();

    // 从选择器中删除 A，B 不受影响
    fireEvent.click(screen.getByTestId(`picker-delete-${a.id}`));
    expect(storedAnnotations(book.id).map((x) => x.id)).toEqual([b.id]);
    expect(container.querySelector(`mark[data-aid="${a.id}"]`)).toBeNull();
    expect([...container.querySelectorAll(`mark[data-aid="${b.id}"]`)].map((m) => m.textContent).join('')).toBe(
      '还没有散尽。山路',
    );
  });
});

describe('持久化与导出同源', () => {
  it('刷新后从 localStorage 恢复批注与高亮', () => {
    const first = render(<App initial={{ book }} />);
    selectAndAnnotate(first.container, 'ch1', 0, 0, 0, 4);
    expect(storedAnnotations(book.id)).toHaveLength(1);
    cleanup();

    // 模拟重新打开：无注入状态，从 localStorage 恢复
    const second = render(<App />);
    const marks = [...second.container.querySelectorAll('mark')];
    expect(marks.map((m) => m.textContent).join('')).toBe('清晨的雾');
    expect(screen.getByTestId(/annotation-card-/).textContent).toContain('清晨的雾');
  });

  it('导出内容与持久化的锚点状态一致', () => {
    const { container } = render(<App initial={{ book }} />);
    selectAndAnnotate(container, 'ch1', 0, 0, 0, 4);
    const stored = storedAnnotations(book.id);
    const exported = JSON.parse(exportAnnotations(book, stored));
    expect(exported.bookId).toBe(book.id);
    expect(exported.annotations).toHaveLength(1);
    expect(exported.annotations[0]).toMatchObject({
      chapterId: 'ch1',
      start: stored[0].start,
      end: stored[0].end,
      exact: '清晨的雾',
      status: 'anchored',
    });
  });
});

describe('重锚对话框', () => {
  const v1: Book = {
    id: 'dialog-book',
    title: '第一版',
    chapters: [{ id: 'ch1', title: '一', paragraphs: ['他说：好。她说：好。目标句子在这里。'] }],
  };
  const v2: Book = {
    id: 'dialog-book',
    title: '第二版',
    chapters: [{ id: 'ch1', title: '一', paragraphs: ['他说：好。她说：好。'] }],
  };

  function annotationOn(bookX: Book, exact: string, occurrence = 0): Annotation {
    const text = buildChapterText(bookX.chapters[0].paragraphs).text;
    let start = -1;
    for (let i = 0; i <= occurrence; i++) start = text.indexOf(exact, start + 1);
    const anchor = makeAnchor(text, {
      bookId: bookX.id,
      chapterId: 'ch1',
      start,
      end: start + exact.length,
      now: NOW,
    });
    return { ...anchor, status: 'anchored' };
  }

  it('待裁决批注：选择候选位置后锚定并高亮', () => {
    const ann = annotationOn(v1, '好。', 1);
    const { annotations, report } = reanchorAnnotations([ann], v1, NOW); // 同文本但多处匹配
    expect(annotations[0].status).toBe('ambiguous');

    const { container } = render(<App initial={{ book: v1, annotations, reanchorReport: report }} />);
    expect(screen.getByTestId('reanchor-dialog')).toBeTruthy();
    // 裁决前正文不高亮（对话框候选片段中的 mark 不在阅读器内）
    expect(screen.getByTestId('reader').querySelectorAll('mark')).toHaveLength(0);

    fireEvent.click(screen.getByTestId(`adjudicate-${ann.id}-0`));
    const resolved = storedAnnotations(v1.id)[0];
    expect(resolved.status).toBe('anchored');
    expect(resolved.start).toBe(ann.start);
    // 裁决后出现高亮，且是第二处「好。」
    const marks = [...container.querySelectorAll('mark')];
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('好。');
  });

  it('失联批注：展示原文证据，可删除', () => {
    const ann = annotationOn(v1, '目标句子在这里');
    const { annotations, report } = reanchorAnnotations([ann], v2, NOW);
    expect(annotations[0].status).toBe('orphan');

    render(<App initial={{ book: v2, annotations, reanchorReport: report }} />);
    const item = screen.getByTestId(`orphan-${ann.id}`);
    expect(item.textContent).toContain('目标句子在这里');
    expect(item.textContent).toContain('前文');

    fireEvent.click(item.querySelector('button.danger')!);
    expect(storedAnnotations(v2.id)).toHaveLength(0);
  });
});
