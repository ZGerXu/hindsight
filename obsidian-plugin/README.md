# Foresight

Foresight 是 Hindsight AI 学习框架的 Obsidian 配套插件。教材引用显示为原书注解，在原生 PDF 阅读器中定位来源页和高亮原文；历史学习引用使用独立的回顾标签和 Markdown 弹层，预览、定位旧讲解、quiz 问答和学习者代码。

## 使用

1. 在 Obsidian 社区插件中启用 **Foresight**。
2. 打开课程转录 `curricula/<course-id>/transcripts/archive.md` 或同步后的阅读笔记，使用阅读视图或实时预览。
3. 点击 **原书 + 引用名称** 标签，默认在旁边打开教材；继续点击引用会复用原书窗格。
4. 鼠标悬停可查看物理页、印刷页、图号或短引文。右键选择 **查看引用详情** 或 **绑定教材 PDF**；Ctrl / Cmd + 点击使用新标签页。
5. 实时预览中，将光标放到标记所在行即可编辑原始 Markdown；源码模式始终保留原始标记。

命令面板提供 **Foresight: 检查当前笔记的教材引用**。插件设置可开关教材注解、选择是否并排打开原书，以及解除教材绑定。

**历史学习回顾**：在阅读视图或实时预览中，鼠标悬停 **回顾·内容名** 虚线标签，直接查看所引用的原讲解，或 quiz 的题目、实际回答与解析，公式与代码按 Markdown 渲染。弹层中每条记录的 **前往这段记录** 按钮可分别定位题目或回答；点击标签定位第一个事件，提供 `quote` 时选中对应原文。Ctrl / Cmd + 点击使用新标签页，普通点击复用对应笔记窗格。源码模式和光标所在标记行保留可编辑的原始脚注。

历史标签使用自己的 `history` 图标、虚线样式、`HistoryUI` 与原生 `HoverPopover` 弹层，不复用教材按钮、教材 tooltip、详情 Modal 或 PDF 导航。设置中的 **显示学习回顾** 与教材开关互相独立。

PDF 必须位于当前 vault 中。引用中的原书位置失效时，插件按 SHA-256 在 vault 中查找同版本 PDF；也可用右键菜单绑定移动后的教材，绑定前仍会校验指纹。不会通过相似书名替换版本。

## 引用与定位约定

遵循 [教材引用协议 v1](../skills/curriculum/references/citations.md)：正文 `[^book-…]` 对应标准脚注定义，定义包含可读 PDF 链接及 `<!-- textbook-ref:v1 {...} -->`。AST 解析支持正文、嵌套 blockquote / callout、局部 ID 与转录的事件 SHA-256 ID，跳过代码和注释中的示例。

当前真实转录中存在历史 `[注N]` 写法。插件只将附有有效协议数据的定义与同一 `md-log:event` 内的标记关联，因此多条消息复用 `[注1]` 时不会跨消息串联。原始课程转录和同步笔记不会被改写。

历史学习引用遵循独立的 [历史学习引用协议 v1](../skills/curriculum/references/history-references.md)：`[^history-…]` 定义包含可读转录链接及 `<!-- history-ref:v1 {...} -->`，通过 `archive_id` 与 `event_ids` 关联真实原记录，可选 `quote` 为已核对的连续 Markdown 原文。模型先用 `curriculum_history` 获取这些数据，md-log 再为局部脚注加事件命名空间。单元／诊断编号不是可跳转目标。

优先解析当前笔记中的同课程记录，因此原本同步到 Notebook 或另一阅读副本后仍能就地跳转。当前笔记没有所选事件时读取 vault 中的原本，验证 UUID、事件顺序、事件存在性与原文锚点；原本 URI 失效时按 UUID 查找，多份候选不猜选。UUID 不匹配、记录缺失或原文变化会显示明确提示并停止跳转；不使用旧行号或相似标题兜底。每次点击重新读取当前内容，前插文字不会破坏定位。

无插件时历史引用仍显示普通脚注及转录文件链接，`#mdlog-…` 的精确事件导航由 Foresight 提供。旧转录中的自然语言编号不会被自动替换；迁移需逐条核对原依据，也不能直接改写带内容哈希的同步区域。

未知协议版本、格式错误、缺字段、无效页码或链接/元数据不一致的引用保持原始显示。普通个人脚注保持原有行为。

`pdf_page` 始终表示从封面起算的物理页；`printed_page` 只用于显示。插件首先核对文件指纹，再打开页级目标；`quote` 优先于 `locator`，匹配成功时使用 PDF 文本项的真实索引与字符偏移生成 Obsidian `selection` 定位。PDF 的换行、断词和常见连字会被归一化用于匹配。范围引用从起始页逐页寻找锚点。

没有锚点时只定位页面。文本层不可用或匹配失败时，保留页级跳转并明确提示，不能保证图像 PDF 的句子高亮。PDF.js 文档的取得依赖 Obsidian 阅读器内部接口，集中封装在适配文件中；接口不兼容时仍可使用原生页链接。

## 目录与扩展边界

