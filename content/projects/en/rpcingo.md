---
name: "RPCinGo"
summary: "A demo-grade RPC framework over TCP, with service discovery, load balancing and connection reuse."
---

- **Protocol and codecs**: a custom binary protocol with a fixed-length header and a variable body, switchable between ***JSON*** and ***Protobuf*** to keep serialization cheap
- **Multiplexing and pooling**: opening a connection per call adds latency jitter under load, so concurrent requests share one ***TCP*** connection keyed by request ID — which also means responses returning out of order still route correctly — and idle connections are pooled to remove the handshake from every call
- **Finding the bottleneck**: at 32 concurrent clients, throughput went from 25K to 74K QPS and p99 from 6.7ms to 2.0ms. The cost was disk I/O from logging on the hot path, 1.9 million lines in a single run, alongside moving serialization from ***JSON*** to ***Protobuf***. Separately, several goroutines writing one connection interleaved frames and corrupted them; a single writer goroutine now serializes outbound frames
- **Failure and rate control**: retrying into a failing dependency exhausts resources and cascades, so a sliding-window circuit breaker rejects requests once the error rate crosses a threshold, with token-bucket and sliding-window rate limiters alongside it
- **Discovery and balancing**: clients need to see nodes appear and disappear as services scale, so the client watches ***etcd*** for the service list and implements several balancing strategies over it
- **Interceptors and observability**: interceptor chains on both the client and server sides, carrying Recovery, Logging, ***Prometheus*** metrics, Retry, and ***OpenTelemetry*** tracing
