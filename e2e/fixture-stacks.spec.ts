import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, downedCard, ensureDown, stackRow } from './helpers/stacks';

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
  await progress.getByRole('button', { name: 'Close' }).click({ timeout: 30000 });
}

test('healthcheck fixture: Stack Info reflects real healthcheck transitions, not a static label', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'healthcheck');
  await up(page, 'healthcheck');

  const row = stackRow(page, 'healthcheck');
  await expect(row).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
  await row.getByRole('button', { name: 'Stack info' }).click();
  const modal = page.getByRole('dialog', { name: /Info — healthcheck/ });
  await expect(modal).toBeVisible();

  // Real effect: the compose file's healthcheck (start_period 5s, 10s
  // interval) genuinely converges to "healthy" — not a one-shot snapshot
  // frozen at whatever it showed on first render. Podman folds the health
  // state directly into the uptime text ("Up 1 second (healthy)") rather
  // than a separate "Health" row.
  await expect(modal.getByText('healthy', { exact: false })).toBeVisible({ timeout: 30000 });
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

test('crash-loop fixture: the crashing service actually keeps crashing, the sidecar keeps running', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'crash-loop');
  await up(page, 'crash-loop');

  const row = stackRow(page, 'crash-loop');
  // Real effect: `crasher` (restart: on-failure, exits immediately) never
  // reaches a steady "running" state, so the stack settles into "partial"
  // (sidecar up, crasher cycling) rather than "running".
  await expect(row).toHaveAttribute('data-status', 'partial', { timeout: 20000 });

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
