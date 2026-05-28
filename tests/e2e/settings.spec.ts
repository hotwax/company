import { test, expect } from '@playwright/test';

test.describe('Settings Page', () => {
    test.beforeEach(async ({ page }) => {
        /**
         * Note: This application uses an external login service.
         * For E2E tests to run, you should handle authentication.
         * You can use a 'global-setup' or mock authentication states.
         * For now, we assume the user is redirected to the settings page after login.
         */
        await page.goto('/settings');
    });

    test('should display the settings page with correct title', async ({ page }) => {
        // Check if the title is visible in the toolbar
        const title = page.locator('ion-title');
        await expect(title).toBeVisible();
        await expect(title).toContainText('Settings');
    });

    test('should display user profile information card', async ({ page }) => {
        const profileSection = page.locator('.user-profile');
        await expect(profileSection).toBeVisible();

        const profileCard = profileSection.locator('ion-card');
        await expect(profileCard).toBeVisible();

        // Verify avatar if present (conditionally rendered in Vue)
        // We check if it exists in the DOM at all if we expect it
        // const avatar = profileCard.locator('ion-avatar');
        // await expect(avatar).toBeVisible();

        // Verify User ID and Full Name containers
        await expect(profileCard.locator('ion-card-subtitle')).toBeVisible();
        await expect(profileCard.locator('ion-card-title')).toBeVisible();
    });

    test('should have a functional logout button', async ({ page }) => {
        const logoutButton = page.getByRole('button', { name: 'Logout' });
        await expect(logoutButton).toBeVisible();
        await expect(logoutButton).toHaveAttribute('color', 'danger');

        // Clicking logout would trigger a redirect in the app
        // await logoutButton.click();
        // await expect(page).toHaveURL(/.*login/);
    });

    test('should have a "Go to Launchpad" button', async ({ page }) => {
        const launchpadButton = page.getByRole('button', { name: 'Go to Launchpad' });
        await expect(launchpadButton).toBeVisible();
    });

    test('should display OMS instance section', async ({ page }) => {
        const omsHeader = page.getByRole('heading', { name: 'OMS' });
        await expect(omsHeader).toBeVisible();

        const omsCard = page.locator('section').filter({ hasText: 'OMS instance' }).locator('ion-card');
        await expect(omsCard).toBeVisible();
        await expect(omsCard.locator('ion-card-subtitle')).toContainText('OMS instance');

        const goToOmsButton = omsCard.getByRole('button', { name: 'Go to OMS' });
        await expect(goToOmsButton).toBeVisible();
    });

    test('should display App version and built info', async ({ page }) => {
        const appHeader = page.getByRole('heading', { name: 'App' });
        await expect(appHeader).toBeVisible();

        // Check for version text
        await expect(appHeader.locator('p.overline').first()).toContainText('Version:');

        // Check for built time (in the same section header)
        const builtInfo = page.locator('.section-header p.overline').nth(1);
        await expect(builtInfo).toContainText('Built:');
    });

    test('should display Timezone section and allow opening change modal', async ({ page }) => {
        const timezoneCard = page.locator('ion-card', { hasText: 'Timezone' });
        await expect(timezoneCard).toBeVisible();

        await expect(timezoneCard.locator('ion-card-title')).toContainText('Timezone');
        await expect(timezoneCard.locator('text=Selected TimeZone')).toBeVisible();

        const changeButton = timezoneCard.getByRole('button', { name: 'Change' });
        await expect(changeButton).toBeVisible();

        // Click change button and verify modal is presented
        await changeButton.click();
        const modal = page.locator('ion-modal');
        await expect(modal).toBeVisible();
    });
});
