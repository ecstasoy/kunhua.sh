---
name: LGTM
summary: 自动审查 GitHub PR 的助手，线上可用。它组装的不只是 diff，还有 CI 状态和仓库自己的约定文档。
stack: Go · Gin · Next.js · SQLite/Postgres · Redis · SSE
code: https://github.com/ecstasoy/PR-Review-Assistant
live: https://lgtm-alpha.vercel.app
order: 1
---

- 拉取一个 PR 的元数据、diff、CI 状态与仓库约定文档，分三阶段调用 LLM 产出变更摘要、风险清单、以及**锚定到具体文件行**的修改建议，并可回写到 PR
- 每个阶段可以选用不同模型；输出是结构化的，不是一整块文本。自建 SSE 协议让摘要边生成边出现，风险和建议在各自阶段完成时更新
- GitHub App：OAuth 登录，webhook 在新 PR 或 push 时自动审查；SQLite/Postgres 持久化配 Redis 缓存避免重复审查，webhook 做幂等
- 端到端国际化：一套自建的 locale 层同时驱动界面文案和模型输出的语言，但 PR 评论固定用英文，让维护者只读一种语言
- 后端 15,300 行 Go、102 个文件；前端 Vercel、Go 后端 Fly.io 容器化部署

## 诚实的边界

个人项目，alpha 阶段。审查质量取决于 prompt 和模型，会产生误报，主要在我自己的仓库上验证过。不是生产级 SaaS。
