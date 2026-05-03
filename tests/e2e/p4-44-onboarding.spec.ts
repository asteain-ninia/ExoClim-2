// P4-44 オンボーディング (U14) の E2E 検証。
// 仕様: [現状.md §6 U14]、[src/ui/OnboardingModal.tsx]、[src/ui/HelpButton.tsx]。
//
// 注意: playwright.config.ts の `use.storageState` はオンボーディング既読フラグを
// 既定で localStorage に仕込む（他の E2E がモーダルにブロックされないため）。
// この spec はモーダル表示そのものを検証するため `test.use` で空 origins に
// 上書きして「初回起動」シナリオを再現する。

import { expect, test } from '@playwright/test';

// 「初回起動」を再現: localStorage を空にする
test.describe('P4-44: オンボーディング（初回起動シナリオ）', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('初回起動でオンボーディングモーダルが自動表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('onboarding-modal')).toBeVisible();
    await expect(page.getByTestId('onboarding-overlay')).toHaveAttribute(
      'aria-modal',
      'true',
    );
  });

  test('「次へ」を押すと最終スライドに到達し「始める」が出る', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('onboarding-modal')).toBeVisible();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await expect(page.getByTestId('onboarding-done')).toBeVisible();
    await expect(page.getByTestId('onboarding-next')).toHaveCount(0);
  });

  test('「始める」を押すとモーダルが閉じ、リロード後も再表示されない', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-next').click();
    await page.getByTestId('onboarding-done').click();
    await expect(page.getByTestId('onboarding-modal')).toHaveCount(0);
    // localStorage に既読フラグが書かれているか
    const flag = await page.evaluate(() => window.localStorage.getItem('exoclim-onboarded'));
    expect(flag).toBe('v1');
    await page.reload();
    await expect(page.getByTestId('onboarding-modal')).toHaveCount(0);
  });

  test('Esc キーで閉じる', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('onboarding-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('onboarding-modal')).toHaveCount(0);
  });

  test('「スキップ」ボタンで閉じる + 既読フラグが書かれる', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('onboarding-skip').click();
    await expect(page.getByTestId('onboarding-modal')).toHaveCount(0);
    const flag = await page.evaluate(() => window.localStorage.getItem('exoclim-onboarded'));
    expect(flag).toBe('v1');
  });
});

// 既読フラグありの状態（playwright.config.ts デフォルト storageState）でのヘルプ再表示
test.describe('P4-44: ヘルプボタンによる再表示', () => {
  test('既読時はモーダルが自動表示されない', async ({ page }) => {
    await page.goto('/');
    // app-help-button が描画されるのを待つ（pipeline 計算が落ち着いてから）
    await expect(page.getByTestId('app-help-button')).toBeVisible();
    await expect(page.getByTestId('onboarding-modal')).toHaveCount(0);
  });

  test('「❓ ヘルプ」を押すとモーダルが表示され、閉じても既読フラグは維持', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('app-help-button').click();
    await expect(page.getByTestId('onboarding-modal')).toBeVisible();
    await page.getByTestId('onboarding-skip').click();
    await expect(page.getByTestId('onboarding-modal')).toHaveCount(0);
    // 既読フラグは v1 のまま（manual モードは触らない）
    const flag = await page.evaluate(() => window.localStorage.getItem('exoclim-onboarded'));
    expect(flag).toBe('v1');
  });
});
