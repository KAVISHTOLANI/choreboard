import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('tick a chore, add a person and a chore, review the summary', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Share the housework');
  await expect(page.locator('.hero .day').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open this week’s board' }).click();
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const box = page.getByRole('checkbox', { name: new RegExp(`^Wash up and wipe counters, ${weekday}`) });
  await box.check();
  await expect(page.getByText('Done: Wash up and wipe counters.')).toBeVisible();
  await snap(page, 'week');
  await checkMobile(page);
  await page.reload();
  await expect(box).toBeChecked();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'People' }).click();
  await page.getByLabel('Name').fill('Jordan');
  await page.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByText('Added Jordan.')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Chores' }).click();
  await page.getByRole('link', { name: 'Add chore' }).click();
  await page.getByLabel('Chore', { exact: true }).fill('Descale the kettle');
  await page.getByRole('radio', { name: 'Every N days' }).click();
  await page.getByLabel('Every how many days?').fill('30');
  await page.getByLabel('Person').selectOption({ label: 'Jordan' });
  await page.getByRole('button', { name: 'Save chore' }).click();
  await expect(page.getByRole('link', { name: 'Descale the kettle' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Descale the kettle/ })).toContainText('Every 30 days');
  await snap(page, 'chores');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Summary' }).click();
  await expect(page.getByRole('img', { name: /Jordan: 0 of/ })).toBeVisible();
  await snap(page, 'summary');
  await checkMobile(page, 'summary-mobile');
});
