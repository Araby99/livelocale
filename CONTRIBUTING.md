# Contributing to next-i18n-lens

Thank you for your interest in contributing to `next-i18n-lens`! This guide will help you get started with running and developing the project locally.

## Development Setup

1. **Clone the repository**:

   ```bash
   git clone https://github.com/Araby99/next-i18n-lens.git
   cd next-i18n-lens
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Build the packages**:

   ```bash
   npm run build
   ```

4. **Run the tests**:
   - Unit and Integration tests:
     ```bash
     npm run test
     ```
   - End-to-End (Playwright) tests:
     ```bash
     npx playwright install --with-deps
     npm run test:e2e
     ```

## Code Quality Standards

Before submitting a Pull Request, please ensure:

- Your code is properly formatted: `npm run format:check` (or format your files using `npm run format:write`).
- Your code passes the linter rules: `npm run lint`.
- TypeScript compiles without errors: `npm run typecheck`.
- All tests pass: `npm run test` and `npm run test:e2e`.

## Submission Process

1. Fork the repo and create your branch from `main`.
2. Implement your changes and add tests if applicable.
3. Commit your changes. Pre-commit hooks via Husky and lint-staged will automatically verify formatting and linting.
4. Push your branch and open a Pull Request against `main`.

## Release Process

Versions and the changelog are managed with [Changesets](https://github.com/changesets/changesets).

1. With every user-facing change, add a changeset describing it:
   ```bash
   npx changeset
   ```
2. To cut a release, apply the pending changesets. This bumps `package.json` and prepends the
   notes to `CHANGELOG.md`:
   ```bash
   npm run version
   ```
3. Commit the result, push, and create a GitHub release tagged `vX.Y.Z`. The publish workflow
   builds, tests, and publishes to npm with provenance.
