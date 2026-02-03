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
  const title = await page.title();
  const url = page.url();
  return text.includes('验证码') || text.includes('滑动验证') || text.includes('nc_1_n1z') || 
         title.includes('Captcha') || url.includes('punish');
}

async function solveCaptchaWithCapSolver(page) {
  if (!process.env.CAPSOLVER_API_KEY) {
    console.error('CAPSOLVER_API_KEY missing.');
    return false;
  }

  const cfg = await page.evaluate(() => window._config_ || null).catch(() => null);
  const websiteURL = page.url();
  // Default to a generic Nocaptcha task if not specified
  const taskType = process.env.CAPSOLVER_TASK_TYPE || 'AliyunCaptchaTask';

  const taskPayload = {
    clientKey: process.env.CAPSOLVER_API_KEY,
    task: {
      type: taskType,
      websiteURL,
      websiteKey: cfg?.NCAPPKEY || cfg?.NCTOKENSTR || undefined,
      challenge: cfg?.NCTOKENSTR || undefined,
      scene: cfg?.scene || 'nc_message', // Common scene
    }
  };

  try {
    const createRes = await fetch('https://api.capsolver.com/createTask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskPayload)
    }).then(r => r.json());

    if (!createRes?.taskId) return false;

    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const res = await fetch('https://api.capsolver.com/getTaskResult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: process.env.CAPSOLVER_API_KEY, taskId: createRes.taskId })
      }).then(r => r.json());

      if (res?.status === 'ready') return true; // Solved
      if (res?.status === 'failed') return false;
    }
  } catch (e) {
    console.error('CapSolver error:', e);
  }
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
  const proxyUrl = process.env.PROXY_URL;

  const launchOptions = { headless };
  if (proxyUrl) {
    launchOptions.proxy = { server: proxyUrl };
  }

  const browser = await chromium.launch(launchOptions);
  
  // Set context options (User Agent + Viewport + Cookies)
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 }
  });

  if (cookiesRaw) {
    try {
      const cookies = JSON.parse(cookiesRaw);
      await context.addCookies(cookies);
    } catch (e) {
      // ignore
    }
  }

  const page = await context.newPage();
  const url = `https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(query)}`;
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (await detectCaptcha(page)) {
      const solved = await solveCaptchaWithCapSolver(page);
      if (!solved) {
        // Log info for debugging
        console.error('Captcha detected and not solved. Update PROXY_URL or CAPSOLVER config.');
        if (headless) {
            await browser.close();
            throw new Error('Captcha detected (punish page). Use a residential proxy (PROXY_URL) or correct CapSolver config.');
        }
      } else {
        await page.reload();
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

      if (title) {
        results.push({ title, price, link, seller });
      }
    }
  } catch (e) {
    console.error('Search error:', e);
    throw e;
  } finally {
    await browser.close();
  }

  const structuredContent = { results };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
