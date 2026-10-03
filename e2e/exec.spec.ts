import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

// Uses `multi`'s `worker` service (busybox, always available — see
// scripts/test-vm.config.sh). Verifies a real command actually executes
// inside the container (output appears in the terminal), not just that the
// modal opens. afterEach is a second safety net alongside withRunningStack's
// own cleanup, in case a hard test-timeout aborts before that runs.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'multi').count()) {
    await downStack(page, 'multi').catch(() => {});
  }
});

test('Shell opens a real terminal in the container and shows real command output', async ({ pluginPage: page }) => {
  // See logs.spec.ts for why: Up alone can eat most of the default 30s.
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'multi', async () => {
    await stackRow(page, 'multi').getByRole('button', { name: 'Shell' }).click();
    const modal = page.getByRole('dialog', { name: /Shell — multi/ });
    await expect(modal).toBeVisible();

    // The service list loads asynchronously and defaults selectedService to
    // the first entry once it resolves — selecting before that finishes
    // gets silently overwritten back to the default. Wait for the option
    // to exist, then confirm the value actually stuck before proceeding.
    const serviceSelect = modal.locator('#em2-service');
    await expect(serviceSelect.locator('option[value="worker"]')).toHaveCount(1);
    await serviceSelect.selectOption('worker');
    await expect(serviceSelect).toHaveValue('worker');
    await modal.getByRole('button', { name: 'Open shell' }).click();

    const terminal = modal.locator('.em2-terminal');
    await expect(terminal.locator('.xterm')).toBeVisible({ timeout: 10000 });

    // xterm.js only routes keyboard input once its own element has focus —
    // clicking "Open shell" leaves DOM focus on that button, not the newly
    // mounted terminal, so keystrokes would otherwise go nowhere.
    await terminal.click();

    // A distinctive marker proves the command actually ran in the container,
    // not just that a terminal widget rendered.
    await page.keyboard.type('echo e2e-exec-marker-12345');
    await page.keyboard.press('Enter');
    await expect(terminal).toContainText('e2e-exec-marker-12345', { timeout: 10000 });

    await modal.getByRole('button', { name: 'Disconnect' }).click();
    await expect(modal).not.toBeVisible();
  });
});

// Wave 5 (#227): command history. Exec and Run share HistoryDatalist, which feeds a
// native <datalist> from localStorage (useInputHistory, key
// "cockpit-compose:history:exec-command"). Nothing asserted before that a command,
// once used, is offered again.
//
// Playwright can't drive a browser's native datalist dropdown, so the assertion is
// the rendered <option> the browser autocompletes from, wired to the input by its
// `list` attribute — the real DOM contract, not the in-memory React state. Reopening
// the modal proves it came back from storage rather than surviving in a component.
test('Shell remembers a used command and offers it again after reopening', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  // Start from empty history so a previous run can't satisfy the assertion.
  await page.evaluate(() => localStorage.removeItem('cockpit-compose:history:exec-command')).catch(() => {});

  const CMD = 'sh';

  await withRunningStack(page, 'multi', async () => {
    const openShellModal = async () => {
      await stackRow(page, 'multi').getByRole('button', { name: 'Shell' }).click();
      const modal = page.getByRole('dialog', { name: /Shell — multi/ });
      await expect(modal).toBeVisible();
      const serviceSelect = modal.locator('#em2-service');
      await expect(serviceSelect.locator('option[value="worker"]')).toHaveCount(1);
      await serviceSelect.selectOption('worker');
      await expect(serviceSelect).toHaveValue('worker');
      return modal;
    };

    // First use: nothing to offer yet.
    let modal = await openShellModal();
    await expect(modal.locator('#em2-shell-history option')).toHaveCount(0);
    await modal.locator('#em2-shell').fill(CMD);
    await modal.getByRole('button', { name: 'Open shell' }).click();
    await expect(modal.locator('.em2-terminal .xterm')).toBeVisible({ timeout: 10000 });
    await modal.getByRole('button', { name: 'Disconnect' }).click();
    await expect(modal).not.toBeVisible();

    // Second use: the command comes back as a suggestion on the same input.
    modal = await openShellModal();
    await expect(modal.locator('#em2-shell')).toHaveAttribute('list', 'em2-shell-history');
    await expect(modal.locator(`#em2-shell-history option[value="${CMD}"]`)).toHaveCount(1);

    await page.keyboard.press('Escape');
  });
});
