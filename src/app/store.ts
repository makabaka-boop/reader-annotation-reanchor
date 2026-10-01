/** 应用状态：纯 reducer，UI、持久化、导出共用同一份锚点状态。 */
import type { Annotation, Book, ReanchorReport } from '../types';
import { adjudicate, reanchorAnnotations } from '../lib/anchor';
import { buildChapterText } from '../lib/text';

export interface PickerState {
  x: number;
  y: number;
  ids: string[];
}

export interface AppState {
  book: Book | null;
  annotations: Annotation[];
  selectedId: string | null;
  picker: PickerState | null;
  fontSize: number;
  reanchorReport: ReanchorReport | null;
  /** 导入/操作的一次性提示 */
  notice: string | null;
}

export const initialState: AppState = {
  book: null,
  annotations: [],
  selectedId: null,
  picker: null,
  fontSize: 18,
  reanchorReport: null,
  notice: null,
};

export type Action =
  | { type: 'INIT'; book: Book | null; annotations: Annotation[]; fontSize: number | null }
  | { type: 'IMPORT_BOOK'; book: Book; annotations?: Annotation[]; now?: number }
  | { type: 'ADD_ANNOTATION'; annotation: Annotation }
  | { type: 'UPDATE_NOTE'; id: string; note: string }
  | { type: 'DELETE_ANNOTATION'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_PICKER'; picker: PickerState | null }
  | { type: 'ADJUDICATE'; id: string; candidateIndex: number }
  | { type: 'MARK_ORPHAN'; id: string; now?: number }
  | { type: 'DISMISS_REPORT' }
  | { type: 'SET_FONT_SIZE'; size: number }
  | { type: 'SET_NOTICE'; notice: string | null };

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'INIT':
      return {
        ...state,
        book: action.book,
        annotations: action.annotations,
        fontSize: action.fontSize ?? state.fontSize,
      };

    case 'IMPORT_BOOK': {
      const incoming = action.book;
      const sameBook = state.book !== null && state.book.id === incoming.id;
      if (!sameBook) {
        // 换书：直接使用调用方提供的该书批注（来自持久化），不做重锚
        return {
          ...state,
          book: incoming,
          annotations: action.annotations ?? [],
          selectedId: null,
          picker: null,
          reanchorReport: null,
          notice: `已导入《${incoming.title}》`,
        };
      }
      // 同一本书的新版本：重锚
      const { annotations, report } = reanchorAnnotations(state.annotations, incoming, action.now);
      const { migrated, ambiguous, orphan } = report;
      return {
        ...state,
        book: incoming,
        annotations,
        selectedId: null,
        picker: null,
        reanchorReport: report,
        notice: `新版本重锚完成：迁移 ${migrated.length} 条，待裁决 ${ambiguous.length} 条，失联 ${orphan.length} 条`,
      };
    }

    case 'ADD_ANNOTATION':
      return {
        ...state,
        annotations: [...state.annotations, action.annotation],
        selectedId: action.annotation.id,
        picker: null,
      };

    case 'UPDATE_NOTE':
      return {
        ...state,
        annotations: state.annotations.map((a) => (a.id === action.id ? { ...a, note: action.note } : a)),
      };

    case 'DELETE_ANNOTATION':
      return {
        ...state,
        annotations: state.annotations.filter((a) => a.id !== action.id),
        selectedId: state.selectedId === action.id ? null : state.selectedId,
        picker: state.picker && state.picker.ids.includes(action.id)
          ? { ...state.picker, ids: state.picker.ids.filter((i) => i !== action.id) }
          : state.picker,
      };

    case 'SELECT':
      return { ...state, selectedId: action.id, picker: null };

    case 'SET_PICKER':
      return { ...state, picker: action.picker };

    case 'ADJUDICATE': {
      const ann = state.annotations.find((a) => a.id === action.id);
      const chapter = state.book?.chapters.find((c) => c.id === ann?.chapterId);
      if (!ann || !chapter || ann.status !== 'ambiguous') return state;
      const candidate = ann.candidates?.[action.candidateIndex];
      if (!candidate) return state;
      const text = buildChapterText(chapter.paragraphs).text;
      const resolved = adjudicate(ann, text, candidate);
      return {
        ...state,
        annotations: state.annotations.map((a) => (a.id === ann.id ? resolved : a)),
        selectedId: ann.id,
      };
    }

    case 'MARK_ORPHAN':
      return {
        ...state,
        annotations: state.annotations.map((a) =>
          a.id === action.id && a.status === 'ambiguous'
            ? { ...a, status: 'orphan' as const, candidates: undefined, orphanSince: action.now ?? Date.now() }
            : a,
        ),
      };

    case 'DISMISS_REPORT':
      return { ...state, reanchorReport: null };

    case 'SET_FONT_SIZE':
      return { ...state, fontSize: Math.min(32, Math.max(12, action.size)) };

    case 'SET_NOTICE':
      return { ...state, notice: action.notice };

    default:
      return state;
  }
}
