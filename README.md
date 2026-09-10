# Hindsight — 个人 AI 学习系统

一套基于 [pi](https://github.com/earendil-works/pi) 的学习系统：教学哲学编码为 skill，辅以少量扩展与子代理定义。本仓库本身就是一个 `.pi` 目录，置于学习项目根目录下即可生效。

## 组成

- `skills/teach/` — 教学哲学与教学流程（probe → plan → teach）
- `skills/curriculum/` — 将 PDF 教材转化为经过审计的课程：SMART 单元适配短会话，Markdown 检查点支持断点续学
- `skills/visualize/` — 当某个想法用图更清晰时，为课程补一张正确且极简的示意图
- `extensions/ask-user-question.ts` — 通过 UI 弹窗向学习者提问
- `extensions/quiz.ts` — 可判分的选择题，即时反馈（✓/✗、正确答案、解析）
- `extensions/md-log.ts` — 将会话镜像到 markdown 文件（配合 Obsidian 渲染）
- `extensions/visual-tools/` — 可视化子代理使用的渲染工具
- `agents/` — `researcher`、`svg-maker`、`mermaid-maker`：系统委派的子代理

## 环境要求

- [pi](https://github.com/earendil-works/pi)
- 子代理实现，用于派生 researcher 与可视化制作者。推荐 [pi-interactive-subagents](https://github.com/amosblomqvist/pi-interactive-subagents)（仅 tmux）；其他实现也可用，但需自行调整代理定义——例如 `agents/researcher.md` 工具列表中的 `safe_bash` 即来自该扩展。
- `ask-user-question` 使用本仓库自带的这份实现：不同扩展的弹窗经由共享 UI 锁序列化，只有同一实现才能正常工作。

## 教材课程（curriculum）

用 `curriculum` 对**文本型 PDF** 教材做顺序学习。它会映射整本书、审计前置顺序与练习对齐、记录有依据的章节重排，并详排接下来的 3–5 个单元。会话默认 15 分钟，含练习与检测。扫描版图书需先转成可搜索 PDF；Word/Google Docs 与整本书 OCR 不在首版范围内。

```text
/skill:curriculum 根据 "E:/Books/教材.pdf" 建立课程，默认每次 15 分钟
/skill:curriculum 继续上次的课程，今天只有 5 分钟
/skill:curriculum 查看课程进度和仍需复习的内容
/skill:curriculum 这个单元太长，按我的实际进度调整后面的路线
```

自然语言的"规划/继续教材课程"请求同样会选中该 skill；命中多个课程时会先询问是哪一个；只要规划时，仅保存路线而不开课。

提取器依赖 Node.js 18+，且 Poppler 的 `pdfinfo` 与 `pdftotext` 需在 PATH 上；`pdftoppm` 加图像读取用于检查公式、图表与提取问题。提取器不需要任何 npm 包：

```text
node .pi/skills/curriculum/scripts/pdf-source.mjs "path/to/textbook.pdf" --out "curricula/my-course/source"
```

在学习项目根目录下运行上例（若已在 `.pi` 目录内则去掉 `.pi/` 前缀）。它返回 JSON 摘要，并写入以 PDF 的 SHA-256 命名的 Markdown 缓存，保留物理页边界。空白/可疑页面保留为显式警告；印刷页码与内容仍需人工复核。退出码 2 表示未提取到文本，1 表示出错。

课程记录存放在 `<learning-root>/curricula/<course-id>/`，learning root 为当前目录（在项目 `.pi` 目录内运行时取其父目录）。`course.md` 记录书目与审计结论，`roadmap.md` 是完整路线，`units/` 存放详细任务，`progress.md` 是权威的当前状态，`sessions/` 保存证据与可恢复的检查点。续学完全基于这些文件（包括未完成的问答或练习），不依赖旧聊天记录。保存由代理在检查点处执行，而非后台 session hook；异常终止可能丢失最后一个检查点之后的内容。

`md-log` 必须指向**单独的新转录文件**：链接会回填并覆盖目标文件，绝不要指向课程记录或检查点日志。现有的教学、测验、提问与可视化扩展接口保持不变。

## 通用教学（teach）

没有子代理实现也能运行：主会话直接承担教学，只是失去 researcher（事实核查）与自动生成的示意图。
