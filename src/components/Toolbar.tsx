import { useRef } from 'react';
import type { Action } from '../app/store';
import type { Book } from '../types';
import { BookFormatError, exportAnnotations, parseBook } from '../lib/book';
import type { Annotation } from '../types';

interface ToolbarProps {
  book: Book | null;
  annotations: Annotation[];
  fontSize: number;
  dispatch: React.Dispatch<Action>;
  onImport: (book: Book) => void;
  onError: (message: string) => void;
}

export function Toolbar({ book, annotations, fontSize, dispatch, onImport, onError }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      onImport(parseBook(JSON.parse(text)));
    } catch (err) {
      onError(err instanceof BookFormatError ? `书稿格式错误：${err.message}` : '无法解析 JSON 文件');
    }
  };

  const loadSample = async (version: 1 | 2) => {
    try {
      const res = await fetch(`/samples/book-v${version}.json`);
      onImport(parseBook(await res.json()));
    } catch {
      onError('示例书稿加载失败');
    }
  };

  const doExport = () => {
    if (!book) return;
    const blob = new Blob([exportAnnotations(book, annotations)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book.title}-批注.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <header className="toolbar">
      <span className="app-name">本地阅读器</span>
      <button type="button" onClick={() => fileRef.current?.click()}>
        导入书稿 JSON
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => void loadSample(1)}>
        示例 v1
      </button>
      <button type="button" onClick={() => void loadSample(2)}>
        示例 v2（重锚）
      </button>
      <button type="button" disabled={!book} onClick={doExport}>
        导出批注
      </button>
      <span className="spacer" />
      <button
        type="button"
        aria-label="减小字号"
        data-testid="font-dec"
        onClick={() => dispatch({ type: 'SET_FONT_SIZE', size: fontSize - 2 })}
      >
        A−
      </button>
      <span className="font-size" data-testid="font-size">
        {fontSize}
      </span>
      <button
        type="button"
        aria-label="增大字号"
        data-testid="font-inc"
        onClick={() => dispatch({ type: 'SET_FONT_SIZE', size: fontSize + 2 })}
      >
        A＋
      </button>
    </header>
  );
}
