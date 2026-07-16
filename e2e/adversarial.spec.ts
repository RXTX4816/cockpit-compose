import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { openYamlEditor, yamlEditorContent } from './helpers/stacks';

// These tests deliberately feed the app bad or unexpected input — the goal
// isn't "does it render" but "does it fail safely" (warn/reject instead of
// silently corrupting data or crashing).

test('Saving malformed YAML warns instead of silently corrupting the compose file', async ({ pluginPage: page }) => {
  // See e2e/logs.spec.ts for why: individual steps here now use generous
  // timeouts for slow dialog paints, which can add up past the default 30s.
  test.setTimeout(90_000);
  await baseData(page);
  await openYamlEditor(page, 'gotify');
  await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();

  const editor = yamlEditorContent(page);
  // Replace the whole document with something that isn't valid YAML at all
  // (unterminated mapping / random symbols), not just a compose-schema warning.
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('services: [this is not valid yaml: : :');
  // Checkpoint: confirm the replace actually landed before relying on it —
  // Ctrl+A + type into CodeMirror can occasionally race with focus/mount
  // timing, and failing fast here beats a confusing timeout three steps later.
  await expect(editor).toContainText('this is not valid yaml', { timeout: 10000 });
  // The DOM updating (checked above) doesn't guarantee React's own
  // `editedContent` state has committed yet — Save's handler closes over
  // that state, and clicking too early can silently save the stale
  // (valid) pre-edit content instead of hitting the malformed-YAML path.
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Save' }).click();

  // Real behavior per src/components/YamlModal.tsx handleSave(): invalid YAML
  // doesn't hard-block, it opens a "Save with issues?" confirm dialog first.
  // Under VM load the dialog shell and its Alert content can each take a
  // while to paint, so both checks need more than Playwright's default 5s.
  const confirm = page.getByRole('dialog', { name: 'Confirm save' });
  await expect(confirm).toBeVisible({ timeout: 15000 });
  // .first() — both the alert heading and its body text contain "error".
  await expect(confirm.getByText(/error/i).first()).toBeVisible({ timeout: 10000 });

  // Back out instead of forcing the save — the original file must be untouched.
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).not.toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Reopen fresh and confirm the on-disk content was never touched.
  await openYamlEditor(page, 'gotify');
  await expect(yamlEditorContent(page)).toContainText('gotify');
  await expect(yamlEditorContent(page)).not.toContainText('this is not valid yaml');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
});

test('Scanning a directory that does not exist fails gracefully instead of crashing', async ({ pluginPage: page }) => {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const scanInput = page.getByLabel('Compose directory');
  await scanInput.waitFor();
  await scanInput.fill('/home/test/this-directory-absolutely-does-not-exist-e2e');
  await scanInput.press('Enter');

  // Whatever the exact wording, the app must show *some* graceful empty/error
  // state and keep the page usable — not hang, not throw an unhandled error
  // that leaves the UI dead.
  await expect(
    page.getByText(/Nothing found|Scan failed/i)
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Compose Stacks', exact: true })).toBeVisible();
});

test('Scan-depth stepper clamps at its documented bounds (1-5) instead of going out of range', async ({ pluginPage: page }) => {
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('Compose directory').waitFor();

  const depthValue = page.locator('.dss-stepper-value');
  const minus = page.getByRole('button', { name: 'Decrease scan depth' });
  const plus = page.getByRole('button', { name: 'Increase scan depth' });

  // Hammer the minus button well past the lower bound. Depth may already be
  // at the minimum by default, so guard each click on the button still
  // being enabled instead of assuming N clicks are always valid.
  for (let i = 0; i < 8; i++) {
    if (await minus.isDisabled()) break;
    await minus.click();
  }
  await expect(depthValue).toHaveText('1');
  await expect(minus).toBeDisabled();

  // Hammer the plus button well past the upper bound.
  for (let i = 0; i < 10; i++) {
    if (await plus.isDisabled()) break;
    await plus.click();
  }
  await expect(depthValue).toHaveText('5');
  await expect(plus).toBeDisabled();
});
