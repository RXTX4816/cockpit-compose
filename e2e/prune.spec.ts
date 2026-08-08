import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow, upStack } from './helpers/stacks';

// `volumes-test` (db+app, db uses a named volume `pgdata` — see
// scripts/test-vm.config.sh) is brought up then Stopped (not removed) so it
// stays in the running-stacks list with its per-stack Prune action, matching
// testing guide §6.16.1.
//
// NOTE on volume pruning specifically (§6.16.7 "dangling named volume"):
// this scenario looks unreachable through the current UI. Volume detection
// (src/api/stacks.ts listDanglingVolumes()) runs a plain
// `docker volume ls --filter dangling=true` — Docker's own definition,
// which only counts a volume as dangling once *no container at all*
// (running or stopped) references it. But the per-stack Prune action only
// exists on a row in the *running* stacks list, and that row disappears
// (moves to the downed-stacks section, which has no Prune action) the
// moment the stack's container count hits zero — verified live: pruning
// volumes-test's stopped containers via this same modal made the row
// vanish immediately, before a second Prune pass to target the now-truly-
// dangling volume could ever be reached. In other words, by the time a
// volume qualifies as prunable, the UI no longer offers a way to prune it
// for that stack. Flagged as a product question, not fixed here — see
// docs/wiki/E2E-Test-Reference.md's "Known flaky behavior" section.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'volumes-test').count()) {
    await downStack(page, 'volumes-test').catch(() => {});
  }
});

test('Prune removes real stopped containers, not just closes the dialog', async ({ pluginPage: page }) => {
  // See logs.spec.ts for why: Up alone can eat most of the default 30s.
  test.setTimeout(120_000);
  await baseData(page);
  const row = stackRow(page, 'volumes-test');

  try {
    // Self-heal against a previous run's leaked state (see helpers/stacks.ts
    // ensureDown doc comment) before assuming volumes-test starts down.
    await ensureDown(page, 'volumes-test');
    await upStack(page, 'volumes-test');

    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await page.getByRole('dialog', { name: 'Confirm stop' }).getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(row).toHaveAttribute('data-status', 'stopped', { timeout: 15000 });

    await row.getByRole('button', { name: 'More actions for volumes-test' }).click();
    await page.getByRole('menuitem', { name: 'Prune' }).click();

    const selectModal = page.getByRole('dialog', { name: /Prune resources — volumes-test/ });
    await expect(selectModal).toBeVisible();
    await selectModal.locator('#prune-containers').check();
    await selectModal.getByRole('button', { name: 'Preview' }).click();

    const previewModal = page.getByRole('dialog', { name: /Confirm prune — volumes-test/ });
    await expect(previewModal).toBeVisible();
    // Real effect target: the stopped db container listed by name, not just a generic count.
    await expect(previewModal.getByText('volumes-test-db-1', { exact: false })).toBeVisible({ timeout: 10000 });
    await previewModal.getByRole('button', { name: 'Prune selected' }).click();
    await expect(previewModal).not.toBeVisible({ timeout: 20000 });

    // Real effect check: the stack now has zero containers, so it drops out
    // of the running-stacks list entirely (moves to the downed section).
    await expect(row).toHaveCount(0, { timeout: 15000 });
  } finally {
    if (await row.count()) {
      await downStack(page, 'volumes-test').catch(() => {});
    }
  }
});

// Regression test for #247: the Down-Stack table previously had no Prune
// action at all, so a fully-down stack's now-unused image (no container
// anywhere references it once "Down (remove)" has run) was unreachable
// through the UI — matching the exact gap called out in the comment above.
// `gotify` uses a unique image (gotify/server) not shared with any other
// fixture stack, so once it's down its image is unambiguously prunable.
test('Down-Stack table Prune action removes a real unused image for a fully-down stack', async ({ pluginPage: page }) => {
  test.setTimeout(120_000);
  await baseData(page);

  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');
  await downStack(page, 'gotify');

  const card = downedCard(page, 'gotify');
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Prune' }).click();

  const selectModal = page.getByRole('dialog', { name: /Prune resources — gotify/ });
  await expect(selectModal).toBeVisible();
  await selectModal.getByRole('button', { name: 'Preview' }).click();

  const previewModal = page.getByRole('dialog', { name: /Confirm prune — gotify/ });
  await expect(previewModal).toBeVisible();
  // Real effect target: the actual now-unused image, not just a generic count.
  await expect(previewModal.getByText('gotify/server', { exact: false })).toBeVisible({ timeout: 10000 });
  await previewModal.getByRole('button', { name: 'Prune selected' }).click();
  await expect(previewModal).not.toBeVisible({ timeout: 20000 });
});
