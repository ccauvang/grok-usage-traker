# Grok Usage Tracker

Chrome extension that shows your Grok usage (remain/total) inline next to the model selector on grok.com.

## What it does

- Reads your current rate-limit status directly from grok.com's own endpoints (using your logged-in session — no separate account or API key needed)
- Free tier: shows `remain/total` queries for the currently selected model, resets on a rolling window (e.g. 24h)
- Paid tier: shows usage % pulled from the billing/credits endpoint, with period reset date
- Displays as a small chip next to the model selector — skins Grok's own native usage button if one exists on the page, otherwise injects a matching chip styled to blend into the toolbar
- Color changes with usage: gray → amber → orange → red as you approach the limit
- Hover the chip to see model name + reset info

## Install (unpacked)

1. Unzip the folder
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**, select the extension folder
5. Open grok.com — chip appears next to the model selector once logged in

## Status / known limitations

- Polling is currently interval-based (checks periodically), not yet send-triggered — planned improvement
- Model name mapping (`Fast` → `grok-3`, etc.) is a best-effort guess and may need adjusting if Grok changes model labels
- Paid tier shows percentage only — no raw remain/total count available from the endpoint currently used
- No settings/history yet — this is a minimal v1, just the live chip

## Privacy

All requests go directly from your browser to grok.com using your existing session cookies. No data is sent anywhere else, nothing is collected or stored remotely.
