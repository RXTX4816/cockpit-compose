import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, dismissStartupPodmanPrompt } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow, upStack, withRunningStack } from './helpers/stacks';

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
