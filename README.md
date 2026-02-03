# 1688-mcp

MCP server for 1688.com search using Playwright.

## Setup
```bash
npm install
cp .env.example .env
# fill CAPSOLVER_API_KEY and COOKIES_1688 (JSON array of cookies)
```

## Run
```bash
npm run dev
```

## MCP Tool
- `search_1688({ query, maxResults })` -> returns `{ results: [{ title, price, link, seller }] }`

## Notes
- CapSolver integration added (best-effort). You may need to adjust `CAPSOLVER_TASK_TYPE` and fields depending on the captcha variant.
- Cookies are recommended for stability.
