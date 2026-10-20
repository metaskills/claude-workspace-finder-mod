# Claude Workspace Finder

**A resolver for date-prefixed Claude workspaces: find any project or note by what's in it, and open it in one command.**

You keep a workspace of dated projects and notes, each folder with a `CLAUDE.md` holding the goal, the status, and what you found. After a few months there are dozens of them, and finding the one you need means remembering what you named it. This [Claude Code](https://claude.com/claude-code) plugin adds `/proj` and `/jrnl`: type a few words you remember, and Claude opens that entry's notes.

```
> /proj embeddings
  Opening 2026-02-16 API Latency Investigation
> Read /Users/you/workspace/projects/2026-02-16-api-latency-investigation/CLAUDE.md
```

With more than one match, you get a picker. Choose one, or type more keywords to narrow it down.

```
> /proj pricing
  ┌ Projects ────────────────────────────────────────────────────────┐
  │ 2 entries in projects match "pricing". Which one?                │
  │ Type more keywords to narrow.                                    │
  │ ❯ 1. pricing-page-redesign                                       │
  │   2. quarterly-planning-deck                                     │
  │   3. Type something.                                             │
  └──────────────────────────────────────────────────────────────────┘
```

## Why you'd want it

- **Search by what you remember.** Every keyword is matched against the folder name, the title, and the whole `CLAUDE.md`. Remember "embeddings" and not the project name? That's enough.
- **Several keywords, real ranking.** `/proj pricing tiers` needs both words. Title matches rank above notes matches, then newest first.
- **No false hits from word fragments.** Keywords match the start of a word, so `rsi` finds "RSI Reset" and skips "versions".
- **Open, don't hunt.** One match opens straight away. Claude reads the entry's `CLAUDE.md` and is ready to carry on the work.
- **One slash command per entry, for free.** At session start it writes `/p:01-pricing-page-redesign` style commands, newest first, so the built-in `/` menu lists your whole workspace by date and title.
- **Your folders, your commands.** Add collections like `meetings/` or `research/`, each with its own command name.

## Use cases

- **Monday morning.** `/proj onboarding` picks the project back up with all its notes in context.
- **"Where did I write that down?"** `/jrnl vendor discount` finds the call notes that mention both.
- **Handing off.** `/proj latency` and then "write a handoff for this" gives Claude the full history to work from.
- **A big workspace.** At 80 projects the `/` menu is a long scroll. Two keywords get you to the one you want.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install workspace-finder --marketplace metaskills/claude-workspace-finder-mod
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell, the same thing:

```bash
claude plugin install workspace-finder --marketplace metaskills/claude-workspace-finder-mod
```

In the desktop app, where `/plugin` doesn't run: click + next to the prompt box, then Plugins, Add marketplace with `metaskills/claude-workspace-finder-mod`, then Add plugin.

Then tell it where your workspace is (next section) and start a new session.

## Your workspace

The plugin is built for a workspace where every entry is a folder named with an ISO 8601 date and a short slug, `YYYY-MM-DD-slug`, holding a `CLAUDE.md` whose first `# ` line is its title. Entries are grouped into collections. By default the plugin reads `~/workspace` with two:

```
~/workspace/
├── CLAUDE.md                                  # optional: how you run the workspace
├── projects/                                  # /proj
│   ├── 2026-03-02-pricing-page-redesign/
│   │   └── CLAUDE.md                          # "# Pricing Page Redesign - Mar 2026"
│   ├── 2026-02-16-api-latency-investigation/
│   │   └── CLAUDE.md
│   └── archives/                              # skipped
└── journal/                                   # /jrnl
    └── 2026-03-04-vendor-call/
        └── CLAUDE.md
```

The date prefix does the work, so there's nothing else to keep up:

- **The date orders it.** Matches rank newest first by folder name, and the stub commands are ranked the same way.
- **The slug names it.** The part after the date is what the picker shows and what `/p:01-pricing-page-redesign` is named after.
- **The title describes it.** It comes from the first `# ` heading. A date at the end, like "- Mar 2026" or "(Jan 2026)", is dropped since the date is shown on its own.

Folders named `archives` or starting with `.` are skipped. A folder with no date prefix still works, but it sorts after every dated one.

Don't have a workspace yet? Copy [`example-workspace/`](./example-workspace/) to `~/workspace`. Its `CLAUDE.md` tells Claude how to create and register new projects, so "create a new project for the Q3 launch" makes a correctly dated folder from then on.

## How it works

- **`/proj <keywords>`** searches `projects/`, and **`/jrnl <keywords>`** searches `journal/`. Each configured collection gets its own command.
- **One match** opens it: the plugin sends `Read <entry>/CLAUDE.md` as your next prompt.
- **Several matches** show the top 4 in a picker. Typing under "Type something" adds those words as keywords and searches again. Escape prints "Nothing opened."
- **The index** is built at session start and rebuilt when it's more than a minute old. It only reads your workspace.

### The stub commands

At session start the plugin writes one command per entry into `~/.claude/commands/<prefix>/`:

```markdown
---
description: "2026-03-02 Pricing Page Redesign"
---

Read /Users/you/workspace/projects/2026-03-02-pricing-page-redesign/CLAUDE.md
```

Then it asks Claude Code to rescan commands, so they work in that same session. The two-digit rank keeps the `/` menu newest first. Claude Code's picker won't match across the `01-`, so `/p:pricing` finds nothing. Type `/pricing` with no namespace or `/proj pricing` instead, or turn ranking off for an alphabetical menu.

The plugin only writes to a stub folder it created, marked by a `.workspace-stubs` file, or one that doesn't exist yet. If you already have your own `~/.claude/commands/p/`, it's left alone and `/finder-debug` says so. Stale stubs are deleted when their entry is renamed, archived or removed.

## Configuration

Everything is set with environment variables. Put them in the `env` block of `~/.claude/settings.json` so every session gets them:

```json
{
  "env": {
    "CLAUDE_WORKSPACE_DIR": "~/Documents/claude",
    "CLAUDE_WORKSPACE_COLLECTIONS": "p:projects:proj,j:journal:jrnl,m:meetings:mtg"
  }
}
```

| Variable | Default | What it does |
| :- | :- | :- |
| `CLAUDE_WORKSPACE_DIR` | `~/workspace` | The workspace root |
| `CLAUDE_WORKSPACE_COLLECTIONS` | `p:projects:proj,j:journal:jrnl` | Comma-separated `prefix:folder[:command]`. The command is the slash command that searches it, and defaults to the folder's name. The prefix names its stubs (`/p:...`). The folder is relative to the workspace or absolute |
| `CLAUDE_WORKSPACE_EXCLUDE` | `archives` | Comma-separated folder names to skip |
| `CLAUDE_WORKSPACE_STUBS` | `true` | Set `false` to stop writing stub commands |
| `CLAUDE_WORKSPACE_STUBS_RANK` | `true` | Set `false` for plain `/p:pricing-page-redesign` names, sorted alphabetically |
| `CLAUDE_WORKSPACE_COMMANDS_DIR` | `$CLAUDE_CONFIG_DIR/commands`, else `~/.claude/commands` | Where stub folders go |

A command name that Claude Code already uses is refused, and `/finder-debug` lists the commands that did register. Changing a variable in `settings.json` takes effect in the next session.

## Try it without installing

```bash
git clone https://github.com/metaskills/claude-workspace-finder-mod.git
cd claude-workspace-finder-mod
CLAUDE_WORKSPACE_DIR="$PWD/example-workspace" CLAUDE_WORKSPACE_STUBS=false claude --plugin-dir .
```

Then type `/proj pricing`.

## Troubleshooting

Run `/finder-debug`. It shows the workspace it read, the collections, how many entries each has, whether the stub folder was skipped, any settings it couldn't parse, the commands it registered, and how the last open went.

- **"Nothing in projects matches":** check `workspace:` and any `missing:` line in `/finder-debug`.
- **The picker opened but nothing was sent:** `last submit:` in `/finder-debug` says why. When the prompt can't be sent it's left in the prompt box for you to press Enter.
- **No `/p:` commands:** look for `stubs skipped, not made by this plugin`. Move your own commands out of that folder, or set `CLAUDE_WORKSPACE_STUBS=false`.
- **Turn it off for a session:** start Claude Code with `--safe-mode`.

## Works well with

[**Claude Workspace Typeahead**](https://github.com/metaskills/claude-workspace-typeahead-mod) makes `/` work anywhere in a prompt: type `/pricing` mid-sentence and the entry's `CLAUDE.md` comes along as an `@` mention. Both plugins read the same settings and write the same stubs, so install either or both.

## Development

The hooks module is TypeScript, loaded by Claude Code with no build step.

- `hooks/register.ts` - the commands, the picker and `/finder-debug`
- `hooks/workspace-index.ts` - reads the settings and indexes the workspace
- `hooks/workspace-stubs.ts` - writes the stub commands
- `tests/` - run with `claude plugin test .`

`claude plugin validate .` checks the manifest and the module. `workspace-index.ts`, `workspace-stubs.ts` and `tests/memory-fs.ts` are identical copies in the typeahead plugin, so each plugin stands alone. Change them in both.

## License

[MIT](./LICENSE)
