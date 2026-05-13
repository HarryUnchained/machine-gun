# Frontend (`apps/frontend`)

The Angular-based dashboard for Machine Gun. Used to build schemas, run simulations, and monitor the testing environment in real time.


## What the UI provides

- Schema library with search and filtering.
- Visual schema builder for payload definitions.
- Flow canvas for orchestration graphs.
- Live Hub for real-time payload inspection.
- Connection status and telemetry charts.


## Authentication

The frontend handles security through a centralized system:

- **AuthService**: Single source of truth for the authentication token.
- **AuthInterceptor**: Automatically attaches the `Authorization: Bearer <token>` header to all outgoing REST requests.
- **Socket Authentication**: Passes the current token from `AuthService` to the Socket.IO handshake automatically.

## Architecture highlights

- Signal-first state management (`signal`, `computed`, `update`).
- Real-time communication through Socket.IO (`SocketService`).
- Shared domain types imported from `@machine-gun/common`.
- Main feature composition in `DashboardComponent`.

## Run locally

From repo root:

```bash
pnpm --filter frontend dev
```

Or from this directory:

```bash
pnpm start
```

Default URL: `http://localhost:4200`

## Build & test

From repo root:

```bash
pnpm --filter frontend build
pnpm --filter frontend test
```

## Backend dependency

The UI expects backend services to be available at `http://localhost:3000` (Socket.IO + API).

For full local development, run both apps from repo root:

```bash
pnpm dev
```

## Key locations

- `src/app/components/dashboard/` — top-level UI composition
- `src/app/components/schema-builder/` — schema creation/editing
- `src/app/components/flow-canvas/` — visual orchestration editor
- `src/app/components/live-hub/` — real-time activity and response monitoring
- `src/app/services/socket.service.ts` — socket events, commands, and live state
