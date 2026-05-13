<p align="center">
  <img src="https://raw.githubusercontent.com/HarryUnchained/machine-gun/main/apps/frontend/public/favicon.png" width="120" alt="Machine Gun Logo" />
</p>

# Machine Gun

> [!TIP]
> **Docker Hub Short Description:** Schema-driven load testing for RabbitMQ & Kafka. 100k+ msg/s with a visual flow editor.
> **Docker Hub Category:** DevOps Tools

**A high-performance visual load generator for RabbitMQ and Kafka.**

![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=for-the-badge&logo=rabbitmq&logoColor=white)
![Apache Kafka](https://img.shields.io/badge/Apache%20Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)
![NestJS](https://img.shields.io/badge/nestjs-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Angular](https://img.shields.io/badge/angular-DD0031?style=for-the-badge&logo=angular&logoColor=white)

Machine Gun is a tool for stress-testing messaging infrastructure through a clean, node-based flow editor. It allows you to design data generation pipelines, trigger high-throughput bursts, and monitor transport health in real-time.

## Features

- **Flow Editor**: Build complex data generation pipelines visually.
- **High Performance**: 
    - **Multi-TCP Connection Pooling**: Distributed I/O across multiple TCP sockets to eliminate RabbitMQ head-of-line blocking.
    - **Adaptive Backpressure**: Dynamic generation throttling linked to broker saturation levels.
- **Transports**: Native support for RabbitMQ (AMQP) and Kafka.
- **Monitoring**: Real-time throughput and system status dashboard with adaptive telemetry.
- **Schema Builder**: Define JSON structures using Faker.js for dynamic, realistic data generation.

## 🐳 Run Everything Together (Unified Image)

The simplest way to start Machine Gun is using the **Unified Image**, which contains both the visual dashboard (UI) and the backend engine in a single container.

```bash
docker run -d \
  --name machine-gun \
  -p 3000:3000 \
  -e RABBIT=amqp://guest:guest@your-rabbitmq:5672 \
  -e KAFKA_BROKERS=your-kafka:9092 \
  harryunchained/machine-gun:latest
```
Access the dashboard at: **[http://localhost:3000](http://localhost:3000)**

---

## 📦 Distributed Run (Separate Components)

For production-style deployments or custom scaling, you can run the components individually.

### 1. Start the Backend
The engine that handles flow logic and message publishing.

```bash
docker run -d \
  --name machine-gun-backend \
  -p 3000:3000 \
  -e RABBIT=amqp://guest:guest@your-rabbitmq:5672 \
  -e KAFKA_BROKERS=your-kafka:9092 \
  harryunchained/machine-gun:backend
```

### 2. Start the Frontend
The visual dashboard that connects to the backend.

```bash
docker run -d \
  --name machine-gun-frontend \
  -p 80:80 \
  harryunchained/machine-gun:frontend
```

### 3. Start the Test Consumer (Optional)
A helper to verify that messages are arriving correctly at your infrastructure.

```bash
docker run -d \
  --name machine-gun-test-consumer \
  -p 3001:3001 \
  -e RABBIT=amqp://guest:guest@your-rabbitmq:5672 \
  -e KAFKA_BROKERS=your-kafka:9092 \
  harryunchained/machine-gun:test-consumer
```

## 🛠️ Development Setup (Compose)

If you have the repository cloned, use Docker Compose for the full local environment:

```bash
docker compose up -d
```

## Project Links

- **GitHub**: [HarryUnchained/machine-gun](https://github.com/HarryUnchained/machine-gun)
- **Issues**: [Report a bug](https://github.com/HarryUnchained/machine-gun/issues)
