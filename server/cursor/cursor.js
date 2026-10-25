// Persistent helper: human-like mouse paths from ghost-cursor, one JSON request per line on stdin.
// Request: {"from": {x, y}, "box": {x, y, width, height}, "speed": number?}
// Response: {"points": [[x, y, ms_since_start], ...], "end": {x, y}}
// Mirrors GhostCursor.move(): random point inside the box, overshoot then correct on long moves.
const readline = require('readline')
const { path } = require('ghost-cursor')
const { overshoot } = require('ghost-cursor/lib/math')

const OVERSHOOT_THRESHOLD = 500
const OVERSHOOT_RADIUS = 120
const OVERSHOOT_SPREAD = 10
const PADDING = 0.3 // stay away from the element's edges

function plan ({ from, box, speed }) {
  const destination = {
    x: box.x + (box.width * PADDING) / 2 + Math.random() * box.width * (1 - PADDING),
    y: box.y + (box.height * PADDING) / 2 + Math.random() * box.height * (1 - PADDING)
  }
  const options = { useTimestamps: true, ...(speed ? { moveSpeed: speed } : {}) }
  const distance = Math.hypot(destination.x - from.x, destination.y - from.y)
  let points
  if (distance > OVERSHOOT_THRESHOLD) {
    const past = overshoot(destination, OVERSHOOT_RADIUS)
    const first = path(from, past, options)
    const second = path(past, { ...box, ...destination }, { ...options, spreadOverride: OVERSHOOT_SPREAD })
    const offset = first[first.length - 1].timestamp - second[0].timestamp
    points = [...first, ...second.slice(1).map(p => ({ ...p, timestamp: p.timestamp + offset }))]
  } else {
    points = path(from, destination, options)
  }
  const t0 = points[0].timestamp
  return { points: points.map(p => [p.x, p.y, p.timestamp - t0]), end: destination }
}

readline.createInterface({ input: process.stdin }).on('line', line => {
  let out
  try {
    out = plan(JSON.parse(line))
  } catch (err) {
    out = { error: String(err) }
  }
  process.stdout.write(JSON.stringify(out) + '\n')
})
