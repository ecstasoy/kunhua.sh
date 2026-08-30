---
name: "Gorder"
summary: "A demo-grade order system in Go, split across four services, covering the path from placing an order to fulfilling it."
---

- **Service boundaries and transport**: the order flow spans ordering, stock, payment and fulfilment, so it is split into four services that talk over gRPC where a response is needed immediately and over RabbitMQ events where it is not
- **Stock contention and flash sales**: overselling is prevented by a reservation table and a compare-and-swap inside a MySQL transaction. The flash-sale path adds a Redis Lua script that validates, enforces one order per person, and decrements atomically at the entrance, so the real stock is written asynchronously after the spike and the database sees less contention
- **Payment timeouts**: polling for unpaid orders is expensive and slow to react, so orders expire through a RabbitMQ TTL and dead-letter queue; the order service consumes that event, reverses the order's state and returns the stock
- **Order state**: a wrong transition loses money or leaks stock, so transitions are defined as rules and validated inside the service, with refunds and stock returns triggered through events. Orders live in MongoDB, written atomically through a MongoDB session and transaction so a state cannot be skipped
- **Distributed tracing**: once several services were deployed, logs were scattered and a full call path could not be reconstructed. OpenTelemetry and Jaeger provide the tracing; trace context does not propagate across asynchronous calls on its own, so it is carried in RabbitMQ message headers
- **Operations**: Consul for service registration and health checking, Prometheus and Grafana for endpoint latency and call counts, which is how slow requests get located
