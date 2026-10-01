/**
 * 锚点引擎：创建、解析、重锚。
 *
 * 重锚策略（导入同一本书的新版本时）：
 * - exact 在新章节全文中出现且仅出现一次 → 自动迁移；
 * - 出现多处 → 标记 ambiguous，候选按上下文得分排序，等待人工裁决；
 * - 找不到 → 标记 orphan，保留 exact/prefix/suffix 作为证据，绝不猜测位置。
 */
import type { Anchor, AnchorCandidate, Annotation, Book, ReanchorReport } from '../types';
import { buildChapterText } from './text';

export const CONTEXT_LENGTH = 32;

let idCounter = 0;
export function generateId(now: number = Date.now()): string {
  idCounter += 1;
  return `a${now.toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface AnchorInput {
  bookId: string;
  chapterId: string;
  start: number;
  end: number;
  note?: string;
  id?: string;
  now?: number;
}

/** 从章节全文切出锚点（exact + 两侧上下文） */
export function makeAnchor(chapterText: string, input: AnchorInput): Anchor {
  const start = Math.max(0, Math.min(input.start, chapterText.length));
  const end = Math.max(start, Math.min(input.end, chapterText.length));
  if (end === start) throw new Error('空选区不能创建批注');
  return {
    id: input.id ?? generateId(input.now),
    bookId: input.bookId,
    chapterId: input.chapterId,
    start,
    end,
    exact: chapterText.slice(start, end),
    prefix: chapterText.slice(Math.max(0, start - CONTEXT_LENGTH), start),
    suffix: chapterText.slice(end, end + CONTEXT_LENGTH),
    note: input.note ?? '',
    createdAt: input.now ?? Date.now(),
  };
}

/** 找出 needle 在 haystack 中的全部出现位置（允许重叠匹配） */
export function findOccurrences(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

/** 上下文得分：锚点前缀从 pos 向前、后缀从 pos+exact.length 向后连续匹配的字符数 */
export function contextScore(
  text: string,
  pos: number,
  exact: string,
  prefix: string,
  suffix: string,
): number {
  let score = 0;
  for (let k = 1; k <= prefix.length; k++) {
    if (text[pos - k] === prefix[prefix.length - k]) score += 1;
    else break;
  }
  const end = pos + exact.length;
  for (let k = 0; k < suffix.length; k++) {
    if (text[end + k] === suffix[k]) score += 1;
    else break;
  }
  return score;
}

function toCandidate(text: string, pos: number, exact: string, prefix: string, suffix: string): AnchorCandidate {
  const SNIPPET = 24;
  return {
    start: pos,
    end: pos + exact.length,
    score: contextScore(text, pos, exact, prefix, suffix),
    before: text.slice(Math.max(0, pos - SNIPPET), pos),
    after: text.slice(pos + exact.length, pos + exact.length + SNIPPET),
  };
}

export type LocateResult =
  | { kind: 'unique'; start: number; end: number }
  | { kind: 'ambiguous'; candidates: AnchorCandidate[] }
  | { kind: 'not-found' };

/** 在章节全文中按 exact 定位，候选按上下文得分降序 */
export function locate(
  chapterText: string,
  probe: Pick<Anchor, 'exact' | 'prefix' | 'suffix'>,
): LocateResult {
  const positions = findOccurrences(chapterText, probe.exact);
  if (positions.length === 0) return { kind: 'not-found' };
  if (positions.length === 1) {
    return { kind: 'unique', start: positions[0], end: positions[0] + probe.exact.length };
  }
  const candidates = positions
    .map((p) => toCandidate(chapterText, p, probe.exact, probe.prefix, probe.suffix))
    .sort((a, b) => b.score - a.score || a.start - b.start);
  return { kind: 'ambiguous', candidates };
}

/**
 * 渲染期解析：优先信任存储的偏移（同一版本下重复短句也能正确定位），
 * 仅当存储偏移处的文本与 exact 不符时才尝试唯一匹配自愈。
 */
export function resolvePosition(
  chapterText: string,
  anchor: Pick<Anchor, 'start' | 'end' | 'exact' | 'prefix' | 'suffix'>,
): { start: number; end: number } | null {
  if (
    anchor.start >= 0 &&
    anchor.end <= chapterText.length &&
    chapterText.slice(anchor.start, anchor.end) === anchor.exact
  ) {
    return { start: anchor.start, end: anchor.end };
  }
  const found = locate(chapterText, anchor);
  if (found.kind === 'unique') return { start: found.start, end: found.end };
  return null;
}

export interface ReanchorOutcome {
  annotations: Annotation[];
  report: ReanchorReport;
}

/**
 * 用新版本的书重锚全部批注。章节按 id 匹配；章节消失视为找不到原文。
 * 已 ambiguous/orphan 的批注同样参与重锚（再次导入新版本时可恢复）。
 */
export function reanchorAnnotations(
  annotations: Annotation[],
  newBook: Book,
  now: number = Date.now(),
): ReanchorOutcome {
  const chapterTexts = new Map(
    newBook.chapters.map((ch) => [ch.id, buildChapterText(ch.paragraphs).text] as const),
  );
  const report: ReanchorReport = { at: now, bookId: newBook.id, migrated: [], ambiguous: [], orphan: [] };

  const next = annotations.map((ann) => {
    const text = chapterTexts.get(ann.chapterId);
    const base: Annotation = { ...ann, candidates: undefined };
    if (text === undefined) {
      report.orphan.push(ann.id);
      return { ...base, status: 'orphan' as const, orphanSince: ann.orphanSince ?? now };
    }
    const found = locate(text, ann);
    if (found.kind === 'unique') {
      report.migrated.push(ann.id);
      return {
        ...base,
        status: 'anchored' as const,
        start: found.start,
        end: found.end,
        prefix: text.slice(Math.max(0, found.start - CONTEXT_LENGTH), found.start),
        suffix: text.slice(found.end, found.end + CONTEXT_LENGTH),
        orphanSince: undefined,
      };
    }
    if (found.kind === 'ambiguous') {
      report.ambiguous.push(ann.id);
      // 保留旧 start/end 仅供参考；裁决前不参与高亮
      return { ...base, status: 'ambiguous' as const, candidates: found.candidates, orphanSince: undefined };
    }
    report.orphan.push(ann.id);
    // 失联：保留 exact/prefix/suffix 证据与原偏移，不猜测任何位置
    return { ...base, status: 'orphan' as const, orphanSince: ann.orphanSince ?? now };
  });

  return { annotations: next, report };
}

/** 人工裁决：为 ambiguous 批注选定候选位置 */
export function adjudicate(
  annotation: Annotation,
  chapterText: string,
  candidate: AnchorCandidate,
  now: number = Date.now(),
): Annotation {
  return {
    ...annotation,
    status: 'anchored',
    start: candidate.start,
    end: candidate.end,
    exact: chapterText.slice(candidate.start, candidate.end),
    prefix: chapterText.slice(Math.max(0, candidate.start - CONTEXT_LENGTH), candidate.start),
    suffix: chapterText.slice(candidate.end, candidate.end + CONTEXT_LENGTH),
    candidates: undefined,
    orphanSince: undefined,
    createdAt: annotation.createdAt || now,
  };
}
