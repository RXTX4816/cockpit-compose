import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, stackRow, withRunningStack } from './helpers/stacks';

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
