# Hindsight — 个人 AI 学习系统

一套基于 [pi](https://github.com/earendil-works/pi) 的学习系统：教学哲学编码为 skill，辅以少量扩展与子代理定义。本仓库本身就是一个 `.pi` 目录，置于学习项目根目录下即可生效。

## 组成

- `skills/teach/` — 教学哲学与教学流程（probe → plan → teach）
- `skills/curriculum/` — 将 PDF 教材转化为经过审计的课程：SMART 单元适配短会话，Markdown 检查点支持断点续学
- `skills/visualize/` — 当某个想法用图更清晰时，为课程补一张正确且极简的示意图
- `extensions/ask-user-question.ts` — 通过 UI 弹窗向学习者提问
- `extensions/quiz.ts` — 可判分的选择题，即时反馈（✓/✗、正确答案、解析）
- `extensions/md-log.ts` — 自动保存课程讲课原文，并将完整历史持续同步到用户指定的 Markdown 阅读文档
- `extensions/visual-tools/` — 可视化子代理使用的渲染工具
- `obsidian-plugin/` — Foresight：Obsidian 学习伴侣，解析教材注解定位 PDF 原文，并以独立回顾弹层预览、定位历史讲解与问答
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

课程记录存放在 `<learning-root>/curricula/<course-id>/`，learning root 为当前目录（在项目 `.pi` 目录内运行时取其父目录）。`course.md` 记录书目与审计结论，`roadmap.md` 是完整路线，`units/` 存放详细任务，`progress.md` 是权威的当前状态，`sessions/` 保存证据与可恢复的检查点。续学根据这些文件恢复待回答问题、未完成推导与下一步。学习状态由代理在检查点处保存，自动转录由扩展事件保存，两者有各自的职责。

开始课程或新聊天续学时，`curriculum` 自动调用扩展提供的 `curriculum_transcript` 工具，讲解、公式、代码和问答随事件保存到 **`curricula/<course-id>/transcripts/archive.md`**。无需用户事先调用 `md-log`，也无需每次结束时提醒保存。`transcripts/state.json` 只保存转录身份及阅读文档绑定。新聊天由 skill 重新定位、绑定课程，扩展不会猜选最近修改的课程。

用户可以随时把完整讲课资料同步到自己使用的已有文档：

```text
/md-log "E:/Notes/强化学习.md"
/md-unlog
```

`md-log` 从**整门课程的自动转录**回填，包含之前没调用过插件的会话。链接之后仍先保存课程原本，再更新用户文档；以后新会话绑定同一课程时自动恢复这个同步目标。`md-unlog` 只解除外部同步，课程原本继续记录，再次链接即可补齐解除期间的内容。换一个目标会将全部原本同步到新文档。

目标须为课程存储目录之外的已有 `.md` 文件。扩展只更新该课程带标记的转录区域，保留用户在区域外的笔记；重复链接不会重复插入历史。若生成区域被手工修改，报告冲突并保留文件。外部目标不可写时，课程原本仍保存，并在后续事件、会话恢复或重新链接时重试。一般相对链接及可定位的 `viz/` 图片转换为文件 URL，资源仍需可访问；公式和代码保留。

先调用 `md-log` 再绑定课程时，课程同步会合并已被课程原本完整覆盖、内容哈希有效的通用会话阅读区域，避免文档末尾留下停止更新的重复副本。包含额外内容或个人修改的区域继续保留，通用会话原本也保留。

教材引用用标准 Markdown 脚注，让正文专注讲解。脚注定义包含可读 PDF 链接及 `textbook-ref:v1` 隐藏 JSON，保存文件 SHA-256、绝对 URI、PDF 物理页码及已核实的图号／短引文。配套的 [Foresight](obsidian-plugin/README.md) 将其显示为注解标签，点击即可在 Obsidian 中打开来源页，并在文本层可匹配时高亮原文。`md-log` 按事件为脚注加命名空间，避免多会话重名；旧转录保持原样。完整语法与解析约定见 [教材引用与注解协议](skills/curriculum/references/citations.md)。插件的构建、安装和扩展结构见其 README。

引用旧讲解、quiz 问答与学习者代码时，正文先补足必要背景，用 `[^history-1]` 和 `history-ref:v1` 绑定真实转录 UUID 与事件 ID，不再把 U001／D01 当作讲解出处。`curriculum_history` 在已绑定的课程内查找原记录，返回可核对的题目与已呈现回答。Foresight 的 **回顾·内容名** 使用独立标签和 Markdown 弹层：鼠标悬停查看被引内容，点击在当前阅读副本或原本中精确定位事件／短引文。历史与教材注解可分别开关；原始历史文档保留，规则从新输出生效。完整约定见 [历史学习引用协议](skills/curriculum/references/history-references.md)。

每门课程遵循单会话写入约定；不支持多个进程同时写同一课程或阅读文档。升级后的自动保存从成功绑定开始，已丢失的旧原话无法由进度摘要还原；保留的旧 pi 会话可以显式导入。强制终止前尚未完成的流式消息也可能缺失。详细数据流、历史导入及故障恢复见 [自动转录与同步设计](skills/curriculum/references/transcription.md)。更新扩展后，在 pi 中执行 `/reload`，下一次课程学习会自动绑定。

## 通用教学（teach）

没有子代理实现也能运行：主会话直接承担教学，只是失去 researcher（事实核查）与自动生成的示意图。
