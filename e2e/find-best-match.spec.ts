import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData, dismissStartupPodmanPrompt, COMPOSE_DIR } from './helpers/base';
import { downStack, stackRow, upStack, ensureDown } from './helpers/stacks';

// Wave 5 (#227): "Find best match" (actions.find_best_match) infers the compose
// root from the directories of stacks the runtime already knows about, so the
// user doesn't have to remember where their stacks live. It appears in two
// places — the downed-stacks scan bar (DownedStacksSection.tsx) and Create
// Stack's directory field (CreateStackModal.tsx) — and neither had any coverage.
//
// The button is disabled while `stacks.length === 0`, i.e. it can only infer a
// root from *running* stacks. So each test brings a fixture stack up first;
// that is the precondition, not incidental setup.
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

  await page.getByRole('button', { name: 'Infer compose root from active stacks' }).first().click();

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
  // gotify (and everything else) stays down — nothing for the heuristic to work
  // from, so the control must be disabled rather than resolving to a guess.
  await ensureDown(page, 'gotify');

  const button = page.getByRole('button', { name: 'Infer compose root from active stacks' }).first();
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
  await modal.getByRole('button', { name: 'Infer compose root from active stacks' }).click();

  // Same inference, reached through the other entry point.
  await expect(modal.locator('#csm-dir')).toHaveValue(COMPOSE_DIR, { timeout: 15000 });
});
