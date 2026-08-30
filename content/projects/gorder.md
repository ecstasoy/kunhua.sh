---
name: Gorder
summary: 基于 Go 的 demo 级订单系统，将逻辑拆分为四个服务，支持从下单到履约的完整流程。
stack: Go · gRPC · RabbitMQ · MySQL · MongoDB · Redis
code: https://github.com/ecstasoy/gorder
order: 4
---

- **服务拆分与通信设计**：订单流程横跨下单、库存、支付、处理订单多个业务域，为此拆分为四个服务，按实时性选择 gRPC 同步或 RabbitMQ 异步通信
- **库存并发与秒杀**：订单统一通过 MySQL 事务内的库存预留表和 CAS 防止超卖；秒杀入口额外使用 Redis Lua 原子脚本进行校验、一人一单与预扣，入口削峰后异步落真实库存，减少数据库热点竞争
- **支付超时取消**：用户下单后若长期未支付，轮询检测成本高且实时性差，为此基于 RabbitMQ TTL + 死信队列实现订单超时自动取消，订单服务消费该事件后撤销订单状态并回补库存
- **订单状态控制**：状态流转错误会引发资金损失或库存泄漏，为此设计订单状态流转规则，在服务内部实现状态校验，并通过事件机制触发退款与库存回补。订单存储使用 MongoDB，通过 MongoDB Session + 事务原子执行，防止状态跳跃
- **链路追踪落地**：多服务部署后日志分散、难以还原完整调用路径，为此接入 OpenTelemetry + Jaeger 实现跨服务链路追踪；通过自定义 MQ header 解决异步调用 trace 丢失问题
- **服务治理与监控**：使用 Consul 实现服务注册与健康检查，Prometheus + Grafana 采集接口耗时与调用次数，定位慢请求问题
