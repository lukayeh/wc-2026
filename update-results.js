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

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world'

const TO_ESPN = {
  'Bosnia & Herzegovina': 'Bosnia-Herzegovina',
  'DR Congo': 'Congo DR',
  "Côte d'Ivoire": 'Ivory Coast',
  'USA': 'United States',
}

const FROM_ESPN = {}
for (const k in TO_ESPN) FROM_ESPN[TO_ESPN[k]] = k

function espnName(name) {
  return TO_ESPN[name] || name
}

function fromEspnName(name) {
  return FROM_ESPN[name] || name
}

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

function syncEliminatedOrder(data) {
  if (!data.eliminatedOrder) data.eliminatedOrder = []
  for (const p of data.players) {
    const allOut = p.eliminated.length >= p.teams.length
    const inOrder = data.eliminatedOrder.includes(p.name)
    if (allOut && !inOrder) {
      data.eliminatedOrder.push(p.name)
    } else if (!allOut && inOrder) {
      data.eliminatedOrder = data.eliminatedOrder.filter(n => n !== p.name)
    }
  }
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

const cardCache = {}

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function datePlus(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate())
}

async function fetchEvents(dateKey) {
  if (cardCache[dateKey] !== undefined) return cardCache[dateKey]
  const url = `${ESPN_BASE}/scoreboard?dates=${dateKey}`
  try {
    const res = await fetch(url)
    if (!res.ok) { cardCache[dateKey] = null; return null }
    const body = await res.json()
    cardCache[dateKey] = body.events || []
    return cardCache[dateKey]
  } catch (e) {
    cardCache[dateKey] = null
    return null
  }
}

async function getMatchCards(match) {
  if (match.yellow1 !== undefined) return
  
  const dateKeys = [match.date.replace(/-/g, ''), datePlus(match.date, 1)]
  
  for (const dateKey of dateKeys) {
    const events = await fetchEvents(dateKey)
    if (!events || !events.length) continue
    
    for (const ev of events) {
      const comp = ev.competitions?.[0]
      if (!comp || !comp.competitors || comp.competitors.length < 2) continue
      
      const c1 = comp.competitors[0]
      const c2 = comp.competitors[1]
      const n1 = c1.team.displayName
      const n2 = c2.team.displayName
      const mn1 = fromEspnName(n1) || n1
      const mn2 = fromEspnName(n2) || n2
      
      const matchPair = (mn1 === match.team1 && mn2 === match.team2) ||
                        (mn1 === match.team2 && mn2 === match.team1)
      if (!matchPair) continue
      
      const summaryUrl = `${ESPN_BASE}/summary?event=${ev.id}`
      let summary
      try {
        const sr = await fetch(summaryUrl)
        if (!sr.ok) continue
        summary = await sr.json()
      } catch (e) {
        continue
      }
      
      const box = summary.boxscore
      if (!box || !box.teams) continue
      
      const stats = {}
      for (const t of box.teams) {
        const tid = t.team?.id
        if (!tid) continue
        const y = t.statistics?.find(s => s.name === 'yellowCards')?.displayValue || '0'
        const r = t.statistics?.find(s => s.name === 'redCards')?.displayValue || '0'
        stats[tid] = { yellow: parseInt(y) || 0, red: parseInt(r) || 0 }
      }
      
      const tid1 = c1.team.id
      const tid2 = c2.team.id
      
      if (stats[tid1] !== undefined && stats[tid2] !== undefined) {
        if (mn1 === match.team1) {
          match.yellow1 = stats[tid1].yellow
          match.red1 = stats[tid1].red
          match.yellow2 = stats[tid2].yellow
          match.red2 = stats[tid2].red
        } else {
          match.yellow1 = stats[tid2].yellow
          match.red1 = stats[tid2].red
          match.yellow2 = stats[tid1].yellow
          match.red2 = stats[tid1].red
        }
        console.log(`  cards: ${match.team1} Y${match.yellow1} R${match.red1}, ${match.team2} Y${match.yellow2} R${match.red2}`)
        return
      }
    }
  }
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
      syncEliminatedOrder(data)
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
    syncEliminatedOrder(data)
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
      date: (m.local_date || '').split(' ')[0].replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2') || '2026-06-11',
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

  // --- collect upcoming schedule ---
  if (!data.schedule) data.schedule = []
  for (const m of matches) {
    if (m.finished === 'TRUE') continue
    const t1r = (m.home_team_name_en || '').trim()
    const t2r = (m.away_team_name_en || '').trim()
    if (!t1r || !t2r) continue
    const t1 = normalize(t1r)
    const t2 = normalize(t2r)
    if (!teamSet.has(t1) && !teamSet.has(t2)) continue
    const exists = data.schedule.some(x => x.team1 === t1 && x.team2 === t2)
    if (exists) continue
    var stage = ''
    if (m.type === 'group') stage = 'Group ' + m.group
    else if (m.type === 'r32') stage = 'R32'
    else if (m.type === 'r16') stage = 'R16'
    else if (m.type === 'qf') stage = 'QF'
    else if (m.type === 'sf') stage = 'SF'
    else if (m.type === 'final') stage = 'Final'
    else if (m.type === 'third') stage = '3rd Place'
    else stage = m.type || ''
    data.schedule.push({
      team1: t1,
      team2: t2,
      stage: stage,
      date: (m.local_date || '').split(' ')[0].replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$1-$2') || '',
      time: (m.local_date || '').split(' ')[1] || '',
    })
  }
  data.schedule.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''))

  data.matches.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  // --- fetch card data from ESPN for matches that lack it ---
  console.log(`\nFetching card data for ${data.matches.filter(m => m.yellow1 === undefined).length} match(es)...`)
  for (const m of data.matches) {
    await getMatchCards(m)
  }

  syncEliminatedOrder(data)

  data.lastUpdated = new Date().toISOString()

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n')

  if (eliminated.length) {
    console.log(`\nEliminated: ${eliminated.join(', ')}`)
  }

  embedInHtml(data)
  console.log(`\nDone. ${added} match(es) added. Total: ${data.matches.length}, schedule: ${data.schedule.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
