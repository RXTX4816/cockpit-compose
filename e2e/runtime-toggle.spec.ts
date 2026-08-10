import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { sshExec } from './helpers/vm';

// Requires both Docker and Podman installed — only `arch-both` has both, so
// every test here is scoped to that project rather than running (and
// trivially no-oping or erroring) everywhere else.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'arch-both', 'needs both Docker and Podman installed to exercise a real runtime switch');
});

test('Switching to Podman shows the experimental-support confirm dialog and actually switches the active runtime', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);

  await expect(page.locator('.dss-stack-name').first()).toBeVisible();
  await page.getByRole('button', { name: 'Podman', exact: true }).click();

  const confirm = page.getByRole('dialog', { name: 'Switch to Podman' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('experimental', { exact: false })).toBeVisible();
  await confirm.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(confirm).not.toBeVisible();

  // Real effect: the footer badge reflects the actual active runtime.
  await expect(page.getByText('Podman:', { exact: false })).toBeVisible({ timeout: 15000 });

  // Runtime switch intentionally clears the downed-stacks scan (a separate
  // documented behavior, §6.2) — re-scanning under the new runtime must
  // still genuinely work, proving the switch really queries `podman`, not a
  // stale Docker-backed cache.
  await expect(page.getByText('No compose stacks are running', { exact: false })).toBeVisible({ timeout: 10000 });
  await baseData(page);
  await expect(page.locator('.dss-stack-name').first()).toBeVisible({ timeout: 10000 });

  // Switching back to Docker needs no confirmation.
  await page.getByRole('button', { name: 'Docker', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Docker', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await baseData(page);
  await expect(page.locator('.dss-stack-name').first()).toBeVisible({ timeout: 10000 });
});

// Regression coverage for §6.20/6.21's "not installed" revert: temporarily
// hides the real `podman` binary via SSH (always restored in `finally`) so
// switching to Podman genuinely fails detection, rather than mocking it.
test('Switching to a runtime that is not actually installed reverts and shows a warning', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);

  await sshExec('arch-both', 'sudo mv /usr/bin/podman /usr/bin/podman.e2e-disabled');
  try {
    await page.getByRole('button', { name: 'Podman', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Switch to Podman' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(confirm).not.toBeVisible();

    // Real effect: detection genuinely fails against the missing binary, so
    // the toggle reverts to Docker and a "not found" warning appears.
    await expect(page.getByText('Podman not found', { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'Docker', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await sshExec('arch-both', 'sudo mv /usr/bin/podman.e2e-disabled /usr/bin/podman');
  }
});
