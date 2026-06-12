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

## Elimination

**Group stage** — manual:

```bash
node update-results.js --eliminate "TeamName"
node update-results.js --uneliminate "TeamName"
```

**Knockout** — automatic. When a knockout match finishes, the loser gets eliminated.

## Points System

| Result | Points |
|--------|--------|
| Win | 3 |
| Draw | 1 |
| Loss | 0 |

## Editing Data

Edit `data.json` to change team assignments, add matches manually, or override eliminations. After editing, run `node update-results.js` to sync changes into `index.html`.
