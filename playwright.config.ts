// Playwright 設定。E2E テスト用（[開発ガイド.md §3.4]）。
// 仕様: [技術方針.md §1.8] テスト戦略で Playwright を採用。
// 規約: dev サーバを自動起動して `tests/e2e/**/*.spec.ts` を実行する。

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5180',
    trace: 'on-first-retry',
    // P4-44: オンボーディングモーダル既読フラグを既定で localStorage に
    // 仕込んでおき、既存 E2E がモーダルにブロックされないようにする。
    // モーダル表示自体を検証する p4-44-onboarding.spec.ts は test.use で
    // 空 origins に上書きする。
    // ([src/ui/OnboardingModal.tsx])
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://localhost:5180',
          localStorage: [{ name: 'exoclim-onboarded', value: 'v1' }],
        },
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // vite.config.ts で port: 5180 / strictPort: true を指定済み
    command: 'npm run dev',
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
