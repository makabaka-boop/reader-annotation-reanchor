import { useEffect, useReducer, useRef } from 'react';
import { appReducer, initialState, type AppState } from './app/store';
import type { Book } from './types';
import { loadAnnotations, loadBook, loadFontSize, saveAnnotations, saveBook, saveFontSize } from './lib/storage';
import { Toolbar } from './components/Toolbar';
import { Reader } from './components/Reader';
import { AnnotationPanel } from './components/AnnotationPanel';
import { ReanchorDialog } from './components/ReanchorDialog';
import { Picker } from './components/Picker';

export default function App({ initial }: { initial?: Partial<AppState> } = {}) {
  const [state, dispatch] = useReducer(appReducer, { ...initialState, ...initial });
  const hydrated = useRef(false);

  // 启动时从 localStorage 恢复（测试注入 initial 时跳过）
  useEffect(() => {
    if (initial) {
      hydrated.current = true;
      return;
    }
    const book = loadBook();
    dispatch({
      type: 'INIT',
      book,
      annotations: book ? loadAnnotations(book.id) : [],
      fontSize: loadFontSize(),
    });
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 持久化：批注、书籍、字号（与高亮、导出同源）
  useEffect(() => {
    if (hydrated.current) saveBook(state.book);
  }, [state.book]);
  useEffect(() => {
    if (hydrated.current && state.book) saveAnnotations(state.book.id, state.annotations);
  }, [state.book, state.annotations]);
  useEffect(() => {
    if (hydrated.current) saveFontSize(state.fontSize);
  }, [state.fontSize]);

  // 提示自动消失
  useEffect(() => {
    if (!state.notice) return;
    const t = setTimeout(() => dispatch({ type: 'SET_NOTICE', notice: null }), 4000);
    return () => clearTimeout(t);
  }, [state.notice]);

  const handleImport = (book: Book) => {
    const sameBook = state.book?.id === book.id;
    dispatch({
      type: 'IMPORT_BOOK',
      book,
      annotations: sameBook ? undefined : loadAnnotations(book.id),
    });
  };

  return (
    <div className="app" onClick={() => state.picker && dispatch({ type: 'SET_PICKER', picker: null })}>
      <Toolbar
        book={state.book}
        annotations={state.annotations}
        fontSize={state.fontSize}
        dispatch={dispatch}
        onImport={handleImport}
        onError={(msg) => dispatch({ type: 'SET_NOTICE', notice: msg })}
      />
      {state.notice && (
        <div className="notice" data-testid="notice" role="status">
          {state.notice}
        </div>
      )}
      <main className="main">
        {state.book ? (
          <>
            <Reader
              book={state.book}
              annotations={state.annotations}
              selectedId={state.selectedId}
              fontSize={state.fontSize}
              dispatch={dispatch}
            />
            <AnnotationPanel
              book={state.book}
              annotations={state.annotations}
              selectedId={state.selectedId}
              dispatch={dispatch}
            />
          </>
        ) : (
          <div className="welcome">
            <h1>本地 JSON 书稿阅读器</h1>
            <p>导入一本书稿（JSON：章节 + 段落），选中文字即可创建批注。</p>
            <p>再次导入同一本书的新版本时，批注会自动重锚；无法确定的批注会保留证据，绝不猜测位置。</p>
          </div>
        )}
      </main>
      {state.reanchorReport && (
        <ReanchorDialog report={state.reanchorReport} annotations={state.annotations} dispatch={dispatch} />
      )}
      {state.picker && <Picker picker={state.picker} annotations={state.annotations} dispatch={dispatch} />}
    </div>
  );
}
