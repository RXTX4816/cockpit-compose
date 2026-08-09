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
| 6.9 | Events (stream, table rows, stop, clear) | `e2e/events.spec.ts` | ✅ (streaming start/stop + real restart events land in the table; note: EventsModal auto-starts on mount, no manual "Stream events" click needed) |
| 6.10 | Exec / shell into a running container | `e2e/exec.spec.ts` | ✅ |
| 6.11 | Run command (one-off, --rm) | `e2e/run-command.spec.ts` | ✅ (args mode + --entrypoint override mode) |
| 6.12 | Pull images (progress, unpinned warning, cancel) | `e2e/pull-images.spec.ts` | ✅ (unpinned warning + real re-pull + Run in Background) |
| 6.13 | Stack info (services/images/volumes/networks tabs, shared networks) | `e2e/stack-info.spec.ts` | ✅ (found & fixed a real bug — see Notes) / 🚧 shared-networks case still open |
| 6.14 | Edit YAML (multi-file tabs, add/delete file, import, snapshot history/diff/restore) | `e2e/yaml-editor.spec.ts` | ✅ partial / 🚧 multi-file + snapshots |
| 6.15 | Edit env file (table/raw modes, duplicate-key warning, add file) | `e2e/env-editor.spec.ts` | ✅ (found a real doc/behavior mismatch — see Notes) |
| 6.16.1 | Prune — basic flow (containers; volumes appears unreachable via UI, see reference doc) | `e2e/prune.spec.ts` | ✅ |
| 6.17 | Scale services (increase replicas, port-conflict warning) | `e2e/scale.spec.ts` | ✅ |
| 6.19 | Create stack (template method, validation bypass) | `e2e/create-stack.spec.ts` | ✅ (manual method only — template/git method still 🚧) |
| downed-stacks bulk actions (select-all + bulk Up, commit 85fe38d) | Bulk select/Up on downed stacks table | `e2e/downed-stacks-bulk.spec.ts` | ✅ |
| 6.22 | Ports — clickable link, localhost-only vs all-interfaces tooltip | `e2e/ports.spec.ts` | ✅ (external-bind case; found a doc/behavior mismatch — see Notes) / 🚧 localhost/specific-bind cases |
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
| 6.16.2-6.16.6 | Prune edge cases (shared image across stacks still in use, exited one-shot container removal by name) | `e2e/prune.spec.ts` (additional cases) | ✅ |
| 6.16.7 | Dangling named volume | `e2e/prune.spec.ts` | ❓ appears unreachable via the current UI — see `e2e/prune.spec.ts`'s header comment and [E2E Test Reference](E2E-Test-Reference.md) before attempting; worth raising as a product question first |
| 6.18 | Backup & restore (archive create, restore into new dir, restored stack starts) | `e2e/backup-restore.spec.ts` | ✅ (found & documented a UX asymmetry vs BackupModal — see Notes) |
| 6.14 (malformed) | Save rejects invalid YAML with error details | `e2e/yaml-editor.spec.ts` (additional case) | 🚧 |
| 6.23 | Clickable external links in Stack Info show warning modal before navigating | `e2e/stack-info.spec.ts` (additional case) | 🚧 |
| healthcheck / restart-policy / named-network / crash-loop / long-logs fixture stacks (pre-staged, §5) | Status badge & info correctness for each fixture | folded into 6.1/6.13 specs as parametrized cases | 🚧 |

## Wave 4 — Features absent from this inventory entirely

Discovered while cross-checking `docs/wiki/*.md` against this table for a coverage
push — these are real, documented features with zero automated coverage that were
never even tracked here (the table above only maps `docs/testing.md` §6-7's manual
scenarios).

