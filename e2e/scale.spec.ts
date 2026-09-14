import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';
import { engineCli, sshExec } from './helpers/vm';

// Uses `multi`'s `worker` service — it has no host port bindings, so scaling
// it up is safe and won't hit the port-conflict path (see scale_modal.port_conflict_*).
// afterEach is a second safety net alongside withRunningStack's own cleanup.
test.afterEach(async ({ pluginPage: page }) => {
  for (const name of ['multi', 'scale-test']) {
    if (await stackRow(page, name).count()) {
      await downStack(page, name).catch(() => {});
    }
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

// Wave 5 (#227): the port-conflict warning. The test above deliberately scales
// `multi`'s port-less worker to stay off this path, so scale_modal.port_conflict_*
// had never been exercised.
//
// `scale-test`'s `web` publishes a static host port (8085:80). A host port can only
// be bound by one container, so a second replica cannot start. Note this contradicts
// the E2E inventory's planned shape, which expected scaling to "still be allowed"
// with Compose binding only the first replica — the app's own copy
// (scale_modal.port_conflict_inline) says it will fail, so this test follows the
// code rather than the plan.
//
// What is asserted is therefore: the warning appears in both places, it warns
// rather than blocks (Apply stays enabled), and the engine never ends up with more
// than one running `web` — whichever way the CLI reports the conflict.
test('Scaling a service with a static host port warns about the conflict, in the editor and on confirm', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(120_000);
  const vm = testInfo.project.name;
  await baseData(page);

  await withRunningStack(page, 'scale-test', async () => {
    const row = stackRow(page, 'scale-test');
    await row.getByRole('button', { name: 'More actions for scale-test' }).click();
    await page.getByRole('menuitem', { name: 'Scale' }).click();

    const modal = page.getByRole('dialog', { name: 'Scale services modal' });
    await expect(modal).toBeVisible();

    // No warning at the current count of 1 — it must be triggered by the change.
    const inline = modal.getByText('This service has static host port bindings', { exact: false });
    await expect(inline).toHaveCount(0);

    await modal.getByRole('button', { name: 'Increase replicas for web' }).click();

    // Warning #1: inline under the service's counter, on the edit step.
    await expect(inline).toBeVisible();

    // The port-less sibling scales freely and must not pick up the warning.
    await modal.getByRole('button', { name: 'Increase replicas for worker' }).click();
    await expect(inline).toHaveCount(1);

    await modal.getByRole('button', { name: 'Continue' }).click();

    // Warning #2: on the confirm step, a modal-level alert naming the real service,
    // plus the per-service warning icon.
    const alert = modal.getByText('Port conflict likely', { exact: false });
    await expect(alert).toBeVisible();
    await expect(modal.locator('code', { hasText: /^web$/ })).toBeVisible();
    await expect(modal.locator('code', { hasText: /^worker$/ })).toHaveCount(0);
    await expect(modal.locator('svg[title="Has static host port bindings"], [title="Has static host port bindings"]')).toHaveCount(1);

    // It warns, it does not block.
    const apply = modal.getByRole('button', { name: 'Apply' });
    await expect(apply).toBeEnabled();
    await apply.click();

    // Whether the CLI errors or quietly leaves the second replica unstarted, the
    // engine must never report two running `web` containers bound to one port.
    const runningWeb = async () => {
      const out = await sshExec(vm,
        `${engineCli(vm)} ps --filter label=com.docker.compose.project=scale-test --filter label=com.docker.compose.service=web --filter status=running -q`);
      return out.split('\n').filter(Boolean).length;
    };
    await expect.poll(runningWeb, { timeout: 30000 }).toBeLessThanOrEqual(1);

    // And the port-less service did scale — proving Apply genuinely ran rather than
    // being silently swallowed by the conflict.
    const runningWorkers = async () => {
      const out = await sshExec(vm,
        `${engineCli(vm)} ps --filter label=com.docker.compose.project=scale-test --filter label=com.docker.compose.service=worker --filter status=running -q`);
      return out.split('\n').filter(Boolean).length;
    };
    await expect.poll(runningWorkers, { timeout: 30000 }).toBe(2);

    // Close whatever state the modal ended in (error alert or already dismissed).
    if (await modal.isVisible()) {
      await page.keyboard.press('Escape');
    }
  });
});
