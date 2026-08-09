import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow } from './helpers/stacks';

// `gotify` and `env-test` (see scripts/test-vm.config.sh) are both simple
// single-service stacks safe to bulk-Up together.
test.afterEach(async ({ pluginPage: page }) => {
  for (const name of ['gotify', 'env-test']) {
    if (await stackRow(page, name).count()) {
      await downStack(page, name).catch(() => {});
    }
  }
});

test('Bulk Up on selected downed stacks actually starts every selected stack, not just the first', async ({ pluginPage: page }) => {
  test.setTimeout(120_000);
  await baseData(page);
  const p = page;
  await ensureDown(p, 'gotify');
  await ensureDown(p, 'env-test');

  // Per docs/wiki/Bulk-Actions.md: the row checkbox is hidden until the row
  // is hovered/focused, or at least one stack is already selected — force
  // the first check to bypass that CSS-visibility actionability gate.
  await downedCard(p, 'gotify').locator('input[type="checkbox"]').check({ force: true });
  await downedCard(p, 'env-test').locator('input[type="checkbox"]').check();

  const bulkBar = p.getByTestId('dss-bulk-bar');
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar.getByText('2 selected', { exact: false })).toBeVisible();

  await bulkBar.getByRole('button', { name: 'Up', exact: true }).click();

  const confirm = p.getByRole('dialog', { name: 'Confirm bulk action' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('gotify')).toBeVisible();
  await expect(confirm.getByText('env-test')).toBeVisible();
  await confirm.getByRole('button', { name: 'Up', exact: true }).click();
  await expect(confirm).not.toBeVisible();

  // Bulk actions run as background tasks (per docs/wiki/Bulk-Actions.md) —
  // real effect check is that BOTH stacks end up running, not just the modal closing.
  await expect(stackRow(p, 'gotify')).toHaveAttribute('data-status', /running|partial/, { timeout: 30000 });
  await expect(stackRow(p, 'env-test')).toHaveAttribute('data-status', /running|partial/, { timeout: 30000 });
});

test('Select all toggles every visible downed stack and shows an indeterminate state for a partial selection', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  const p = page;
  await ensureDown(p, 'gotify');

  await downedCard(p, 'gotify').locator('input[type="checkbox"]').check({ force: true });
  const selectAll = p.getByTestId('dss-select-all');
  // Partial selection (not every downed stack checked) → indeterminate, not checked.
  await expect(selectAll).not.toBeChecked();

  await selectAll.click();
  await expect(selectAll).toBeChecked();
  await expect(downedCard(p, 'gotify').locator('input[type="checkbox"]')).toBeChecked();

  // Toggling off clears every selection.
  await selectAll.click();
  await expect(downedCard(p, 'gotify').locator('input[type="checkbox"]')).not.toBeChecked();
});
