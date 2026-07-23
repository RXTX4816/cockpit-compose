# Contributing to cockpit-compose

Thanks for your interest in contributing! This guide will help you get started.

## Development Setup

### Requirements

- Node.js 22+
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

### Working on the base library

This plugin depends on [`@rxtx4816/cockpit-plugin-base-react`](https://github.com/RXTX4816/cockpit-plugin-base-react), which provides shared hooks, components, tooling config, and the VM test harness. If you need to change both repos at the same time, use [yalc](https://github.com/wclr/yalc) to link your local build instead of the published npm package.

**One-time setup:** `npm install -g yalc`

```bash
# 1. In the cockpit-plugin-base-react repo, publish to the local yalc store
yalc publish

# 2. In this repo, replace the npm dependency with the local yalc version
npm run base:add

# 3. Make your changes in both repos. To push updated base library changes:
#    (in cockpit-plugin-base-react)
yalc push       # publishes and auto-updates all linked consumers

# 4. When done, restore the npm registry version
npm run base:reset
```

**Important:** never commit the `.yalc/` directory or the `yalc.lock` file — they are gitignored. Always run `npm run base:reset` before opening a PR.

## Running Tests

### Unit tests

```bash
npm run test          # Run tests once
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

### E2E tests (Playwright)

Browser tests that drive Chromium against a real QEMU VM. They are **not run in CI** — run them locally when working on UI features.

**Prerequisites** (one-time per machine):
```bash
sudo pacman -S qemu-full cloud-image-utils wget
npx playwright install chromium
```

**Run:**
```bash
npm run build
npm run vm download debian       # if you haven't yet
npm run vm start debian-podman
npm run vm wait debian-podman
npm run test:e2e                 # headless
npm run test:e2e:ui              # visual runner
```

Tests live in `e2e/`. To add a test, import from the base fixture (handles login automatically):

```ts
import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';

test('my scenario', async ({ pluginPage: page }) => {
  await expect(page.getByRole('heading', { name: 'Docker Compose' })).toBeVisible();
});
```

Use `npm run test:e2e:codegen` to record a test by clicking through the live UI. See [docs/testing.md](docs/testing.md) for full documentation.

## Code Quality

```bash
npm run lint       # ESLint
npm run typecheck  # TypeScript type checking
npm run build      # Production build (minified)
```

All of these run automatically in CI. Your PR must pass all checks before merging.

**Important — module resolution pitfall:** never have both `src/api/foo.ts` and `src/api/foo/`
(a directory) at the same time. When both exist, esbuild resolves a bare import like
`from "./foo"` to the **file**, silently shadowing the entire directory — even though
`npm run typecheck` and `npm run lint` both pass cleanly, since TypeScript/ESLint check every
file matched by `tsconfig.json`'s `include` glob regardless of whether it's actually reachable
from the bundle's entry point. This bit us for a long time: `src/api/stacks.ts` was a leftover
from before the API layer was split into `src/api/stacks/{query,lifecycle,prune,exec}.ts`, and
was never deleted — every fix to the split files silently went nowhere because the old file kept
winning module resolution. If you ever suspect a change "isn't taking effect" despite a clean
build, verify what's *actually* in the bundle rather than trusting the source tree:

```bash
npx esbuild src/index.tsx --bundle --metafile=/tmp/meta.json --outfile=/tmp/out.js \
  --minify --target=es2020 --jsx=automatic --loader:.tsx=tsx --loader:.ts=ts --loader:.svg=dataurl
grep -o '"[^"]*your-file\.ts"' /tmp/meta.json   # confirms which file esbuild actually included
```

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
- **Security vulnerability?** Do **not** open a public issue. Follow the private disclosure process in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
