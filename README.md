# 本地阅读器 · 文本锚点批注

React + TypeScript 实现的本地 JSON 书稿阅读器。核心是一套**与排版无关的文本锚点**系统：
批注不记录任何屏幕坐标，只记录章节身份、规范化文字位置、选中文字及两侧上下文，
因此改变字号、窗口宽度、重排之后，批注仍然指向原来的文字。

## 运行

```bash
npm install
npm run dev        # 开发服务器
npm test           # 运行全部测试（vitest + jsdom）
npm run build      # 类型检查 + 生产构建
```

界面内置「示例 v1 / 示例 v2」按钮：先载入 v1，选中文字创建若干批注，
再载入 v2 即可现场观察重锚（段落拆分、文字插入、句子删除、重复短句四种情形）。

## 书稿格式

```json
{
  "id": "demo-book",
  "title": "山间笔记",
  "chapters": [
    { "id": "ch1", "title": "第一章", "paragraphs": ["段落一。", "段落二。"] }
  ]
}
```

导入时即做规范化（Unicode NFC + 折叠空白），渲染文本与锚点文本严格一致。

## 锚点模型

每条批注（`src/types.ts` 的 `Anchor`）记录：

| 字段 | 含义 |
| --- | --- |
| `chapterId` | 章节身份 |
| `start` / `end` | 章节规范化全文中的字符偏移（段落间以 `\n\n` 连接） |
| `exact` | 选中的原文 |
| `prefix` / `suffix` | 两侧各至多 32 字符的上下文 |

- **创建**：DOM 选区（可跨段落、跨 `<mark>` 的任意文本节点）经 TreeWalker
  换算为章节偏移（`src/lib/selection.ts`），再从章节全文切出锚点。
- **高亮**：按锚点偏移把段落切成片段，重叠批注渲染为嵌套 `<mark>`，
  随文字流自然重排——这是"改字号/改宽度后仍指向原文字"的实现方式。
- **重锚**（导入同一 `id` 的新版本时，`src/lib/anchor.ts`）：
  - `exact` 在新章节中**唯一**出现 → 自动迁移；
  - **多处**出现 → 标记 `ambiguous`，候选按上下文连续匹配得分排序，列入待裁决；
  - **找不到** → 标记 `orphan`，保留 `exact/prefix/suffix` 证据，**不猜测任何位置**。
- **同源**：localStorage 持久化、画面高亮、JSON 导出全部读写同一份锚点状态。

## 目录结构

```
src/lib/text.ts       规范化与章节全文构建（段落偏移表）
src/lib/anchor.ts     锚点创建 / 定位 / 重锚 / 裁决
src/lib/selection.ts  DOM 选区 → 章节偏移
src/lib/highlight.ts  段落按批注区间切片（支持重叠）
src/lib/storage.ts    localStorage 持久化
src/lib/book.ts       书稿校验、批注导出
src/app/store.ts      应用状态 reducer
src/components/       阅读器 / 批注面板 / 重锚对话框 / 重叠选择器
tests/                44 个测试：段落拆分、重复短句、文字插入、
                      跨节点选择、重排后定位、失联证据、重叠删除等
```
