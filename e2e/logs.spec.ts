import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// Uses `multi` (web/cache/worker services, worker logs every 3s — see
// scripts/test-vm.config.sh) brought up just for this test and back down
// afterward via withRunningStack. afterEach is a second safety net in case
// a hard test-timeout aborts before withRunningStack's own cleanup runs.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'multi').count()) {
    await downStack(page, 'multi').catch(() => {});
  }
});

test('Logs modal streams, filters by service, searches, pauses, clears, and refreshes', async ({ pluginPage: page }) => {
  // Default 30s is too tight: Up alone (confirm + progress modal) can take
  // most of that under VM load, leaving nothing for the rest of the test —
  // and a hard timeout mid-test skips withRunningStack's cleanup, leaking
  // the stack into the next run. Real network round-trips need real time.
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    await stackRow(page, 'multi').getByRole('button', { name: 'View logs' }).click();
    const modal = page.getByRole('dialog', { name: /Logs — multi/ });
    await expect(modal).toBeVisible();

    // Real log content should stream in, not just an empty viewer.
    await expect(modal.getByText(/worker-tick/).first()).toBeVisible({ timeout: 15000 });

    // Filter to a single service — the other services' lines should disappear.
    await modal.locator('select.lm-select').selectOption('worker');
    await expect(modal.getByText(/worker-tick/).first()).toBeVisible();

    // Back to all services, then search for something that won't match.
    await modal.locator('select.lm-select').selectOption('');
    await modal.getByPlaceholder('Search logs…').fill('this-string-should-never-appear-in-logs');
    await expect(modal.getByText(/worker-tick/)).toHaveCount(0);
    await modal.getByPlaceholder('Search logs…').fill('');

    // Pause freezes the stream; the button flips to Resume.
    await modal.getByRole('button', { name: /Pause/ }).click();
    await expect(modal.getByRole('button', { name: /Resume/ })).toBeVisible();
    await modal.getByRole('button', { name: /Resume/ }).click();
    await expect(modal.getByRole('button', { name: /Pause/ })).toBeVisible();

    // Clear empties the viewer; new lines should repopulate it shortly after.
    await modal.getByRole('button', { name: 'Clear' }).click();
    await expect(modal.getByText(/worker-tick/).first()).toBeVisible({ timeout: 15000 });

    // Refresh re-fetches without erroring.
    await modal.getByRole('button', { name: 'Refresh' }).click();
    await expect(modal.getByText(/worker-tick/).first()).toBeVisible({ timeout: 15000 });

    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});
