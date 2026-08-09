import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// Uses `multi`'s `worker` service (busybox — see scripts/test-vm.config.sh).
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'multi').count()) {
    await downStack(page, 'multi').catch(() => {});
  }
});

test('Run command executes a real one-off command and streams its actual output', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    const row = stackRow(page, 'multi');
    await row.getByRole('button', { name: 'More actions for multi' }).click();
    await page.getByRole('menuitem', { name: 'Run', exact: true }).click();

    const modal = page.getByRole('dialog', { name: /Run — multi/ });
    await expect(modal).toBeVisible();

    await modal.locator('#rm-service').selectOption('worker');
    // A distinctive marker proves the command actually ran in the container,
    // not just that the modal transitioned to its "running" step.
    await modal.locator('#rm-command').fill('echo e2e-run-marker-98765');
    await modal.getByRole('button', { name: 'Run', exact: true }).click();

    await expect(modal.getByText('e2e-run-marker-98765')).toBeVisible({ timeout: 20000 });
    await expect(modal.getByText('Command complete', { exact: false })).toBeVisible({ timeout: 20000 });

    // The modal has two "Close" buttons once done: the header's icon-only
    // close (aria-label "Close") and the footer's primary "Close" button —
    // scope to the footer (role="contentinfo") to avoid strict-mode ambiguity.
    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});

test('Run command with --entrypoint override replaces the entrypoint instead of appending arguments', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    const row = stackRow(page, 'multi');
    await row.getByRole('button', { name: 'More actions for multi' }).click();
    await page.getByRole('menuitem', { name: 'Run', exact: true }).click();

    const modal = page.getByRole('dialog', { name: /Run — multi/ });
    await modal.locator('#rm-service').selectOption('worker');
    await modal.locator('#rm-command').fill('/bin/echo e2e-override-marker-24680');
    await modal.getByRole('checkbox', { name: /Override entrypoint/ }).check();
    await modal.getByRole('button', { name: 'Run', exact: true }).click();

    // Real effect: the overridden entrypoint actually ran and printed via /bin/echo,
    // not the default entrypoint receiving these words as arguments to a shell loop.
    await expect(modal.getByText('e2e-override-marker-24680')).toBeVisible({ timeout: 20000 });

    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
  });
});
