/**
 * 把段落文本按批注区间切成片段。重叠批注会产生携带多个 id 的片段，
 * 渲染时按“先开始、后结束”的顺序嵌套 <mark>，保证每条批注都可独立命中。
 */

export interface ParaRange {
  id: string;
  /** 相对段落起点的偏移，已裁剪到段落内 */
  start: number;
  end: number;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** 覆盖该片段的批注 id，嵌套顺序：外层在前 */
  ids: string[];
}

export function splitParagraph(text: string, ranges: ParaRange[]): Segment[] {
  const valid = ranges
    .filter((r) => r.end > r.start && r.start < text.length && r.end > 0)
    .map((r) => ({ ...r, start: Math.max(0, r.start), end: Math.min(text.length, r.end) }));

  const boundaries = new Set<number>([0, text.length]);
  for (const r of valid) {
    boundaries.add(r.start);
    boundaries.add(r.end);
  }
  const points = [...boundaries].sort((a, b) => a - b);

  // 稳定的嵌套顺序：先开始者优先，同起点则区间更长者在外层
  const order = (id: string) => {
    const r = valid.find((v) => v.id === id)!;
    return r.start * (text.length + 1) + (text.length - r.end);
  };

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const ids = valid
      .filter((r) => r.start <= start && r.end >= end)
      .map((r) => r.id)
      .sort((a, b) => order(a) - order(b));
    segments.push({ start, end, text: text.slice(start, end), ids });
  }
  return segments;
}
