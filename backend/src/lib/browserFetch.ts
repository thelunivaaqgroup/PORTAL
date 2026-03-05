import { chromium, type Browser, type Page } from "playwright";
import { logger } from "../logger.js";

export type BrowserFetchOptions = {
  /** Playwright waitUntil strategy. Default: "domcontentloaded" */
  waitUntil?: "domcontentloaded" | "networkidle" | "load" | "commit";
  /** Extra settle time in ms after page load. Default: 3000 */
  settleMs?: number;
};

export type BrowserFetchResult = {
  html: string;
  title: string;
  screenshot: Buffer;
};

const BROWSER_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [2_000, 5_000];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Fetch a URL using a headless Chromium browser via Playwright.
 *
 * - Launches with anti-detection flags (disables automation signals)
 * - Forces HTTP/1.1 to avoid Akamai HTTP/2 protocol errors
 * - Waits for domcontentloaded then settles with extra delay
 * - Returns raw HTML, page title, and a full-page screenshot
 * - Closes browser on success or failure (no leaks)
 * - Throws on timeout or navigation failure
 */
export async function browserFetch(url: string, opts?: BrowserFetchOptions): Promise<BrowserFetchResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1] ?? 5_000;
      logger.warn({ url, attempt, delay }, "browserFetch: retrying after delay");
      await new Promise((r) => setTimeout(r, delay));
    }

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-http2",
          "--disable-extensions",
          "--disable-component-extensions-with-background-pages",
          "--disable-default-apps",
          "--disable-features=TranslateUI",
          "--disable-hang-monitor",
          "--disable-ipc-flooding-protection",
          "--disable-popup-blocking",
          "--disable-prompt-on-repost",
          "--disable-renderer-backgrounding",
          "--disable-sync",
          "--metrics-recording-only",
          "--no-first-run",
          "--password-store=basic",
        ],
      });

      const context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1920, height: 1080 },
        locale: "en-AU",
        timezoneId: "Australia/Sydney",
        javaScriptEnabled: true,
        extraHTTPHeaders: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-AU,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      const page: Page = await context.newPage();

      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", {
          get: () => false,
        });
        Object.defineProperty(navigator, "plugins", {
          get: () => [1, 2, 3, 4, 5],
        });
        Object.defineProperty(navigator, "languages", {
          get: () => ["en-AU", "en"],
        });
        const originalQuery = window.navigator.permissions.query.bind(
          window.navigator.permissions,
        );
        window.navigator.permissions.query = (parameters: PermissionDescriptor) => {
          if (parameters.name === "notifications") {
            return Promise.resolve({
              state: Notification.permission,
            } as PermissionStatus);
          }
          return originalQuery(parameters);
        };
      });

      logger.info({ url, attempt }, "browserFetch: navigating");

      const waitUntil = opts?.waitUntil ?? "domcontentloaded";
      const settleMs = opts?.settleMs ?? 3000;

      await page.goto(url, {
        waitUntil,
        timeout: BROWSER_TIMEOUT_MS,
      });

      await page.waitForFunction(
        () => document.body && document.body.innerHTML.length > 500,
        { timeout: 30_000 },
      ).catch(() => {
        logger.warn({ url }, "browserFetch: body content wait timed out");
      });

      if (settleMs > 0) {
        await page.waitForTimeout(settleMs);
      }

      const title = await page.title();
      const html = await page.content();
      const screenshot = await page.screenshot({ fullPage: true, type: "png" });

      logger.info(
        { url, title, htmlLen: html.length, attempt },
        "browserFetch: success",
      );

      await context.close();
      await browser.close().catch(() => {});

      return { html, title, screenshot };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.error({ url, attempt, err: lastError.message }, "browserFetch: attempt failed");
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  throw lastError ?? new Error(`browserFetch failed after ${MAX_RETRIES + 1} attempts`);
}
