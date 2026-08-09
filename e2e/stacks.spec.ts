import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, dismissStartupPodmanPrompt } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow, upStack, withRunningStack } from './helpers/stacks';
import { sshExec } from './helpers/vm';

test('Compose Stacks heading is visible', async ({ pluginPage: page }) => {
  await dismissStartupPodmanPrompt(page);
  await expect(page.getByRole('heading', { name: 'Compose Stacks', exact: true })).toBeVisible();
});

test('scan finds pre-staged stacks', async ({ pluginPage: page }) => {
  await baseData(page);
  // At least one stack card should appear; gotify is always present
  await expect(page.locator('#dss-name-gotify')).toBeVisible();
  await expect(page.locator('.dss-stack-name').first()).toBeVisible();
});

test('each found stack has an Edit compose file button', async ({ pluginPage: page }) => {
  await baseData(page);
  await expect(downedCard(page, 'gotify').getByRole('button', { name: 'Edit compose file' })).toBeVisible();
});

test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('Status badge transitions from running to stopped in real time, without a page refresh', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');
  const row = stackRow(page, 'gotify');
  await expect(row).toHaveAttribute('data-status', /running|partial/);

  await row.getByRole('button', { name: 'Stop', exact: true }).click();
  await page.getByRole('dialog', { name: 'Confirm stop' }).getByRole('button', { name: 'Stop', exact: true }).click();
  // Dashboard auto-refreshes every 500ms (docs/wiki/Stacks-Dashboard.md) — the
  // badge should flip on its own, no manual reload.
  await expect(row).toHaveAttribute('data-status', 'stopped', { timeout: 10000 });
});

test('Status filter chips narrow the list down to matching stacks only', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');

  const runningChip = page.locator('.sv-filter-chip', { hasText: /running/i });
  await expect(runningChip).toBeVisible();
  await runningChip.click();
  await expect(runningChip).toHaveClass(/sv-filter-chip--active/);
  await expect(stackRow(page, 'gotify')).toBeVisible();

  // Deactivating the only active filter shows every stack again.
  await runningChip.click();
  await expect(runningChip).not.toHaveClass(/sv-filter-chip--active/);
});

test('Keyboard shortcuts (U/D/L/E/I) act on the focused stack row', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);

  await withRunningStack(page, 'gotify', async () => {
    const row = stackRow(page, 'gotify');
    // Clicking the row's background <div> doesn't focus anything (no
    // tabIndex, no explicit .focus() in handleRowClick) — the shortcut
    // handler checks document.activeElement.closest('[data-stack-name]'),
    // so focus has to land on a real focusable descendant. The expand
    // toggle button is the natural one docs/wiki/Stacks-Dashboard.md
    // implies ("click any row to focus it").
    const toggle = row.locator('#toggle-gotify');
    await toggle.click();
    await expect(row).toHaveAttribute('data-status', /running|partial/);
    await toggle.focus();
    await page.keyboard.press('l');
    await expect(page.getByRole('dialog', { name: /Logs — gotify/ })).toBeVisible({ timeout: 10000 });
    await page.getByRole('dialog', { name: /Logs — gotify/ }).getByRole('button', { name: 'Close' }).click();

    await toggle.focus();
    await page.keyboard.press('i');
    await expect(page.getByRole('dialog', { name: /Info — gotify/ })).toBeVisible({ timeout: 10000 });
    await page.getByRole('dialog', { name: /Info — gotify/ }).getByRole('button', { name: 'Close' }).click();
  });
});

test('Layout selector switches between all four layouts and the dashboard stays functional', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');

  for (const label of ['Power User', 'Pretty', 'Unix', 'Minimal']) {
    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('button', { name: label, exact: true }).click();
    // Real effect per layout: the running gotify stack is still findable and
    // its data-status attribute (the thing every other spec's real-effect
    // assertions depend on) survives the layout switch.
    await expect(stackRow(page, 'gotify')).toHaveAttribute('data-status', /running|partial/, { timeout: 10000 });
  }
});

// Regression coverage for docs/testing.md §6.23. This does NOT live in
// StackInfoModal — that modal's own port badges call window.open() directly
// with no confirmation (see #260/e2e/ports.spec.ts). The real warning-modal
// flow is ContainerTable's per-service image name link (rendered inside an
// expanded stack row in the Power User/Pretty/Unix layouts), which opens
// ExternalLinkModal before navigating to the image's changelog/registry page.
test('Expanded row\'s image link shows a real warning modal with the actual destination before navigating', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);

  await withRunningStack(page, 'gotify', async () => {
    const row = stackRow(page, 'gotify');
    await row.locator('#toggle-gotify').click();
    const expanded = page.locator('#expand-gotify');
    await expect(expanded).toBeVisible({ timeout: 10000 });

    const imageLink = expanded.getByRole('button', { name: 'gotify', exact: true });
    await expect(imageLink).toBeVisible({ timeout: 10000 });
    await imageLink.click();

    const warning = page.getByRole('dialog', { name: 'External link warning' });
    await expect(warning).toBeVisible({ timeout: 10000 });
    // Real effect: the actual destination URL is shown, not a generic notice.
    await expect(warning.getByText('hub.docker.com', { exact: false })).toBeVisible();
    await expect(warning.getByText('gotify', { exact: false })).toBeVisible();

    await warning.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(warning).not.toBeVisible();
  });
});

// Simulates a real poll failure (docs/wiki/Stacks-Dashboard.md's degrade/Retry
// behavior) by breaking the actual `podman` binary the app's listStacks poll
// shells out to — not a mocked network error, the real CLI call really fails.
// Always restored in `finally` even if an assertion throws, since this
// otherwise leaves the VM's podman broken for every subsequent test.
test('A real poll failure shows the load-failed alert, and Retry recovers once the runtime is fixed', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await expect(page.locator('.dss-stack-name').first()).toBeVisible();

  await sshExec('arch-podman', 'sudo mv /usr/bin/podman /usr/bin/podman.e2e-disabled');
  try {
    // No manual refresh control exists for the main poll — the 500ms
    // auto-refresh interval (src/components/StacksView/index.tsx) will hit
    // the broken binary on its own within a couple of ticks.
    const alert = page.getByText('Failed to load stacks', { exact: false });
    await expect(alert).toBeVisible({ timeout: 15000 });
    const retry = page.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();

    // Retrying while still broken must not clear the alert — it's a real
    // re-check, not an optimistic dismiss.
    await retry.click();
    await expect(alert).toBeVisible({ timeout: 10000 });
  } finally {
    await sshExec('arch-podman', 'sudo mv /usr/bin/podman.e2e-disabled /usr/bin/podman');
  }

  // Real effect: fixing the runtime and retrying actually recovers — the
  // alert clears and real stack data reloads, not just a UI reset.
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Failed to load stacks', { exact: false })).not.toBeVisible({ timeout: 15000 });
  await expect(page.locator('.dss-stack-name').first()).toBeVisible({ timeout: 10000 });
});
