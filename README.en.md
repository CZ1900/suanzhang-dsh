# suanzhang（算账）· DeepSeek Spending at a Glance

> A little "bookkeeper" for DeepSeek Harness (dsh): your balance, today's spending, and how much each model step costs — all crystal clear, no more guessing.

[中文](./README.md)

---

## Why install it?

When using DeepSeek, don't you often wonder:

- **How much balance do I have left?** — Checking means digging through the web console. Annoying.
- **How much did I spend today?** — You only feel it at the end of the month.
- **How much did this one step cost me?** — The table only shows token counts; seeing it in RMB is what matters.
- **Where did the money go?** — Which model burns the most? Which tool is the priciest?

Install **suanzhang** and the answers are **right in front of you**:

| You care about | suanzhang gives you |
|---|---|
| Remaining balance | Always visible in the sidebar, auto-refreshed |
| Today's spend | Right there in the sidebar too |
| Cost per step in RMB | Per-step cost table in the "算账" tab |
| Where the money went | Visualized by model, by tool, by day |
| How much more to chat | Cost forecast: avg per step × steps |

## What it looks like

A clean trading-terminal style (think Bloomberg):

- **Sidebar footer**: `当前余额：¥xx.xx，今天用了：¥xx.xx` — click it to jump straight into the 算账 tab.
- **算账 tab**: a four-cell quote bar on top (Balance / Today / Total / Cache savings) → per-step cost table below.
- **Click any step row**: auto-jumps to the "Trajectory" tab and highlights that step.
- **Auto-synced official pricing**: follows the DeepSeek official price page; price changes take effect automatically.

## Screenshots

| | |
|---|---|
| Sidebar balance & today's spend | 算账 tab · quote bar + cost table |
| ![sidebar](docs/sidebar.png) | ![tab](docs/tab.png) |
| Analysis · per-model/tool bars + forecast | Cross-session / per-day summary |
| ![analysis](docs/analysis.png) | ![summary](docs/summary.png) |

## Requirements

- A machine with DeepSeek Harness installed (`dsh web` runs).
- Your own DeepSeek API Key (configured in Harness settings).
- Internet access (needed for balance and official pricing queries).

## Installation

### Option 1: Install from GitHub (recommended)

```bash
pnpm add https://github.com/CZ1900/suanzhang-dsh.git
```

Then edit `cordis.patch.yml` under your Harness profile, adding at the top:

```yaml
- insert:
    - id: suanzhang
      name: suanzhang-dsh
```

Restart `dsh web` and refresh — you'll see the balance in the sidebar and the "算账" tab in the session header.

### Option 2: Local install

Copy the folder into your Harness profile's `node_modules`:

```bash
# inside the DSH profile directory (e.g. ~/.dsh/profiles/web):
cp -r /path/to/suanzhang-dsh node_modules/
```

Then add the same two `insert` lines to `cordis.patch.yml` and restart.

## Privacy

| Action | Where data goes | Uploaded? |
|---|---|---|
| Balance check | `GET https://api.deepseek.com/user/balance` (with your Key) | Only to DeepSeek official |
| Official pricing | `https://api-docs.deepseek.com` public page | No auth, read-only |
| Cost/summary calculation | Reads your local session logs | Never leaves your machine |
| Display / sort / charts | Local browser computation | Never leaves your machine |

## FAQ

**Q: Does the plugin itself consume tokens?**
A: Zero. It never calls any model — pure local computation plus two free HTTP requests. The tokens you actually spend are from chatting in dsh, unrelated to this plugin.

**Q: Will prices go stale?**
A: No. Official pricing auto-syncs; when DeepSeek adjusts prices the plugin follows automatically. If fetching ever fails, it falls back to built-in prices so nothing breaks.

**Q: Which models are supported?**
A: DeepSeek V4-Flash / V4-Pro (including peak/off-peak pricing), plus deepseek-chat / deepseek-reasoner. Other models show as "未计价" (not priced).

## For developers

- Code layout: `lib/index.js` (Host: balance/pricing/summary/today RPCs), `lib/client.js` (browser UI).
- Key constants (hard-coded in `lib/index.js`): API key ref defaults to `DEEPSEEK_API_KEY`, baseURL defaults to `https://api.deepseek.com`, peak hours 9:00–14:00, low-balance threshold ¥20.
- To change the poll interval: bump `60000` (ms) in `lib/client.js`.

## License

MIT — use it, fork it, credit it.
