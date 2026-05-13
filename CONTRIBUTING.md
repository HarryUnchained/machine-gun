# Contributing to Machine Gun

First off, thank you for considering contributing to Machine Gun! It's people like you that make the open-source community such an amazing place to learn, inspire, and create.

## Code of Conduct

This project and everyone participating in it is governed by the [Machine Gun Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Bugs are tracked as GitHub issues. When creating a bug report, please include as many details as possible:

*   Use a clear and descriptive title.
*   Describe the exact steps which reproduce the problem.
*   Explain which behavior you expected to see and why.
*   Include screenshots or recordings if applicable.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When suggesting an enhancement:

*   Use a clear and descriptive title.
*   Provide a step-by-step description of the suggested enhancement.
*   Explain why this enhancement would be useful to most Machine Gun users.

### Pull Requests

1.  Fork the repo and create your branch from `main`.
2.  If you've added code that should be tested, add tests.
3.  If you've changed APIs, update the documentation.
4.  Ensure the test suite passes (`pnpm test`).
5.  Make sure your code lints (`pnpm lint`).

## Development Setup

1.  Clone the repository.
2.  Install dependencies: `pnpm install`.
3.  Copy `.env.example` to `.env` in `apps/backend` and `apps/test-consumer`.
4.  Start the development environment: `pnpm dev`.

## Styleguides

### Git Commit Messages

*   Use the present tense ("Add feature" not "Added feature").
*   Use the imperative mood ("Move cursor to..." not "Moves cursor to...").
*   Limit the first line to 72 characters or less.

### TypeScript Styleguide

*   Use PascalCase for classes and interfaces.
*   Use camelCase for variables and functions.
*   Use `readonly` for immutable properties.
*   Prefer Signals for Angular state management.
