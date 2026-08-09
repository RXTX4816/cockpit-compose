import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// `gotify` uses `image: gotify/server` with no explicit tag (implicit :latest —
// see scripts/test-vm.config.sh), so it's expected to trigger the unpinned-image
// warning in the pull confirmation dialog.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('Pull images warns about the unpinned tag, then actually re-pulls the image', async ({ pluginPage: page }) => {
  test.setTimeout(120_000);
  await baseData(page);

  await withRunningStack(page, 'gotify', async () => {
    const row = stackRow(page, 'gotify');
    await row.getByRole('button', { name: 'Pull latest images', exact: true }).click();

    const confirm = page.getByRole('dialog', { name: /Confirm pull — gotify/ });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText('gotify/server', { exact: false })).toBeVisible();
    await expect(confirm.getByText(/unpinned/i).first()).toBeVisible();

    await confirm.getByRole('button', { name: 'Pull', exact: true }).click();

    const modal = page.getByRole('dialog', { name: /Pull — gotify/ });
    await expect(modal).toBeVisible();
    // Real effect: the log viewer actually receives pull progress output, not
    // an immediately-empty/complete modal.
    await expect(modal.getByText('Pull complete', { exact: false })).toBeVisible({ timeout: 60000 });

    // Two "Close" controls exist once done: the header's icon-only close
    // (aria-label "Close") and the footer's text "Close" button — scope to
    // the footer to avoid strict-mode ambiguity.
    await modal.locator('.pm-footer').getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});

test('Run in Background sends the pull to the background task queue instead of blocking the modal', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'gotify', async () => {
    const row = stackRow(page, 'gotify');
    await row.getByRole('button', { name: 'Pull latest images', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: /Confirm pull — gotify/ });
    await confirm.getByRole('button', { name: 'Pull', exact: true }).click();

    const modal = page.getByRole('dialog', { name: /Pull — gotify/ });
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Run in Background' }).click();
    await expect(modal).not.toBeVisible();

    // Real effect: the task actually shows up (and eventually completes) in the
    // background tasks panel, not just that the modal silently closed.
    await page.getByRole('button', { name: 'Background tasks' }).click();
    const panel = page.locator('.btd-panel');
    await expect(panel.getByText('gotify', { exact: false }).first()).toBeVisible({ timeout: 10000 });
    await expect(panel.getByText('Complete', { exact: true })).toBeVisible({ timeout: 60000 });
  });
});
