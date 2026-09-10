---
schema_version: 1
course_id: "{{course_id}}"
session_id: "{{session_id}}"
started_at: "{{utc_timestamp}}"
---

# {{日期}} · 学习记录

保存观察与检查点，不作为当前状态面板，也不与 md-log 关联。每个检查点追加以下结构，填写后保留完整的首尾标记。

<!-- checkpoint:{{checkpoint_id}}:begin -->
## 检查点 {{checkpoint_id}}

- 父检查点：{{parent_checkpoint_id 或 null}}
- 时间：{{utc_timestamp}}
- 事件：{{待回答／已作答／步骤完成／暂停／路线调整}}
- 观察与证据：{{实际回答、错误与修正、产物链接；尚未回答时明确写出}}
- 评估依据：{{对应验收条件；待回答时不填写答案}}
- 路线变更：{{没有时写无；否则关联路线修订}}

### 待提升为当前状态的完整快照

````markdown
{{完整的 progress.md，包括 YAML；checkpoint_id、父 ID 和证据应与本条记录一致。}}
````
<!-- checkpoint:{{checkpoint_id}}:end -->
