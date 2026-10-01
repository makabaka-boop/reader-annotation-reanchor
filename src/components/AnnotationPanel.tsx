import type { Action } from '../app/store';
import type { Annotation, Book } from '../types';

const STATUS_LABEL: Record<Annotation['status'], string> = {
  anchored: '已锚定',
  ambiguous: '待裁决',
  orphan: '已失联',
};

interface PanelProps {
  book: Book;
  annotations: Annotation[];
  selectedId: string | null;
  dispatch: React.Dispatch<Action>;
}

export function AnnotationPanel({ book, annotations, selectedId, dispatch }: PanelProps) {
  const chapterOrder = new Map(book.chapters.map((c, i) => [c.id, i] as const));
  const chapterTitle = new Map(book.chapters.map((c) => [c.id, c.title] as const));
  const sorted = [...annotations].sort(
    (a, b) =>
      (chapterOrder.get(a.chapterId) ?? 0) - (chapterOrder.get(b.chapterId) ?? 0) || a.start - b.start,
  );

  const locate = (a: Annotation) => {
    dispatch({ type: 'SELECT', id: a.id });
    const el = document.querySelector(`mark[data-aid="${a.id}"]`);
    (el as HTMLElement | null)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  return (
    <aside className="panel" data-testid="annotation-panel">
      <h2>批注（{annotations.length}）</h2>
      {sorted.length === 0 && <p className="empty">选中正文文字即可创建批注。</p>}
      {sorted.map((a) => (
        <div
          key={a.id}
          data-testid={`annotation-card-${a.id}`}
          className={`card ${a.id === selectedId ? 'selected' : ''} status-${a.status}`}
          onClick={() => dispatch({ type: 'SELECT', id: a.id })}
        >
          <div className="card-head">
            <span className="chapter-tag">{chapterTitle.get(a.chapterId) ?? a.chapterId}</span>
            <span className={`badge badge-${a.status}`}>{STATUS_LABEL[a.status]}</span>
          </div>
          <blockquote className="quote">{a.exact}</blockquote>
          {a.status === 'orphan' && (
            <div className="evidence">
              <div>前文：…{a.prefix || '（无）'}</div>
              <div>后文：{a.suffix || '（无）'}…</div>
            </div>
          )}
          <textarea
            placeholder="写下你的想法…"
            value={a.note}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => dispatch({ type: 'UPDATE_NOTE', id: a.id, note: e.target.value })}
          />
          <div className="card-actions">
            {a.status === 'anchored' && (
              <button type="button" onClick={(e) => { e.stopPropagation(); locate(a); }}>
                定位
              </button>
            )}
            <button
              type="button"
              className="danger"
              data-testid={`delete-${a.id}`}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({ type: 'DELETE_ANNOTATION', id: a.id });
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </aside>
  );
}
