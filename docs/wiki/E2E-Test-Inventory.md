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
| 6.1 | Stack listing & status badges (running/stopped/partial/paused) | `e2e/stacks.spec.ts` | ✅ (status transitions covered) |
| 6.2 | Import / discover downed stacks, depth setting, runtime-switch clears path | `e2e/stacks.spec.ts`, `e2e/runtime-toggle.spec.ts` | ✅ runtime-switch clears path covered / 🚧 depth *setting's effect on what's found* still untested (only its clamping bounds are, via `adversarial.spec.ts`) |
| 6.3 | Start (Up) — simple | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.4 | Start (Up) — with profiles | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.5 | Stop / Restart | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.6 | Down (remove containers) | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.7 | Kill | `e2e/stack-lifecycle.spec.ts` | ✅ |
| 6.8 | Logs (filter, search, pause/continue, clear, refresh) | `e2e/logs.spec.ts` | ✅ |
| 6.9 | Events (stream, table rows, stop, clear) | `e2e/events.spec.ts` | ✅ (streaming start/stop + real restart events land in the table; note: EventsModal auto-starts on mount, no manual "Stream events" click needed) |
| 6.10 | Exec / shell into a running container | `e2e/exec.spec.ts` | ✅ |
| 6.11 | Run command (one-off, --rm) | `e2e/run-command.spec.ts` | ✅ (args mode + --entrypoint override mode) |
| 6.12 | Pull images (progress, unpinned warning, cancel) | `e2e/pull-images.spec.ts` | ✅ (unpinned warning + real re-pull + Run in Background) |
| 6.13 | Stack info (services/images/volumes/networks tabs, shared networks) | `e2e/stack-info.spec.ts` | ✅ (found & fixed a real bug — see Notes) / 🚧 shared-networks case still open |
| 6.14 | Edit YAML (multi-file tabs, add/delete file, import, snapshot history/diff/restore) | `e2e/yaml-editor.spec.ts` | ✅ (multi-file tabs + snapshot history/diff/restore covered) / 🚧 add/delete file specifically (attempted, cut for click reliability — see spec comment) |
| 6.15 | Edit env file (table/raw modes, duplicate-key warning, add file) | `e2e/env-editor.spec.ts` | ✅ (found a real doc/behavior mismatch — see Notes) |
| 6.16.1 | Prune — basic flow (containers; volumes appears unreachable via UI, see reference doc) | `e2e/prune.spec.ts` | ⚠️ image/shared-image prune tests pass; container-prune tests marked `test.fixme` on Podman pending issue [#274](https://github.com/RXTX4816/cockpit-compose/issues/274) — see Notes |
| 6.17 | Scale services (increase replicas, port-conflict warning) | `e2e/scale.spec.ts` | ✅ |
| 6.19 | Create stack (template method, validation bypass) | `e2e/create-stack.spec.ts` | ✅ (manual method only — template/git method still 🚧) |
| downed-stacks bulk actions (select-all + bulk Up, commit 85fe38d) | Bulk select/Up on downed stacks table | `e2e/downed-stacks-bulk.spec.ts` | ✅ |
| 6.22 | Ports — clickable link, localhost-only vs all-interfaces tooltip | `e2e/ports.spec.ts` | ✅ (external-bind case; found a doc/behavior mismatch — see Notes) / 🚧 localhost/specific-bind cases |
| adversarial | Malformed YAML, nonexistent scan directory, scan-depth bounds | `e2e/adversarial.spec.ts` | ✅ all 3 fixed and stable (3/3 × 2 full-file runs) — see Notes, these were real test bugs, not flakes |

## Wave 2 — Runtime/engine-specific, full 9-VM matrix

Run these against the full matrix (batched per §"Managing resource usage" in
[VM Testing](VM-Testing)) since behavior depends on engine + rootless/rootful + distro.

| Testing guide § | Scenario | Spec (planned) | Status |
|---|---|---|---|
| 6.20, 6.21 | Footer + runtime toggle (Docker↔Podman switch, rootless badge, socket path, "not installed" revert) | `e2e/runtime-toggle.spec.ts` | ✅ (`arch-both`; "not installed" case breaks the real `podman` binary via SSH, always restored) |
| 7.1 | Docker rootless mode | `e2e/runtime-rootless.spec.ts` | ✅ partial (`rootless-compose-root.spec.ts`) / 🚧 |
| 7.2 | Podman via `podman compose` external provider | (every spec that runs against `arch-podman`) | ✅ — on `arch-podman`, `podman compose`'s "external compose provider" genuinely *is* `/usr/bin/podman-compose` (verified via SSH: `podman compose version` prints the "Executing external compose provider" banner naming that exact binary); every Wave 1/3/4 spec already run against this VM exercises this path, no dedicated spec needed |
| 7.3 | Podman via `podman-compose` (Python, no docker-compose) | (every spec that runs against `arch-podman`) | ✅ — same finding as 7.2: `arch-podman` has no `docker-compose` at all and its `podman-compose` is confirmed genuine Python (`/usr/bin/podman-compose` is `#!/usr/bin/python`, reports `podman-compose version 1.6.0`), so 7.2 and 7.3 are literally the same code path on this VM, both already covered by the existing suite |
| 7.4 | Podman root (system socket), no rootless socket at all — issue [#242](https://github.com/RXTX4816/cockpit-compose/issues/242) regression: discovery + Stack Info container list under real Cockpit Administrative access, and that the two agree on state *at the same moment* after a real transition (Troubleshooting.md's status-agreement regression) | `e2e/runtime-rootless.spec.ts` (`fedora-podman-rootful` only) | ✅ |
| 7.5 | Neither runtime present — error state | `e2e/runtime-unavailable.spec.ts` | ✅ (`arch-docker`; hides both `docker` and the standalone `docker-compose` legacy binary via SSH — hiding `docker` alone isn't enough, `detectComposeCommand()` falls back to it) |
| Rootless/Rootful socket-mode toggle (added alongside #242's fix) — switching modes when both sockets are detected, footer badge, stale-list refresh on switch | `e2e/socket-mode-toggle.spec.ts` | ✅ (`fedora-full` only, via `loginWithAdminAccess` — Rootful stays disabled without real admin access) |
| superuser prompt | Compose file owned by another uid (`composeFileSuperuser()`, `src/api/cockpit.ts:185-215`) | `e2e/superuser-prompt.spec.ts` | ✅ (`fedora-full` only — the one VM with a genuine rootless Docker socket; see spec header comment for why a stricter-permissions fixture was tried and reverted) |
| Recheck button vs. a socket that exists but doesn't respond (`checkSocketHealth()`, `docs/wiki/Troubleshooting.md`) | none | 🚧 not attempted — the only way to produce this state is mutating a shared VM's live `systemd --user` socket/service, which isn't reproducible and would need a full VM reset afterward; needs a dedicated VM image provisioned with a genuinely broken/stub socket baked into cloud-init instead of a live hack, out of scope for this pass |
| distro quirks | Debian cgroupfs pause/unpause workaround, Fedora SELinux `label=false`, pasta/nftables networking | covered implicitly by running Wave-1 lifecycle specs against the full matrix rather than a dedicated spec | ✅ partial — `e2e/stacks.spec.ts` + `stack-lifecycle.spec.ts` run clean on `debian-podman` (4/4 + 9/9) and `debian-docker` (13/13); `fedora-podman` 12/13 (1 known host-load flake, passed alone); `fedora-docker` 4/13 — the other 9 failures are **not** distro-quirk test gaps, they're issue [#272](https://github.com/RXTX4816/cockpit-compose/issues/272) (a real app-level race, also reproduces on `arch-docker`, not Fedora-specific) / 🚧 `debian-both`, `fedora-both` |

## Wave 3 — Edge cases / error states

| Testing guide § | Scenario | Spec (planned) | Status |
|---|---|---|---|
| 5.3 / 6.4 | Multi-service stack with profiles | covered by 6.4 above | ✅ |
| 5.4 / 6.14 | Multi-file compose (extra compose file) | covered by 6.14 above | ✅ |
| 6.16.2-6.16.6 | Prune edge cases (shared image across stacks still in use, exited one-shot container removal by name) | `e2e/prune.spec.ts` (additional cases) | ✅ |
| 6.16.7 | Dangling named volume | `e2e/prune.spec.ts` | ❓ the earlier "unreachable via the current UI" finding turned out to rest on a false premise specific to Podman — see issue [#274](https://github.com/RXTX4816/cockpit-compose/issues/274) and `e2e/prune.spec.ts`'s header comment; revisit once #274 is fixed before deciding whether this is still a product question |
| 6.18 | Backup & restore (archive create, restore into new dir, restored stack starts) | `e2e/backup-restore.spec.ts` | ✅ (found & documented a UX asymmetry vs BackupModal — see Notes) |
| 6.14 (malformed) | Save rejects invalid YAML with error details | `e2e/yaml-editor.spec.ts` (additional case) | ✅ (see Notes for a known flake under cumulative session load) |
| 6.23 | Clickable external links show a warning modal before navigating | `e2e/stacks.spec.ts` (additional case) | ✅ — not in StackInfoModal (its port badges call `window.open()` directly, no confirmation, see #260/`ports.spec.ts`); the real warning-modal flow is `ContainerTable`'s per-service image link inside an expanded row, covered here instead |
| healthcheck / restart-policy / named-network / crash-loop / long-logs fixture stacks (pre-staged, §5) | Status badge & info correctness for each fixture | folded into 6.1/6.13 specs as parametrized cases | 🚧 |

## Wave 4 — Features absent from this inventory entirely

Discovered while cross-checking `docs/wiki/*.md` against this table for a coverage
push — these are real, documented features with zero automated coverage that were
never even tracked here (the table above only maps `docs/testing.md` §6-7's manual
scenarios).

| Feature | Doc | Spec (planned) | Status |
|---|---|---|---|
| Background Tasks (queue, states, Stop/Remove, real container-state completion, runtime-switch cancellation) | [Background-Tasks.md](Background-Tasks) | `e2e/background-tasks.spec.ts` | ✅ (Pending→Running→Complete against real container state, Stop terminates the underlying process, Remove actually drops the task, runtime-switch cancellation race verified on `arch-both`) / 🚧 log-view-through-panel (cut, see spec header comment) |
| Bulk Actions on running stacks (per-layout selection, select-all indeterminate, per-action confirm, runtime-switch clears selection) | [Bulk-Actions.md](Bulk-Actions) | `e2e/bulk-actions.spec.ts` | ✅ (Power User checkbox, Minimal card-click, Unix bracket-toggle, runtime-switch-clears-selection all covered) / 🚧 Pretty layout |
| Process Viewer / Top (`docker compose top` equivalent) | [Process-Viewer.md](Process-Viewer) | `e2e/process-viewer.spec.ts` | ✅ |
| Keyboard shortcuts (U/D/L/E/I) | [Stacks-Dashboard.md](Stacks-Dashboard#keyboard-shortcuts) | fold into `e2e/stacks.spec.ts` | ✅ |
| Layout selector (4 layouts) | [Stacks-Dashboard.md](Stacks-Dashboard#layout-options) | fold into `e2e/stacks.spec.ts` | ✅ |
| Status filter chips + auto-refresh degrade/Retry | [Stacks-Dashboard.md](Stacks-Dashboard) | fold into `e2e/stacks.spec.ts` | ✅ (auto-refresh degrade/Retry verified against a real broken `podman` binary on the VM, not a mock — see Notes) |

## Notes

- **The 5 "flaky" specs, actually debugged with a trace/screenshot pass** — of
  the 5 specs previously tagged as an unresolved host-contention flake class,
  4 turned out to be real, deterministic bugs (in the tests, and in one case
  the app), not timing flakes at all:
  - `e2e/adversarial.spec.ts`'s malformed-YAML test used
    `page.getByRole('dialog', { name: 'Confirm save' })` — the modal's real
    accessible name is its `ModalHeader` title ("Save with issues?"), which
    takes ARIA precedence over the `aria-label` prop. Fixed to filter by
    visible content instead. A second, separate bug in the same test: after
    canceling the confirm dialog, it called `openYamlEditor()` again to
    verify the on-disk content — but Cancel only exits edit mode, it doesn't
    close the modal, so the second open raced the first modal's own
    backdrop. Fixed to assert directly on the still-open modal instead of
    closing and reopening.
  - `e2e/adversarial.spec.ts`'s other two tests (nonexistent scan dir,
    scan-depth bounds) never called `dismissStartupPodmanPrompt()` — on a
    podman-only VM the auto-suggest-Podman modal blocks the Import button
    they immediately try to click. Fixed by adding the missing call.
  - `e2e/backup-restore.spec.ts`: a prior run's restored stack directory
    (`e2e-restored-gotify`) was never fully deleted — `downStack()` only
    runs `compose down`, and the app's own "Delete compose file" action only
    removes the `.yml` (not gotify's bind-mounted `data/` subdirectory), so
    the directory survived either cleanup path and permanently disabled
    `RestoreModal`'s Restore button on the next run (`targetExists` stays
    true, requiring an overwrite-confirm checkbox neither run handled). Fixed
    afterEach/setup to `rm -rf` the directory via SSH — the only way to
    guarantee it's actually gone. Also now cleans up accumulated
    `.bak.tar.gz` archives, which had grown to 8+ from repeated runs.
  - `e2e/prune.spec.ts`'s `volumes-test` case surfaced a **real app bug**:
    see issue [#274](https://github.com/RXTX4816/cockpit-compose/issues/274)
    — `podman container prune` is a silent no-op on containers that belong
    to a pod, which every podman-compose stack's containers are. The test's
    old assertion (row disappears from the running list) was based on a
    false assumption; the row actually stays "stopped" forever since the
    containers never get removed. This is what the §6.16.7 dangling-volume
    "unreachable" note above was built on — also revisit once #274 is fixed.
    Both affected tests now assert the *correct* behavior (real container
    removal, verified via Stack Info) and are marked `test.fixme` on Podman
    referencing #274, so they'll auto-pass once fixed rather than needing a
    rewrite. The sibling image-prune tests in the same file are unaffected
    (different underlying command, no pod involvement).
  - The only genuine remaining flakiness: `e2e/backup-restore.spec.ts`'s
    final "Up" step occasionally needs more than 20s when run right after
    several other heavy tests in the same batch (passes reliably alone) —
    ordinary host-load timing, not a logic bug.
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
- **`arch-both` findings (Wave 2, first pass)**:
  - This VM's Docker only exposes a **Rootful** socket — no rootless Docker
    at all. `bulk-actions.spec.ts`'s four pre-existing Docker-default tests
    (`Bulk Down`, `Minimal layout`, `Unix layout`, `Select all`) need real
    Cockpit Administrative access to bring a stack up under a rootful
    socket, which the shared `pluginPage` fixture doesn't provide (only
    `loginWithAdminAccess`, used by `runtime-rootless.spec.ts`'s rootful
    spec, does). Scoped away from `arch-both` with `test.skip` in a
    `test.describe` block rather than silently left failing — a real gap,
    not fixed in this pass, worth a dedicated admin-access variant.
  - `gotify`'s `./data` bind mount on this shared VM had been left
    root-owned by an earlier Docker run (Docker's daemon runs as root) —
    rootless Podman then can't write its sqlite db ("attempt to write a
    readonly database"), so the container exits immediately with the app
    correctly reporting it as stopped. Not an app bug — fixed the ownership
    on the VM directly (`sudo chown -R test:test`) and switched the
    Podman-side runtime-switch tests to `env-test` (no bind mount) to avoid
    depending on that VM-specific fixup persisting.
  - Confirmed while chasing the above: `podman compose` on `arch-both`
    delegates to `/usr/lib/docker/cli-plugins/docker-compose` (Docker's own
    compose-v2 plugin, reporting itself as "Podman Compose: 5.3.1") rather
    than the `podman-compose` (Python) provider `arch-podman` uses — a
    legitimate difference in what "the podman external provider" means
    per-distro/install, not a misconfiguration.
  - Attempted a dedicated admin-access variant of the four skipped tests
    (`loginWithAdminAccess` + Bulk Down under Rootful Docker): the
    underlying escalation capability is already proven working elsewhere
    (`e2e/superuser-prompt.spec.ts` on `fedora-full`), but on `arch-both`
    specifically the very first "Up" click after `loginWithAdminAccess`
    only ever registered as a hover (the row's tooltip appeared, no confirm
    dialog) — combined with a "Cockpit admin mode mismatch" banner
    (`DownedStacksSection.tsx`'s intentional warning for scanning inside the
    admin user's own home directory, not a bug) muddying the picture. Left
    unfixed rather than shipping a test that doesn't reliably pass — the
    gap documented above stands; a real follow-up should probably scan a
    directory outside the admin user's home to sidestep the mismatch banner
    entirely before re-attempting.
- **Issue [#272](https://github.com/RXTX4816/cockpit-compose/issues/272)** (found running the distro-quirks matrix on `fedora-docker`):
  clicking **Close** on the Up progress modal the instant it becomes
  clickable can silently discard a still-finishing `docker compose up` —
  the modal shows the full success log through "Started" but the
  container never actually exists (`docker ps -a` empty, zero `docker
  events` activity). Rigorously reproduced with matched-timing
  before/after comparisons (3 runs each) on `fedora-docker` and
  `arch-docker`; does **not** reproduce on `debian-docker` or
  `arch-podman` despite `arch-docker`/`debian-docker` having *identical*
  Docker and Compose versions — ruled out cgroup driver and
  version as the differentiator. Root cause not confirmed (best working
  theory: a `cockpit.spawn` channel-close timing race, not something
  fixable from this repo alone) — filed with the full repro rather than
  guessing further. This is *why* `fedora-docker` only passed 4/13 in the
  distro matrix above: the other 9 failures are all this same bug hitting
  `upStack()`'s Close click, not per-test gaps.
- **Second pass on Wave 3/4 remainder findings**:
  - `e2e/yaml-editor.spec.ts`'s malformed-YAML test joins the same
    host-load flake class noted above: passes reliably in isolation but can
    time out waiting for the "Save with issues?" confirm dialog when run
    after many prior edits to the same fixture (`gotify`) in a long-lived
    VM session — every failure screenshot shows the correct final state
    already rendered, consistent with CodeMirror's linter work piling up
    under cumulative session load rather than a real app bug. A settle wait
    after typing and generous timeouts reduce but don't eliminate it.
  - §6.23's external-link warning modal doesn't live where the inventory
    originally assumed (StackInfoModal) — that modal's own port badges are
    the same direct-`window.open()` behavior #260 already covers. The real
    `ExternalLinkModal`-backed warning flow is `ContainerTable`'s per-service
    image name link, rendered inside an expanded stack row in the Power
    User/Pretty/Unix layouts — moved to `e2e/stacks.spec.ts` accordingly.
  - The auto-refresh degrade/Retry test breaks the VM's real `podman` binary
    (`sudo mv` it aside via SSH, always restored in a `finally`) rather than
    mocking a network error — the app's poll failure, the "Failed to load
    stacks" alert, and the Retry recovery are all exercised against a
    genuinely broken runtime.
  - Both the Background Tasks and Bulk Actions runtime-switch-race scenarios
    needed a VM with both Docker and Podman installed to exercise a real
    runtime switch (`arch-podman` only has Podman) — completed against
    `arch-both` as part of Wave 2 instead, see the `arch-both` findings above.
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
