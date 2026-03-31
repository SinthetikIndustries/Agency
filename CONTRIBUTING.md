# Contributing to Agency

Thanks for your interest in contributing! Agency is developed by [Sinthetix, LLC](https://www.sinthetix.com) and welcomes community contributions.

## Before You Start

By submitting a contribution, you agree that Sinthetix, LLC may use, modify, and distribute your contribution under any terms, including commercial terms, as described in the [LICENSE](./LICENSE). If you're not comfortable with that, please don't submit contributions.

## How to Contribute

### Reporting Bugs

Open an issue at [github.com/SinthetikIndustries/Agency/issues](https://github.com/SinthetikIndustries/Agency/issues).

Include:
- What you were doing
- What you expected to happen
- What actually happened
- Your OS, Node.js version, and Docker version
- Any relevant logs (`/tmp/agency-gateway.log`)

### Suggesting Features

Open an issue with the `enhancement` label. Describe what you want and why. We'll discuss before you write any code.

### Submitting Code

1. **Fork** the repository on GitHub
2. **Create a branch** from `main` for your change:
   ```bash
   git checkout -b fix/your-bug-description
   # or
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** — keep commits focused and atomic
4. **Test your changes** — run the test suite:
   ```bash
   cd app && pnpm test
   cd cli && npm test
   ```
5. **Push** your branch to your fork:
   ```bash
   git push origin your-branch-name
   ```
6. **Open a Pull Request** against `main` on the main repo

### Pull Request Guidelines

- Keep PRs focused — one fix or feature per PR
- Write a clear description of what changed and why
- Reference any related issues (`Closes #123`)
- Make sure tests pass before submitting
- Don't bump version numbers — we handle releases

## Code Style

- TypeScript throughout — no `any` unless absolutely necessary
- Follow the patterns already in the codebase
- Shell scripts use `#!/usr/bin/env bash`

## Questions?

Open an issue or reach out at [sinthetix.com](https://www.sinthetix.com).
