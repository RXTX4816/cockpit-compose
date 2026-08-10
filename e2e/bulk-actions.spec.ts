import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { downStack, ensureDown, stackRow, upStack } from './helpers/stacks';

// `gotify` and `env-test` (see scripts/test-vm.config.sh) are both simple
// single-service stacks safe to bulk-Down together. Distinct from the
// downed-stacks bulk-Up feature (e2e/downed-stacks-bulk.spec.ts) — this is
// docs/wiki/Bulk-Actions.md's selection bar for already-*running* stacks.
test.afterEach(async ({ pluginPage: page }) => {
  for (const name of ['gotify', 'env-test']) {
    if (await stackRow(page, name).count()) {
      await downStack(page, name).catch(() => {});
    }
  }
});

// These four tests default to Docker (the app's default runtime) and never
// touch the socket-mode toggle. On `arch-both` specifically, Docker has no
// rootless socket at all — only Rootful, which needs real Cockpit
// Administrative access that the shared pluginPage fixture doesn't provide
// (see e2e/runtime-rootless.spec.ts's loginWithAdminAccess for the one spec
// that does). Discovered while adding this file's runtime-switch coverage;
// scoped away from that project rather than silently left failing — a real
// gap worth a dedicated admin-access variant, not fixed in this pass.
test.describe('Docker-default selection behavior', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name === 'arch-both', 'this VM\'s Docker is Rootful-only and needs real Cockpit admin access this fixture lacks — see file header comment');
  });

  test('Bulk Down on selected running stacks actually stops and removes every selected stack', async ({ pluginPage: page }) => {
    test.setTimeout(90_000);
    await baseData(page);
    await ensureDown(page, 'gotify');
    await ensureDown(page, 'env-test');
    await upStack(page, 'gotify');
    await upStack(page, 'env-test');

    // Per docs/wiki/Bulk-Actions.md: the row checkbox is hidden until the row
    // is hovered/focused, or at least one stack is already selected — force
    // the first check to bypass that CSS-visibility actionability gate.
    await stackRow(page, 'gotify').locator('input[type="checkbox"]').check({ force: true });
    await stackRow(page, 'env-test').locator('input[type="checkbox"]').check();

    const bulkBar = page.getByTestId('sv-bulk-bar');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.getByText('2 selected', { exact: false })).toBeVisible();

    await bulkBar.getByRole('button', { name: 'Down (remove containers)' }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirm bulk action' });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText('gotify')).toBeVisible();
    await expect(confirm.getByText('env-test')).toBeVisible();
    await confirm.getByRole('button', { name: 'Down', exact: true }).click();
    await expect(confirm).not.toBeVisible();

    // Real effect: both stacks actually stop and get removed, run as
    // background tasks per docs/wiki/Bulk-Actions.md — not just the modal closing.
    await expect(stackRow(page, 'gotify')).toHaveCount(0, { timeout: 30000 });
    await expect(stackRow(page, 'env-test')).toHaveCount(0, { timeout: 30000 });
  });

  // docs/wiki/Bulk-Actions.md: selection control differs per layout — Power
  // User's checkbox is covered above; Minimal/Pretty select via clicking the
  // card itself (blue glow ring, no checkbox), Unix via a `[ ]`/`[x]` bracket
  // toggle. Real effect checked here is the bulk bar's live count, proving the
  // click actually registered as a selection in each layout's own model, not
  // just a visual class flip.
  test('Minimal layout selects stacks by clicking the card itself, not a checkbox', async ({ pluginPage: page }) => {
    test.setTimeout(60_000);
    await baseData(page);
    await ensureDown(page, 'gotify');
    await ensureDown(page, 'env-test');
    await upStack(page, 'gotify');
    await upStack(page, 'env-test');

    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('button', { name: 'Minimal', exact: true }).click();

    const gotifyCard = page.getByRole('button', { name: /^gotify —/ });
    const envCard = page.getByRole('button', { name: /^env-test —/ });
    await expect(gotifyCard).toBeVisible({ timeout: 10000 });
    await gotifyCard.click();
    await expect(gotifyCard).toHaveAttribute('aria-pressed', 'true');

    const bulkBar = page.getByTestId('sv-bulk-bar');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.getByText('1 selected', { exact: false })).toBeVisible();

    await envCard.click();
    await expect(bulkBar.getByText('2 selected', { exact: false })).toBeVisible();

    // Clicking again deselects — real toggle, not a one-way flag.
    await gotifyCard.click();
    await expect(gotifyCard).toHaveAttribute('aria-pressed', 'false');
    await expect(bulkBar.getByText('1 selected', { exact: false })).toBeVisible();
  });

  test('Unix layout selects stacks via the [ ]/[x] bracket toggle', async ({ pluginPage: page }) => {
    test.setTimeout(90_000);
    await baseData(page);
    await ensureDown(page, 'gotify');
    await upStack(page, 'gotify');

    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('button', { name: 'Unix', exact: true }).click();

    const gotifyRow = page.locator('[data-stack-name="gotify"]');
    await expect(gotifyRow).toBeVisible({ timeout: 10000 });
    const toggle = gotifyRow.locator('.ur-key--select');
    await expect(toggle).toHaveText('[ ]');

    await toggle.click();
    await expect(toggle).toHaveText('[x]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const bulkBar = page.getByTestId('sv-bulk-bar');
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.getByText('1 selected', { exact: false })).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveText('[ ]');

    // Unix layout's Down control is a bracket key ("[down]"), not the
    // "Down (remove containers)" button the shared afterEach's downStack()
    // helper targets — switch back to Power User so teardown works normally.
    await page.getByRole('button', { name: 'Change layout' }).click();
    await page.getByRole('button', { name: 'Power User', exact: true }).click();
  });

  test('Select all selects every displayed running stack, and shows indeterminate for a partial selection', async ({ pluginPage: page }) => {
    test.setTimeout(60_000);
    await baseData(page);
    await ensureDown(page, 'gotify');
    await ensureDown(page, 'env-test');
    await upStack(page, 'gotify');
    await upStack(page, 'env-test');

    await stackRow(page, 'gotify').locator('input[type="checkbox"]').check({ force: true });
    const selectAll = page.getByTestId('sv-select-all');
    await expect(selectAll).toBeVisible();
    // Partial selection (only gotify, not env-test) → not checked (indeterminate).
    await expect(selectAll).not.toBeChecked();

    await selectAll.click();
    await expect(stackRow(page, 'gotify').locator('input[type="checkbox"]')).toBeChecked();
    await expect(stackRow(page, 'env-test').locator('input[type="checkbox"]')).toBeChecked();

    // Toggling off (now truly "all" selected) clears every selection.
    await selectAll.click();
    await expect(stackRow(page, 'gotify').locator('input[type="checkbox"]')).not.toBeChecked();
    await expect(stackRow(page, 'env-test').locator('input[type="checkbox"]')).not.toBeChecked();
  });
});

