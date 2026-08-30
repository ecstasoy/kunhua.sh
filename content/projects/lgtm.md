---
name: LGTM
summary: 自动审查 GitHub PR 的助手，已部署上线，可注册为 GitHub App 。除 diff 外还会读取 CI 状态与仓库自身的约定文档，已实现仓库级RAG。
stack: Go · Gin · Next.js · SQLite/Postgres · Redis · SSE
code: https://github.com/ecstasoy/LGTM
live: https://lgtm-alpha.vercel.app
order: 1
---

- **上下文构建**：只把 diff 交给模型会得到脱离项目背景的评论，为此在审查前先拉取 PR 元数据、CI 状态与仓库自身的约定文档，一并作为上下文
- **三阶段流水线**：单次调用产出的长文本难以定位与复用，为此拆成变更摘要、风险清单、修改建议三个阶段，每阶段可指定不同模型、可单独重试，输出为结构化数据并锚定到具体文件行
- **流式返回**：完整审查耗时较长，前端空等体验差，为此自建 SSE 协议，摘要逐段推送，风险与建议在各自阶段完成时整体更新
- **GitHub App 集成**：以 OAuth 登录，webhook 在新 PR 或 push 时自动触发审查，结果作为行内建议回写到 PR
- **缓存与幂等**：同一 PR 重复触发会造成无谓的模型调用，为此以 SQLite/Postgres 持久化配 Redis 缓存，并对 webhook 做幂等处理
- **国际化**：界面语言与模型输出语言需一致，为此自建 locale 层同时驱动两者；PR 评论固定英文，保证仓库维护者只读一种语言
- **部署**：前端部署在 Vercel，Go 后端容器化跑在 Fly.io，持久层可在 SQLite 与 Postgres 间切换
