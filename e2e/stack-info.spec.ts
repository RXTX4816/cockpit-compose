import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, ensureDown, stackRow, upStack, withRunningStack } from './helpers/stacks';
import { sshExec } from './helpers/vm';

// `volumes-test` (db+app, db uses a named volume `pgdata` — see
// scripts/test-vm.config.sh) gives us real services, images, volumes, and a
// network to check against, all in one stack.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'volumes-test').count()) {
    await downStack(page, 'volumes-test').catch(() => {});
  }
});

test('Stack Info shows real services, images, volumes, and networks — not empty placeholders', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);

  await withRunningStack(page, 'volumes-test', async () => {
    const row = stackRow(page, 'volumes-test');
    await row.getByRole('button', { name: 'Stack info', exact: true }).click();

    const modal = page.getByRole('dialog', { name: /Info — volumes-test/ });
    await expect(modal).toBeVisible();

    // Services: real container names/status, not "No containers found".
    await expect(modal.getByText('db', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(modal.getByText('app', { exact: true })).toBeVisible();
    await expect(modal.getByText(/No containers found/i)).toHaveCount(0);

    // Images: the actual images backing those services.
    await expect(modal.getByText('postgres', { exact: false })).toBeVisible();
    await expect(modal.getByText('nginx', { exact: false })).toBeVisible();

    // Volumes: the real named volume declared in the compose file.
    await expect(modal.getByText('volumes-test_pgdata', { exact: true })).toBeVisible();
    await expect(modal.getByText(/No volumes found/i)).toHaveCount(0);

    // Networks: the project's default network. This caught a real bug while
    // writing this spec — on Podman 6.0.1, listNetworkConnectedProjects's
    // `ps --format {{index .Labels "..."}}` Go template errors ("cannot
    // index slice/array with type string"), taking down the whole Networks
    // section with a generic "Could not load networks" alert. Fixed in
    // src/api/stacks/query.ts to go through --format json + JS parsing for
    // the podman branch instead, matching every other podman fallback in
    // that file.
    await expect(modal.getByText('volumes-test_default', { exact: false })).toBeVisible({ timeout: 20000 });
    await expect(modal.getByText('Could not load networks', { exact: false })).toHaveCount(0);

    // Close the modal — otherwise withRunningStack's teardown Down click
    // lands on a row still covered by this modal's backdrop and hangs.
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible();
  });
});

// Regression coverage for §6.13's shared-networks case: no existing fixture
// stack pair actually shares a network by default, so this connects one of
// `multi`'s real containers to `gotify`'s network via SSH (the same real
// container-engine command a user's own docker/podman network connect would
// run) — genuinely making gotify's default network cross-project, not
// simulated in any way.
test('Stack Info flags a network actually shared with another project', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(90_000);
  const vm = testInfo.project.name;
  await baseData(page);
  await ensureDown(page, 'gotify');
  await ensureDown(page, 'multi');
  await upStack(page, 'gotify');
  await upStack(page, 'multi');

  try {
    const runtime = await page.getByRole('button', { name: 'Podman', exact: true }).getAttribute('aria-pressed') === 'true'
      ? 'podman' : 'docker';
    await sshExec(vm, `${runtime} network connect gotify_default multi_web_1 || ${runtime} network connect gotify_default multi-web-1`);

    const row = stackRow(page, 'gotify');
    await row.getByRole('button', { name: 'Stack info', exact: true }).click();
    const modal = page.getByRole('dialog', { name: /Info — gotify/ });
    await expect(modal).toBeVisible();

    // Real effect: the actual other project's name appears next to the
    // network it's genuinely connected to, with the warning icon — not a
    // generic "shared" flag with no indication of who it's shared with.
    await expect(modal.getByText('gotify_default', { exact: false })).toBeVisible({ timeout: 20000 });
    // sharedWith is computed by a per-network round trip after the network
    // list itself loads — give it a moment before polling for the text, a
    // plain expect() alone has been observed racing this render (screenshot
    // at "failure" already shows the correct text, the live poll just
    // never catches it within the window).
    await page.waitForTimeout(2000);
    await expect(modal.locator('td', { hasText: 'multi' })).toBeVisible({ timeout: 20000 });
    await modal.getByRole('button', { name: 'Close' }).click();
  } finally {
    await downStack(page, 'multi').catch(() => {});
    await downStack(page, 'gotify').catch(() => {});
  }
});
