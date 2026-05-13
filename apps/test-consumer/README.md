# Test Consumer (`apps/test-consumer`)

A NestJS app used to verify that Machine Gun is correctly publishing messages to RabbitMQ and Kafka. It acts as the end-to-end verification target.


## What it does

- Subscribes to shared RabbitMQ and Kafka presets.
- Records received messages in-memory for verification.
- Returns RPC echo responses (visible in the Live Hub).
- Lightweight HTTP endpoints for health and receipt logs.


## RabbitMQ endpoints

This app listens for the shared consumer presets:

- `rabbit-dummy-topic-consumer`
- `rabbit-dummy-direct-consumer`
- `rabbit-dummy-headers-consumer`
- `rabbit-dummy-queue-consumer`
- `rabbit-dummy-rpc-consumer`
- `rmq-queue-autodelete`
- `rmq-message-ttl`
- `rmq-priority`

## Kafka endpoints

This app also subscribes to the shared Kafka topics:

- `test.kafka.basic`
- `test.kafka.routing`
- `test.kafka.custom-key`
- `test.kafka.field-key`

## Run locally

From repo root:

```bash
pnpm --filter test-consumer dev
```

Or, after adding the root shortcut:

```bash
pnpm dev:test-consumer
```

Default HTTP port: `3001`

## Inspection endpoints

- `GET /health` — app status and receipt counts
- `GET /receipts` — recorded messages in newest-first order (Audit Log)
- `GET /receipts/summary` — per-consumer message counts
- `GET /receipts/stats` — detailed breakdown by exchange, queue, and topic
- `DELETE /receipts` — clear the in-memory receipt log

## Environment

- `RABBIT` — optional, enables RabbitMQ consumers when present
- `KAFKA` — optional, enables Kafka consumers when present
- `KAFKA_GROUP_ID` — optional, defaults to `machine-gun-test-consumer`
- `KAFKA_CLIENT_ID` — optional, defaults to `machine-gun-test-consumer`
- `TEST_CONSUMER_PORT` — optional, defaults to `3001`
