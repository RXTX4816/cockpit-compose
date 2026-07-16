# E2E Test Reference

Living reference documenting every automated Playwright end-to-end test in `e2e/`: what it does, what it actually asserts (real backend effect vs. UI state), its preconditions, and which VMs it's meant to run against. Update this file in the same PR that adds, changes, or removes a spec.

For the *backlog* of tests still to be written, see [E2E Test Inventory](E2E-Test-Inventory.md). For how to run the suite and manage VMs, see [VM Testing](VM-Testing.md) and [docs/testing.md](../testing.md).

## Shared infrastructure (`e2e/helpers/`)

| File | Purpose |
|---|---|
| `base.ts` | `baseData(page)` — logs in, dismisses the podman-only startup prompt if present, imports/scans the pre-staged compose directory. Retries the whole open→fill→submit sequence up to 5 times because rootless Podman's local component state gets reset for a few seconds after a runtime switch (see "Known flaky behavior" below). `dismissStartupPodmanPrompt(page)` — standalone, for specs that don't need a scan. `FIXTURE_STACKS` — names of every pre-staged fixture stack (kept in sync with `scripts/test-vm.config.sh`). |
| `stacks.ts` | Composable stack actions: `downedCard`, `stackRow`, `upStack`, `downStack`, `openYamlEditor` (uses `force: true` on its click — see "Known flaky behavior"), `yamlEditorContent`, `ensureDown` (force a stack down first, self-healing against a previous run's leaked state), `withRunningStack` (runs a callback against a temporarily-up stack, always brings it back down in a `finally`, even on failure; calls `ensureDown` first). |
| `runtime.ts` | `switchRuntime(page, 'docker'|'podman')`, `expectRootless(page, bool)` — runtime/rootless assertions. |

**Design principle:** every test here asserts a real effect (file content, container/volume state, a status attribute) rather than only "is this element visible" — see the discussion in issue #227.

## VM scope legend

- **Canonical** — runs on `arch-podman`, `arch-docker`, `arch-both` (one VM per engine-mode); most feature tests only need this.
- **Full matrix** — meant to also run across `debian-*`/`fedora-*` because it's specifically about rootless/rootful or engine differences.
- **Podman-only** — self-skips via `test.skip()` unless the Playwright project name includes `podman`.

## Tests

### `e2e/login.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `reaches the plugin page` | URL matches the plugin route and `#root` renders. | Canonical |
| `shows the Compose Stacks heading` | Main heading renders after dismissing the podman-only startup prompt if present. | Canonical |

### `e2e/stacks.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Compose Stacks heading is visible` | Heading renders (`exact: true` — an empty-state heading "No compose stacks are running" would otherwise substring-match "Compose Stacks"). | Canonical |
| `scan finds pre-staged stacks` | Scanning `/home/test/testcompose` surfaces the `gotify` fixture in the downed-stacks list. | Canonical |
| `each found stack has an Edit compose file button` | Each downed stack card exposes an "Edit compose file" action. | Canonical |

### `e2e/yaml-editor.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `YAML editor modal opens` | Dialog renders for `gotify`. | Canonical |
| `editor contains YAML content` | CodeMirror content actually contains `gotify` (real file content, not a placeholder). | Canonical |
| `Save button is present` | Save control renders once Edit is clicked. | Canonical |
| `Cancel exits edit mode without closing the modal` | Cancel reverts to read-only (Save disappears) without closing the dialog. | Canonical |
| `closing the modal returns to the main view` | Close hides the dialog and returns to the main heading. | Canonical |

### `e2e/stack-lifecycle.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Up starts a downed stack, Down removes it again` | Clicking Up → confirming the recreate-warning dialog → closing the progress modal results in a real `data-status="running"|"partial"` row (not just a closed dialog); Down then removes that row entirely. `afterEach` force-downs `gotify` even if the test throws, so a failure can't leak a running container into the next test/run. | Canonical |

### `e2e/rootless-compose-root.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Create Stack suggests the home directory when rootless and no stacks exist yet` | The Create dialog's directory field defaults to `/home/test/compose` under rootless Podman. Self-skips on Docker VMs (they run rootful here). | Podman-only |

### `e2e/logs.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Logs modal streams, filters by service, searches, pauses, clears, and refreshes` | Real log lines from the `worker` service (`multi` fixture, emits `worker-tick` every 3s) stream in; filtering to one service still shows its lines; searching for a non-matching string hides all lines; Pause/Resume toggles the button label; Clear empties the viewer and new lines repopulate it; Refresh doesn't error. Brings `multi` up via `withRunningStack` and back down afterward. | Canonical |

### `e2e/exec.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Shell opens a real terminal in the container and shows real command output` | Typing `echo e2e-exec-marker-12345` into the xterm session and pressing Enter produces that exact marker in the terminal output — proves a command actually executed inside the `worker` container, not just that a terminal widget rendered. Requires an explicit `terminal.click()` before typing: xterm.js only routes keyboard input to itself once it has DOM focus, and clicking "Open shell" leaves focus on that button, not the newly mounted terminal — without the click, keystrokes go nowhere and the assertion fails looking like the terminal itself vanished. | Canonical |

### `e2e/scale.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Scaling a service up actually creates the extra replicas` | Scaling `multi`'s `worker` service from 1→3 via the Scale dialog results in a real "×3" replica badge in the expanded container list — not just that the dialog closed. `worker` has no host port bindings, so this avoids the port-conflict path. | Canonical |

### `e2e/prune.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Prune removes real stopped containers, not just closes the dialog` | Stopping `volumes-test` and pruning with the Containers checkbox actually removes the named, stopped `volumes-test-db-1` container — verified by name in the preview, then confirmed the stack drops out of the running list entirely (zero containers left). | Canonical |

**Volume pruning specifically (testing guide §6.16.7, "dangling named volume") looks unreachable through the current UI** — see the file's own header comment for the full writeup. Docker only considers a volume "dangling" once *zero* containers (running or stopped) reference it (`docker volume ls --filter dangling=true`, `src/api/stacks.ts listDanglingVolumes()`), but the per-stack Prune action only exists on a row in the *running* stacks list — and that row disappears (moves to the downed section, which has no Prune action at all) the instant the stack's container count hits zero. Verified live: pruning `volumes-test`'s stopped containers via this same Prune modal made the row vanish immediately, before a second Prune pass targeting the now-truly-dangling `pgdata` volume could ever be reached. By the time a volume qualifies as prunable, the UI no longer offers a way to prune it for that stack. This is flagged as a product question worth raising, not something fixed in the test.

### `e2e/create-stack.spec.ts`

| Test | Asserts | VM scope |
|---|---|---|
| `Create Stack (manual method) actually creates a compose file on disk` | Creating a stack via the Manual method (pre-filled stub YAML, no template/git dependency) results in a directory a fresh rescan can actually find on disk. Deletes the throwaway stack afterward so repeat runs stay clean. | Canonical |

### `e2e/adversarial.spec.ts`

Deliberately-hostile input — the point is "does the app fail safely," not "does it render."

| Test | Asserts | VM scope |
|---|---|---|
| `Saving malformed YAML warns instead of silently corrupting the compose file` | Replacing `gotify`'s compose file with invalid YAML and clicking Save surfaces a "Save with issues?" confirm dialog (per `YamlModal.tsx handleSave()`) rather than saving silently. Canceling out of that dialog leaves the on-disk file untouched — reopening the editor shows the original content, not the malformed text. | Canonical |
| `Scanning a directory that does not exist fails gracefully instead of crashing` | Scanning a nonexistent path produces a visible "Nothing found"/"Scan failed" state and the rest of the UI (main heading) stays usable — no hang, no dead page. | Canonical |
| `Scan-depth stepper clamps at its documented bounds (1-5)` | Clicking the decrease button 8 times in a row still leaves the depth at `1` (disabled, doesn't go to 0 or negative); clicking increase 10 times in a row leaves it at `5` (disabled, doesn't run away past its documented max). | Canonical |

## Verification status

Everything above was written by reading the source (`src/components/`, `src/i18n/locales/en.json`, `src/api/`) for exact selectors/behavior, then actually run against live QEMU VMs repeatedly — not just typechecked. Every failure hit along the way was individually root-caused (see git history / PR discussion for the blow-by-blow); the fixes are already folded into the specs and helpers described above.

- **Confirmed passing, repeatedly, on `arch-docker`**: `login`, `stacks`, `yaml-editor`, `stack-lifecycle`, `create-stack`, `logs` (needs `VM_MEM=2048`+, see below), `exec`, `scale`, `prune`, and two of `adversarial`'s three tests (nonexistent-directory, scan-depth bounds).
- **Confirmed passing on `arch-podman`**: `rootless-compose-root` (podman-only, self-skips elsewhere), plus the general suite after fixing the podman-startup-prompt and scan-panel-reset issues described below.
- **One test with unresolved intermittent flakiness**: `adversarial.spec.ts`'s "Saving malformed YAML..." case. Its underlying behavior has been directly verified correct multiple times over via screenshot (the "Save with issues?" dialog shows the right content; canceling genuinely leaves the file untouched) — the remaining failures are a `TimeoutError` on a single click (`openYamlEditor`'s "Edit compose file" button) that happens under sustained host load. In the session this was diagnosed in, the *host* (not just the test VM) was down to ~1.4GB free RAM with swap active and a load average of ~4, concurrently running the user's own interactive desktop (VSCode, browser tabs) alongside the QEMU/Chromium/ffmpeg test workload — `force: true` on the click made no difference, which rules out a CSS-transition/stability-check issue and points at genuine host-level contention instead. Re-run this specific test on a quiet host before trusting its result; if it still fails there, treat it as a real regression.

