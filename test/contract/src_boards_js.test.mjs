// Contract tests for src/boards.js — boards of comparison cards over stored runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCard, newBoard, templateCards, readBoards, boardRuns, letterOf, addRunsToBoard, dropRuns, DEFAULT_COLUMNS } from '../../src/boards.js'

test('newCard: each kind with its defaults', () => {
  assert.equal(newCard('overlay').quantity, 'pressure')
  assert.deepEqual([newCard('metric').y, newCard('metric').x, newCard('metric').per], ['xPeak', 'level', 'hz'])
  assert.deepEqual(newCard('table').columns, DEFAULT_COLUMNS)
  assert.equal(newCard('stacked').span, 2)
  assert.equal(newCard('overlay', { span: 2 }).span, 2)
})

test('templates', () => {
  assert.deepEqual(templateCards('level').map((c) => c.kind), ['stacked', 'metric', 'table'])
  assert.deepEqual(templateCards('projects').map((c) => c.quantity || c.kind), ['pressure', 'excursion', 'velocity', 'table'])
  assert.deepEqual(templateCards('blank'), [])
  assert.equal(newBoard('B', 'report').cards[0].kind, 'report')
})

test('readBoards keeps what is usable', () => {
  assert.deepEqual(readBoards(null), [])
  const b = readBoards([{ id: 'b', name: 'x', cards: [{ id: 'c', kind: 'overlay', runs: ['r1', 5] }, { id: 'd', kind: 'nope' }] }, { nope: 1 }])
  assert.deepEqual(b, [{ id: 'b', name: 'x', cards: [{ id: 'c', kind: 'overlay', runs: ['r1'] }] }])
})

// CONTRACT: letters follow the order runs first appear on the board.
test('boardRuns and letterOf', () => {
  const b = { cards: [{ runs: ['x', 'y'] }, { runs: ['y', 'z'] }] }
  assert.deepEqual(boardRuns(b), ['x', 'y', 'z'])
  assert.deepEqual([0, 1, 25, 26, 27].map(letterOf), ['A', 'B', 'Z', 'AA', 'AB'])
})

test('addRunsToBoard and dropRuns', () => {
  const boards = [{ id: 'b', cards: [{ id: 'c1', kind: 'overlay', runs: ['a'] }, { id: 'c2', kind: 'report', runs: [] }] }]
  const all = addRunsToBoard(boards, 'b', ['a', 'b'])
  assert.deepEqual(all[0].cards.map((c) => c.runs), [['a', 'b'], ['a']], 'a report takes one run')
  const one = addRunsToBoard(all, 'b', ['c'], 'c1')
  assert.deepEqual(one[0].cards.map((c) => c.runs), [['a', 'b', 'c'], ['a']])
  assert.deepEqual(addRunsToBoard(one, 'b', ['z'], 'c2')[0].cards[1].runs, ['z'], 'dropping onto a report replaces its run')
  assert.deepEqual(dropRuns(one, ['a'])[0].cards.map((c) => c.runs), [['b', 'c'], []])
})
