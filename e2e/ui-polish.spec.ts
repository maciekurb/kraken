import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('UI/UX polish: Settings sheet portal & scroll lock, Candlelight Dark Mode, QR modal, confirm dialog, zero horizontal overflow', async ({
  page,
}) => {
  await page.goto('/?transport=local');

  // 1. Verify zero horizontal overflow on 390px mobile screen
  const homeOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(homeOverflow).toBe(false);

  // 2. Open Settings bottom sheet -> verify portaled directly to document.body + body scroll locked
  await page.getByTestId('open-settings-btn').click();
  const sheet = page.getByTestId('settings-sheet');
  await expect(sheet).toBeVisible();

  const portalCheck = await sheet.evaluate((el) => {
    const parentIsBody = el.parentElement === document.body;
    const bodyOverflow = document.body.style.overflow;
    let trappedByAncestor = false;
    let cur = el.parentElement;
    while (cur && cur !== document.body) {
      const s = getComputedStyle(cur);
      if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none') {
        trappedByAncestor = true;
      }
      cur = cur.parentElement;
    }
    return { parentIsBody, bodyOverflow, trappedByAncestor };
  });
  expect(portalCheck.parentIsBody).toBe(true);
  expect(portalCheck.bodyOverflow).toBe('hidden');
  expect(portalCheck.trappedByAncestor).toBe(false);

  // 3. Toggle Candlelight Dark Mode -> verify dataset, theme-color meta, and reload persistence
  await page.getByTestId('theme-dark-btn').click();
  const darkState = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    metaColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
  }));
  expect(darkState.theme).toBe('dark');
  expect(darkState.metaColor).toBe('#110a06');

  // Open Debug Logs from Settings sheet -> verify it portals to document.body and unlocks body scroll on close
  await page.getByTestId('open-logs-btn').click();
  const logsModal = page.getByTestId('debug-log-modal');
  await expect(logsModal).toBeVisible();
  expect(await logsModal.evaluate((el) => el.parentElement === document.body)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(logsModal).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

  // Reload and confirm Dark Mode persists
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');

  // Switch back to Parchment Light Mode
  await page.getByTestId('open-settings-btn').click();
  await page.getByTestId('theme-light-btn').click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

  // 4. Host a room -> test fullscreen QR modal & Leave confirmation dialog
  await page.getByTestId('player-name-input').fill('Kapitan');
  await page.getByTestId('create-room-btn').click();
  await expect(page.getByTestId('lobby-room-code')).toBeVisible();

  await page.getByTestId('lobby-qr-enlarge-btn').click();
  const qrModal = page.getByTestId('lobby-qr-modal');
  await expect(qrModal).toBeVisible();
  expect(await qrModal.evaluate((el) => el.parentElement === document.body)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(qrModal).toHaveCount(0);

  // Leave Room -> custom confirmation dialog (cancel stays in lobby, confirm leaves)
  await page.getByTestId('leave-room-btn').click();
  const confirmDialog = page.getByTestId('confirm-leave-lobby');
  await expect(confirmDialog).toBeVisible();
  await page.getByTestId('confirm-leave-lobby-cancel').click();
  await expect(page.getByTestId('lobby-room-code')).toBeVisible();

  await page.getByTestId('leave-room-btn').click();
  await page.getByTestId('confirm-leave-lobby-confirm').click();
  await expect(page.getByTestId('create-room-btn')).toBeVisible();
});

test('Keep Screen Awake toggles ON/OFF without immediately reverting and re-acquires on visibility restore', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = {
      requestCount: 0,
      releaseCount: 0,
      currentSentinel: null as {
        released: boolean;
        release: () => Promise<void>;
        triggerRelease: () => void;
      } | null,
    };
    (window as unknown as Record<string, unknown>).__wakeLockMock = state;

    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        async request() {
          state.requestCount += 1;
          const listeners = new Set<() => void>();
          const sentinel = {
            released: false,
            addEventListener(type: string, cb: () => void) {
              if (type === 'release') listeners.add(cb);
            },
            removeEventListener(type: string, cb: () => void) {
              if (type === 'release') listeners.delete(cb);
            },
            triggerRelease() {
              if (this.released) return;
              this.released = true;
              for (const cb of [...listeners]) cb();
            },
            async release() {
              if (this.released) return;
              state.releaseCount += 1;
              this.triggerRelease();
            },
          };
          state.currentSentinel = sentinel;
          return sentinel;
        },
      },
    });
  });

  await page.goto('/?transport=local');
  await page.getByTestId('open-settings-btn').click();
  const wakeLockBtn = page.getByTestId('settings-wakelock-btn');
  const wakeLockState = page.getByTestId('settings-wakelock-state');

  await expect(wakeLockBtn).toBeEnabled();
  await expect(wakeLockBtn).toHaveAttribute('role', 'switch');
  await expect(wakeLockBtn).toHaveAttribute('aria-checked', 'false');
  await expect(wakeLockState).toHaveText('OFF');
  await expect(wakeLockState).toBeVisible();

  // Verify the toggle control stays fully inside the mobile viewport (no clipping on iPhone 15 Pro width)
  const toggleInBounds = await wakeLockBtn.evaluate((btn) => {
    const rect = btn.getBoundingClientRect();
    const track = btn.querySelector('.toggle-switch')?.getBoundingClientRect();
    return Boolean(track && track.width >= 44 && track.right <= rect.right && track.right <= window.innerWidth);
  });
  expect(toggleInBounds).toBe(true);

  // Toggle ON -> must stay ON and not immediately release
  await wakeLockBtn.click();
  await expect(wakeLockBtn).toHaveAttribute('aria-checked', 'true');
  await expect(wakeLockState).toHaveText('ON');

  const afterEnable = await page.evaluate(() => {
    const s = (window as unknown as Record<string, { requestCount: number; releaseCount: number; currentSentinel: { released: boolean } | null }>).__wakeLockMock;
    return {
      requestCount: s.requestCount,
      releaseCount: s.releaseCount,
      released: s.currentSentinel?.released ?? true,
    };
  });
  expect(afterEnable).toEqual({ requestCount: 1, releaseCount: 0, released: false });

  // Simulate tab hidden (OS releases wake lock) -> tab visible again (should re-acquire)
  await page.evaluate(() => {
    const s = (window as unknown as Record<string, { currentSentinel: { triggerRelease: () => void } | null }>).__wakeLockMock;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    s.currentSentinel?.triggerRelease();
    document.dispatchEvent(new Event('visibilitychange'));

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  await expect(wakeLockBtn).toHaveAttribute('aria-checked', 'true');
  await expect(wakeLockState).toHaveText('ON');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = (window as unknown as Record<string, { requestCount: number; currentSentinel: { released: boolean } | null }>).__wakeLockMock;
        return { requestCount: s.requestCount, released: s.currentSentinel?.released ?? true };
      })
    )
    .toEqual({ requestCount: 2, released: false });

  // Toggle OFF -> releases wake lock and displays OFF
  await wakeLockBtn.click();
  await expect(wakeLockBtn).toHaveAttribute('aria-checked', 'false');
  await expect(wakeLockState).toHaveText('OFF');

  const afterDisable = await page.evaluate(() => {
    const s = (window as unknown as Record<string, { releaseCount: number; currentSentinel: { released: boolean } | null }>).__wakeLockMock;
    return {
      releaseCount: s.releaseCount,
      released: s.currentSentinel?.released ?? false,
    };
  });
  expect(afterDisable).toEqual({ releaseCount: 1, released: true });
});
