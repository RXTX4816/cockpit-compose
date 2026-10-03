import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, dismissStartupPodmanPrompt, COMPOSE_DIR } from './helpers/base';
import { downStack, ensureNoRunningStacks, stackRow, upStack, ensureDown } from './helpers/stacks';

// Wave 5 (#227): "Find best match" (actions.find_best_match) infers the compose
// root from the directories of stacks the runtime already knows about, so the
// user doesn't have to remember where their stacks live. It appears in two
// places — the downed-stacks scan bar (DownedStacksSection.tsx) and Create
// Stack's directory field (CreateStackModal.tsx) — and neither had any coverage.
//
// The button is disabled while `stacks.length === 0`, i.e. it can only infer a
// root from *running* stacks. So each test brings a fixture stack up first;
// that is the precondition, not incidental setup.
// The control has two accessible names depending on layout: the default layout
// renders a labelled button ("Find best match", with the longer phrasing only as a
// `title`, which does not contribute to the accessible name), while the minimal
// layout renders an icon-only button carrying that phrasing as its aria-label.
// Matching either keeps these tests valid in both layouts.
const FIND_BEST_MATCH = /Find best match|Infer compose root from active stacks/;

test.afterEach(async ({ pluginPage: page }) => {
  if (await stackRow(page, 'gotify').count()) {
    await downStack(page, 'gotify').catch(() => {});
  }
});

test('Find best match infers the real compose root from a running stack, and scanning it finds stacks', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');

  // Clear the directory field first so a resolved value is unambiguously the
  // button's doing and not left over from baseData()'s scan.
  const scanInput = page.getByLabel('Compose directory');
  await scanInput.fill('/tmp');

  await page.getByRole('button', { name: FIND_BEST_MATCH }).first().click();

  // Real effect #1: the field resolves to the actual compose root on disk,
  // inferred from gotify's own directory (COMPOSE_DIR/gotify).
  await expect(scanInput).toHaveValue(COMPOSE_DIR, { timeout: 15000 });

  // Real effect #2 — the point of the feature: scanning the inferred path
  // genuinely finds stacks there. Asserting only the input's value would pass
  // even if the button wrote a plausible-looking but wrong path.
  await scanInput.press('Enter');
  await expect(page.locator('.dss-stack-name').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.dss-stack-name', { hasText: 'multi' }).first()).toBeVisible({ timeout: 15000 });
});

test('Find best match is unavailable with no running stacks to infer from', async ({ pluginPage: page }) => {
  await dismissStartupPodmanPrompt(page);
  await baseData(page);
  // Nothing may be running — the control is disabled purely on `stacks.length === 0`,
  // so any stack an earlier spec left up keeps it enabled and this assertion fails on
  // what ran before it. Downing gotify alone was not enough.
  await ensureNoRunningStacks(page);

  const button = page.getByRole('button', { name: FIND_BEST_MATCH }).first();
  await expect(button).toBeDisabled();
});

test('Create Stack offers Find best match for its directory field too', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  await ensureDown(page, 'gotify');
  await upStack(page, 'gotify');

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();

  await modal.locator('#csm-dir').fill('/tmp');
  await modal.getByRole('button', { name: FIND_BEST_MATCH }).click();

  // Same inference, reached through the other entry point.
  await expect(modal.locator('#csm-dir')).toHaveValue(COMPOSE_DIR, { timeout: 15000 });

  // Close the dialog before finishing: afterEach downs gotify through the page
  // underneath, and a modal left open intercepts those clicks — the hook then burns
  // the whole remaining test budget and fails a test whose body passed.
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal).not.toBeVisible({ timeout: 10000 });
});
