/** localStorage 持久化：批注按书 id 分键存储，书籍与字号各自存储。 */
import type { Annotation, Book } from '../types';

const BOOK_KEY = 'local-reader:book:v1';
const FONT_KEY = 'local-reader:font-size:v1';
const annKey = (bookId: string) => `local-reader:annotations:v1:${bookId}`;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadBook(): Book | null {
  return safeParse<Book>(localStorage.getItem(BOOK_KEY));
}

export function saveBook(book: Book | null): void {
  if (book) localStorage.setItem(BOOK_KEY, JSON.stringify(book));
  else localStorage.removeItem(BOOK_KEY);
}

export function loadAnnotations(bookId: string): Annotation[] {
  const list = safeParse<Annotation[]>(localStorage.getItem(annKey(bookId)));
  return Array.isArray(list) ? list : [];
}

export function saveAnnotations(bookId: string, annotations: Annotation[]): void {
  localStorage.setItem(annKey(bookId), JSON.stringify(annotations));
}

export function loadFontSize(): number | null {
  const n = Number(localStorage.getItem(FONT_KEY));
  return Number.isFinite(n) && n >= 12 && n <= 32 ? n : null;
}

export function saveFontSize(size: number): void {
  localStorage.setItem(FONT_KEY, String(size));
}
