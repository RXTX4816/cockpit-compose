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
  await progress.getByRole('button', { name: 'Close' }).click({ timeout: 30000 });

  await expect(stackRow(page, name)).toHaveAttribute('data-status', /running|partial/, { timeout: 20000 });
}

/**
 * Removes a running stack's containers via Down and confirms the row's
 * status actually changes (not merely that the confirm dialog closed).
 */
export async function downStack(page: Page, name: string) {
  await stackRow(page, name).getByRole('button', { name: 'Down (remove containers)' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Down (remove)' }).click();
  await expect(stackRow(page, name)).toHaveCount(0, { timeout: 20000 });
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
  if (await downed.count()) {
    await downed.getByRole('button', { name: 'Edit compose file' }).click({ force: true, timeout: 20000 });
  } else {
    await stackRow(page, name).getByRole('button', { name: 'Edit compose file' }).click({ force: true, timeout: 20000 });
  }
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
