import { test, expect } from '@playwright/test';

test.describe('Reports', () => {
  test('landing page mentions reporting', async ({ page }) => {
    await page.goto('/');

    // Should mention reports feature
    await expect(page.getByText(/Insightful Reports/i)).toBeVisible();
  });
});
