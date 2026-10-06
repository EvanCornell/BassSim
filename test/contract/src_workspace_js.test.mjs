// Contract tests for the boards file in src/workspace.js.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as W from '../../src/workspace.js'

// CONTRACT: boards an older build kept in project files move to the workspace, once each, and leave the projects.
test('liftBoards', () => {
  let ws = W.newWorkspace('W', 'A')
  ws = W.writeFile(ws, 'B.speakerspice', { kind: 'project', data: { name: 'B', nodes: [], edges: [], tdBoards: [{ id: 'b1', name: 'One', cards: [] }] } })
  ws = W.writeFile(ws, 'C.speakerspice', { kind: 'project', data: { name: 'C', nodes: [], edges: [], tdBoards: [{ id: 'b1', name: 'Dup', cards: [] }, { id: 'b2', name: 'Two', cards: [] }] } })
  const out = W.liftBoards(ws)
  assert.deepEqual(W.readBoardList(out).map((b) => b.name), ['One', 'Two'])
  assert.equal('tdBoards' in out.files['B.speakerspice'].data, false)
  assert.equal(out.files[W.BOARDS_PATH].kind, 'boards')
  assert.equal(W.liftBoards(out), out, 'nothing left to move')
  assert.equal(W.kindForPath(W.BOARDS_PATH), 'boards')
})

test('writeBoards / readBoardList round trip', () => {
  const ws = W.writeBoards(W.newWorkspace(), [{ id: 'b', name: 'B', cards: [] }])
  assert.equal(W.readBoardList(ws)[0].id, 'b')
  assert.deepEqual(W.readBoardList(W.newWorkspace()), [])
})