// docs/wiki/Bulk-Actions.md: switching the Docker/Podman runtime clears the
// selection (unlike switching layout, which deliberately preserves it —
// covered by the Minimal/Unix tests above). Needs a real runtime switch, so
// only runs where both Docker and Podman are actually installed.
test('Switching runtime clears the bulk selection', async ({ pluginPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'arch-both', 'needs both Docker and Podman installed to exercise a real runtime switch');
  test.setTimeout(60_000);
  await baseData(page);
  // This VM's Docker only exposes a Rootful socket (no rootless Docker at
  // all), which needs real Cockpit Administrative access the shared
  // pluginPage fixture doesn't have. Start under Podman instead — already
  // proven to work rootless elsewhere in this suite — and switch *to*
  // Docker to observe the clear, since only switching *to* Podman needs its
  // own confirm dialog in the way.
  //
  // Uses `env-test`, not `gotify`: gotify's `./data` bind mount on this
  // shared arch-both VM got left root-owned by an earlier Docker run
  // (Docker's daemon runs as root) — rootless Podman then can't write
  // gotify's sqlite db ("attempt to write a readonly database"), so the
  // container exits immediately. env-test has no bind mount, so it isn't
  // exposed to that ownership conflict.
  await page.getByRole('button', { name: 'Podman', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch to Podman' }).getByRole('button', { name: 'Continue', exact: true }).click();
  await baseData(page);

  await ensureDown(page, 'env-test');
  await upStack(page, 'env-test');

  await stackRow(page, 'env-test').locator('input[type="checkbox"]').check({ force: true });
  const bulkBar = page.getByTestId('sv-bulk-bar');
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar.getByText('1 selected', { exact: false })).toBeVisible();

  await page.getByRole('button', { name: 'Docker', exact: true }).click();

  // Real effect: the bulk bar itself is gone, not just visually reset.
  await expect(bulkBar).not.toBeVisible({ timeout: 15000 });

  // env-test is still running under Podman — switch back and tear it down
  // directly here (rather than trusting the shared afterEach's `.catch(() =>
  // {})`, which silently swallowed this exact cleanup once already, leaking
  // a running Podman stack into whichever test happened to run next).
  await page.getByRole('button', { name: 'Podman', exact: true }).click();
  await page.getByRole('dialog', { name: 'Switch to Podman' }).getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(stackRow(page, 'env-test')).toHaveAttribute('data-status', /running|partial/, { timeout: 15000 });
  await downStack(page, 'env-test');
});
