/** 书稿 JSON 的校验与规范化。导入即规范化，保证渲染文本与锚点文本一致。 */
import type { Book } from '../types';
import { normalizeText } from './text';

export class BookFormatError extends Error {}

export function parseBook(json: unknown): Book {
  if (typeof json !== 'object' || json === null) throw new BookFormatError('书稿必须是 JSON 对象');
  const b = json as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) throw new BookFormatError('书稿缺少字符串字段 id');
  if (typeof b.title !== 'string') throw new BookFormatError('书稿缺少字符串字段 title');
  if (!Array.isArray(b.chapters) || b.chapters.length === 0) {
    throw new BookFormatError('书稿缺少非空 chapters 数组');
  }
  const chapters = b.chapters.map((c, i) => {
    if (typeof c !== 'object' || c === null) throw new BookFormatError(`chapters[${i}] 不是对象`);
    const ch = c as Record<string, unknown>;
    if (typeof ch.id !== 'string' || !ch.id) throw new BookFormatError(`chapters[${i}] 缺少 id`);
    if (typeof ch.title !== 'string') throw new BookFormatError(`chapters[${i}] 缺少 title`);
    if (!Array.isArray(ch.paragraphs) || ch.paragraphs.some((p) => typeof p !== 'string')) {
      throw new BookFormatError(`chapters[${i}].paragraphs 必须是字符串数组`);
    }
    return {
      id: ch.id,
      title: ch.title,
      paragraphs: (ch.paragraphs as string[]).map(normalizeText),
    };
  });
  return { id: b.id, title: b.title, chapters };
}

/** 导出批注：与持久化、高亮使用同一份锚点状态 */
export function exportAnnotations(book: Book, annotations: import('../types').Annotation[]): string {
  return JSON.stringify(
    {
      bookId: book.id,
      bookTitle: book.title,
      exportedAt: new Date().toISOString(),
      annotations: annotations.map((a) => ({
        id: a.id,
        chapterId: a.chapterId,
        start: a.start,
        end: a.end,
        exact: a.exact,
        prefix: a.prefix,
        suffix: a.suffix,
        note: a.note,
        status: a.status,
        createdAt: a.createdAt,
      })),
    },
    null,
    2,
  );
}
