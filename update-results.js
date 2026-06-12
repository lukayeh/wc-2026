// update-results.js — fetch WC 2026 results, update data.json + index.html
// Usage:
//   node update-results.js                        fetch latest matches
//   node update-results.js --eliminate "TeamName"  mark team eliminated
//   node update-results.js --uneliminate "Team"    undo elimination

const fs = require('fs')
const path = require('path')

const DATA_FILE = path.join(__dirname, 'data.json')
const HTML_FILE = path.join(__dirname, 'index.html')
const API = 'https://worldcup26.ir/get/games'

const NAME_MAP = {
  'Cape Verde': 'Cabo Verde',
  'Turkey': 'Türkiye',
  'Ivory Coast': "Côte d'Ivoire",
  'Czech Republic': 'Czechia',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Democratic Republic of the Congo': 'DR Congo',
  'DRC': 'DR Congo',
  'Korea Republic': 'South Korea',
  'United States': 'USA',
  'Curaçao': 'Curaçao',
}

function normalize(name) {
  return NAME_MAP[name] || name
}

function getPlayerByTeam(data, team) {
  return data.players.find(p => p.teams.includes(team))
}

function embedInHtml(data) {
  const json = JSON.stringify(data)
  let html = fs.readFileSync(HTML_FILE, 'utf-8')
  const startMarker = '//DATA\nconst DATA = '
  const endMarker = '\n//DATAEND'
  const start = html.indexOf(startMarker)
  const end = html.indexOf(endMarker)
  if (start === -1 || end === -1) {
    console.error('Could not find DATA markers in HTML')
    return
  }
  const before = html.slice(0, start + startMarker.length)
  const after = html.slice(end)
  html = before + json + after
  fs.writeFileSync(HTML_FILE, html)
}

async function main() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8')
  const data = JSON.parse(raw)
  const teamSet = new Set()
  data.players.forEach(p => p.teams.forEach(t => teamSet.add(t)))

  // --- handle --eliminate / --uneliminate flags ---
  const elimIdx = process.argv.indexOf('--eliminate')
  const unelimIdx = process.argv.indexOf('--uneliminate')
  if (elimIdx !== -1 && process.argv[elimIdx + 1]) {
    const team = process.argv[elimIdx + 1]
    const player = getPlayerByTeam(data, team)
    if (!player) { console.error(`Team "${team}" not found in any player's teams`); process.exit(1) }
    if (!player.eliminated.includes(team)) {
      player.eliminated.push(team)
      console.log(`Eliminated: ${team} (${player.name})`)
    } else {
      console.log(`${team} already eliminated`)
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
    embedInHtml(data)
    return
  }
  if (unelimIdx !== -1 && process.argv[unelimIdx + 1]) {
    const team = process.argv[unelimIdx + 1]
    const player = getPlayerByTeam(data, team)
    if (!player) { console.error(`Team "${team}" not found`); process.exit(1) }
    player.eliminated = player.eliminated.filter(t => t !== team)
    console.log(`Un-eliminated: ${team} (${player.name})`)
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n')
    embedInHtml(data)
    return
  }

  // --- fetch matches ---
  console.log(`Fetching: ${API}`)
  let matches
  try {
    const res = await fetch(API)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    matches = body.games || []
  } catch (e) {
    console.error(`API fetch failed: ${e.message}`)
    matches = []
  }

  let added = 0
  let eliminated = []

  for (const m of matches) {
    if (m.finished !== 'TRUE') continue

    const t1 = normalize(m.home_team_name_en.trim())
    const t2 = normalize(m.away_team_name_en.trim())
    const g1 = Number(m.home_score)
    const g2 = Number(m.away_score)

    if (isNaN(g1) || isNaN(g2)) continue

    const exists = data.matches.some(
      x => x.team1 === t1 && x.team2 === t2 && x.goals1 === g1 && x.goals2 === g2
    )
    if (exists) continue

    if (!teamSet.has(t1) && !teamSet.has(t2)) continue

    data.matches.push({
      team1: t1,
      team2: t2,
      goals1: g1,
      goals2: g2,
      stage: m.type === 'group' ? 'Group' : (m.type || 'Knockout'),
      date: (m.local_date || '').split(' ')[0] || '2026-06',
    })
    added++

    const both = teamSet.has(t1) && teamSet.has(t2)
    const msg = both ? '★ BOTH' : teamSet.has(t1) ? t1 : t2
    console.log(`  + ${t1} ${g1}-${g2} ${t2} (${msg})`)

    // knockout elimination: loser is eliminated
    if (m.type !== 'group' && g1 !== g2) {
      const loser = g1 < g2 ? t1 : t2
      if (teamSet.has(loser)) {
        const player = getPlayerByTeam(data, loser)
        if (player && !player.eliminated.includes(loser)) {
          player.eliminated.push(loser)
          eliminated.push(loser)
        }
      }
    }
  }

  data.matches.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n')

  if (eliminated.length) {
    console.log(`\nEliminated: ${eliminated.join(', ')}`)
  }

  embedInHtml(data)
  console.log(`\nDone. ${added} match(es) added. Total: ${data.matches.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
