import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// Uses `multi` (web/cache/worker — see scripts/test-vm.config.sh) so Top has
// more than one service section to show real, distinct process lists for.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'multi').count()) {
    await downStack(page, 'multi').catch(() => {});
  }
});

test('Top shows real per-service process output (docker/podman compose top equivalent)', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    const row = stackRow(page, 'multi');
    await row.getByRole('button', { name: 'More actions for multi' }).click();
    await page.getByRole('menuitem', { name: 'Top' }).click();

    const modal = page.getByRole('dialog', { name: /Top — multi/ });
    await expect(modal).toBeVisible();

    // Real effect: each service gets its own section with real ps output —
    // worker runs `sh -c "while true; do echo worker-tick; ..."`, so `sh`
    // (or the busybox `sleep`/`echo` it spawns) should show up as a real
    // command, not a placeholder or empty table.
    await expect(modal.getByText('worker', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(modal.getByText('web', { exact: true })).toBeVisible();
    await expect(modal.getByText('No running processes found.')).toHaveCount(0);
    await expect(modal.getByRole('columnheader', { name: 'PID' }).first()).toBeVisible();

    // Refresh re-fetches without erroring.
    await modal.getByRole('button', { name: 'Refresh' }).click();
    await expect(modal.getByText('worker', { exact: true })).toBeVisible({ timeout: 10000 });

    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});

test('Top is not reachable for a downed stack — the downed-stacks table has no "more actions" menu at all', async ({ pluginPage: page }) => {
  test.setTimeout(30_000);
  await baseData(page);
  if (await stackRow(page, 'gotify').count()) await downStack(page, 'gotify').catch(() => {});

  const gotifyDownedRow = page.locator('[data-status="down"]').filter({ has: page.locator('#dss-name-gotify') });
  await expect(gotifyDownedRow).toBeVisible();
  await expect(gotifyDownedRow.getByRole('button', { name: 'More actions for gotify' })).toHaveCount(0);
});
