import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow, upStack, withRunningStack } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

// Uses gotify (always pre-staged, always down at VM boot). afterEach forces
// it back down even if an assertion above throws mid-test — otherwise a
// failed run here leaves gotify running and breaks every other spec's
// baseData() setup on a re-run against the same VM.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('Up starts a downed stack, Down removes it again — real status transitions, not just UI toasts', async ({ pluginPage: page }) => {
  // See e2e/logs.spec.ts for why: Up alone can eat most of the default 30s under VM load.
  test.setTimeout(60_000);
  await baseData(page);

  // Self-heal against a previous run's leaked state before assuming gotify starts down.
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');
  await expect(stackRow(page, 'gotify')).toHaveAttribute('data-status', /running|partial/);

  await downStack(page, 'gotify');
  await expect(stackRow(page, 'gotify')).toHaveCount(0);
});

// `profiles` (app always-on + debug[dev] + monitoring[monitoring] — see
// scripts/test-vm.config.sh) tests the Up confirm dialog's profile checkboxes.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'profiles').count()) {
    await downStack(page, 'profiles').catch(() => {});
  }
});

test('Start with a profile selected only starts that profile\'s services, not every profile', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'profiles');

  await downedCard(page, 'profiles').getByRole('button', { name: 'Up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: /Confirm up.*profiles/ });
  await expect(confirm.getByRole('checkbox', { name: 'dev' })).toBeVisible();
  await confirm.getByRole('checkbox', { name: 'dev' }).check();
  await confirm.getByRole('button', { name: 'Up', exact: true }).click();
  const progress = page.getByRole('dialog', { name: /^Up.*profiles/ });
  await progress.getByRole('button', { name: 'Close' }).click({ timeout: 30000 });
  await expect(stackRow(page, 'profiles')).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });

  // Real effect: Stack Info shows `debug` (profile: dev) running, `monitoring`
  // (profile: monitoring, not selected) absent.
  await stackRow(page, 'profiles').getByRole('button', { name: 'Stack info', exact: true }).click();
  const info = page.getByRole('dialog', { name: /Info — profiles/ });
  await expect(info.getByText('debug', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(info.getByText('monitoring', { exact: true })).toHaveCount(0);
  await info.getByRole('button', { name: 'Close' }).click();
});

// Uses `multi` (web/cache/worker — see scripts/test-vm.config.sh).
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'multi').count()) {
    await downStack(page, 'multi').catch(() => {});
  }
});

test('Stop leaves the stack in the list as stopped; Start (no confirm dialog) brings it back', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await withRunningStack(page, 'multi', async () => {
    const row = stackRow(page, 'multi');
    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirm stop' }).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', 'stopped', { timeout: 15000 });

    // Start (not Up) re-runs `start` on already-created containers, no confirm dialog.
    await row.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });

    // NOTE: docs/wiki/Stacks-Dashboard.md lists Restart under the ⋮ "more"
    // menu, but in this (Power User / default) row layout it's actually a
    // direct icon button (StackRow.tsx) — MinimalCard's layout does put it
    // in its kebab menu, so the doc is only half-wrong depending on layout.
    await row.getByRole('button', { name: 'Restart', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirm restart' }).getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });
  });
});

test('Kill sends SIGKILL immediately and the stack drops out of the running list', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'multi');
  await upStack(page, 'multi');

  const row = stackRow(page, 'multi');
  await row.getByRole('button', { name: 'More actions for multi' }).click();
  await page.getByRole('menuitem', { name: 'Kill' }).click();
  await page.getByRole('dialog', { name: 'Confirm kill' }).getByRole('button', { name: 'Kill all containers' }).click();
  await expect(row).toHaveCount(0, { timeout: 15000 });
});

// Wave 5 (#227): Pause / Unpause. Nothing in the suite clicked either before — the
// only "pause" in e2e/ was the unrelated log-stream pause in logs.spec.ts.
//
// Pause lives in the row's ⋮ menu and, unlike Stop or Kill, runs immediately with
// no confirmation dialog. The menu item's label flips to "Unpause" while paused,
// so the same entry drives both directions.
//
// `multi`'s worker loops forever, so every container stays running until paused —
// a clean baseline where "paused" can only come from this action.
test('Pause freezes a running stack\'s real containers, and Unpause resumes them', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  const vm = testInfo.project.name;
  const states = () =>
    sshExec(vm, `${engineCli(vm)} ps -a --filter label=com.docker.compose.project=multi --format "{{.State}}"`)
      .then(out => out.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean));

  await baseData(page);
  await ensureDown(page, 'multi');
  await upStack(page, 'multi');

  const row = stackRow(page, 'multi');
  try {
    // --- Pause ---
    await row.getByRole('button', { name: 'More actions for multi' }).click();
    await page.getByRole('menuitem', { name: 'Pause', exact: true }).click();

    await expect(row).toHaveAttribute('data-status', 'paused', { timeout: 20000 });

    // Real effect: the engine itself reports every container paused — the badge
    // alone could come from a stale or optimistic state.
    await expect.poll(async () => (await states()).every(s => s === 'paused'), { timeout: 20000 }).toBe(true);

    // While paused, the entry offers the reverse action rather than Pause again.
    await row.getByRole('button', { name: 'More actions for multi' }).click();
    await expect(page.getByRole('menuitem', { name: 'Pause', exact: true })).toHaveCount(0);

    // --- Unpause ---
    await page.getByRole('menuitem', { name: 'Unpause', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });
    await expect.poll(async () => (await states()).every(s => s === 'running'), { timeout: 20000 }).toBe(true);
  } finally {
    // A stack left paused can make Down misbehave on some engines, so unpause it
    // out-of-band before the teardown tries to remove it.
    await sshExec(vm, `${engineCli(vm)} unpause $(${engineCli(vm)} ps -q --filter label=com.docker.compose.project=multi --filter status=paused) 2>/dev/null`).catch(() => {});
    if (await row.count()) await downStack(page, 'multi').catch(() => {});
  }
});
