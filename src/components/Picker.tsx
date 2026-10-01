import type { Action, PickerState } from '../app/store';
import type { Annotation } from '../types';

interface PickerProps {
  picker: PickerState;
  annotations: Annotation[];
  dispatch: React.Dispatch<Action>;
}

/** 重叠批注的点击选择器：列出该位置的所有批注，可分别选择或删除 */
export function Picker({ picker, annotations, dispatch }: PickerProps) {
  const items = picker.ids
    .map((id) => annotations.find((a) => a.id === id))
    .filter((a): a is Annotation => Boolean(a));
  if (items.length === 0) return null;

  return (
    <div
      className="picker"
      data-testid="picker"
      style={{ left: picker.x, top: picker.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="picker-title">此处有 {items.length} 条批注</div>
      {items.map((a) => (
        <div key={a.id} className="picker-item" data-testid={`picker-item-${a.id}`}>
          <button
            type="button"
            className="picker-select"
            onClick={() => dispatch({ type: 'SELECT', id: a.id })}
          >
            <span className="quote">「{a.exact.length > 24 ? `${a.exact.slice(0, 24)}…` : a.exact}」</span>
            {a.note && <span className="note-preview">{a.note}</span>}
          </button>
          <button
            type="button"
            className="danger"
            data-testid={`picker-delete-${a.id}`}
            onClick={() => dispatch({ type: 'DELETE_ANNOTATION', id: a.id })}
          >
            删除
          </button>
        </div>
      ))}
      <button type="button" className="link" onClick={() => dispatch({ type: 'SET_PICKER', picker: null })}>
        取消
      </button>
    </div>
  );
}
