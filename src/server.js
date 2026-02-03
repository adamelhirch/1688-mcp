import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import { chromium } from 'playwright';

const SearchSchema = {
  query: z.string().min(2),
  maxResults: z.number().int().min(1).max(20).default(5),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
};

const OutputSchema = {
  results: z.array(
    z.object({
      title: z.string().optional(),
      price: z.string().optional(),
      link: z.string().optional(),
      seller: z.string().optional(),
    })
  )
};

const server = new McpServer({ name: '1688-mcp', version: '0.1.0' });

async function detectCaptcha(page) {
  const text = await page.content();
  return text.includes('验证码') || text.includes('滑动验证') || text.includes('nc_1_n1z');
}

async function solveCaptchaWithCapSolver() {
  if (!process.env.CAPSOLVER_API_KEY) {
    throw new Error('CAPSOLVER_API_KEY missing. Set it in .env to enable captcha solving.');
  }
  // TODO: Implement CapSolver task for Alibaba/1688 slider.
  // Placeholder: return false so caller can bubble a friendly error.
  return false;
}

server.registerTool('search_1688', {
  description: 'Search products on 1688.com',
  inputSchema: SearchSchema,
  outputSchema: OutputSchema
}, async ({ query, maxResults, minPrice, maxPrice }) => {
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

  if (await detectCaptcha(page)) {
    const solved = await solveCaptchaWithCapSolver();
    if (!solved) {
      await browser.close();
      throw new Error('Captcha detected on 1688. Provide cookies or implement CapSolver slider task.');
    }
  }

  const items = await page.$$('[data-offer-id]');
  for (const item of items.slice(0, maxResults)) {
    const title = await item.$eval('[class*=title], a', el => el.textContent?.trim() || '').catch(() => '');
    const price = await item.$eval('[class*=price], [class*=moq], .price', el => el.textContent?.trim() || '').catch(() => '');
    const link = await item.$eval('a', el => el.href).catch(() => '');
    const seller = await item.$eval('[class*=company], [class*=seller]', el => el.textContent?.trim() || '').catch(() => '');

    const priceNum = Number((price.match(/[0-9]+(\.[0-9]+)?/) || [])[0]);
    if (!Number.isNaN(priceNum)) {
      if (minPrice !== undefined && priceNum < minPrice) continue;
      if (maxPrice !== undefined && priceNum > maxPrice) continue;
    }

    results.push({ title, price, link, seller });
  }

  await browser.close();
  const structuredContent = { results };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
