// Time-domain boards: saved sets of comparison cards over stored runs.
//
// A board belongs to a project and is saved in its file, outside any record;
// it holds no results, only which runs each card shows and how. A card is
// one query over runs — an overlay of a quantity, the same quantity stacked,
// a figure against what a series varied, a difference, a table, or one run's
// full report.
//
// Everything here is pure.

/** The kinds of card, `[id, label, description]`, in the "Add comparison" menu's order. */
export const CARD_KINDS = [
  ['overlay', 'Overlay', 'Any quantity from any runs on one axis'],
  ['stacked', 'Stacked', 'Same quantity, one lane per run, shared time'],
  ['metric', 'Metric vs parameter', 'A figure from each run, plotted against what varied'],
  ['difference', 'Difference', 'One run minus another, on a shared axis'],
  ['table', 'Table', 'Every figure side by side'],
  ['report', 'Report', 'Everything one run measured, as its analysis shows it'],
]

/** The columns a new table starts with. */
export const DEFAULT_COLUMNS = ['spl', 'cmp', 'xPeak', 'vPeak', 'thd', 'iPeak']

/**
 * A new card's id.
 *
 * @returns {string} e.g. `card-x81kd2`.
 * @sideEffect Reads the random number generator.
 */
const cardId = () => `card-${Math.random().toString(36).slice(2, 8)}`

/**
 * A new card of a kind, with that kind's defaults.
 *
 * @param {string} kind - A `CARD_KINDS` id.
 * @param {object} [patch] - Fields to set.
 * @returns {object} The card.
 * @sideEffect Reads the random number generator for its id.
 */
export function newCard(kind, patch = {}) {
  const base = { id: cardId(), kind, runs: [], span: kind === 'stacked' || kind === 'report' ? 2 : 1 }
  if (kind === 'overlay' || kind === 'stacked' || kind === 'difference') base.quantity = 'pressure'
  if (kind === 'metric') Object.assign(base, { y: 'xPeak', x: 'level', per: 'hz' })
  if (kind === 'table') base.columns = DEFAULT_COLUMNS.slice()
  return { ...base, ...patch }
}

/** The templates a new board can start from, `[id, label, description, card summary]`. */
export const TEMPLATES = [
  ['overlay', 'Waveform overlay', 'One chart, any quantity, every run you drop in.', 'Overlay'],
  ['level', 'Level study', 'From a level series: stacked waveforms, compression vs level, and a table.', 'Stacked · Metric vs level · Table'],
  ['beforeafter', 'Before / after', 'Two runs of one project: overlay, difference, and the figures that moved.', 'Overlay · Difference · Table'],
  ['projects', 'Project vs project', 'Same signal, different designs: pressure, excursion, port velocity side by side.', '3 × Overlay · Table'],
]

/**
 * The cards a template starts a board with.
 *
 * `report` is the board a single run opens on when it is sent to a new
 * board: its report, with its figures beneath.
 *
 * @param {string} template - A `TEMPLATES` id, `report` or `blank`.
 * @returns {Array<object>} The cards.
 * @sideEffect Reads the random number generator for card ids.
 */
export function templateCards(template) {
  if (template === 'overlay') return [newCard('overlay', { span: 2 })]
  if (template === 'level') return [newCard('stacked', { quantity: 'excursion' }), newCard('metric', { y: 'cmp' }), newCard('table')]
  if (template === 'beforeafter') return [newCard('overlay'), newCard('difference'), newCard('table', { span: 2 })]
  if (template === 'projects') return [newCard('overlay'), newCard('overlay', { quantity: 'excursion' }), newCard('overlay', { quantity: 'velocity' }), newCard('table')]
  if (template === 'report') return [newCard('report')]
  return []
}

/**
 * A new board.
 *
 * @param {string} name - Its name.
 * @param {string} [template] - What it starts with; `blank` for nothing.
 * @returns {{id: string, name: string, cards: Array<object>}} The board.
 * @sideEffect Reads the random number generator for ids.
 */
export function newBoard(name, template = 'blank') {
  return { id: `board-${Math.random().toString(36).slice(2, 8)}`, name, cards: templateCards(template) }
}

/**
 * The boards a project file carries, checked.
 *
 * @param {*} raw - The file's `tdBoards` field.
 * @returns {Array<object>} Usable boards; none when the field is missing or malformed.
 * @pure
 */
export function readBoards(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((b) => b && typeof b.id === 'string' && Array.isArray(b.cards))
    .map((b) => ({
      id: b.id,
      name: typeof b.name === 'string' ? b.name : 'Board',
      cards: b.cards
        .filter((c) => c && typeof c.id === 'string' && CARD_KINDS.some((k) => k[0] === c.kind))
        .map((c) => ({ ...c, runs: Array.isArray(c.runs) ? c.runs.filter((r) => typeof r === 'string') : [] })),
    }))
}

/**
 * Every run a board shows, in the order they first appear: the order its letters and colours follow.
 *
 * @param {object} board - The board.
 * @returns {string[]} Run ids.
 * @pure
 */
export function boardRuns(board) {
  const out = []
  for (const c of board?.cards || []) for (const r of c.runs) if (!out.includes(r)) out.push(r)
  return out
}

/**
 * A run's letter on a board: A for the first run shown, then B, and so on.
 *
 * @param {number} i - Its place in `boardRuns`.
 * @returns {string} `A`…`Z`, then `AA`…
 * @pure
 */
export function letterOf(i) {
  return i < 26 ? String.fromCharCode(65 + i) : letterOf(Math.floor(i / 26) - 1) + letterOf(i % 26)
}

/**
 * Put runs on a board's cards: on one card, or on every card that takes runs.
 *
 * A report shows one run, so it takes the first given and keeps no others.
 *
 * @param {Array<object>} boards - The project's boards.
 * @param {string} boardId - The board.
 * @param {string[]} runIds - The runs.
 * @param {string} [cardId] - The card; every card when omitted.
 * @returns {Array<object>} The boards.
 * @pure
 */
export function addRunsToBoard(boards, boardId, runIds, cardId) {
  return boards.map((b) => (b.id !== boardId ? b : {
    ...b,
    cards: b.cards.map((c) => {
      if (cardId && c.id !== cardId) return c
      if (c.kind === 'report') return c.runs.length && !cardId ? c : { ...c, runs: runIds.slice(0, 1) }
      return { ...c, runs: [...c.runs, ...runIds.filter((r) => !c.runs.includes(r))] }
    }),
  }))
}

/**
 * Remove runs from every card of every board, as when the runs are deleted.
 *
 * @param {Array<object>} boards - The project's boards.
 * @param {string[]} runIds - The runs.
 * @returns {Array<object>} The boards.
 * @pure
 */
export function dropRuns(boards, runIds) {
  return boards.map((b) => ({ ...b, cards: b.cards.map((c) => ({ ...c, runs: c.runs.filter((r) => !runIds.includes(r)) })) }))
}
