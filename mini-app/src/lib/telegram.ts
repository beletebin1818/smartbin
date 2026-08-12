/**
 * Telegram Mini Apps SDK wrapper.
 *
 * IMPORTANT: window.Telegram is read dynamically on every call — NOT cached
 * at module load time. The Telegram client injects window.Telegram after the
 * page script starts, so a top-level `const tg = window.Telegram` will
 * always be undefined (captured before injection happens).
 *
 * Gracefully degrades when the app is opened in a regular browser.
 */

export interface TelegramLaunchParams {
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** Read the WebApp object fresh on every call. */
function getWebApp(): Record<string, unknown> | undefined {
  try {
    const w = window as unknown as Record<string, unknown>;
    const telegram = w['Telegram'] as Record<string, unknown> | undefined;
    return telegram?.['WebApp'] as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Call on app mount. Signals to Telegram that the Mini App is ready
 * and expands to full height. No-ops outside Telegram.
 */
export function initTelegram(): void {
  try {
    const webApp = getWebApp();
    if (webApp) {
      (webApp['ready'] as () => void)?.();
      (webApp['expand'] as () => void)?.();
    }
  } catch (err) {
    console.info('[Telegram] Running outside Telegram client, SDK skipped.');
  }
}

/**
 * Extract useful player identity fields from Telegram's initDataUnsafe.
 * Returns nulls when running outside Telegram.
 */
export function getLaunchParams(): TelegramLaunchParams {
  try {
    const webApp = getWebApp();
    const initDataUnsafe = webApp?.['initDataUnsafe'] as Record<string, unknown> | undefined;
    const user = initDataUnsafe?.['user'] as Record<string, unknown> | undefined;

    if (!user) return emptyParams();

    return {
      telegramId: user['id'] != null ? String(user['id']) : null,
      username: (user['username'] as string) ?? null,
      firstName: (user['first_name'] as string) ?? null,
      lastName: (user['last_name'] as string) ?? null,
    };
  } catch {
    return emptyParams();
  }
}

function emptyParams(): TelegramLaunchParams {
  return { telegramId: null, username: null, firstName: null, lastName: null };
}

/** True when running inside the Telegram client (dynamic check). */
export function isInsideTelegram(): boolean {
  const webApp = getWebApp();
  const initDataUnsafe = webApp?.['initDataUnsafe'] as Record<string, unknown> | undefined;
  return Boolean(initDataUnsafe && Object.keys(initDataUnsafe).length > 0);
}
