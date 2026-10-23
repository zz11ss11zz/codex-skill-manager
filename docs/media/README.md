# Demo assets

These captures show the v0.1.0 dashboard with the post-release Chinese heading correction to “Skill 采用次数” (the published tag is unchanged) with generated synthetic records, using a local browser AppBridge host. They are **not native Codex screenshots**, real usage statistics, or evidence of official directory publication.

- `demo.gif`: six actual UI states, five seconds each; 30-second looping walkthrough.
- `dashboard-plugins.png`: separate plugin call-attempt statistics.
- `dashboard-skills.png`: Skill adoption statistics.
- `dashboard-filtered.png`: June date filter applied.
- `dashboard-detail.png`: item hover details.
- `dashboard-narrow.png`: 360-pixel panel in the browser host.
- `dashboard-return.png`: return to plugin statistics.

Reproduce the interactive source with `npm ci --ignore-scripts`, `npm run build`, then `node scripts/demo.mjs`. Open the printed loopback URL. The fixture uses generated 2026 records in an isolated temporary directory. The script only exposes dashboard/query operations to its browser client. Type `q` in its terminal to close it and remove its own temporary fixture.

Capture with a 1100 × 1100 browser viewport and Chinese locale. GIF frames retain the visible synthetic-data label; do not crop that label out. Recording counts are examples, not performance claims. The coverage endpoint uses the runtime date, so future reruns may show a different coverage end date.
