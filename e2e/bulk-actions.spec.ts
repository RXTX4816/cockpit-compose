import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, ensureDown, stackRow, upStack } from './helpers/stacks';

// `gotify` and `env-test` (see scripts/test-vm.config.sh) are both simple
// single-service stacks safe to bulk-Down together. Distinct from the
// downed-stacks bulk-Up feature (e2e/downed-stacks-bulk.spec.ts) — this is
// docs/wiki/Bulk-Actions.md's selection bar for already-*running* stacks.
test.afterEach(async ({ pluginPage: page }) => {
  for (const name of ['gotify', 'env-test']) {
    if (await stackRow(page, name).count()) {
      await downStack(page, name).catch(() => {});
    }
  }
});

test('Bulk Down on selected running stacks actually stops and removes every selected stack', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await ensureDown(page, 'env-test');
  await upStack(page, 'gotify');
  await upStack(page, 'env-test');

  // Per docs/wiki/Bulk-Actions.md: the row checkbox is hidden until the row
  // is hovered/focused, or at least one stack is already selected — force
  // the first check to bypass that CSS-visibility actionability gate.
  await stackRow(page, 'gotify').locator('input[type="checkbox"]').check({ force: true });
  await stackRow(page, 'env-test').locator('input[type="checkbox"]').check();

  const bulkBar = page.getByTestId('sv-bulk-bar');
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar.getByText('2 selected', { exact: false })).toBeVisible();

  await bulkBar.getByRole('button', { name: 'Down (remove containers)' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm bulk action' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('gotify')).toBeVisible();
  await expect(confirm.getByText('env-test')).toBeVisible();
  await confirm.getByRole('button', { name: 'Down', exact: true }).click();
  await expect(confirm).not.toBeVisible();

  // Real effect: both stacks actually stop and get removed, run as
  // background tasks per docs/wiki/Bulk-Actions.md — not just the modal closing.
  await expect(stackRow(page, 'gotify')).toHaveCount(0, { timeout: 30000 });
  await expect(stackRow(page, 'env-test')).toHaveCount(0, { timeout: 30000 });
});

test('Select all selects every displayed running stack, and shows indeterminate for a partial selection', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await ensureDown(page, 'env-test');
  await upStack(page, 'gotify');
  await upStack(page, 'env-test');

  await stackRow(page, 'gotify').locator('input[type="checkbox"]').check({ force: true });
  const selectAll = page.getByTestId('sv-select-all');
  await expect(selectAll).toBeVisible();
  // Partial selection (only gotify, not env-test) → not checked (indeterminate).
  await expect(selectAll).not.toBeChecked();

  await selectAll.click();
  await expect(stackRow(page, 'gotify').locator('input[type="checkbox"]')).toBeChecked();
  await expect(stackRow(page, 'env-test').locator('input[type="checkbox"]')).toBeChecked();

  // Toggling off (now truly "all" selected) clears every selection.
  await selectAll.click();
  await expect(stackRow(page, 'gotify').locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(stackRow(page, 'env-test').locator('input[type="checkbox"]')).not.toBeChecked();
});
