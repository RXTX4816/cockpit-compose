import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// Uses `multi`'s `worker` service — it has no host port bindings, so scaling
// it up is safe and won't hit the port-conflict path (see scale_modal.port_conflict_*).
// afterEach is a second safety net alongside withRunningStack's own cleanup.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'multi').count()) {
    await downStack(page, 'multi').catch(() => {});
  }
});

test('Scaling a service up actually creates the extra replicas, not just closes the dialog', async ({ pluginPage: page }) => {
  // See logs.spec.ts for why: Up alone can eat most of the default 30s.
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    const row = stackRow(page, 'multi');
    await row.getByRole('button', { name: 'More actions for multi' }).click();
    await page.getByRole('menuitem', { name: 'Scale' }).click();

    const modal = page.getByRole('dialog', { name: 'Scale services modal' });
    await expect(modal).toBeVisible();

    await modal.getByRole('button', { name: 'Increase replicas for worker' }).click();
    await modal.getByRole('button', { name: 'Increase replicas for worker' }).click();
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Apply' }).click();
    await expect(modal).not.toBeVisible({ timeout: 20000 });

    // Real effect: expand the row and confirm 3 worker replicas actually exist.
    await row.locator('#toggle-multi').click();
    const workerGroup = page.locator('#expand-multi').locator('.ct-row', { hasText: 'worker' });
    await expect(workerGroup.getByText('×3')).toBeVisible({ timeout: 15000 });
  });
});
