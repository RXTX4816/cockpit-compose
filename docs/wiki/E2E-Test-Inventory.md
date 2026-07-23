# E2E Test Inventory

Tracking doc for issue [#227](https://github.com/RXTX4816/cockpit-compose/issues/227).
Maps every manual feature scenario in the [Testing Guide](../testing.md) §6-7 to a
planned (or existing) automated spec in `e2e/`, grouped into implementation waves.

Status legend: ✅ done, confirmed passing on live VMs (repeatedly) · ⚠️ done, one known intermittent flake tied to host-level resource contention, not app/test logic (see [E2E Test Reference](E2E-Test-Reference.md#verification-status)) · 🚧 planned, not written yet

Every new test should assert a **real effect**, not just DOM visibility — e.g. after
an edit, re-read the compose file content; after Up/Down, confirm the stack's actual
status rather than only a badge class. See `e2e/helpers/` for the shared helpers that
make this practical (`baseData`, `stacks.ts`, `runtime.ts`).

## Wave 1 — Core CRUD, canonical VMs (`arch-podman`, `arch-docker`, `arch-both`)

| Testing guide § | Scenario | Spec (planned) | Status |
|---|---|---|---|
| 6.1 | Stack listing & status badges (running/stopped/partial/paused) | `e2e/stacks.spec.ts` | ✅ partial / 🚧 status transitions |
| 6.2 | Import / discover downed stacks, depth setting, runtime-switch clears path | `e2e/stacks.spec.ts` | ✅ partial / 🚧 depth + runtime-switch |
| 6.3 | Start (Up) — simple | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.4 | Start (Up) — with profiles | `e2e/stack-lifecycle.spec.ts` | 🚧 |
| 6.5 | Stop / Restart | `e2e/stack-lifecycle.spec.ts` | 🚧 |
| 6.6 | Down (remove containers) | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.7 | Kill | `e2e/stack-lifecycle.spec.ts` | 🚧 |
| 6.8 | Logs (filter, search, pause/continue, clear, refresh) | `e2e/logs.spec.ts` | ✅ |
| 6.9 | Events (stream, table rows, stop, clear) | `e2e/events.spec.ts` | 🚧 |
| 6.10 | Exec / shell into a running container | `e2e/exec.spec.ts` | ✅ |
| 6.11 | Run command (one-off, --rm) | `e2e/run-command.spec.ts` | 🚧 |
| 6.12 | Pull images (progress, unpinned warning, cancel) | `e2e/pull-images.spec.ts` | 🚧 |
| 6.13 | Stack info (services/images/volumes/networks tabs, shared networks) | `e2e/stack-info.spec.ts` | 🚧 |
| 6.14 | Edit YAML (multi-file tabs, add/delete file, import, snapshot history/diff/restore) | `e2e/yaml-editor.spec.ts` | ✅ partial / 🚧 multi-file + snapshots |
| 6.15 | Edit env file (table/raw modes, duplicate-key warning, add file) | `e2e/env-editor.spec.ts` | 🚧 |
| 6.16.1 | Prune — basic flow (containers; volumes appears unreachable via UI, see reference doc) | `e2e/prune.spec.ts` | ✅ |
| 6.17 | Scale services (increase replicas, port-conflict warning) | `e2e/scale.spec.ts` | ✅ |
| 6.19 | Create stack (template method, validation bypass) | `e2e/create-stack.spec.ts` | ✅ (manual method only — template/git method still 🚧) |
| downed-stacks bulk actions (select-all + bulk Up, commit 85fe38d) | Bulk select/Up on downed stacks table | `e2e/downed-stacks-bulk.spec.ts` | 🚧 |
| 6.22 | Ports — clickable link, localhost-only vs all-interfaces tooltip | `e2e/ports.spec.ts` | 🚧 |
| adversarial | Malformed YAML, nonexistent scan directory, scan-depth bounds | `e2e/adversarial.spec.ts` | ⚠️ (depth/nonexistent-dir confirmed clean; malformed-YAML logic verified correct but has an unresolved host-contention-triggered flake) |

## Wave 2 — Runtime/engine-specific, full 9-VM matrix

Run these against the full matrix (batched per §"Managing resource usage" in
[VM Testing](VM-Testing)) since behavior depends on engine + rootless/rootful + distro.

| Testing guide § | Scenario | Spec (planned) | Status |
|---|---|---|---|
| 6.20, 6.21 | Footer + runtime toggle (Docker↔Podman switch, rootless badge, socket path, "not installed" revert) | `e2e/runtime-toggle.spec.ts` | 🚧 |
| 7.1 | Docker rootless mode | `e2e/runtime-rootless.spec.ts` | ✅ partial (`rootless-compose-root.spec.ts`) / 🚧 |
| 7.2 | Podman via `podman compose` external provider | `e2e/runtime-rootless.spec.ts` | 🚧 |
| 7.3 | Podman via `podman-compose` (Python, no docker-compose) | `e2e/runtime-rootless.spec.ts` | 🚧 |
| 7.4 | Podman root (system socket), no rootless socket at all — issue [#242](https://github.com/RXTX4816/cockpit-compose/issues/242) regression: discovery + Stack Info container list under real Cockpit Administrative access | `e2e/runtime-rootless.spec.ts` (`fedora-podman-rootful` only) | ✅ |
| 7.5 | Neither runtime present — error state | `e2e/runtime-unavailable.spec.ts` | 🚧 |
| Rootless/Rootful socket-mode toggle (added alongside #242's fix) — switching modes when both sockets are detected, footer badge, stale-list refresh on switch | `e2e/runtime-rootless.spec.ts` or a dedicated spec | 🚧 (manually verified on `fedora-full`; not yet automated — needs a project with both sockets *and* admin access, see `loginWithAdminAccess` in `e2e/helpers/admin.ts`) |
| superuser prompt | Compose file owned by another uid (`composeFileSuperuser()`, `src/api/cockpit.ts:185-215`) | `e2e/superuser-prompt.spec.ts` | 🚧 |
| distro quirks | Debian cgroupfs pause/unpause workaround, Fedora SELinux `label=false`, pasta/nftables networking | covered implicitly by running Wave-1 lifecycle specs against the full matrix rather than a dedicated spec | 🚧 |

## Wave 3 — Edge cases / error states

| Testing guide § | Scenario | Spec (planned) | Status |
|---|---|---|---|
| 5.3 / 6.4 | Multi-service stack with profiles | covered by 6.4 above | 🚧 |
| 5.4 / 6.14 | Multi-file compose (extra compose file) | covered by 6.14 above | 🚧 |
| 6.16.2-6.16.6 | Prune edge cases (pinned version bump, shared image across stacks, unpinned `:latest`, non-semver tag, exited containers) | `e2e/prune.spec.ts` (additional cases) | 🚧 |
| 6.16.7 | Dangling named volume | `e2e/prune.spec.ts` | ❓ appears unreachable via the current UI — see `e2e/prune.spec.ts`'s header comment and [E2E Test Reference](E2E-Test-Reference.md) before attempting; worth raising as a product question first |
| 6.18 | Backup & restore (archive create, restore into new dir, restored stack starts) | `e2e/backup-restore.spec.ts` | 🚧 |
| 6.14 (malformed) | Save rejects invalid YAML with error details | `e2e/yaml-editor.spec.ts` (additional case) | 🚧 |
| 6.23 | Clickable external links in Stack Info show warning modal before navigating | `e2e/stack-info.spec.ts` (additional case) | 🚧 |
| healthcheck / restart-policy / named-network / crash-loop / long-logs fixture stacks (pre-staged, §5) | Status badge & info correctness for each fixture | folded into 6.1/6.13 specs as parametrized cases | 🚧 |

## Notes

- The "check config didn't break" principle from issue #227 has no literal
  Caddyfile-equivalent in this app (no reverse-proxy feature exists). It's applied
  here as: after YAML/env edits, assert file content really changed via a re-scan or
  `cockpit.file()` read; after Up/Down/Scale, assert real container/service state
  (via Stack Info or a second scan) rather than only a UI class/badge.
- Wave 1 specs should be written first and always run on the canonical 3-VM set in
  CI-equivalent local runs; Wave 2 specs are the ones that justify the full matrix.
- This table should be kept up to date as specs are written — flip 🚧 to ✅ in the
  same PR that adds the spec.
