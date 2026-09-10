---
schema_version: 1
course_id: "{{course_id}}"
route_revision: {{route_revision}}
checkpoint_id: "{{checkpoint_id}}"
parent_checkpoint_id: null
session_journal: "sessions/{{session_id}}.md"
updated_at: "{{utc_timestamp}}"
current_unit: null
current_step: null
---

# {{教材名称}} · 当前进度

## 从这里继续

- 当前阶段：{{建课／诊断／讲解／练习／检查／暂停}}
- 已建立的前提与最后一步结果：{{具体内容；没有时明确写无}}
- 未完成产物：{{实际文件相对链接及未完成部分；没有时写无}}
- 待回答问题：{{完整题干、输入条件、是否已回答；没有时写无。不写答案键。}}
- 下一步动作：{{可直接执行的一个动作，含单元／步骤 ID}}
- 本次／默认时间：{{用户指定值，否则默认 15 分钟}}

## 单元状态与证据

未列出的单元默认为 not_started。状态只用 not_started、in_progress、completed、needs_review、skipped。

| 单元 ID | 状态 | 达到／未达到的验收条件 | 实际证据链接与摘要 | 最近检查／跳过原因 |
| --- | --- | --- | --- | --- |

## 先修与误区

| 能力／先修项 | 已知证据或 unknown | 当前缺口／错误模型 | 影响单元 | 下一项补救或检查 |
| --- | --- | --- | --- | --- |

## 进度读数

- 必修模块：{{已满足全部模块验收条件的数量}} / {{全部必修模块数量}}。
- 已展开的有效单元：{{完成数量}} / {{展开数量}}；待复习 {{数量}}，跳过 {{数量}}。
- 尚未展开／尚未审查：{{模块范围；不把展开单元比例作为全书完成率}}
