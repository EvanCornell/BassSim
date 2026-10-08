// Contract tests for the comparison boards src/workspace.js drops.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as W from '../../src/workspace.js'

// CONTRACT: boards older builds saved — the workspace's file, and inside projects — are dropped; nothing else changes.
test('dropBoards', () => {
  let ws = W.newWorkspace('W', 'A')
  ws = W.writeFile(ws, 'B.speakerspice', { kind: 'project', data: { name: 'B', nodes: [], edges: [], tdBoards: [{ id: 'b1', name: 'One', cards: [] }] } })
  ws = W.writeFile(ws, W.BOARDS_PATH, { kind: 'json', data: [{ id: 'b2', name: 'Two', cards: [] }] })
  const out = W.dropBoards(ws)
  assert.equal('tdBoards' in out.files['B.speakerspice'].data, false)
  assert.equal(out.files['B.speakerspice'].data.name, 'B')
  assert.equal(out.files[W.BOARDS_PATH], undefined)
  assert.equal(W.dropBoards(out), out, 'nothing left to drop')
})
