import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downedCard, downStack, ensureDown, stackRow, upStack } from './helpers/stacks';

// `volumes-test` (db+app, db uses a named volume `pgdata` — see
// scripts/test-vm.config.sh) is brought up then Stopped (not removed) so it
// stays in the running-stacks list with its per-stack Prune action, matching
// testing guide §6.16.1.
//
// NOTE on volume pruning specifically (§6.16.7 "dangling named volume"): an
// earlier pass assumed that pruning volumes-test's stopped containers makes the
// row disappear immediately, leaving no UI path to reach the now-dangling volume.
// That turned out to be false twice over. On Podman it rested on #274 (Prune
// Containers was a silent no-op there, so the row never lost its containers at
// all) — now fixed. And on both runtimes the row does *not* disappear: `compose
// ls` still lists a known project with zero containers, so it stays as "stopped",
// as the first test below asserts. Whether the dangling-volume UI gap is real is
// therefore still open, but for a different reason than originally recorded, and
// Podman's Prune Containers can now be trusted to do what it claims.
test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'volumes-test').count()) {
    await downStack(page, 'volumes-test').catch(() => {});
  }
});

test('Prune removes real stopped containers, not just closes the dialog', async ({ pluginPage: page }) => {
  // Runs on Podman again since #274 was fixed. This test always asserted the correct
  // behaviour rather than being weakened to match the bug, so removing the skip is all
  // that was needed.
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
    // Real effect target: the stopped db container listed by name, not just a
    // generic count. Podman container names use underscores as the
    // service/index separators (project name's own hyphen is untouched).
    await expect(previewModal.getByText('volumes-test_db_1', { exact: false })).toBeVisible({ timeout: 10000 });
    await previewModal.getByRole('button', { name: 'Prune selected' }).click();
    await expect(previewModal).not.toBeVisible({ timeout: 20000 });

    // Real effect check: the stack itself does NOT drop out of the
    // running-stacks list — `compose ls` (podman and docker alike) still
    // lists a known project even with zero containers, so it stays visible
    // here as "stopped". Its "N services" count also doesn't change (that
    // reflects the compose *file's* defined services, not live container
    // count). (Earlier versions of this test assumed the row would
    // disappear, or that the services count would drop to 0 — both verified
    // false against the real DOM/app behavior.) Stack Info is the one place
    // that actually reflects live container state, so that's what proves
    // the containers are really gone.
    await expect(row).toHaveAttribute('data-status', 'stopped', { timeout: 15000 });
    await row.getByRole('button', { name: 'Stack info' }).click();
    const infoModal = page.getByRole('dialog', { name: /Info — volumes-test/ });
    await expect(infoModal).toBeVisible();
    await expect(infoModal.locator('.sim-no-containers')).toBeVisible({ timeout: 10000 });
    await infoModal.getByRole('button', { name: 'Close' }).click();
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

// `shared-image-a_prunetest` and `shared-image-b_prunetest` (testing guide
// §6.16.3, see scripts/test-vm.config.sh) both use nginx:alpine — Prune must
// not offer to remove an image while ANY stack still has a running container
// using it, even if the stack being pruned itself is fully down.
test('Prune does not offer to remove an image another stack is still using', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);

  await ensureDown(page, 'shared-image-a_prunetest');
  await ensureDown(page, 'shared-image-b_prunetest');
  await upStack(page, 'shared-image-a_prunetest');
  await upStack(page, 'shared-image-b_prunetest');

  try {
    // Down only stack A — its container is gone, but B's is still running
    // and using the same nginx:alpine image.
    await downStack(page, 'shared-image-a_prunetest');

    const card = downedCard(page, 'shared-image-a_prunetest');
    await card.getByRole('button', { name: 'Prune' }).click();
    const selectModal = page.getByRole('dialog', { name: /Prune resources — shared-image-a_prunetest/ });
    await expect(selectModal).toBeVisible();
    await selectModal.getByRole('button', { name: 'Preview' }).click();

    const previewModal = page.getByRole('dialog', { name: /Confirm prune — shared-image-a_prunetest/ });
    await expect(previewModal).toBeVisible();
    // Real effect: nginx:alpine must NOT appear as removable while stack B
    // still has a container using it — not just a generic "nothing to prune".
    await expect(previewModal.getByText('nginx:alpine', { exact: false })).toHaveCount(0);
    await previewModal.getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {});
    if (await previewModal.count()) await page.keyboard.press('Escape');
  } finally {
    await downStack(page, 'shared-image-b_prunetest').catch(() => {});
  }
});

// `exited-containers_prunetest` (testing guide §6.16.6) exits immediately
// (restart: "no"), giving Prune's Containers section a real stopped
// container to list and remove by name.
test('Prune removes a real one-shot exited container by name', async ({ pluginPage: page }) => {
  // Runs on Podman too since #274 was fixed: `podman container prune` silently skips
  // pod-member containers (which every podman-compose stack's containers are), so
  // pruneContainers() now lists and `podman rm`s them directly. The final assertion
  // below — that the container is really gone, not just that the modal closed — is
  // what catches a regression; only checking the modal is how #274 went unnoticed.
  test.setTimeout(60_000);
  await baseData(page);
  await ensureDown(page, 'exited-containers_prunetest');

  // Not using the shared upStack() helper here: it asserts data-status
  // becomes running|partial, but the `job` service (restart: "no") exits
  // immediately, so the stack can settle straight into "stopped" before that
  // assertion ever catches a transient running moment. docker/podman still
  // tracks the exited container, so it stays in the running-stacks table
  // regardless of which of these statuses it lands on.
  await downedCard(page, 'exited-containers_prunetest').getByRole('button', { name: 'Up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: /Confirm up.*exited-containers_prunetest/ });
  await confirm.getByRole('button', { name: 'Up', exact: true }).click();
  const progress = page.getByRole('dialog', { name: /^Up.*exited-containers_prunetest/ });
  await progress.getByRole('button', { name: 'Close' }).click({ timeout: 30000 });

  const row = stackRow(page, 'exited-containers_prunetest');
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole('button', { name: 'More actions for exited-containers_prunetest' }).click();
  await page.getByRole('menuitem', { name: 'Prune' }).click();

  const selectModal = page.getByRole('dialog', { name: /Prune resources — exited-containers_prunetest/ });
  await expect(selectModal).toBeVisible({ timeout: 10000 });
  await selectModal.locator('#prune-containers').check();
  await selectModal.getByRole('button', { name: 'Preview' }).click();

  const previewModal = page.getByRole('dialog', { name: /Confirm prune — exited-containers_prunetest/ });
  await expect(previewModal).toBeVisible();
  await expect(previewModal.getByText('exited-containers_prunetest_job_1', { exact: false })).toBeVisible({ timeout: 10000 });
  await previewModal.getByRole('button', { name: 'Prune selected' }).click();
  await expect(previewModal).not.toBeVisible({ timeout: 20000 });

  // Real effect: the container is actually gone, not just the modal closed.
  await row.getByRole('button', { name: 'Stack info' }).click();
  const infoModal = page.getByRole('dialog', { name: /Info — exited-containers_prunetest/ });
  await expect(infoModal).toBeVisible();
  await expect(infoModal.locator('.sim-no-containers')).toBeVisible({ timeout: 10000 });
  await infoModal.getByRole('button', { name: 'Close' }).click();
});
