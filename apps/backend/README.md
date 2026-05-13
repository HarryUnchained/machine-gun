# Backend (`apps/backend`)

The core engine for Machine Gun. It handles schema persistence, data generation, transport publishing, and real-time flow orchestration.

## Responsibilities

- Manages built-in and dynamic schemas/flows (under `src/library/`).
- Payload generation via **Piscina** worker threads (100k+ msg/s).
- RabbitMQ and Kafka publishing with drift correction.
- Automatic RabbitMQ infrastructure setup (queues/exchanges).
- WebSocket-based control and telemetry for the UI.

## Security

The backend is hardened with a multi-layered security approach:

- **AuthGuard**: Protects all HTTP endpoints. It requires an industry-standard `Authorization: Bearer <token>` header.
- **WebSocket Auth**: Every real-time connection must provide a valid `token` during the initial handshake.
- **Helmet**: Integrated `@fastify/helmet` to enforce security headers (HSTS, CSP, XSS protection).
- **Strict CORS**: Restricted to allowed origins (defined via `FRONTEND_URL`).
- **ValidationPipe**: Global sanitization for all incoming DTOs to prevent injection and unexpected payloads.

## Runtime Interfaces

### HTTP
- `GET /info` — process/runtime/infrastructure summary + schema/custom-data counts.
- `GET /health/liveness` — process liveness checks (memory-focused).
- `GET /health/readiness` — readiness checks for RabbitMQ, optional Kafka, and memory.

### WebSocket (Socket.IO)
- Schema CRUD + refresh
- Start/stop continuous tests
- Burst test execution
- Custom template/module CRUD
- Flow save/start/stop/delete
- Live events: status updates, flow node status, loaded schemas/flows/custom data
- Broker target notifications when a missing RabbitMQ exchange or queue is created automatically

## Configuration

Primary environment variables are read from `.env`:
- `RABBIT` (required for transport publishing)
- `KAFKA` (optional)
- Other broker routing/runtime values in `.env.example`

## Execution Logic

The backend uses a specialized orchestration system to handle high-velocity generation and complex simulation flows.

### High-Velocity Generation (Piscina)
Generating 100k+ messages per second from nested schemas is CPU-intensive. To prevent blocking the main NestJS event loop (which would drop WebSocket connections), we offload generation to a **Piscina** worker pool.
- **Main Thread**: Handles Socket.IO control, telemetry, and broker connections.
- **Worker Threads**: Execute the `generator.worker.ts` logic to produce raw payload chunks.

### Flow Orchestration
The **FlowEngineService** manages graph-based simulations.
- **Entry Nodes**: Logic starts here based on a defined frequency or manual trigger.
- **Edges**: Nodes trigger downstream neighbors using mathematical expressions (via `mathjs`), allowing for conditional logic (e.g., `parent.status == 'success'`).
- **Bindings**: Downstream nodes can "bind" to values from their parent's payload, enabling realistic stateful simulations.

## Development

From repo root:
```bash
pnpm --filter backend dev
```

Or from this directory:
```bash
pnpm start:dev
```

## Build & Test

From repo root:
```bash
pnpm --filter backend build
pnpm --filter backend test
pnpm --filter backend test:e2e
```

## Notes

- Uses shared contracts from `@machine-gun/common`.
- RabbitMQ integration uses `@golevelup/nestjs-rabbitmq` with custom channel pooling for performance.
- Dynamic data is persisted in `data/` to keep the runtime stateless.
