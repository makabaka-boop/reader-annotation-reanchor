import type { Action } from '../app/store';
import type { Annotation, ReanchorReport } from '../types';

interface DialogProps {
  report: ReanchorReport;
  annotations: Annotation[];
  dispatch: React.Dispatch<Action>;
}

/** 新版本重锚结果：自动迁移摘要 + 待裁决列表 + 失联列表 */
export function ReanchorDialog({ report, annotations, dispatch }: DialogProps) {
  const ambiguous = annotations.filter((a) => a.status === 'ambiguous');
  const orphan = annotations.filter((a) => a.status === 'orphan');
  const pending = ambiguous.length + orphan.length;

  return (
    <div className="modal-backdrop" data-testid="reanchor-dialog">
      <div className="modal">
        <h2>新版本重锚结果</h2>
        <p className="summary">
          自动迁移 {report.migrated.length} 条；多处匹配待裁决 {report.ambiguous.length} 条；
          找不到原文失联 {report.orphan.length} 条。
        </p>

        {ambiguous.map((a) => (
          <div key={a.id} className="review-item" data-testid={`ambiguous-${a.id}`}>
            <div className="review-head">
              <strong>待裁决：</strong>
              <span className="quote">「{a.exact}」</span>
              <span className="hint">原文出现 {a.candidates?.length ?? 0} 处，请选择正确位置</span>
            </div>
            {a.note && <div className="note-preview">批注：{a.note}</div>}
            <ul className="candidates">
              {a.candidates?.map((c, i) => (
                <li key={i}>
                  <span className="snippet">
                    …{c.before}
                    <mark>{a.exact}</mark>
                    {c.after}…
                  </span>
                  <button
                    type="button"
                    data-testid={`adjudicate-${a.id}-${i}`}
                    onClick={() => dispatch({ type: 'ADJUDICATE', id: a.id, candidateIndex: i })}
                  >
                    采用此位置
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="link" onClick={() => dispatch({ type: 'MARK_ORPHAN', id: a.id })}>
              都不是，保留为失联
            </button>
          </div>
        ))}

        {orphan.map((a) => (
          <div key={a.id} className="review-item orphan" data-testid={`orphan-${a.id}`}>
            <div className="review-head">
              <strong>已失联：</strong>
              <span className="quote">「{a.exact}」</span>
            </div>
            <div className="evidence">
              <div>前文：…{a.prefix || '（无）'}</div>
              <div>后文：{a.suffix || '（无）'}…</div>
            </div>
            {a.note && <div className="note-preview">批注：{a.note}</div>}
            <button
              type="button"
              className="danger"
              onClick={() => dispatch({ type: 'DELETE_ANNOTATION', id: a.id })}
            >
              删除此批注
            </button>
          </div>
        ))}

        <div className="modal-actions">
          <button type="button" onClick={() => dispatch({ type: 'DISMISS_REPORT' })}>
            {pending > 0 ? '稍后处理' : '完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
