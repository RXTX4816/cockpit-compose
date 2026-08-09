import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow, upStack, withRunningStack } from './helpers/stacks';

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
