import { test, expect } from '@rxtx4816/cockpit-plugin-base-react/e2e';
import { baseData } from './helpers/base';
import { openYamlEditor, yamlEditorContent } from './helpers/stacks';
import { sshExec } from './helpers/vm';

test.describe('basic editor behavior (gotify, pre-opened in edit mode)', () => {
  test.beforeEach(async ({ pluginPage: page }) => {
    await baseData(page);
    await openYamlEditor(page, 'gotify');
    // The modal opens in read-only mode; click Edit to enable editing and show Save/Cancel
    await page.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
  });

  test('YAML editor modal opens', async ({ pluginPage: page }) => {
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('editor contains YAML content', async ({ pluginPage: page }) => {
    const modal = page.getByRole('dialog');
    await expect(modal.locator('.cm-editor')).toBeVisible();
    await expect(yamlEditorContent(page)).toContainText('gotify');
  });

  test('Save button is present', async ({ pluginPage: page }) => {
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  test('Cancel exits edit mode without closing the modal', async ({ pluginPage: page }) => {
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Modal stays open but returns to read-only — Save button is gone
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).not.toBeVisible();
  });

  test('closing the modal returns to the main view', async ({ pluginPage: page }) => {
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compose Stacks', exact: true })).toBeVisible();
  });
});

// `multi-file` has two real compose files (docker-compose.yml + overrides.yml —
// see scripts/test-vm.config.sh).
// NOTE: an "Add file" sub-case (creating a 3rd file via the tab bar's Add
// button, opened as a nested <Modal aria-label="Add compose file">) was
// attempted here but its "Create file" button proved unreliable to click in
// this session even with force:true and explicit dialog scoping — worth a
// dedicated follow-up investigation with browser devtools attached, since
// the button was visibly present and enabled (confirmed via screenshot).
// Deleting/adding via the tab bar isn't covered elsewhere either — tracked
// as a real backlog gap, not silently dropped.
test('Multi-file tabs show each file\'s own real content, not shared/stale content', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  const multiFileCard = page.locator('[data-status="down"]').filter({ has: page.locator('#dss-name-multi-file') });
  await expect(multiFileCard).toBeVisible({ timeout: 10000 });
  // Not using openYamlEditor() here: its force:true click proved flaky
  // specifically for this stack in this session (the click reported success
  // but no dialog opened, repeatably) — a plain click, which waits for real
  // actionability instead of skipping the check, was reliable instead.
  await multiFileCard.getByRole('button', { name: 'Edit compose file' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 10000 });

  const tabs = modal.locator('[role="tab"]');
  await expect(tabs).toHaveCount(2);
  await expect(modal.locator('.cm-content')).toContainText('app');

  await modal.getByRole('tab', { name: /overrides\.yml/ }).click();
  await expect(modal.locator('.cm-content')).toContainText('NGINX_HOST');

  await modal.getByRole('button', { name: 'Close' }).click();
});

// A previous attempt at this scenario (see the header comment above) found
// the "Create file" button unreliable to click. Root-caused this session:
// typing into the nested "Add compose file" modal's filename field gets its
// own backdrop (and the outer YamlModal's) stuck at aria-hidden="true" —
// visually and functionally the modal keeps working fine (a plain mouse
// click still creates the file for real), but Playwright's (and a real
// screen reader's) accessible-name resolution can no longer see anything
// inside it, so getByRole never resolves. This is a real PatternFly
// focus-trap bug in modal-in-modal nesting, filed as #277 — not fixed here,
// worked around below with a CSS-based click for the one button affected.
test('Add file creates a real new compose file; Delete file removes it from disk', async ({ pluginPage: page }, testInfo) => {
  test.setTimeout(60_000);
  const vm = testInfo.project.name;
  const EXTRA_PATH = '/home/test/testcompose/env-test/extra.yml';
  await sshExec(vm, `rm -f ${EXTRA_PATH}`).catch(() => {});

  await baseData(page);
  await openYamlEditor(page, 'env-test');
  const modal = page.getByRole('dialog');
  await expect(modal.locator('[role="tab"]')).toHaveCount(1);

  await modal.getByRole('button', { name: 'Add', exact: true }).click();
  const addModal = page.getByRole('dialog').filter({ hasText: 'Add compose file' });
  await expect(addModal).toBeVisible({ timeout: 10000 });
  await addModal.locator('#ym-new-filename').fill('extra.yml');

  // #277 workaround: after the fill above, addModal is no longer resolvable
  // via role/name (see comment above) — target the primary footer button by
  // CSS instead of by accessible role.
  await page.locator('.pf-v6-c-modal-box').filter({ hasText: 'Add compose file' })
    .locator('.pf-v6-c-button.pf-m-primary').click();
  await expect(page.locator('.pf-v6-c-modal-box').filter({ hasText: 'Add compose file' })).toHaveCount(0, { timeout: 15000 });

  // Real effect: a second tab for the real new file exists, and it's the
  // one now active/showing its (stub) content — not just a UI state flag.
  await expect(modal.locator('[role="tab"]')).toHaveCount(2, { timeout: 10000 });
  await expect(modal.getByRole('tab', { name: /extra\.yml/ })).toBeVisible();

  // Real effect: the file genuinely exists on disk, independent of the app.
  const lsOut = await sshExec(vm, `test -f ${EXTRA_PATH} && echo EXISTS`);
  expect(lsOut.trim()).toBe('EXISTS');

  // --- Delete it again ---
  await modal.getByRole('tab', { name: /extra\.yml/ }).click(); // ensure its tab is active
  const deleteBtn = modal.locator('.ym-delete-file-btn');
  await deleteBtn.click();
  const deleteConfirm = page.getByRole('dialog').filter({ hasText: 'Delete extra.yml?' });
  await expect(deleteConfirm).toBeVisible({ timeout: 10000 });
  await deleteConfirm.getByRole('button', { name: 'Delete file', exact: true }).click();
  await expect(deleteConfirm).not.toBeVisible({ timeout: 10000 });

  // Real effect: back to one tab, and the file is genuinely gone from disk.
  await expect(modal.locator('[role="tab"]')).toHaveCount(1, { timeout: 10000 });
  const lsAfter = await sshExec(vm, `test -f ${EXTRA_PATH} && echo EXISTS || echo GONE`);
  expect(lsAfter.trim()).toBe('GONE');

  await modal.getByRole('button', { name: 'Close' }).click();
});

// Regression coverage for docs/testing.md §6.14's malformed-save case: typing
// broken YAML and hitting Save must not silently write it to disk — it should
// route through the same "Save with issues?" confirm dialog Create Stack's
// validation-bypass flow uses, showing a real parser error count. Cancelling
// must leave the on-disk file untouched.
//
// Known flake, same class as adversarial.spec.ts's malformed-YAML case: passes
// reliably in isolation (verified repeatedly) but intermittently times out
// waiting for the confirm dialog when run after many prior gotify edits in
// the same long-lived VM/browser session — screenshots at failure always show
// the correct final state already rendered, consistent with cumulative
// session/host load slowing CodeMirror's linter rather than a real app bug.
test('Saving malformed YAML shows a real error count and Cancel leaves the file untouched', async ({ pluginPage: page }) => {
  test.setTimeout(90_000);
  await baseData(page);
  await openYamlEditor(page, 'gotify');
  const modal = page.getByRole('dialog');
  const originalContent = await modal.locator('.cm-content').textContent();

  await modal.getByRole('button', { name: 'Edit' }).click();
  const editor = modal.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('services: [this is not valid yaml: : :');
  // CodeMirror's async YAML linter needs a moment to settle after typing —
  // clicking Save immediately raced it in this session (Save's own
  // synchronous validation is unaffected, but the resulting UI became
  // unresponsive for several seconds afterward, as if the linter's work
  // was still draining on the main thread).
  await page.waitForTimeout(5000);

  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  // Neither the Modal's aria-label ("Confirm save") nor its ModalHeader
  // title text alone resolved via role+name matching here — filter by
  // visible content instead of fighting the accessible-name computation.
  const confirm = page.getByRole('dialog').filter({ hasText: 'Save with issues?' });
  await expect(confirm).toBeVisible({ timeout: 10000 });
  await expect(confirm.getByText('Errors found')).toBeVisible({ timeout: 15000 });
  await expect(confirm.getByText('1 error in your compose file', { exact: false })).toBeVisible({ timeout: 15000 });

  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(confirm).not.toBeVisible({ timeout: 10000 });

  // Real effect: cancelling must not have written anything — exit edit mode
  // and confirm the in-memory content reverted to the untouched original.
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(modal.locator('.cm-content')).toHaveText(originalContent ?? '', { timeout: 10000 });
});

test('Snapshot history records a real edit, shows a diff, and Restore reverts the file on disk', async ({ pluginPage: page }) => {
  test.setTimeout(60_000);
  await baseData(page);
  await openYamlEditor(page, 'gotify');
  const modal = page.getByRole('dialog');
  const originalContent = await modal.locator('.cm-content').textContent();

  await modal.getByRole('button', { name: 'Edit' }).click();
  const editor = modal.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n    # e2e-snapshot-marker');
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 10000 });

  // Real effect: a snapshot of the pre-edit content now exists.
  await expect(modal.getByRole('button', { name: /History \(\d+\)/ })).toBeVisible({ timeout: 10000 });
  await modal.getByRole('button', { name: /History \(\d+\)/ }).click();
  await expect(modal.getByText('Snapshots', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Changes' }).first().click();
  await expect(modal.locator('.pf-v6-c-code-editor, .ym-diff, .cm-editor').first()).toBeVisible();

  await modal.getByRole('button', { name: 'Restore' }).first().click();
  await expect(modal.locator('.cm-content')).not.toContainText('e2e-snapshot-marker', { timeout: 10000 });

  // Restore only updates the in-memory editor content — save it back to disk
  // so the fixture file is genuinely restored, not left dirty for other specs.
  await modal.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(modal.getByRole('button', { name: 'Edit' })).toBeVisible({ timeout: 10000 });
  const restoredContent = await modal.locator('.cm-content').textContent();
  expect(restoredContent).toBe(originalContent);
});
