import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/** The downed-stacks (not-running) card for a given stack name, scan results section. */
export function downedCard(page: Page, name: string): Locator {
  return page.locator('[data-status="down"]').filter({ has: page.locator(`#dss-name-${name}`) });
}

/** The running/managed stack row for a given stack name, regardless of view mode (table/card). */
export function stackRow(page: Page, name: string): Locator {
  return page.locator(`[data-stack-name="${name}"]`);
}

/**
 * Starts a downed stack: clicks "Up", confirms the recreate-warning dialog,
 * waits for the progress modal to finish, closes it, then asserts a real
 * running/partial status row appears — the real state transition, not just
 * a toast or spinner. Note: the downed-stacks list is a static directory
 * scan result, not live status, so the stack's entry there is expected to
 * persist until the directory is rescanned — don't assert it disappears.
 */
export async function upStack(page: Page, name: string) {
  // exact: true — "Up" would otherwise substring-match the row's "Backup" button too.
  await downedCard(page, name).getByRole('button', { name: 'Up', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: new RegExp(`Confirm up.*${name}`) });
  await confirm.getByRole('button', { name: 'Up', exact: true }).click();

  const progress = page.getByRole('dialog', { name: new RegExp(`^Up.*${name}`) });
  await closeUpProgress(progress);

  await expect(stackRow(page, name)).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });
}

/**
 * Waits for an Up progress dialog to finish, then dismisses it.
 *
 * Clicks the *footer's* Close, which UpModal only renders once the run is done. The
 * dialog's header X is also named "Close" and is present from the first frame, so a
 * bare `getByRole('button', { name: 'Close' })` resolves to it immediately — and
 * closing UpModal before it is done cancels the in-flight `compose up`. Whether the
 * stack came up at all then depended on whether compose happened to finish before
 * the cancel landed, which is why so many specs failed at random with the stack
 * simply never appearing.
 */
export async function closeUpProgress(progress: Locator, timeout = 60000) {
  await progress.locator('.um-footer').getByRole('button', { name: 'Close' }).click({ timeout });
}

/**
 * Removes a running stack's containers via Down and confirms the row's
 * status actually changes (not merely that the confirm dialog closed).
 */
export async function downStack(page: Page, name: string) {
  await stackRow(page, name).getByRole('button', { name: 'Down (remove containers)' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm down' });
  await confirm.getByRole('button', { name: 'Down (remove)' }).click();

  // Wait for the confirm dialog to close, which DownModal only does once the down has
  // actually finished (it keeps itself open, with its buttons disabled, while running).
  //
  // The row vanishing is not enough on its own: StacksView hides a stack optimistically
  // the moment Down is clicked (its manuallyDownedStacks list), so the row is gone long
  // before compose is. Returning then let a following Up run concurrently with the still
  // in-flight down — which promptly killed and destroyed the containers that Up had just
  // created, leaving no stack at all. Confirmed from `docker events`: create/start, then
  // kill and destroy one second later.
  // Capped and non-fatal: this is a guard against returning mid-down, not an assertion
  // about the dialog, and a down that has already finished costs nothing here.
  await confirm.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await expect(stackRow(page, name)).toHaveCount(0, { timeout: 20000 });
}

/**
 * Downs every stack the running-stacks list currently shows.
 *
 * For assertions about the *absence* of any running stack — controls gated purely on
 * `stacks.length === 0`, for instance. Those cannot just down one fixture by name:
 * any stack another spec left up keeps the control live, which makes such a test pass
 * or fail on what ran before it rather than on what it is testing.
 *
 * Loops because downing one stack re-renders the list, and a stack that was still
 * shutting down may reappear on the next pass.
 */
export async function ensureNoRunningStacks(page: Page) {
  for (let pass = 0; pass < 10; pass++) {
    const names = [...new Set(
      await page.locator('[data-stack-name]').evaluateAll(
        els => els.map(el => el.getAttribute('data-stack-name')).filter((n): n is string => Boolean(n)),
      ),
    )];
    if (names.length === 0) return;
    for (const name of names) {
      await downStack(page, name).catch(() => {});
    }
  }
  await expect(page.locator('[data-stack-name]')).toHaveCount(0, { timeout: 20000 });
}

/**
 * Opens the compose YAML editor (read-only) for a stack, from either the
 * downed or running list. `force: true` — under sustained session load this
 * click has repeatedly hit Playwright's actionability/stability check
 * (waiting for the element to stop "moving") even though the button is
 * genuinely present and correct; most likely a CSS modal-entry transition
 * rendering too janky for the stability heuristic to ever settle. We
 * independently confirm the dialog opens right after, so skipping that
 * check here is safe.
 */
export async function openYamlEditor(page: Page, name: string) {
  const downed = downedCard(page, name);
  const button = (await downed.count())
    ? downed.getByRole('button', { name: 'Edit compose file' })
    : stackRow(page, name).getByRole('button', { name: 'Edit compose file' });
  // force also skips the check that nothing is covering the button, so make sure
  // nothing is: the page footer is sticky, and for the last rows of the downed list
  // it sits right over the button. A forced click there lands on the footer, the
  // editor never opens, and the failure shows up as a missing dialog instead.
  await button.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await button.click({ force: true, timeout: 20000 });
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Reads back the live YAML content shown in an already-open editor dialog. */
export function yamlEditorContent(page: Page): Locator {
  return page.getByRole('dialog').locator('.cm-content');
}

/**
 * If a previous run's hard timeout killed the page before its afterEach/
 * finally cleanup could run, `name` can be left running — which then makes
 * upStack() fail immediately (it expects to find the stack in the *downed*
 * list), cascading into every subsequent run failing the same way. Force it
 * down first so tests are self-healing against that leaked state instead of
 * just detecting it.
 */
export async function ensureDown(page: Page, name: string) {
  if (await stackRow(page, name).count()) {
    await downStack(page, name);
  }
}

/**
 * Brings `name` up, runs `fn`, then always brings it back down — even if
 * `fn` throws. Several specs (logs, exec, scale) need a genuinely running
 * stack; without a guaranteed teardown, a failed assertion mid-test would
 * leak state into the next test/run the same way the original stack-lifecycle
 * leak did (see stack-lifecycle.spec.ts's afterEach comment). Also calls
 * ensureDown() first — see its doc comment for why that matters.
 */
export async function withRunningStack<T>(page: Page, name: string, fn: () => Promise<T>): Promise<T> {
  await ensureDown(page, name);
  await upStack(page, name);
  try {
    return await fn();
  } finally {
    if (await stackRow(page, name).count()) {
      await downStack(page, name).catch(() => {});
    }
  }
}
