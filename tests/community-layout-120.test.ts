import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync('src/renderer/src/views/CommunityView.vue', 'utf8')

test('community kind capsules use symmetric padding and vertical centering', () => {
  assert.match(source, /\.community-page \.kind-capsules\{margin:0;padding:3px;align-items:center\}/)
  assert.doesNotMatch(source, /padding:0 0 8px/)
  assert.match(source, /line-height: 1;/)
})

test('community version picker teleports and flips inside the viewport', () => {
  assert.match(source, /<Teleport to="body">/)
  assert.match(source, /const openUp = below < Math\.min\(wanted, 220\) && above > below/)
  assert.match(source, /:style="versionMenuStyle"/)
  assert.match(source, /\.ver-filter-menu \{\s*position: fixed;/)
})
