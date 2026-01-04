import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows landing page for unauthenticated users', async ({ page }) => {
    await page.goto('/');

    // Should see the landing page
    await expect(page.getByRole('heading', { name: /Time Tracking/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign in with Microsoft/i })).toBeVisible();
  });

  test('landing page has correct branding', async ({ page }) => {
    await page.goto('/');

    // Should see Thyme branding
    await expect(page.getByText('Thyme')).toBeVisible();
    await expect(page.getByText('KnowAll.ai')).toBeVisible();
  });

  test('landing page shows features', async ({ page }) => {
    await page.goto('/');

    // Should see feature descriptions
    await expect(page.getByText(/Effortless Time Tracking/i)).toBeVisible();
    await expect(page.getByText(/Business Central Sync/i)).toBeVisible();
  });

  test('sign in button is clickable', async ({ page }) => {
    await page.goto('/');

    const signInButton = page.getByRole('button', { name: /Sign in with Microsoft/i }).first();
    await expect(signInButton).toBeEnabled();
  });
});