```text
obsidian-plugin/
  src/
    main.ts                     # 插件入口、共享服务组装、命令
    settings-tab.ts             # 插件设置入口
    core/
      feature.ts                # 功能获取的显式上下文
      settings.ts               # 按功能分组的设置
      pdf/
        types.ts                # 通用 PDF 来源和定位数据
        source-resolver.ts      # 文件解析、指纹校验、缓存
        navigator.ts            # 窗格管理、页与文本目标跳转
        text-anchor.ts          # 不依赖 Obsidian 的文本匹配
        obsidian-pdf-adapter.ts  # 内部 PDF 接口兼容边界
    features/
      textbook-references/
        index.ts                # 功能注册与 Component 生命周期
        model.ts                # 引用数据模型
        parser.ts               # Markdown AST 与协议校验
        document-store.ts       # 有界文档解析缓存
        reading-view.ts         # 阅读视图与 callout 后处理
        live-preview.ts         # CodeMirror 实时预览组件
        ui.ts                   # 标签、详情与教材绑定
      history-references/
        index.ts                # 独立功能注册与生命周期
        parser.ts               # 历史脚注、转录事件与协议校验
        source.ts               # 当前副本／原本解析与 UUID 核对
        reading-view.ts         # 阅读视图与 callout 标签
        live-preview.ts         # 独立 CodeMirror 回顾组件
        ui.ts                   # 回顾弹层、Markdown 渲染与事件跳转
  scripts/                      # 构建、安装、真实应用测试
  dist/                         # 可安装产物，生成且不提交
  test-results/                 # 真实应用报告与截图，生成且不提交
```

新增课程导航、学习状态或其他功能时，在 `features/<feature-name>/` 增加自己的 `Component`，在入口显式装配；需要打开原文时复用 `core/pdf`。通用核心不导入具体功能。功能通过上下文获得 Obsidian 插件、设置和 PDF 服务，注册事件、渲染处理器与编辑器扩展；缓存和异步导航在卸载时清理。当前没有引入动态模块发现、事件总线或依赖注入容器。

## 构建与安装

需要 Node.js 22 或更高版本。

```powershell
cd E:\ZGerx\Tutorials\RL_Hands-On\.pi\obsidian-plugin
npm ci
npm run typecheck
npm run build
npm run install:local
```

默认安装到源码所在项目的 `<vault>/.obsidian/plugins/foresight/`，只复制 `main.js`、`manifest.json` 和 `styles.css`，保留已有设置。也可传入明确 vault：

```powershell
npm run install:local -- "E:\Notes\MyVault"
```

在 Obsidian 中启用插件；开发更新后重新加载插件。`npm run dev` 监视 TypeScript 构建，CSS 或 manifest 更新后执行完整 build/install。

## 验证

真实应用测试需要正在运行且窗口可见的 Obsidian 和已启用的插件，并临时启用 Obsidian 官方 CLI：

```powershell
npm run test:obsidian
```

脚本读取真实 `archive.md`，在应用中点击标签并核对 PDF.js 文本高亮，生成截图和 JSON 报告；它还创建一份专用临时笔记检查边界场景，并在结束时删除该笔记。通过前后 SHA-256 核对真实课程转录未被修改。CLI 路径和 vault 名称可分别用 `OBSIDIAN_CLI`、`OBSIDIAN_VAULT` 指定。

需要 Pi Agent 验证时按项目要求使用 `glm-5.3`，运行类型检查和真实应用测试后读取 JSON 报告，核对检查结果与原始转录的 SHA-256。不要使用 `--no-extensions`，该选项同时禁用 Pi 的内建工具扩展。

历史引用的完整验收：

```powershell
npm run test:history
npm run test:history:pi
npm run test:history:obsidian
```

第一步验证协议、事件边界、quiz 配对、命名空间、重放与镜像同步；第二步用 Pi Agent 的 `zai-coding-cn/glm-5.3` 和真实 md-log 扩展在隔离的课程副本里生成引用；第三步用官方 CLI/CDP 在运行中的 Obsidian 内实际移动鼠标、点击标签，检查问答／公式／代码弹层、阅读与实时预览、同文件及跨文件定位、短引文选择、源码可编辑、开关、卸载与原本移动。Windows 窗口被遮挡导致渲染暂停时，测试临时启用 CDP 焦点模拟，结束后关闭。脚本清理临时笔记并恢复原窗格与功能设置，前后核对真实 `Notebook.md` 和 `archive.md` 的哈希。报告与截图保存在 `test-results/`，不提交到仓库。

Pi 验收脚本使用用户目录下的托管 Pi launcher；两个真实应用脚本都需要项目的实际课程转录、正在运行的 Obsidian 与官方 CLI。它们不是浏览器 mock 测试。

实现依据：[Obsidian Markdown 后处理](https://docs.obsidian.md/Plugins/Editor/Markdown+post+processing)、[编辑器扩展](https://docs.obsidian.md/Plugins/Editor/Editor+extensions)、[官方 CLI](https://help.obsidian.md/cli)。
