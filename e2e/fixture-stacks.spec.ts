import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { closeUpProgress, downStack, downedCard, ensureDown, stackRow } from './helpers/stacks';
import { containerName, engineCli, sshExec } from './helpers/vm';

// Parametrized real-behavior checks for the pre-staged fixture stacks that
// exist in scripts/test-vm.config.sh but have no dedicated scenario of their
// own in docs/testing.md §5 or the manual testing guide — folded into a
// single spec per docs/wiki/E2E-Test-Inventory.md's plan rather than
// duplicated across 6.1/6.13.

test.afterEach(async ({ pluginPage: page }) => {
  for (const name of ['healthcheck', 'restart-policy', 'named-networks', 'crash-loop', 'long-logs']) {
    if (await stackRow(page, name).count()) {
      await downStack(page, name).catch(() => {});
    }
  }
});

async function up(page: import('@playwright/test').Page, name: string) {
  await downedCard(page, name).getByRole('button', { name: 'Up', exact: true }).click();
  await page.getByRole('dialog', { name: new RegExp(`Confirm up.*${name}`) }).getByRole('button', { name: 'Up', exact: true }).click();
  const progress = page.getByRole('dialog', { name: new RegExp(`^Up.*${name}`) });
  await closeUpProgress(progress);
}

test('healthcheck fixture: Stack Info reports the real health state the runtime is in', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(60_000);
  const vm = testInfo.project.name;
  await baseData(page);
  await ensureDown(page, 'healthcheck');
  await up(page, 'healthcheck');

  const row = stackRow(page, 'healthcheck');
  await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });

  // StackInfoModal loads its container data once, when it opens, and never polls, so
  // it can only ever show the state at that instant. Wait for the runtime itself to
  // report healthy *first*, then assert the modal reflects it.
  //
  // This test previously opened the modal immediately and waited 30s for it to turn
  // "healthy", describing itself as proof the label was not "a one-shot snapshot".
  // It cannot show that: a modal that does not refresh never converges. It passed only
  // when `up` happened to take longer than the fixture's 5s start_period, so the
  // container was already healthy before the modal opened — and failed whenever the
  // machine was fast enough to open it first.
  const web = containerName(vm, 'healthcheck', 'web');
  await expect
    .poll(async () => (await sshExec(vm, `${engineCli(vm)} ps --filter name=${web} --format '{{.Status}}' || true`)).trim(), {
      timeout: 30000,
      intervals: [1000],
    })
    .toContain('healthy');

  await row.getByRole('button', { name: 'Stack info' }).click();
  const modal = page.getByRole('dialog', { name: /Info — healthcheck/ });
  await expect(modal).toBeVisible();

  // Both runtimes fold the health state into the uptime text ("Up 20 seconds (healthy)")
  // rather than exposing a separate Health row.
  await expect(modal.getByText('healthy', { exact: false })).toBeVisible({ timeout: 15000 });
  await modal.getByRole('button', { name: 'Close' }).click();
});

test('restart-policy fixture: on-failure and unless-stopped behave differently for real', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'restart-policy');
  await up(page, 'restart-policy');

  const row = stackRow(page, 'restart-policy');
  // Real effect: `flaky` (restart: on-failure, exits after 5s) keeps getting
  // restarted rather than settling into a final "exited" state, so the
  // stack stays partial/running rather than ever fully stopping on its own.
  await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
  await page.waitForTimeout(8000);
  await expect(row).toHaveAttribute('data-status', /running|partial/);

  await row.getByRole('button', { name: 'Stack info' }).click();
  const modal = page.getByRole('dialog', { name: /Info — restart-policy/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('stable', { exact: true })).toBeVisible();
  await expect(modal.getByText('flaky', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Close' }).click();
});

test('named-networks fixture: Stack Info lists each real network the compose file defines', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'named-networks');
  await up(page, 'named-networks');

  const row = stackRow(page, 'named-networks');
  await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
  await row.getByRole('button', { name: 'Stack info' }).click();
  const modal = page.getByRole('dialog', { name: /Info — named-networks/ });
  await expect(modal).toBeVisible();

  // Real effect: all 3 declared networks (dmz, app, data) actually exist and
  // are listed — not a generic "N networks" count.
  await expect(modal.getByText('No networks found', { exact: false })).toHaveCount(0);
  for (const net of ['dmz', 'app', 'data']) {
    await expect(modal.getByText(new RegExp(`named-networks_${net}\\b`))).toBeVisible({ timeout: 10000 });
  }
  await modal.getByRole('button', { name: 'Close' }).click();
});

test('crash-loop fixture: the crashing service actually keeps crashing, the sidecar keeps running', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(60_000);
  const vm = testInfo.project.name;
  await baseData(page);
  await ensureDown(page, 'crash-loop');
  await up(page, 'crash-loop');

  const row = stackRow(page, 'crash-loop');
  // The aggregate badge is deliberately not asserted to be "partial" here.
  // parseStackStatus() derives it from the compose Status string, where a
  // crash-looping container reads "restarting" — which matches neither "running" nor
  // "exit", so a Docker crash-loop aggregates to "running", not "partial". Whether it
  // *should* surface as something else is an app question, not this test's; pinning an
  // exact label made this test assert a runtime-and-timing-specific accident.
  await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });

  // What this test actually claims — that the crasher really is cycling rather than
  // sitting dead — checked against the runtime, which is the only place the restart
  // count is visible at all.
  const crasher = containerName(vm, 'crash-loop', 'crasher');
  const restartsOf = async () =>
    Number((await sshExec(vm, `${engineCli(vm)} inspect -f '{{.RestartCount}}' ${crasher} 2>/dev/null || echo 0`)).trim()) || 0;
  const before = await restartsOf();
  await expect.poll(restartsOf, { timeout: 30000, intervals: [2000] }).toBeGreaterThan(before);

  await row.getByRole('button', { name: 'Stack info' }).click();
  const modal = page.getByRole('dialog', { name: /Info — crash-loop/ });
  await expect(modal).toBeVisible();
  await expect(modal.getByText('sidecar', { exact: true })).toBeVisible();
  await expect(modal.getByText('running', { exact: true }).first()).toBeVisible();
  await modal.getByRole('button', { name: 'Close' }).click();
});

test('long-logs fixture: Logs modal streams real, continuously-growing output', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'long-logs');
  await up(page, 'long-logs');

  const row = stackRow(page, 'long-logs');
  await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
  await row.getByRole('button', { name: 'View logs' }).click();
  const modal = page.getByRole('dialog', { name: /Logs — long-logs/ });
  await expect(modal).toBeVisible();

  // Real effect: real content streams in, and `logger`'s tight sleep-0.3s
  // loop means a later line number is visible a few seconds after the
  // first one — a real growing stream, not a static one-time fetch.
  await expect(modal.getByText(/request \d+ processed/).first()).toBeVisible({ timeout: 15000 });
  const firstLineText = await modal.getByText(/request \d+ processed/).last().textContent();
  const firstN = Number(firstLineText?.match(/request (\d+) processed/)?.[1] ?? 0);
  await page.waitForTimeout(3000);
  const laterLineText = await modal.getByText(/request \d+ processed/).last().textContent();
  const laterN = Number(laterLineText?.match(/request (\d+) processed/)?.[1] ?? 0);
  expect(laterN).toBeGreaterThan(firstN);
  await modal.getByRole('button', { name: 'Close' }).click();
});
