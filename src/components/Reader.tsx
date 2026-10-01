import { useMemo, useRef } from 'react';
import type { Action } from '../app/store';
import type { Annotation, Book, Chapter } from '../types';
import { buildChapterText, type ChapterText } from '../lib/text';
import { makeAnchor, resolvePosition } from '../lib/anchor';
import { selectionToChapterRange } from '../lib/selection';
import { splitParagraph, type ParaRange } from '../lib/highlight';

interface ReaderProps {
  book: Book;
  annotations: Annotation[];
  selectedId: string | null;
  fontSize: number;
  dispatch: React.Dispatch<Action>;
}

export function Reader({ book, annotations, selectedId, fontSize, dispatch }: ReaderProps) {
  return (
    <div className="reader" data-testid="reader" style={{ fontSize: `${fontSize}px` }}>
      <h1 className="book-title">{book.title}</h1>
      {book.chapters.map((ch) => (
        <ChapterView
          key={ch.id}
          book={book}
          chapter={ch}
          annotations={annotations}
          selectedId={selectedId}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}

interface ChapterViewProps {
  book: Book;
  chapter: Chapter;
  annotations: Annotation[];
  selectedId: string | null;
  dispatch: React.Dispatch<Action>;
}

function ChapterView({ book, chapter, annotations, selectedId, dispatch }: ChapterViewProps) {
  const ct: ChapterText = useMemo(() => buildChapterText(chapter.paragraphs), [chapter]);
  const ref = useRef<HTMLDivElement>(null);

  // 高亮位置全部解析自同一份锚点状态（与排版无关的章节偏移）
  const resolved = useMemo(() => {
    const out: { id: string; start: number; end: number }[] = [];
    for (const a of annotations) {
      if (a.chapterId !== chapter.id || a.status !== 'anchored') continue;
      const pos = resolvePosition(ct.text, a);
      if (pos) out.push({ id: a.id, ...pos });
    }
    return out;
  }, [annotations, chapter.id, ct]);

  const onMouseUp = () => {
    const el = ref.current;
    if (!el) return;
    const range = selectionToChapterRange(el, ct);
    if (!range) return;
    const anchor = makeAnchor(ct.text, {
      bookId: book.id,
      chapterId: chapter.id,
      start: range.start,
      end: range.end,
    });
    window.getSelection()?.removeAllRanges();
    dispatch({ type: 'ADD_ANNOTATION', annotation: { ...anchor, status: 'anchored' } });
  };

  const onClick = (e: React.MouseEvent) => {
    const target = e.target as Element;
    const firstMark = target.closest?.('mark[data-aid]');
    if (!firstMark || !ref.current?.contains(firstMark)) return;
    // 收集点击处所有嵌套 mark 的批注 id（重叠批注）
    const ids: string[] = [];
    let el: Element | null = firstMark;
    while (el && el.tagName === 'MARK') {
      ids.push(el.getAttribute('data-aid')!);
      const parent: Element | null = el.parentElement;
      el = parent && parent.tagName === 'MARK' ? parent : null;
    }
    if (ids.length === 0) return;
    if (ids.length === 1) {
      dispatch({ type: 'SELECT', id: ids[0] });
    } else {
      dispatch({ type: 'SET_PICKER', picker: { x: e.clientX, y: e.clientY, ids } });
    }
  };

  return (
    <section className="chapter">
      <h2>{chapter.title}</h2>
      <div data-chapter-id={chapter.id} ref={ref} onMouseUp={onMouseUp} onClick={onClick}>
        {ct.paragraphs.map((text, idx) => {
          const pStart = ct.paraStarts[idx];
          const pEnd = pStart + text.length;
          const ranges: ParaRange[] = resolved
            .filter((a) => a.start < pEnd && a.end > pStart)
            .map((a) => ({
              id: a.id,
              start: Math.max(a.start, pStart) - pStart,
              end: Math.min(a.end, pEnd) - pStart,
            }));
          return <ParagraphView key={idx} idx={idx} text={text} ranges={ranges} selectedId={selectedId} />;
        })}
      </div>
    </section>
  );
}

function ParagraphView({
  idx,
  text,
  ranges,
  selectedId,
}: {
  idx: number;
  text: string;
  ranges: ParaRange[];
  selectedId: string | null;
}) {
  const segments = splitParagraph(text, ranges);
  return (
    <p data-p-idx={idx}>
      {segments.map((seg, i) => {
        if (seg.ids.length === 0) return <span key={i}>{seg.text}</span>;
        // ids 外层在前，从内层开始逐层包裹，重叠批注各自独立成 mark
        let node: React.ReactNode = seg.text;
        for (let k = seg.ids.length - 1; k >= 0; k--) {
          const id = seg.ids[k];
          node = (
            <mark data-aid={id} className={id === selectedId ? 'sel' : undefined}>
              {node}
            </mark>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </p>
  );
}
