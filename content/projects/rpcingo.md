---
name: RPCinGo
summary: 从零实现的 RPC 框架。压测下把吞吐提高约三倍，而且说得清是怎么定位到瓶颈的。
stack: Go · TCP · etcd · Protobuf
code: https://github.com/ecstasoy/RPCinGo
order: 2
---

- 设计 20 字节定长头的二进制协议，JSON / Protobuf 编解码可切换；用请求 ID 在单条 TCP 连接上多路复用并发请求，配连接池复用
- 32 并发压测下吞吐提升约 3 倍（25K → 74K QPS，p99 从 6.7ms 降到 2.0ms）：定位到热路径日志造成的磁盘 I/O（单次运行 190 万行），并把 JSON 换成 Protobuf；另外用一个串行写协程修掉了帧交错导致的数据损坏
- 三态熔断器、令牌桶与滑动窗口限流、etcd Watch 服务发现与负载均衡、双向拦截器链（Recovery / Logging / Metrics / Retry / Tracing）
