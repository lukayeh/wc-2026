# World Cup 2026 Sweepstakes

Static page tracking a 4-player sweepstakes draw for the 2026 FIFA World Cup.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Standalone page — open in browser, no server needed |
| `data.json` | Players, teams, match results, eliminations |
| `update-results.js` | Fetches match results and updates data + HTML |

## Daily Update

```bash
node update-results.js
```

Pulls finished matches from [worldcup26.ir](https://worldcup26.ir) (free open-source API). Adds any new match involving a sweepstakes team. Auto-updates both `data.json` and the inline data in `index.html`.

## Data Sources

| Source | Data |
|--------|------|
| [`worldcup26.ir/get/games`](https://worldcup26.ir/get/games) | Match results (goals, stage, date) |
| [`site.api.espn.com/v2/sports/soccer/fifa.world`](https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard) | Yellow cards, red cards per match (free, no auth) |

Both are free public APIs — no API key required.

## Elimination

**Group stage** — manual:

```bash
node update-results.js --eliminate "TeamName"
node update-results.js --uneliminate "TeamName"
```

**Knockout** — automatic. When a knockout match finishes, the loser gets eliminated.

## Points System

| Event | Points |
|-------|--------|
| Win | +3 |
| Draw | +1 |
| Goal scored | +1 |
| Goal conceded | -1 |
| Yellow card | -0.5 |
| Red card | -1 |

All 104 tournament matches count (group stage + knockout).

## Editing Data

Edit `data.json` to change team assignments, add matches manually, or override eliminations. After editing, run `node update-results.js` to sync changes into `index.html`.
