import { test, expect, type Page } from '@playwright/test';
import { ADMIN } from './instance';
import { COMPACT_LAYOUT_QUERY } from '../src/constants/layout';

// Two-frame, 12×12 original test GIF. Exercises actual animated image upload,
// not just the input's accepted MIME label.
const TWO_FRAME_GIF = 'R0lGODlhDAAMAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQADAAAACwAAAAADAAMAAAIFgABCBxIsKDBgwgTKlzIsKHDhxARBgQAIfkEAQwAAQAsAAAAAAwADACBAAD/AAAAAAAAAAAACBYAAQgcSLCgwYMIEypcyLChw4cQEQYEADs=';

async function signIn(page: Page): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('Stage UX: three pillars, large GIF art, presentation modes and GM opt-in', async ({ page }, testInfo) => {
  const campaign = `Stage UX ${testInfo.project.name} ${Date.now()}`;
  await signIn(page);
  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const campaignDialog = page.getByRole('dialog', { name: 'Create Campaign' });
  await campaignDialog.getByLabel('Campaign Name').fill(campaign);
  await campaignDialog.getByRole('button', { name: 'Create Campaign' }).click();
  await expect(campaignDialog).toBeHidden({ timeout: 15_000 });
  await page.getByRole('button', { name: new RegExp(campaign) }).click();
  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]{36}$/);

  const compact = await page.evaluate((query) => window.matchMedia(query).matches, COMPACT_LAYOUT_QUERY);
  if (compact) {
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
  } else {
    const nav = page.getByRole('navigation', { name: 'SmugVTT workspaces' });
    await expect(nav.getByRole('button')).toHaveCount(3);
    await expect(nav.getByRole('button', { name: 'Canvas' })).toHaveCount(0);
    await expect(nav.getByRole('button', { name: 'Scene' })).toHaveCount(0);
    await nav.getByRole('button', { name: 'Chat' }).click();
    await expect(page.getByRole('button', { name: 'Open Stage' })).toBeVisible();
    await page.getByRole('button', { name: 'Open Stage' }).click();
    await expect(nav.getByRole('button', { name: 'Stage' })).toHaveAttribute('aria-pressed', 'true');
  }

  await expect(page.getByText('No active Stage yet.')).toBeVisible();
  await page.getByPlaceholder('Scene title').fill('Stage Test Composition');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Active scene' })).toBeVisible();

  const dialogue = page.getByRole('combobox', { name: 'Stage dialogue style' });
  await dialogue.selectOption('vn');
  await expect(dialogue).toHaveValue('vn');
  await dialogue.selectOption('jrpg');
  await expect(dialogue).toHaveValue('jrpg');
  const toggle = page.getByRole('button', { name: 'Dialogue On' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Dialogue Off' })).toBeVisible();
  await page.getByRole('button', { name: 'Dialogue Off' }).click();

  const upload = page.locator('input[type="file"][accept*="image/gif"]').first();
  // Construct the fixture as an actual browser File: no Node Buffer typings
  // required, and the application still performs a real multipart GIF upload.
  await upload.evaluate((node, encoded) => {
    const bytes = Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0));
    const file = new File([bytes], 'stage-animated-test.gif', { type: 'image/gif' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    (node as HTMLInputElement).files = transfer.files;
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, TWO_FRAME_GIF);
  const art = page.locator('img[src*="/api/assets/maps/"]').first();
  await expect(art).toBeVisible({ timeout: 20_000 });
  const frame = art.locator('xpath=../../..');
  await expect(frame).toHaveAttribute('style', /width: 640px/);
  await expect(frame).toHaveAttribute('style', /height: 480px/);
  await expect(frame).toHaveAttribute('style', /left: 480px/);

  // Players discover picture selection and sizing by simply clicking the art.
  await art.click();
  await expect(page.getByRole('button', { name: 'Resize selected scene element' })).toBeVisible();

  // A pointer context menu must not accidentally begin a move operation.
  if (!compact) {
    await art.click({ button: 'right' });
    await expect(page.getByRole('combobox', { name: 'Speaking as / Character is' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Right-click Stage emote' }).selectOption('alert');
    await page.getByRole('button', { name: 'Play silent cue' }).click();
    await expect(page.locator('.smug-stage-emote-alert')).toHaveCount(1);
  }

  await page.getByRole('button', { name: 'Stage Options' }).click();
  const permission = page.getByRole('checkbox', { name: 'Allow players to arrange pictures' });
  await expect(permission).not.toBeChecked();
  await permission.check();
  await expect(page.getByText('Reveal this scene and set visibility to Shared before player arranging becomes available.')).toBeVisible();

  if (compact) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'Stage must not push mobile browser wider than viewport').toBeLessThanOrEqual(0);
  }

  await testInfo.attach('stage-ux-final', { body: await page.screenshot(), contentType: 'image/png' });
});
