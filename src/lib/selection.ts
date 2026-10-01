/**
 * DOM 选区 → 章节规范化全文偏移。
 *
 * 段落内文本会被高亮 <mark> 拆成多个文本节点，因此“节点内偏移”
 * 必须换算为“段落文本偏移”：用 TreeWalker 累加目标节点之前所有
 * 文本节点的长度。跨段落（跨文本节点）选区由两端点独立换算后合并。
 */
import type { ChapterText } from './text';

function closestParagraph(el: Node | null): HTMLElement | null {
  const node = el && (el.nodeType === Node.ELEMENT_NODE ? (el as Element) : el.parentElement);
  return node?.closest?.('[data-p-idx]') ?? null;
}

function textLength(node: Node): number {
  return node.textContent?.length ?? 0;
}

/** 目标点（node, offset）在段落元素 pEl 的纯文本中的偏移 */
export function offsetWithinParagraph(pEl: HTMLElement, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const walker = pEl.ownerDocument.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let cur = walker.nextNode();
    while (cur) {
      if (cur === node) return acc + offset;
      acc += textLength(cur);
      cur = walker.nextNode();
    }
    return acc;
  }
  // 元素节点：offset 是 childNodes 下标，累加其前所有子节点的文本长度
  let acc = 0;
  const children = node.childNodes;
  for (let i = 0; i < offset && i < children.length; i++) {
    acc += textLength(children[i]);
  }
  return acc;
}

export interface ChapterPoint {
  paraIdx: number;
  /** 章节全文偏移 */
  offset: number;
}

export function domPointToChapterPoint(node: Node, offset: number): ChapterPoint | null {
  const pEl = closestParagraph(node);
  if (!pEl) return null;
  const paraIdx = Number(pEl.dataset.pIdx);
  if (!Number.isInteger(paraIdx)) return null;
  return { paraIdx, offset: offsetWithinParagraph(pEl, node, offset) };
}

export interface ChapterRange {
  start: number;
  end: number;
}

/**
 * 把当前 window 选区映射为章节全文偏移区间。
 * 选区必须非空且两端都落在同一章节容器内，否则返回 null。
 */
export function selectionToChapterRange(
  chapterEl: HTMLElement,
  ct: ChapterText,
  selection: Selection | null = window.getSelection(),
): ChapterRange | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  if (!anchorNode || !focusNode) return null;
  if (!chapterEl.contains(anchorNode) || !chapterEl.contains(focusNode)) return null;

  const a = domPointToChapterPoint(anchorNode, anchorOffset);
  const b = domPointToChapterPoint(focusNode, focusOffset);
  if (!a || !b) return null;

  const start = ct.paraStarts[a.paraIdx] + a.offset;
  const end = ct.paraStarts[b.paraIdx] + b.offset;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (hi === lo) return null;
  return { start: lo, end: Math.min(hi, ct.text.length) };
}
