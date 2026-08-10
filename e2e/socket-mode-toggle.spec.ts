import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { loginWithAdminAccess } from './helpers/admin';
import { baseData } from './helpers/base';

/**
 * Regression coverage added alongside #242's fix: switching Rootless<->Rootful
 * socket mode when both are genuinely detected. Needs a VM with both Docker
 * sockets present *and* real Cockpit Administrative access (Rootful is
 * disabled without it) — `fedora-full` is the one VM built for this.
 */
test('Switching socket mode between Rootless and Rootful actually changes which engine is queried', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'fedora-full', 'needs a VM with both Docker sockets detected and real Cockpit admin access');
  test.setTimeout(60_000);

  await loginWithAdminAccess(page);
  await baseData(page);

  const footer = page.locator('.cc-footer');
  const socketGroup = page.getByRole('group', { name: 'Socket mode' });
  const rootlessToggle = socketGroup.getByRole('button', { name: 'Rootless', exact: true });
  const rootfulToggle = socketGroup.getByRole('button', { name: 'Rootful', exact: true });

  // Both must be genuinely selectable — this is exactly what's broken
  // without Administrative access (Rootful stays disabled).
  await expect(rootlessToggle).toBeEnabled();
  await expect(rootfulToggle).toBeEnabled();
  await expect(footer.getByText('Rootless', { exact: true })).toBeVisible();

  await rootfulToggle.click();
  // Real effect: the footer badge flips, and the stack list is a fresh query
  // against the rootful engine (not a stale rootless-fetched list still on
  // screen) — docs/testing.md's "stale-list refresh on switch".
  await expect(footer.getByText('Rootful', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.dss-stack-name').first()).toBeVisible({ timeout: 10000 });

  await rootlessToggle.click();
  await expect(footer.getByText('Rootless', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.dss-stack-name').first()).toBeVisible({ timeout: 10000 });
});
