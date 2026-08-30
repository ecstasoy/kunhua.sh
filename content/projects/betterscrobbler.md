---
name: BetterScrobbler
summary: macOS 上的 Last.fm scrobbler，能记录任何来源的播放，不限于音乐 App。这个站上「正在听」的数据就是它上传的。
stack: Go · CGo · macOS MediaRemote · Bubble Tea
code: https://github.com/ecstasoy/BetterScrobblerGo
order: 4
---

- macOS 没有可靠的系统级 scrobbler——Apple Music 不内置，插件方案已废弃。这个程序直接读操作系统的 now-playing 状态，因此 Spotify、Apple Music、YouTube、浏览器里的播放都能记录，再用解析规则跳过非音乐内容
- 通过 CGo 桥接到 Apple 的**私有 MediaRemote 框架**，从 Go 调用未公开的系统 API 并跨 C 边界做类型编组；MediaRemote 覆盖不到的来源用 AppleScript 与浏览器检测兜底
- 引擎解耦成 stream / track / scrobble 三个 manager 加一个 timer，由后者判定一次播放何时才算数（Last.fm 的 50% 或 4 分钟规则）；支持后台守护进程模式
- Last.fm 凭据存在 macOS Keychain 里，不落盘；Bubble Tea 终端界面带同步歌词滚动
- 46 个 Go 文件、10 个测试文件

## 诚实的边界

单平台的个人 CLI 工具。macOS 15.4 之后 Apple 限制了用户程序访问 MediaRemote，这是一个真实的系统级限制。
