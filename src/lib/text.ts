/**
 * 文本规范化与章节全文构建。
 *
 * 关键不变量：渲染到 DOM 的段落文本 === 规范化后的段落文本，
 * 因此 DOM 选区偏移可以直接映射为章节规范化全文的字符偏移，
 * 与字号、行宽等排版因素完全无关。
 */

/** 段落之间在章节全文中的连接符 */
export const PARAGRAPH_JOIN = '\n\n';

/** Unicode NFC 归一 + 折叠空白 + 去首尾空白 */
export function normalizeText(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

export interface ChapterText {
  /** 章节规范化全文（段落以 PARAGRAPH_JOIN 连接） */
  text: string;
  /** 每个段落在全文中的起始偏移 */
  paraStarts: number[];
  /** 规范化后的段落文本 */
  paragraphs: string[];
}

export function buildChapterText(paragraphs: string[]): ChapterText {
  const normalized = paragraphs.map(normalizeText);
  const paraStarts: number[] = [];
  let offset = 0;
  for (const p of normalized) {
    paraStarts.push(offset);
    offset += p.length + PARAGRAPH_JOIN.length;
  }
  return { text: normalized.join(PARAGRAPH_JOIN), paraStarts, paragraphs: normalized };
}

/** 章节偏移落在哪个段落内；落在段落间隙（连接符）时返回下一段的下标 */
export function paragraphIndexAt(ct: ChapterText, offset: number): number {
  for (let i = 0; i < ct.paraStarts.length; i++) {
    const start = ct.paraStarts[i];
    const end = start + ct.paragraphs[i].length;
    if (offset < end) return i;
    if (offset < end + PARAGRAPH_JOIN.length) return Math.min(i + 1, ct.paragraphs.length - 1);
  }
  return ct.paragraphs.length - 1;
}
