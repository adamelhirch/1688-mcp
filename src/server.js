import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { chromium } from 'playwright';

const SearchSchema = z.object({
  query: z.string().min(2),
  maxResults: z.number().int().min(1).max(20).default(5),
});

const server = new Server(
  { name: '1688-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.tool('search_1688', 'Search products on 1688.com', SearchSchema, async ({ query, maxResults }) => {
  const results = [];
  const headless = (process.env.HEADLESS ?? 'true') === 'true';
  const cookiesRaw = process.env.COOKIES_1688 || '';

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();

  if (cookiesRaw) {
    try {
      const cookies = JSON.parse(cookiesRaw);
      await context.addCookies(cookies);
    } catch (e) {
      // ignore cookie parse errors
    }
  }

  const page = await context.newPage();
  const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(query)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // TODO: integrate CapSolver for slider captcha if detected

  // Basic extraction (selectors may change; adjust as needed)
  const items = await page.$$('[data-offer-id]');
  for (const item of items.slice(0, maxResults)) {
    const title = await item.$eval('[class*=title], a', el => el.textContent?.trim() || '').catch(() => '');
    const price = await item.$eval('[class*=price], [class*=moq], .price', el => el.textContent?.trim() || '').catch(() => '');
    const link = await item.$eval('a', el => el.href).catch(() => '');
    const seller = await item.$eval('[class*=company], [class*=seller]', el => el.textContent?.trim() || '').catch(() => '');

    results.push({ title, price, link, seller });
  }

  await browser.close();
  return { results };
});

const transport = new StdioServerTransport();
await server.connect(transport);
