# cockpit-compose

Cockpit plugin for managing Docker and Podman Compose stacks from a web UI. React 19 + PatternFly 6 + TypeScript, bundled with esbuild, AGPL-3.0-only. It runs inside Cockpit in the browser and talks to the host only through the Cockpit JS API (`src/api/cockpit.ts`), never a server of its own. Shared hooks, components, tooling config and the VM test harness come from the separate package `@rxtx4816/cockpit-plugin-base-react`; see `CONTRIBUTING.md` for linking it locally with yalc.

## Commands

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`: all four must pass; CI runs them via the base repo's `ci-plugin.yml`.
- `npm run build` also checks i18n coverage and rewrites the README coverage table.
- E2E (`npm run test:e2e`) drives Playwright against a real QEMU VM, is **not run in CI**, and needs a running VM. See `docs/testing.md`.

## Layout

- `src/api/`: all host interaction (cockpit spawn, engine HTTP, stacks lifecycle/query/prune/exec). Pure parsing lives in `parsing.ts` and `src/lib/`.
- `src/hooks/`, `src/components/`, `src/lib/`: UI state, views, and pure helpers. Tests sit next to the file as `*.test.ts(x)`.
- `src/i18n/locales/*.json`: 24 locales; every user-visible string goes through i18next, and `en.json` is the source.
- `e2e/`: Playwright specs, one per feature. `docs/wiki/`: user docs, synced to the GitHub wiki.
- `PKGBUILD`, `cockpit-compose.spec`, `debian/`: packaging for Arch, RPM, deb.

## Gotchas

- Never have both `src/api/foo.ts` and `src/api/foo/`. esbuild silently resolves to the file and shadows the directory while typecheck and lint stay green. If a change "isn't taking effect", inspect the esbuild metafile (recipe in `CONTRIBUTING.md`).
- Never commit `.yalc/` or `yalc.lock`; run `npm run base:reset` before opening a PR.
- The runtime matrix (Docker / Podman, rootless / rootful, both installed) is where most bugs live. See `docs/wiki/Podman-Compatibility.md`.
- Add a new key to `en.json` and to every other locale. A missing key doesn't fail the build; it only lowers the coverage table that `npm run build` writes into the README.

## Conventions

- Conventional commits drive semantic-release: `fix:` patch, `feat:` minor, `BREAKING CHANGE:` major. Sign off commits (`git commit -s`).
- One feature per PR. A feature or bugfix needs a regression test. User-facing changes update `docs/wiki/`.
- Commit messages, PRs and issues are written as the maintainer, with no tool or AI attribution.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (RXTX4816/cockpit-compose), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
