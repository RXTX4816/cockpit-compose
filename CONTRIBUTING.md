# Contributing to cockpit-compose

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Requirements

- Node.js 20+
- npm
- Docker with Compose plugin (for manual testing)
- Cockpit 300+ (for testing in the UI)

### Local Setup

```bash
git clone https://github.com/RXTX4816/cockpit-compose.git
cd cockpit-compose
npm install
npm run build
```

To develop with live reload inside Cockpit, symlink the plugin:

```bash
mkdir -p ~/.local/share/cockpit
ln -s "$PWD/src" ~/.local/share/cockpit/cockpit-compose
npm run watch
```

Then open http://localhost:9090 — Docker Compose appears in the sidebar automatically.

## Running Tests

```bash
npm run test          # Run tests once
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Code Quality

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript type checking
npm run build      # Production build (minified)
```

All of these run automatically in CI. Your PR must pass all checks before merging.

## Commit Conventions

This project uses semantic versioning driven by commit messages:

- **Patch bump** (v1.0.0 → v1.0.1): Regular bugfixes and improvements
- **Minor bump** (v1.0.0 → v1.1.0): Features. Commit messages starting with `feat:` (e.g. `feat: add snapshot restore`)
- **Major bump** (v1.0.0 → v2.0.0): Breaking changes. Include `BREAKING CHANGE:` in the commit body (e.g. commit message body contains "BREAKING CHANGE: remove support for Cockpit 299")

Examples:

```
feat: add container stats dashboard

fix: correct memory calculation in stats display

chore: update PatternFly to 6.5.0
```

For breaking changes:

```
feat: redesign UI layout

BREAKING CHANGE: old configuration files are no longer supported
```

## Pull Requests

1. **One feature per PR** — keep PRs focused and reviewable
2. **CI must pass** — lint, typecheck, tests, and build all run automatically
3. **Add tests** — if your change is a feature or bugfix, add a test to prevent regression
4. **Update docs** — if user-facing behavior changes, update README or comments as needed
5. **Describe what and why** — a clear PR description helps understand the motivation

## Reporting Issues

- **Bug?** Open an issue with `[BUG]` in the title, include environment details and steps to reproduce
- **Feature request?** Open an issue with `[FEATURE]` in the title, describe the problem being solved
- **Question?** GitHub Discussions (coming soon) or open an issue marked `[QUESTION]`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
