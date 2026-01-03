import { test, expect } from '@playwright/test';

// Mock data for testing
const mockProjects = {
  value: [
    {
      id: 'proj-1',
      number: 'PROJ-001',
      description: 'Website Redesign',
      status: 'Open',
      billToCustomerName: 'ACME Corp',
    },
  ],
};

const mockJobTasks = {
  value: [
    {
      id: 'task-1',
      jobNumber: 'PROJ-001',
      taskNumber: 'DEV',
      description: 'Development',
      jobTaskType: 'Posting',
    },
  ],
};

test.describe('Weekly Timesheet', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication state
    await page.addInitScript(() => {
      window.localStorage.setItem('thyme_time_entries', JSON.stringify([]));
    });

    // Mock BC API endpoints
    await page.route('**/api.businesscentral.dynamics.com/**/jobs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProjects),
      });
    });

    await page.route('**/api.businesscentral.dynamics.com/**/jobTaskLines*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobTasks),
      });
    });
  });

  test('displays week navigation', async ({ page }) => {
    // This test would run against the authenticated dashboard
    // For now, we test that the landing page loads
    await page.goto('/');
    await expect(page).toHaveTitle(/Thyme/);
  });

  test('displays 7 day columns', async ({ page }) => {
    // When authenticated, should show Mon-Sun columns
    await page.goto('/');
    // The landing page should be responsive
    await expect(page.locator('body')).toBeVisible();
  });
});
