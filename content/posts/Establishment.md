---
title: 一次尝试：从零开始，用AI Native的方式搭建个人网站
published: 2026-08-30T18:00:00-04:00
excerpt: A\我要把你狠狠管起来🥵
---
个人网站耽搁很久了。想搭它主要不是为了门面——我缺的是在真实环境里打滚的经验，那种经验看书换不来。造一个能折磨我的实验场，是最直接的办法。

问题是我一列清单就停不下来。我并不是一个有计划的人，把骨架搭好之后，就开始跟 A\ 对线。

## 利用 Skills 进行前期规划

| Skills                    | What to do                                                                   | 产出                     |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------- |
| /init                     | 分析仓库生成 CLAUDE.md。此时基本是空仓库，手动创建也成，现有的 Codebase 才比较需要                          | CLAUDE.md              |
| superpowers:brainstorming | 我先说明意图，A\ 开始拷打我的想法，强迫我结构化思考整个项目的构型。视觉上它在本地起了个浏览器服务，做了四轮样张让我比对                | docs/superpowers/specs |
| superpowers:writing-plans | 把 spec 拆成 9 个带验收命令的任务                                                        | docs/superpowers/plans |
| /grill-me                 | 拿 spec 再压一遍。它不是复查，是反向修正——砍掉了首页的 commit 计数器、把备份提前、废掉了「最后三周留给展示层」那条排期          | 直接改回 spec              |
| /setup-matt-pocock-skills | 上一步 /to-spec 跑失败了，因为缺 issue tracker 的配置。这一步补上                                | docs/agents            |
| /to-spec                  | 通过 user story 的形式，把前面环节的想法发布成 issue                                          | issue #1               |
| /to-tickets               | 读 spec 重新切一遍。plan 里那 9 个任务是按层切的（先基础设施、再内容、再 CI），而它要的是每片都能独立交付的纵切面，所以重划成了 7 个 | issue #2–#8            |

有意思的是 `/to-spec` 第一次是失败的——技能之间有隐式依赖，而它的报错直接把我指向了该跑的下一步。

实际上我感觉 superpowers 不是必须的，毕竟比较浪费 tokens。我用它不是因为没有想法——功能我一口气选了四个——而是因为想法太多而我没有排序的机制。它做的事情是砍：把那四个拆成有先后的阶段，其中一个直接标成「永不做」。

## 技术栈

### 服务器

- **Vultr 东京**：不是为了平衡全球流量，是在美国和中国大陆之间取折中——欧美机房到大陆的路由太差。开机后我先从大陆侧测了一遍这个 IP 的路由，按小时计费，不合格就销毁重开，这一步几乎不要钱
- **Debian 13**：我喜欢
- **Caddy 2.11.4**：选它的决定性理由是证书自动申请和续期。同样的事情用 nginx 要配 certbot、cron、renew hook，是一整块需要长期维护的东西，而 Caddy 这块是零
- **ufw + unattended-upgrades**，以及两个 Linux 身份：`deploy` 有 sudo 用来管机器，`ci` 没有 sudo 只负责发布。发布这条路径本来就不需要 root，所以 CI 密钥泄露的后果止于站点文件被改，而不是整台机器

### 前端

- **Next.js 16.3.3**，静态导出（`output: 'export'`）。这不是「前期先这样」，是刻意的长期选择：展示层是一堆静态文件，没有「挂掉」这个状态。等我后面把 Go 服务写崩、把数据库锁死、把定时任务跑爆内存的时候，首页、文章、项目页照常
- **React 19.2 / TypeScript 7**
- **unified**：gray-matter + remark-parse / remark-gfm / remark-rehype / rehype-stringify
- **原生 CSS + IBM Plex / Noto Serif / Sans SC**。没有 Tailwind

### 后端服务（还没开工）

这一整节目前一行代码都没有，是下一阶段的计划。

- **Go**：我真的很喜欢 Go 啊！后期可以用来实现一些有趣的服务
- **SQLite + modernc.org/sqlite**：纯 Go 驱动，不需要 CGO，能编出静态二进制
- **log/slog**：结构化日志，标准库就够
- **Docker + Docker compose**，**distroless + GHCR**
- **Last.fm API + asciinema**：计划中的功能
- and more：我想做很多东西……而上面那一节刚讲完规划的动作是砍，所以这句得算个自嘲

### CI/CD

- **GitHub Actions**，按路径过滤——改一篇文章不该重启一个连着数据库的服务
- **rsync over SSH**，发到 `releases/<sha>/` 再原子切换软链。回滚是一秒钟的事，不用重新构建
- **node --test + linkinator**，收在一个 `check` 脚本里。本地和 CI 跑的是**同一个文件**，不是两份差不多的命令

## 更能说明问题的是没选的那些

选什么其实说明不了什么，排除掉什么才说明想过：

- **nginx**：见上，Caddy 的自动证书省掉一整套 certbot 维护
- **Terraform**：一台机器上用它是负收益
- **Tailwind**：这个站的视觉方向明确要避开模板感，而 Tailwind 的默认圆角、阴影和配色恰恰是那种观感的来源
- **ORM**：会写 SQL 比会调库更能说明问题
- **MongoDB**：我的数据本来就是关系型的，而无 schema 在单人项目里是负债——三个月后我自己都不记得某个 collection 里有哪些字段
- **Prometheus + Grafana**：个人站最经典的过度工程，花两周搭一套之后再也不看的仪表盘
- **JWT**：单用户，没有分布式验证的需求

服务器上最终只会有两个进程：Caddy 和 Go。没有 Node、没有数据库服务、没有容器编排。上面每一条「不用什么」，基本都能追溯到这个约束。
