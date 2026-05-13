# Common Package (`packages/common`)

Shared TypeScript contracts and utilities used by both the backend and frontend.


Published inside the monorepo as `@machine-gun/common` (workspace package).

## Purpose

- Centralizes domain models for type safety.
- Defines schema, transport, and flow contracts.
- Includes math expression helpers for simulation logic.
- Shared RabbitMQ and Kafka presets for testing.


## Public exports

The package re-exports modules from `src/index.ts`:

- `types/fields`
- `types/transport`
- `types/schema`
- `types/status`
- `types/custom-data`
- `types/flow`
- `utils/math`
- `utils/error`
- `schemas/rabbitmq-dummy-consumer`
- `schemas/kafka-dummy-consumer`

## Usage

Import shared types/contracts from apps:

```ts
import type { SchemaDefinition, SimulationFlow, ConnectionStatus } from '@machine-gun/common';
```

## Build

From repo root:

```bash
pnpm --filter @machine-gun/common build
```

From this directory:

```bash
pnpm build
```

`tsc` compiles `src/**` into `dist/` and emits declaration files (`.d.ts`).
