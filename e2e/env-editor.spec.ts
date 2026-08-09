import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import type { Locator, Page } from '@playwright/test';
import { baseData } from './helpers/base';
import { openYamlEditor } from './helpers/stacks';

// `env-test` (nginx + a real .env with APP_ENV/SECRET_KEY/DEBUG — see
// scripts/test-vm.config.sh) is a downed fixture, so no lifecycle bring-up is
// needed; the editor reads/writes real files on disk regardless of stack state.
//
// EnvTable renders each row's key/value as controlled <input>s (PatternFly
// TextInput) — React sets these via the DOM `value` *property*, not the HTML
// `value` *attribute*, so a `input[value="..."]` CSS attribute selector is
// unreliable (only ever matches an input's very first render, never a value
// set by a later re-render). `rowByKey` instead reads each row's live
// `.inputValue()` to find the right one.
async function rowByKey(modal: Locator, key: string): Promise<Locator> {
  const rows = modal.locator('tr.env-row-entry');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    if (await row.getByLabel('Variable key').inputValue() === key) return row;
  }
  throw new Error(`No env row found with key "${key}"`);
}

function envModal(page: Page) {
  return page.getByRole('dialog', { name: /Env file — env-test/ });
}

// Opens the compose YAML editor (parent) once, then the nested Env file modal
// on top of it — reopening via Cancel/Save leaves the parent YamlModal open
// underneath the whole time, so subsequent re-opens only need the "Env file"
// button, not a fresh openYamlEditor() (which would try to click the downed
// card's "Edit compose file" button while it's obscured by the still-open
// YamlModal, and hang).
async function openEnvModal(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Env file' }).click();
  const modal = envModal(page);
  await expect(modal).toBeVisible();
  // Each open re-fetches the file from disk (findEnvFiles + readEnvFile) and
  // shows a spinner until it resolves — wait for at least one real row
  // before querying rows, otherwise rowByKey can run against an empty table.
  await expect(modal.locator('tr.env-row-entry').first()).toBeVisible({ timeout: 10000 });
  return modal;
}

test('Env file editor reads real values, edits and saves them, and the change persists to disk', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await openYamlEditor(page, 'env-test');
  const modal = await openEnvModal(page);

  // Real content from disk, not a blank form.
  const appEnvRow = await rowByKey(modal, 'APP_ENV');
  await expect(appEnvRow.getByLabel('Variable value')).toHaveValue('development');

  // Edit the DEBUG value and save.
  const debugRow = await rowByKey(modal, 'DEBUG');
  await debugRow.getByLabel('Variable value').fill('false');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal).not.toBeVisible({ timeout: 10000 });

  // Real effect: reopen and confirm the saved value actually persisted to disk.
  const reopened = await openEnvModal(page);
  const reopenedDebugRow = await rowByKey(reopened, 'DEBUG');
  await expect(reopenedDebugRow.getByLabel('Variable value')).toHaveValue('false', { timeout: 10000 });

  // Restore the original value so repeat runs of this spec stay idempotent.
  await reopenedDebugRow.getByLabel('Variable value').fill('true');
  await reopened.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(reopened).not.toBeVisible({ timeout: 10000 });
});

test('Env file editor warns on a duplicate key added via Table mode instead of silently saving it', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  await openYamlEditor(page, 'env-test');
  const modal = await openEnvModal(page);
  await expect(await rowByKey(modal, 'APP_ENV')).toBeVisible({ timeout: 10000 });

  await modal.getByRole('button', { name: 'Add variable' }).click();
  const newRow = modal.locator('tr.env-row-entry').last();
  await newRow.getByLabel('Variable key').fill('APP_ENV');
  await newRow.getByLabel('Variable value').fill('staging');

  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm save' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/Duplicate keys found/i)).toBeVisible();

  // Cancel the warning — the file must be left untouched on disk.
  await confirm.getByRole('button', { name: 'Cancel' }).click({ timeout: 20000 });
  await expect(confirm).not.toBeVisible({ timeout: 10000 });
  // Not scoped through the `modal` (role=dialog) locator here: PatternFly
  // appears to leave the EnvModal's dialog subtree marked aria-hidden for a
  // beat after the nested confirm dialog closes (likely inert/focus-trap
  // bookkeeping for the outgoing nested modal), which makes any role-based
  // query against it resolve to zero elements even though it's visibly
  // present and clickable — a real, if minor, a11y bug worth a follow-up
  // issue. Querying by plain text at the page level sidesteps it.
  await page.getByText('Cancel', { exact: true }).last().click({ timeout: 20000 });
  await expect(modal).not.toBeVisible();

  const reopened = await openEnvModal(page);
  const reopenedAppEnvRow = await rowByKey(reopened, 'APP_ENV');
  await expect(reopenedAppEnvRow.getByLabel('Variable value')).toHaveValue('development', { timeout: 10000 });
  await expect(reopened.locator('tr.env-row-entry')).toHaveCount(3);
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
});

// Regression for #261: a duplicate key added purely in Raw mode used to save
// silently with no warning — EnvModal only computed `hasDuplicates` via
// EnvTable's onDuplicatesChange callback, which never ran while the Raw
// (CodeMirror) editor was mounted instead of the Table view. Fixed in
// src/components/EnvModal.tsx to also re-check the actual saved content
// directly (src/lib/envDuplicates.ts hasDuplicateEnvKeys), independent of
// which view mode produced it.
test('Env file editor warns on a duplicate key added via Raw mode too, not just Table mode', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await openYamlEditor(page, 'env-test');
  const modal = await openEnvModal(page);
  await expect(await rowByKey(modal, 'APP_ENV')).toBeVisible({ timeout: 10000 });

  await modal.getByRole('button', { name: 'Raw', exact: true }).click();
  const raw = modal.locator('.cm-content');
  await expect(raw).toBeVisible({ timeout: 10000 });
  await raw.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('APP_ENV=development\nSECRET_KEY=test-secret-123\nDEBUG=true\nAPP_ENV=staging\n');

  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirm save' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/Duplicate keys found/i)).toBeVisible();

  // Cancel the warning — the file must be left untouched on disk.
  await confirm.getByRole('button', { name: 'Cancel' }).click({ force: true, timeout: 30000 });
  await expect(confirm).not.toBeVisible({ timeout: 10000 });
  await page.getByText('Cancel', { exact: true }).last().click({ force: true, timeout: 30000 });
  await expect(modal).not.toBeVisible();

  const reopened = await openEnvModal(page);
  const reopenedAppEnvRow = await rowByKey(reopened, 'APP_ENV');
  await expect(reopenedAppEnvRow.getByLabel('Variable value')).toHaveValue('development', { timeout: 10000 });
  await expect(reopened.locator('tr.env-row-entry')).toHaveCount(3);
  await reopened.getByRole('button', { name: 'Cancel', exact: true }).click();
});
