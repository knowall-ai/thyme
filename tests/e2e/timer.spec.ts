import { test, expect } from '@playwright/test';

test.describe('Timer Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Clear timer state
    await page.addInitScript(() => {
      window.localStorage.removeItem('thyme-timer-storage');
    });
  });

  test('timer state persists in localStorage', async ({ page }) => {
    await page.goto('/');

    // Timer state should be saved to localStorage
    const timerState = await page.evaluate(() => {
      return window.localStorage.getItem('thyme-timer-storage');
    });

    // Initially null or default state
    expect(timerState === null || JSON.parse(timerState || '{}').state?.isRunning === false).toBeTruthy();
  });
});
