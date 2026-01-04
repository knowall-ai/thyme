import { test, expect } from '@playwright/test';

test.describe('Projects', () => {
  test('landing page mentions project sync', async ({ page }) => {
    await page.goto('/');

    // Should mention Business Central sync
    await expect(page.getByText(/Business Central/i).first()).toBeVisible();
  });
});
