# 1688 MCP Server

A Model Context Protocol (MCP) server to search products on 1688.com (Alibaba China).

## Features
- **Search**: Search for products by keyword.
- **Filters**: Min/Max price, results limit.
- **Output**: JSON structured results (Title, Price, Link, Seller).
- **Anti-Bot**: Supports `COOKIES_1688` and `PROXY_URL` to bypass login/captcha walls.

## Prerequisites
- Node.js v18+
- A 1688.com account (for cookies)
- **Residential Proxy** (Highly Recommended): 1688 aggressively blocks data center IPs. Use IPRoyal, Webshare, or Smartproxy.

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/adamelhirch/1688-mcp.git
   cd 1688-mcp
   npm install
   npx playwright install chromium
   ```

2. Create `.env`:
   ```bash
   cp .env.example .env
   ```

3. Configure `.env`:
   - `COOKIES_1688`: Paste your cookies JSON array (use "EditThisCookie" extension to export).
   - `PROXY_URL`: Your proxy (e.g., `http://user:pass@geo.iproyal.com:12321`).
   - `HEADLESS`: `true` (default).

## Usage

### Run Locally (Stdio)
Use an MCP client like `mcporter` or Claude Desktop.

```bash
node src/server.js
```

### Test with Mcporter
```bash
npx mcporter call --stdio "node src/server.js" search_1688 --args '{"query":"iphone 14 pro","maxResults":5}'
```

## Troubleshooting
- **Captcha / Punish Page**: If you see empty results or "Captcha detected", your IP is likely blocked.
  - **Fix**: Add a **Residential Proxy** to `.env` (`PROXY_URL`).
  - **Alternative**: Refresh cookies.

## License
MIT
