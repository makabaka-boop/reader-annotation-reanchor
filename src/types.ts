/** 书稿与批注的数据模型。所有偏移量均基于“章节规范化全文”的字符偏移。 */

export interface Chapter {
  id: string;
  title: string;
  paragraphs: string[];
}

export interface Book {
  id: string;
  title: string;
  chapters: Chapter[];
}

/**
 * 文本锚点：批注的定位核心。
 * - chapterId：章节身份
 * - start/end：在章节规范化全文中的字符偏移（与排版无关）
 * - exact：选中的原文（规范化后）
 * - prefix/suffix：选中处两侧的上下文（用于重锚时打分与失联取证）
 */
export interface Anchor {
  id: string;
  bookId: string;
  chapterId: string;
  start: number;
  end: number;
  exact: string;
  prefix: string;
  suffix: string;
  note: string;
  createdAt: number;
}

export type AnchorStatus =
  | 'anchored' // 位置有效，可正常高亮
  | 'ambiguous' // 新版本中出现多处匹配，等待人工裁决
  | 'orphan'; // 新版本中找不到原文，保留证据，不猜测位置

/** 重锚候选位置 */
export interface AnchorCandidate {
  start: number;
  end: number;
  /** 上下文匹配得分（前缀+后缀连续匹配字符数），越高越可能是原位置 */
  score: number;
  /** 展示用上下文片段 */
  before: string;
  after: string;
}

export interface Annotation extends Anchor {
  status: AnchorStatus;
  /** status === 'ambiguous' 时存在，按得分降序 */
  candidates?: AnchorCandidate[];
  /** 变为失联的时间（保留证据用） */
  orphanSince?: number;
}

export interface ReanchorReport {
  at: number;
  bookId: string;
  /** 自动迁移成功的批注 id */
  migrated: string[];
  /** 多处匹配、待裁决的批注 id */
  ambiguous: string[];
  /** 找不到原文、已失联的批注 id */
  orphan: string[];
}