| Feature | Doc | Spec (planned) | Status |
|---|---|---|---|
| Background Tasks (queue, states, Stop, real container-state completion) | [Background-Tasks.md](Background-Tasks) | `e2e/background-tasks.spec.ts` | ✅ partial (Pending→Running→Complete against real container state, Stop terminates the underlying process) / 🚧 Remove, log-view-through-panel (cut, see spec header comment), runtime-switch cancellation race |
| Bulk Actions on running stacks (per-layout selection, select-all indeterminate, per-action confirm) | [Bulk-Actions.md](Bulk-Actions) | `e2e/bulk-actions.spec.ts` | ✅ partial / 🚧 multi-layout selection-control variants, runtime-switch-clears-selection |
| Process Viewer / Top (`docker compose top` equivalent) | [Process-Viewer.md](Process-Viewer) | `e2e/process-viewer.spec.ts` | ✅ |
| Keyboard shortcuts (U/D/L/E/I) | [Stacks-Dashboard.md](Stacks-Dashboard#keyboard-shortcuts) | fold into `e2e/stacks.spec.ts` | ✅ |
| Layout selector (4 layouts) | [Stacks-Dashboard.md](Stacks-Dashboard#layout-options) | fold into `e2e/stacks.spec.ts` | ✅ |
| Status filter chips + auto-refresh degrade/Retry | [Stacks-Dashboard.md](Stacks-Dashboard) | fold into `e2e/stacks.spec.ts` | ✅ partial (filter chips) / 🚧 auto-refresh degrade/Retry |

## Notes

- **Known intermittent flakes surfaced during a full-suite regression pass**
  (`e2e/adversarial.spec.ts`'s 3 tests, `e2e/backup-restore.spec.ts`,
  `e2e/prune.spec.ts`'s `volumes-test` case): after several hours of continuous
  VM use, these occasionally fail on `force: true` clicks racing a React
  re-render (the target element gets replaced mid-retry, e.g.
  `openYamlEditor`'s "Edit compose file" button) or on an async-disabled
  button not re-enabling within its timeout (`RestoreModal`'s Restore button).
  Confirmed NOT tied to the #259/#260/#261 merge: `e2e/stack-info.spec.ts`,
  which directly exercises the #259 fix, passes cleanly and repeatably on the
  same rebuilt VM. Each of the 5 passed individually earlier in this same pass
  when run in isolation right after being written — this is the same
  host-load/UI-timing flake class already called out for `adversarial.spec.ts`
  in the table above and for the Background Tasks log-modal interaction (see
  Wave 4 notes below), not a logic regression. Worth a focused pass with
  devtools attached rather than more blind selector/timeout changes.
- **Real bugs found and fixed while writing Wave 1 specs this pass** (proof this
  approach works — writing the test against actual app behavior, not assumptions,
  surfaces genuine issues):
  - `listNetworkConnectedProjects` (`src/api/stacks/query.ts`) used a
    `podman ps --format {{index .Labels "..."}}` Go template that errors on Podman
    6.0.1 ("cannot index slice/array with type string"), breaking the entire Stack
    Info Networks section with a generic "Could not load networks" alert. Fixed to
    go through `--format json` + JS-side parsing instead, matching every other
    podman fallback in that file. Covered by both `e2e/stack-info.spec.ts` and a new
    unit test in `src/api/stacks/query.test.ts`.
  - `docs/wiki/Stacks-Dashboard.md` and `docs/testing.md` §6.22 describe port-badge
    clicks as going through an "external-link confirmation" — the real code
    (`StatsCell.tsx`/`PrettyCard.tsx`/`UnixRow.tsx`) calls `window.open()` directly
    with no modal in between. `e2e/ports.spec.ts` asserts the real behavior; the docs
    need a fix or a product decision on which is intended.
  - `docs/testing.md` §6.15 describes a duplicate-key warning triggering from edits
    made "in raw mode" — `EnvModal.tsx` only computes `hasDuplicates` via
    `EnvTable`'s `onDuplicatesChange`, which never fires while the Raw (CodeMirror)
    editor is mounted, so a raw-mode-only duplicate silently saves with no warning.
    `e2e/env-editor.spec.ts` exercises the real (Table-mode) path where the check
    genuinely runs and documents the Raw-mode gap.
- **Wave 3/4 additional findings** (this pass):
  - `RestoreModal`'s target directory field is the PARENT directory (the app
    appends the stack name itself), same convention as Create Stack — the first
    version of `backup-restore.spec.ts` assumed otherwise and produced a nested
    directory; fixed in the test, not a code bug.
  - `RestoreModal` auto-closes via `onRestored` on success with no dedicated
    success screen, unlike `BackupModal` which shows one — a real UX asymmetry
    between the two modals, documented in `e2e/backup-restore.spec.ts` but not
    changed (no product decision requested for this pass).
  - Background Tasks: clicking a finished task to view its captured log
    (`BackgroundTaskLogModal`) was manually verified to show real captured
    output, but automating it reliably while the drawer stays open behind the
    modal proved fragile (drawer intercepting clicks, ambiguous "Close"
    targets) — cut from `e2e/background-tasks.spec.ts` this pass, see its
    header comment.
- The "check config didn't break" principle from issue #227 has no literal
  Caddyfile-equivalent in this app (no reverse-proxy feature exists). It's applied
  here as: after YAML/env edits, assert file content really changed via a re-scan or
  `cockpit.file()` read; after Up/Down/Scale, assert real container/service state
  (via Stack Info or a second scan) rather than only a UI class/badge.
- Wave 1 specs should be written first and always run on the canonical 3-VM set in
  CI-equivalent local runs; Wave 2 specs are the ones that justify the full matrix.
- This table should be kept up to date as specs are written — flip 🚧 to ✅ in the
  same PR that adds the spec.