## Known flaky behavior (not test bugs)

- **VM memory pressure on Postgres/exec-heavy specs**: `volumes-test` (used by `prune.spec.ts`) runs Postgres, and `exec.spec.ts` drives a real PTY/websocket session — both meaningfully heavier than the rest of the suite. At the `VM_MEM=1024` default, `free -h` *inside the guest* showed it actively swapping (~950 MB total RAM available to the VM), producing exactly the symptoms of a hung app (dialogs timing out, a session silently failing to open). Not parallel-worker contention — identical failures reproduced with `--workers=1`, fully serial. Fix: `VM_MEM=2048`+ for VMs running these specs (`logs.spec.ts` went from consistently failing to consistently passing on the same VM after only a memory bump, no code change). See [VM Testing](VM-Testing.md#environment-overrides).
- **Host-level contention beyond the VM**: distinct from the above — if the *host machine* itself is under load (swapping, high load average, especially from concurrent interactive use), individual Playwright actions can time out waiting for elements that are demonstrably present and correct (confirmed via screenshot). `force: true` does not help here since the bottleneck isn't an actionability/stability check, it's the browser/renderer process not getting scheduled promptly. There is no good in-test fix for this beyond generous timeouts; if you hit it, check `free -h` and `uptime` on the host before assuming a code regression.
- **Rootless Podman panel resets**: for a few seconds after switching to Podman (or on podman-only VMs where the app auto-switches on load), something keeps resetting `DownedStacksSection`'s local state — an opened import panel, typed directory, or even an in-flight scan can get wiped mid-flow. `baseData()` retries the entire open→fill→submit sequence (not just individual clicks) to absorb this. If you see `TimeoutError` waiting for `.dss-stack-name` specifically on a podman VM, this is the likely cause — check the screenshot before assuming a real regression.
- **A previous run's leaked state cascades into the next**: if a hard test-timeout kills the page before `afterEach`/`finally` cleanup runs, a stack (`gotify`, `multi`, `volumes-test`) can be left running, which then makes the *next* run's `upStack()` fail immediately (it expects to find the stack in the downed list) — a single real failure can look like several in a row. `ensureDown()` (in `helpers/stacks.ts`, called by `withRunningStack` and at the start of `stack-lifecycle`/`prune`) self-heals this by forcing the stack down before assuming its starting state.
- **Element detached / retry #1 passes**: occasional Playwright-level auto-retry on clicks (`element was detached from the DOM, retrying`) under heavy VM load. The suite's `retries: 1` config absorbs this; if a test fails on *both* the initial run and the retry, treat it as real.

## Adding a new test

1. Add the spec under `e2e/`, reusing `e2e/helpers/` where possible — don't re-implement login/scan/stack-action flows inline.
2. Prefer `exact: true` on `getByRole` name matches for any short/common word ("Up", "Import", "Create", "Compose Stacks") — this codebase has repeatedly hit substring collisions (e.g. "Up" matching "Backup", "Create" matching "Create stack"). Assume collision until proven otherwise.
3. If the test mutates state (creates/starts/deletes a stack), guarantee cleanup with `try/finally` or a `test.afterEach`, not just a final step — a thrown assertion mid-test must not leak state into the next run.
4. Add an entry to this file and, if it fills in a 🚧 row, flip it to ✅ in [E2E Test Inventory](E2E-Test-Inventory.md).
