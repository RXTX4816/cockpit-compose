import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

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

// Wave 5 (#227): command history, Run side — see the matching test in
// e2e/exec.spec.ts for why the datalist <option> is the assertion.
test('Run remembers a used command and offers it again after reopening', async ({ pluginPage: page }) => {
  test.setTimeout(120_000);
  await baseData(page);
  await page.evaluate(() => localStorage.removeItem('cockpit-compose:history:run-command')).catch(() => {});

  const CMD = 'echo e2e-run-history-24680';

  await withRunningStack(page, 'multi', async () => {
    const openRunModal = async () => {
      await stackRow(page, 'multi').getByRole('button', { name: 'More actions for multi' }).click();
      await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
      const modal = page.getByRole('dialog', { name: /Run — multi/ });
      await expect(modal).toBeVisible();
      return modal;
    };

    let modal = await openRunModal();
    await expect(modal.locator('#rm-command-history option')).toHaveCount(0);
    await modal.locator('#rm-service').selectOption('worker');
    await modal.locator('#rm-command').fill(CMD);
    await modal.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(modal.getByText('Command complete', { exact: false })).toBeVisible({ timeout: 30000 });
    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();

    modal = await openRunModal();
    await expect(modal.locator('#rm-command')).toHaveAttribute('list', 'rm-command-history');
    await expect(modal.locator(`#rm-command-history option[value="${CMD}"]`)).toHaveCount(1);

    await page.keyboard.press('Escape');
  });
});

// Wave 5 (#227): "Remove container after run (--rm)" unchecked. Both tests above
// leave it at its default (checked), so nobody had confirmed the one-off container
// actually survives when it's turned off.
//
// `multi`'s worker loops forever, so none of the stack's own containers ever exit.
// Any *exited* container for the project after the run can therefore only be the
// one-off — which makes a before/after count of exited containers an unambiguous,
// engine-agnostic check without relying on the compose oneoff label, which not
// every backend sets.
test('Run with --rm unchecked leaves the one-off container behind, exited', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(120_000);
  const vm = testInfo.project.name;
  const exitedCount = async () => {
    const out = await sshExec(vm,
      `${engineCli(vm)} ps -a --filter label=com.docker.compose.project=multi --filter status=exited -q`);
    return out.split('\n').filter(Boolean).length;
  };

  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    const before = await exitedCount();

    await stackRow(page, 'multi').getByRole('button', { name: 'More actions for multi' }).click();
    await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
    const modal = page.getByRole('dialog', { name: /Run — multi/ });
    await expect(modal).toBeVisible();

    await modal.locator('#rm-service').selectOption('worker');
    await modal.locator('#rm-command').fill('echo e2e-run-keep-13579');

    const rm = modal.locator('#rm-remove');
    await expect(rm).toBeChecked(); // default is on; this test is about turning it off
    await rm.uncheck();
    await expect(rm).not.toBeChecked();

    await modal.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(modal.getByText('e2e-run-keep-13579')).toBeVisible({ timeout: 30000 });
    await expect(modal.getByText('Command complete', { exact: false })).toBeVisible({ timeout: 30000 });
    await modal.getByRole('contentinfo').getByRole('button', { name: 'Close' }).click();

    // Real effect: exactly one new exited container exists — the one-off, kept.
    await expect.poll(exitedCount, { timeout: 20000 }).toBe(before + 1);
  });

  // withRunningStack's `down` removes project containers, including a kept one-off;
  // this is a belt-and-braces sweep in case Down was skipped by an earlier failure.
  await sshExec(vm,
    `${engineCli(vm)} rm -f $(${engineCli(vm)} ps -aq --filter label=com.docker.compose.project=multi --filter status=exited) 2>/dev/null`).catch(() => {});
});
