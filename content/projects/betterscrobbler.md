---
name: BetterScrobbler
summary: 运行于 macOS 的 Last.fm scrobbler，可记录任何来源的播放。
stack: C++17 · Objective-C++ · Go · CGo · macOS MediaRemote
code: https://github.com/ecstasoy/BetterScrobblerGo
order: 2
---

- **系统级采集**：macOS 没有可靠的系统级 scrobbler，Apple Music 不内置、旧插件方案已废弃，为此直接读取系统的 now-playing 状态，使 Spotify、Apple Music、YouTube 与浏览器中的播放都能记录，再通过可配置的解析规则跳过非音乐内容
- **私有框架调用**：now-playing 状态只能从 Apple 未公开的 MediaRemote 框架取得。C++ 版在 Objective-C++ 中自行声明其私有接口，CMake 以 `-F/System/Library/PrivateFrameworks` 链接；Go 版则通过 CGo 桥接，需在 C 边界两侧做类型编组
- **计分判定**：并非每次播放都应计入，为此将引擎拆成 stream、track、scrobble 三个 manager 加一个 timer，由 timer 依 Last.fm 的规则判定一次 scrobble 何时成立
- **兜底来源**：MediaRemote 覆盖不到的播放源以 AppleScript 与浏览器音频检测补齐
- **请求签名**：Last.fm 要求对请求签名，为此手写实现——参数排序后拼接 secret 取 md5
- **凭据存储**：认证信息存入 macOS Keychain
- **终端界面**：以 Bubble Tea 实现终端 UI，带 LRC 同步歌词滚动，并支持后台守护进程模式
