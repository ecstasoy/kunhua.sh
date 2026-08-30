---
name: Gorder
summary: Go 微服务订单系统。真正花时间的是异步调用之间的链路追踪丢失。
stack: Go · gRPC · RabbitMQ · Kubernetes
code: https://github.com/ecstasoy/gorder
order: 3
---

- 把一个电商订单平台拆成四个服务（Order、Payment、Stock、Kitchen），DDD / 六边形架构，服务间走 gRPC 与 RabbitMQ 事件
- 用 OpenTelemetry 和 Jaeger 做跨服务分布式追踪。**异步调用会丢链路**，解法是把 trace context 通过 RabbitMQ 的消息头传递下去
- Prometheus / Grafana 采集接口延迟与调用量，Consul 做服务健康检查
