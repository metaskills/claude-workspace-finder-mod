import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { CMDS, FILES, WS, memoryFs, stubsIn, typed } from './memory-fs.ts'

const LATENCY = `${WS}/projects/2026-02-16-api-latency-investigation/CLAUDE.md`

// Stands in for the engine: records registered commands and submitted prompts,
// and answers the picker with `pick` (a label, or typed text)
function engine(on: On, pick?: (labels: string[]) => string) {
  const registered: string[] = []
  const submitted: string[] = []
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('prompt.submit', (_, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
    const q = e.questions[0]!
    if (!pick) return { deny: 'no answer' }
    return { result: { questions: e.questions, answers: { [q.question]: pick(q.options.map(o => o.label)) } } }
  })
  return { registered, submitted }
}

async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

test('one command per collection, named from settings', async ($, on) => {
  memoryFs(on, FILES, { CLAUDE_WORKSPACE_COLLECTIONS: 'p:projects:proj,j:journal:notes' })
  const { registered } = engine(on)
  await start($)
  expect(registered).toEqual(['proj', 'notes', 'finder-debug'])
})

test('one hit opens it with a Read prompt after the command returns', async ($, on) => {
  memoryFs(on)
  const clock = mock.clock(on)
  const { submitted } = engine(on)
  await start($)

  const { text } = await $.command.run(typed('proj', 'latency'))
  expect(text).toBe('Opening 2026-02-16 API Latency Investigation')
  expect(submitted).toEqual([])
  await clock.advance(300)
  expect(submitted).toEqual([`Read ${LATENCY}`])
})

test('several hits ask which one, and typed text narrows', async ($, on) => {
  memoryFs(on)
  const clock = mock.clock(on)
  const asked: string[][] = []
  const { submitted } = engine(on, labels => {
    asked.push(labels)
    return 'tiers'
  })
  await start($)

  // "pricing" is in one title and in the deck's notes. "tiers" isn't a label,
  // so it's added as a keyword, and only the pricing page has both.
  const { text } = await $.command.run(typed('proj', 'pricing'))
  expect(asked).toEqual([['pricing-page-redesign', 'quarterly-planning-deck']])
  expect(text).toBe('Opening 2026-03-02 Pricing Page Redesign')
  await clock.advance(300)
  expect(submitted).toEqual([`Read ${WS}/projects/2026-03-02-pricing-page-redesign/CLAUDE.md`])
})

test('picking a label opens that entry', async ($, on) => {
  memoryFs(on)
  engine(on, labels => labels[1]!)
  await start($)
  const { text } = await $.command.run(typed('proj', 'pricing'))
  expect(text).toBe('Opening 2026-01-12 Quarterly Planning Deck')
})

test('no match, no keywords, and a dismissed picker each say so', async ($, on) => {
  memoryFs(on)
  engine(on)
  await start($)
  expect((await $.command.run(typed('proj', 'zebra'))).text).toBe('Nothing in projects matches "zebra".')
  expect((await $.command.run(typed('jrnl', ''))).text).toBe('Usage: /jrnl <keywords>')
  expect((await $.command.run(typed('proj', 'pricing'))).text).toBe('Nothing opened.')
})

test('session start writes the same stubs the typeahead plugin does', async ($, on) => {
  const fs = memoryFs(on)
  engine(on)
  const result = await $.classic.SessionStart({ source: 'startup' })
  expect(result.reloadSkills).toBe(true)
  expect(stubsIn(fs, 'p')).toEqual([
    '.workspace-stubs',
    '01-pricing-page-redesign.md',
    '02-api-latency-investigation.md',
    '03-quarterly-planning-deck.md',
  ])
  expect(fs.get(`${CMDS}/p/02-api-latency-investigation.md`)).toContain(`Read ${LATENCY}`)
})

test('finder-debug reports the index and settings problems', async ($, on) => {
  memoryFs(on, FILES, { CLAUDE_WORKSPACE_COLLECTIONS: 'p:projects,oops', CLAUDE_WORKSPACE_DIR: '~/workspace/' })
  engine(on)
  await start($)
  const { text } = await $.command.run(typed('finder-debug'))
  expect(text).toContain(`workspace: ${WS}`)
  expect(text).toContain('index: 3 in projects')
  expect(text).toContain('problem: collection "oops" is not prefix:folder[:command]')
  expect(text).toContain('commands: /projects')
})
