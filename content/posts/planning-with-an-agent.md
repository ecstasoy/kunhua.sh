---
title: 一次尝试：从零开始，用AI Native的方式搭建个人网站
published: 2026-08-30T07:50:00-04:00
excerpt: A\我要把你狠狠管起来🥵
---
搭个人网站的想法耽搁很久了，主要也不是为了门面，我感觉自己还是缺乏一些在真实环境打滚的经验。造一个能折磨我的地方是最直接的办法。问题是我是一个没什么规划的人，所以把骨架搭好之后就开始和 A\ 对线。

## 利用 Skills 进行前期规划

| Skills                    | What to do                                          | 产出                     |
| ------------------------- | --------------------------------------------------- | ---------------------- |
| /init                     | 分析仓库生成 CLAUDE.md。此时基本是空仓库，手动创建也成，现有的 Codebase 才比较需要 | CLAUDE.md              |
| superpowers:brainstorming | 我先说明意图，A\ 开始拷打我的想法，强迫我结构化思考整个项目的构型                  | docs/superpowers/specs |
| /grill-me                 | 拿 spec 过一遍                                          | 直接改回 spec              |
| /to-spec                  | 通过 user story 的形式，把前面环节的想法发布成 issue                 | issue #1               |
| /to-tickets               | 按照 spec 把项目按照能够独立交付的各个环节切分成七个阶段，每个阶段又能拆分成  issues   | 其他各个 issue             |

实际上我感觉 superpowers 不是必须的，毕竟比较浪费 tokens。我用它不是因为没有想法，而是因为想法太多太杂乱所以需要一个排序的机制。

## 技术栈

### 服务器

- **Vultr 东京**：两个半球的路由集中一下
- **Debian 13**：我喜欢
- **Caddy 2.11.4**：主要还是为了证书自动申请和续期
- **ufw + unattended-upgrades**，以及两个 Linux 身份：`deploy` 有 sudo 用来管机器，`ci` 没有 sudo 只负责发布

### 前端

- **Next.js 16.3.3**，静态导出`output: 'export'`
- **React 19.2 / TypeScript 7**
- **unified**：gray-matter + remark-parse / remark-gfm / remark-rehype / rehype-stringify
- **原生 CSS + IBM Plex / Noto Serif / Sans SC**

### 后端服务

目前是后面的计划：

- **Go**：我真的很喜欢 Go 啊！后期可以用来实现一些服务
- **SQLite** + modernc.org/sqlite ：纯 Go 驱动
- **log/slog**：结构化日志
- **Docker + Docker compose**，**distroless + GHCR**
- **Last.fm API + asciinema**：计划中
- and more：我想做很多东西……

### CI/CD

- **GitHub Actions**，按路径过滤
- **rsync over SSH**，发到 `releases/<sha>/` 
- **node --test + linkinator**，放在 `check` 脚本