import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';
import { sshExec } from './helpers/vm';

// Uses `gotify` (single service — see scripts/test-vm.config.sh) brought up
// just for this test. Restarting it out-of-band (over SSH, not through the
// UI — the row underneath the Events modal is covered by its backdrop and
// can't be clicked) produces a real stop/die/start sequence of events.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('Events modal streams real container lifecycle events, not just a static table', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'gotify', async () => {
    const row = stackRow(page, 'gotify');
    await row.getByRole('button', { name: 'More actions for gotify' }).click();
    await page.getByRole('menuitem', { name: 'Events' }).click();

    const modal = page.getByRole('dialog', { name: /Events — gotify/ });
    await expect(modal).toBeVisible();

    // EventsModal auto-starts streaming on mount (useEffect(() => start(), [])) —
    // the "Stream events" button never appears in the normal open flow, only
    // "Stop" (this is what made the very first version of this spec hang: it
    // waited to click a "Stream events" button that was never there).
    await expect(modal.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();

    // Real effect: restart the container for real, out-of-band, and confirm
    // the resulting events actually arrive in the table (not a fabricated row).
    await sshExec(
      testInfo.project.name,
      `podman restart $(podman ps -q --filter label=com.docker.compose.project=gotify) || docker restart $(docker ps -q --filter label=com.docker.compose.project=gotify)`,
    );

    await expect(modal.getByText('start', { exact: true }).first()).toBeVisible({ timeout: 20000 });

    await modal.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Stream events' })).toBeVisible();
    await modal.getByRole('button', { name: 'Clear' }).click();
    await expect(modal.locator('.em-table')).toHaveCount(0);

    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});
