import type { EngineInterface, Register } from 'claude-code'

import { describe, getConfig, label, refresh, search } from './workspace-index.ts'
import type { Collection } from './workspace-index.ts'
import { describeStubs, syncStubs } from './workspace-stubs.ts'

// Find a project or journal entry in a Claude workspace by keywords and open it.
//
// - One command per collection, `/proj <keywords>` and `/jrnl <keywords>` by
//   default: every keyword must match the start of a word in the folder name,
//   the title, or the CLAUDE.md body. One hit opens it, several ask which one,
//   and typing under "Type something" adds keywords.
// - At session start the stubs are written (see workspace-stubs.ts).
// - /finder-debug: settings, what the index holds and how the last open went.

const CHOICES = 4

let commands = new Map<string, Collection>()
let lastSubmit = 'none yet'

// Submitting from inside command.run never starts a turn, so wait for the
// command to finish. If the prompt still doesn't go, leave it in the box.
function submitRead($: EngineInterface, path: string): void {
  const text = `Read ${path}`
  $.clock.after(250, () => {
    $.prompt.submit({ text, asUser: true })
      .then(async r => {
        if (r.drop === undefined) { lastSubmit = `entered: ${r.text}`; return }
        lastSubmit = `dropped: ${String(r.drop)}`
        await $.prompt.fill({ text })
      })
      .catch(async err => {
        lastSubmit = `threw: ${err instanceof Error ? err.message : String(err)}`
        await $.prompt.fill({ text })
      })
  })
}

function header(c: Collection): string {
  const name = c.folder.split('/').pop() ?? c.folder
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 12)
}

async function open($: EngineInterface, c: Collection, args: string): Promise<{ text: string }> {
  await refresh($, true)
  const where = `in ${c.folder}`
  let query = args.trim()
  if (!query) return { text: `Usage: /${c.command} <keywords>` }

  // The picker shows a few at a time. Typing under "Type something" adds
  // keywords and searches again.
  for (;;) {
    const hits = search(query, c.prefix).map(h => h.entry)
    if (hits.length === 0) return { text: `Nothing ${where} matches "${query}".` }

    let pick = hits[0]!
    if (hits.length > 1) {
      const top = hits.slice(0, CHOICES)
      // Long labels are rejected, so the slug stands in for the title
      const labels = top.map(x => x.slug.slice(0, 40))
      let answer: string
      try {
        answer = await $.ui.ask(
          `${hits.length} entries ${where} match "${query}". Which one? Type more keywords to narrow.`,
          { options: labels, header: header(c) },
        )
      } catch (err) {
        const failure = err instanceof Error ? err.message : String(err)
        if (failure.includes('no answer')) return { text: 'Nothing opened.' }
        return {
          text: [
            `Picker failed: ${failure}`,
            ...hits.slice(0, 8).map(x => `  ${x.stub ?? x.path}  ${label(x)}`),
          ].join('\n'),
        }
      }
      const chosen = top[labels.indexOf(answer)]
      if (!chosen) {
        query = `${query} ${answer}`.trim()
        continue
      }
      pick = chosen
    }

    submitRead($, pick.path)
    return { text: `Opening ${label(pick)}` }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await refresh($, true)
    commands = new Map()
    for (const c of getConfig()?.collections ?? []) {
      try {
        await $.command.register({
          name: c.command,
          description: `Find an entry in ${c.folder} by keywords and open it`,
          argumentHint: '<keywords>',
        })
        commands.set(c.command, c)
      } catch (err) {
        $.ui.log(`workspace-finder: /${c.command} not registered: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
      }
    }
    await $.command.register({
      name: 'finder-debug',
      description: 'workspace-finder: settings, index size and how the last open went',
    })
    return next(e)
  })

  // Write the stubs, then ask Claude Code to rescan commands so they work now
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const report = await syncStubs($)
    return report.written + report.removed > 0 ? { ...result, reloadSkills: true } : result
  }).catch(($, e, next) => next(e))

  // Collection commands are named in settings, so one hook serves them all
  on('command.run', ($, e, next) => {
    const c = commands.get(e.command)
    return c ? open($, c, e.args) : next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'finder-debug' }, async $ => {
    await refresh($, true)
    return {
      text: [
        ...describe(),
        ...describeStubs(),
        `commands: ${[...commands.keys()].map(n => `/${n}`).join(', ') || 'none'}`,
        `last submit: ${lastSubmit}`,
      ].join('\n'),
    }
  })
}
