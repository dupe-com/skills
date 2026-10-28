import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import {
  accountOf,
  autoProject,
  bindingOf,
  briefTemplate,
  folderOf,
  globMatch,
  groupEmoji,
  groupOf,
  inProject,
  isSharedFolder,
  labelFor,
  livePids,
  memberFor,
  peerOf,
  projectArgs,
  rootOf,
  threadKey,
  tmuxTarget,
  waitingOn,
} from '../hooks/register'
import type { CoordSession } from '../types'

const ROOT = '/w/app'
const BOARD = '/w/app/coord/x/coordinator-board.md'

const file = (o: Record<string, unknown>) => JSON.stringify(o)

// Beneath the mod: a fake machine. Two accounts' session files (one of them this
// session, one a live builder, one whose process is gone), git, gh and a writable fs.
type Seen = {
  filled: string[]
  tools: string[]
  titles: string[]
  store?: Record<string, unknown>
  sessionId?: string
  clock?: { advance: (ms: number) => Promise<void> }
  // tmux commands run, and what `display-message` says of this session's tab: id, name, automatic-rename.
  tmux?: string[][]
  tab?: [string, string, string]
  status?: (string | undefined)[]
}

function engine(on: On, files: Record<string, string>, seen: Seen, opts: { named?: boolean; selfCwd?: string } = {}) {
  files['/home/.claude/sessions/1.json'] = file({
    pid: 1,
    sessionId: 'self',
    cwd: opts.selfCwd ?? ROOT,
    messagingSocketPath: '/tmp/1.sock',
    name: 'Coordinator',
    status: 'busy',
    statusUpdatedAt: 0,
    nameSource: opts.named ? 'user' : 'derived',
    tmux: 'dev:@3.%9',
  })
  // A stale file in the other account from a process that once had our pid: never us.
  files['/home/.claude-work/sessions/1.json'] = file({
    pid: 1,
    sessionId: 'stale',
    cwd: ROOT,
    messagingSocketPath: '/tmp/stale.sock',
    name: 'Old Coordinator',
    status: 'idle',
    nameSource: 'user',
  })
  files['/home/.claude/sessions/4.json'] = file({
    pid: 4,
    sessionId: 'c',
    cwd: `${ROOT}/branches/billing-x`,
    messagingSocketPath: '/tmp/4.sock',
    name: 'billing-x-1a',
    status: 'busy',
    statusUpdatedAt: Date.now(),
  })
  files['/home/.claude-work/sessions/2.json'] = file({
    pid: 2,
    sessionId: 'b',
    cwd: `${ROOT}/branches/auth-a`,
    messagingSocketPath: '/tmp/2.sock',
    name: 'auth-a-6b',
    status: 'idle',
    statusUpdatedAt: Date.now(),
    tmux: 'dev:@8.%56',
  })
  files['/home/.claude-work/sessions/3.json'] = file({
    pid: 3,
    sessionId: 'gone',
    cwd: `${ROOT}/branches/old`,
    messagingSocketPath: '/tmp/3.sock',
    name: 'old-1',
    status: 'idle',
  })

  // The store in the open, so a test can read what the mod remembered.
  const store = (seen.store ??= {})
  on('store.get', ($, e: any) => ({ value: store[e.key] }) as any)
  on('store.set', ($, e: any) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined } as any
  })
  on('store.delete', ($, e: any) => {
    delete store[e.key]
    return { value: undefined } as any
  })
  on('store.keys', () => ({ value: Object.keys(store) }) as any)
  seen.clock = mock.clock(on, { now: Date.now() })
  mock.env(on, { HOME: '/home', CLAUDE_COORD_CONFIG_DIRS: '/home/.claude-work' })
  on('session.id', () => ({ value: seen.sessionId ?? 'self' }) as any)
  on('session.cwd', () => ({ value: opts.selfCwd ?? ROOT }) as any)
  on('fs.list', ($, e: any) => {
    const dir = `${e.path}/`
    const names = Object.keys(files)
      .filter(f => f.startsWith(dir))
      .map(f => f.slice(dir.length))
    // Like a real disk: a folder that holds nothing here doesn't exist. The root holds branches/.
    if (names.length === 0 && e.path !== `${ROOT}/branches`) throw new Error('ENOENT')
    return { value: names.map(name => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as any
  })
  on('fs.read', ($, e: any) => {
    if (!(e.path in files)) throw new Error('ENOENT')
    return { value: files[e.path] } as any
  })
  on('fs.write', ($, e: any) => {
    files[e.path] = e.text
    return { value: undefined } as any
  })
  on('process.run', ($, e: any) => {
    const [cmd, , script, , line, file] = e.argv as string[]
    if (cmd === '/bin/sh' && script === 'echo $PPID') return { value: { exitCode: 0, stdout: '1\n', stderr: '' } } as any
    if (cmd === '/bin/sh' && script?.includes('exec tmux')) {
      const args = (e.argv as string[]).slice(4)
      ;(seen.tmux ??= []).push(args)
      const stdout = args[0] === 'display-message' ? `${(seen.tab ?? ['dev:@3', 'zsh', '1']).join('\t')}\n` : ''
      return { value: { exitCode: 0, stdout, stderr: '' } } as any
    }
    if (cmd === '/bin/sh' && file && line !== undefined) {
      files[file] = `${files[file] ?? ''}${line}\n`
      return { value: { exitCode: 0, stdout: '', stderr: '' } } as any
    }
    const stdout =
      cmd === 'ps'
        ? '    1 /home/.local/bin/claude\n    2 claude\n    4 claude\n    3 zsh\n'
        : cmd === 'git'
          ? 'feature/auth-a\n'
          : JSON.stringify([{ number: 101, headRefName: 'feature/auth-a', isDraft: true, title: 'Row buttons', headRefOid: 'abc1234def567' }])
    return { value: { exitCode: 0, stdout, stderr: '' } } as any
  })
  on('tool.register', ($, e: any) => {
    seen.tools.push(e.name)
    return { value: { tool: `mcp__coordinator__${e.name}` } } as any
  })
  on('command.register', ($, e: any) => ({ value: { command: e.name } }) as any)
  on('ui.open', ($, e: any) => {
    seen.titles.push(e.title)
    return { value: { isPlaced: true } } as any
  })
  on('ui.status', ($, e: any) => {
    ;(seen.status ??= []).push(e.text)
    return { value: undefined } as any
  })
  on('prompt.fill', ($, e: any) => {
    seen.filled.push(e.text)
    return { isFilled: true } as any
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e: any) => ({ sessionId: e.sessionId }) as any)
  on('session.send', () => ({ isDelivered: true }) as any)
  on('session.receive', ($, e) => ({ text: e.text }) as any)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({ key: 'engine' })
  })
}

const store_ = (seen: Seen) => seen.store!

async function coord($: any, args: string): Promise<string> {
  const r = await $.command.run({ command: 'coord', args })
  return r.text ?? ''
}

describe('coordinator helpers', () => {
  test('rootOf strips the worktree part', async () => {
    expect(rootOf('/w/app/branches/auth-a')).toBe('/w/app')
    expect(rootOf('/w/app')).toBe('/w/app')
  })

  test('peerOf reads the sender off a cross-session message', async () => {
    expect(peerOf('<cross-session-message from="uds:/tmp/9.sock" from-name="auth-x" from-mode="auto">hi')).toEqual({
      socket: 'uds:/tmp/9.sock',
      name: 'auth-x',
    })
    expect(peerOf('plain text')).toBeNull()
  })

  test('waitingOn says who owes the next message', async () => {
    const s: CoordSession = {
      name: 'b',
      account: '.claude-work',
      pid: 2,
      cwd: '/w',
      socket: 'uds:/tmp/2.sock',
      status: 'idle',
      statusSince: 1_000,
      isSelf: false,
      isNamed: false,
    }
    expect(waitingOn(undefined, s, 2_000).tone).toBe('none')
    expect(waitingOn({ name: 'b', lastIn: 2_000, lastOut: 1_000 }, s, 3_000).tone).toBe('owe')
    expect(waitingOn({ name: 'b', lastIn: 1_000, lastOut: 2_000 }, s, 3_000).tone).toBe('wait')
    expect(waitingOn({ name: 'b', lastOut: 2_000 }, s, 2_000 + 16 * 60_000).tone).toBe('nudge')
    expect(waitingOn({ name: 'b', lastOut: 2_000 }, { ...s, status: 'busy' }, 2_000 + 16 * 60_000).tone).toBe('wait')
  })

  test('a builder that restarts keeps its thread; two sessions in one folder do not share one', async () => {
    const s = (socket: string, cwd: string): CoordSession => ({
      name: socket,
      account: '.claude-work',
      pid: 1,
      cwd,
      socket,
      status: 'idle',
      statusSince: 0,
      isSelf: false,
      isNamed: false,
    })
    expect(threadKey([s('uds:/a', '/w/branches/x')], 'uds:/a')).toBe('/w/branches/x')
    expect(threadKey([s('uds:/b', '/w/branches/x')], 'uds:/b')).toBe('/w/branches/x')
    expect(threadKey([s('uds:/a', '/w/branches/y'), s('uds:/b', '/w/branches/y')], 'uds:/a')).toBe('uds:/a')
    expect(threadKey([], 'uds:/gone')).toBe('uds:/gone')
    // Subagent hand-backs use another wrapper and never count as a builder message.
    expect(peerOf('<agent-message from="a868e24d">[Subagent hand-back] done')).toBeNull()
  })

  test('a project is its folder pattern, plus sessions added, minus sessions dropped', async () => {
    const s = (cwd: string): CoordSession => ({
      name: 'x',
      account: '.claude',
      pid: 1,
      cwd,
      socket: 'uds:/x',
      status: 'idle',
      statusSince: 0,
      isSelf: false,
      isNamed: false,
    })
    expect(folderOf('/w/branches/auth-a/apps/web')).toBe('auth-a')
    expect(folderOf('/w/other')).toBe('/w/other')
    expect(globMatch('auth-*', 'auth-row-buttons')).toBe(true)
    expect(globMatch('auth-*', 'xauth-a')).toBe(false)
    expect(globMatch('a.b?', 'a.bc')).toBe(true)
    expect(globMatch('a.b', 'axb')).toBe(false)

    const p = { name: 'auth', pattern: 'auth-*', members: ['billing-x', '/m/app'], dropped: ['auth-old'] }
    expect(inProject(p, s('/w/branches/auth-a'), '/w')).toBe(true)
    expect(inProject(p, s('/w/branches/billing-y'), '/w')).toBe(false)
    expect(inProject(p, s('/w/branches/billing-x'), '/w')).toBe(true)
    expect(inProject(p, s('/m/app'), '/w')).toBe(true)
    expect(inProject(p, s('/w/branches/auth-old'), '/w')).toBe(false)
    expect(inProject(p, s('/w'), '/w')).toBe(false)
    expect(inProject(p, s('/w2/branches/auth-a'), '/w')).toBe(false)
    // No project: everything under the root, and only the root.
    expect(inProject(undefined, s('/w/branches/billing-y'), '/w')).toBe(true)
    expect(inProject(undefined, s('/w-other'), '/w')).toBe(false)
  })

  test('add and drop take an exact session, a path or a folder, never a prefix', async () => {
    const s = (name: string, cwd: string, isSelf = false): CoordSession => ({
      name,
      account: '.claude',
      pid: 1,
      cwd,
      socket: `uds:/tmp/${name}.sock`,
      status: 'idle',
      statusSince: 0,
      isSelf,
      isNamed: false,
    })
    const live = [s('auth-a-6b', '/w/branches/auth-a'), s('Coordinator', '/w', true)]
    expect(memberFor(live, 'auth-a-6b')).toBe('auth-a')
    expect(memberFor(live, 'uds:/tmp/auth-a-6b.sock')).toBe('auth-a')
    expect(memberFor(live, 'auth')).toBe('auth')
    expect(memberFor(live, '/w/branches/auth-extra/')).toBe('auth-extra')
    expect(memberFor(live, 'branches/auth-extra/apps')).toBe('auth-extra')
    expect(memberFor(live, 'Coordinator')).toBe('Coordinator')
  })

  test("a named session's own binding wins over the folder's", async () => {
    expect(bindingOf(undefined, true)).toBe('')
    expect(bindingOf(undefined, 'auth')).toBe('auth')
    expect(bindingOf('billing', 'auth')).toBe('billing')
    expect(bindingOf(false, true)).toBe(false)
    expect(bindingOf(undefined, undefined)).toBe(false)
  })

  test('the worktree root and branches/main are shared folders; other worktrees are not', async () => {
    const holds = (d: string) => d === ROOT
    expect(isSharedFolder(ROOT, holds)).toBe(true)
    expect(isSharedFolder(`${ROOT}/`, holds)).toBe(true)
    expect(isSharedFolder(`${ROOT}/main`, holds)).toBe(true)
    expect(isSharedFolder(`${ROOT}/branches/main`, holds)).toBe(true)
    expect(isSharedFolder(`${ROOT}/branches/master`, holds)).toBe(true)
    expect(isSharedFolder(`${ROOT}/branches/main/apps/web`, holds)).toBe(true)
    expect(isSharedFolder(`${ROOT}/branches/auth-coord`, holds)).toBe(false)
    expect(isSharedFolder(`${ROOT}/branches/main-ish`, holds)).toBe(false)
    expect(isSharedFolder(`${ROOT}/coord/x`, holds)).toBe(false)
    expect(isSharedFolder('/home/code/other-repo', holds)).toBe(false)
    expect(isSharedFolder('/home/code/main', holds)).toBe(false)
  })

  test('a builder label drops the part of the folder its pattern spells out', async () => {
    const p = { name: 'auth', pattern: 'auth-*', emoji: '🌸', members: [], dropped: [] }
    expect(labelFor(p, 'auth-login')).toEqual({ status: '🌸 auth · login', tab: '🌸 login' })
    expect(labelFor({ ...p, emoji: undefined }, 'billing-x')).toEqual({ status: '◆ auth · billing-x', tab: '◆ billing-x' })
    expect(labelFor(p, '/m/app')).toEqual({ status: '🌸 auth · app', tab: '🌸 app' })
    expect(labelFor(p, 'auth-')).toEqual({ status: '🌸 auth · auth-', tab: '🌸 auth-' })
    expect(labelFor(p, 'auth-#(id)').tab).toBe('🌸 (id)')
    expect(projectArgs(['#(id)']).bad).toBe('#(id)')
    expect(tmuxTarget('dev:@8.%56')).toEqual({ window: 'dev:@8', pane: 'dev:@8.%56' })
    expect(tmuxTarget('my:session:@12.%3')).toEqual({ window: 'my:session:@12', pane: 'my:session:@12.%3' })
    expect(tmuxTarget(undefined)).toBeUndefined()
    expect(tmuxTarget('garbage')).toBeUndefined()
    expect(projectArgs(['🌸', '/b.md'])).toEqual({ emoji: '🌸', board: '/b.md' })
    expect(projectArgs(['/b.md', '🌸'])).toEqual({ emoji: '🌸', board: '/b.md' })
    expect(projectArgs(['🌸', 'oops']).bad).toBe('oops')
    // A path that isn't absolute is refused, never kept as the emoji.
    expect(projectArgs(['notes/board.md']).bad).toBe('notes/board.md')
    expect(projectArgs(['~/b.md']).bad).toBe('~/b.md')
    expect(projectArgs(['-'])).toEqual({ emoji: '' })
  })

  test('a folder group is the worktree name up to its first dash, with an emoji of its own', async () => {
    expect(groupOf('/w/branches/auth-log-in/apps/web')).toBe('auth')
    expect(groupOf('/w/branches/scratch1')).toBeUndefined()
    expect(groupOf('/w/branches/auth-')).toBeUndefined()
    expect(groupOf('/w/branches/all-x')).toBeUndefined()
    expect(groupOf('/w/auth-a')).toBeUndefined()
    expect(groupEmoji('auth')).toBe(groupEmoji('auth'))
    expect(new Set(['auth', 'billing', 'plugin', 'coord', 'haiku', 'mods', 'cart', 'ext'].map(groupEmoji)).size).toBeGreaterThan(4)
    const p = autoProject('auth')
    expect(p).toEqual({ name: 'auth', pattern: 'auth-*', emoji: groupEmoji('auth'), members: [], dropped: [], auto: true })
    expect(labelFor(p, 'auth-login')).toEqual({ status: `${p.emoji} auth · login`, tab: `${p.emoji} login` })
  })

  test('the claude -w layout (.claude/worktrees/) works like branches/', async () => {
    const wt = '/r/app/.claude/worktrees'
    expect(rootOf(`${wt}/auth-a/src`)).toBe('/r/app')
    expect(folderOf(`${wt}/auth-a/src`)).toBe('auth-a')
    expect(groupOf(`${wt}/auth-a`)).toBe('auth')
    expect(groupOf('/r/app')).toBeUndefined()
    expect(memberFor([], '.claude/worktrees/auth-extra/src')).toBe('auth-extra')
    expect(memberFor([], `${wt}/auth-extra/`)).toBe('auth-extra')
    const holds = (d: string) => d === '/r/app'
    expect(isSharedFolder('/r/app', holds)).toBe(true)
    expect(isSharedFolder(`${wt}/auth-coord`, holds)).toBe(false)
    expect(accountOf('/home/.claude')).toBe('.claude')
    expect(accountOf('/home/.claude-work/')).toBe('.claude-work')
  })

  test('only a Claude process keeps a session file live', async () => {
    expect([...livePids('  12 /Users/me/.local/bin/claude\n  13 node\n  14 /bin/zsh\n  15 Google Chrome Helper\n')]).toEqual([12, 13])
  })

  test('the brief carries the rules and the reply-to', async () => {
    const s: CoordSession = {
      name: 'auth-a',
      account: '.claude-work',
      pid: 2,
      cwd: '/w',
      socket: 'uds:/tmp/2.sock',
      status: 'idle',
      statusSince: 0,
      isSelf: false,
      isNamed: false,
    }
    const text = briefTemplate(s, 'uds:/tmp/1.sock', 'ship row buttons')
    expect(text).toContain('Reply to: uds:/tmp/1.sock')
    expect(text).toContain('Goal: ship row buttons')
    expect(text).toContain('never merge or force-push')
  })
})

describe('coordinator', () => {
  test('finds live builders, tracks who owes a reply, keeps the board', async ($, on) => {
    const files: Record<string, string> = {}
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, files, seen, { named: true })

    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    // Off until asked: no tools for the model in a builder session.
    expect(seen.tools).toEqual([])

    expect(await coord($, 'on')).toContain('Coordinator on')
    expect(seen.tools).toEqual(['sessions', 'board', 'brief'])

    const status = await coord($, 'status')
    expect(status).toContain('auth-a-6b (.claude-work)')
    expect(status).toContain('uds:/tmp/2.sock')
    expect(status).toContain('#101 draft @ abc1234de')
    expect(status).toContain('no messages yet')
    expect(status).not.toContain('old-1')
    expect(status).not.toContain('Coordinator (.claude)')
    expect(status).toContain('billing-x-1a (.claude)')

    expect(await coord($, 'board-path relative.md')).toContain('absolute path')
    await coord($, `board-path ${BOARD}`)

    await $.session.receive({
      origin: { kind: 'peer-send-message' },
      text: '<cross-session-message from="uds:/tmp/2.sock" from-name="auth-a-6b">\nPlan: 10 lines\n</cross-session-message>',
    } as any)
    expect(await coord($, 'status')).toContain('you owe a reply')
    expect(files['/w/app/coord/x/messages.md']).toMatch(/← auth-a-6b: Plan: 10 lines/)

    await $.session.send({ to: 'uds:/tmp/2.sock', text: 'Approved, with two conditions.', origin: { kind: 'model' } } as any)
    expect(await coord($, 'status')).toContain('waiting on them')
    expect(files['/w/app/coord/x/messages.md']).toMatch(/→ auth-a-6b: Approved/)

    await coord($, 'board #101 review READY')
    expect(files[BOARD]).toMatch(/^- .*: #101 review READY\n$/)
    expect(await coord($, 'board')).toContain('#101 review READY')

    const board = await $.tool.call({ tool: 'mcp__coordinator__board', append: 'second line' } as any)
    expect(String((board as any).text ?? (board as any).result)).toContain('Added to')
    expect(files[BOARD]?.split('\n').filter(Boolean)).toHaveLength(2)

    expect(await coord($, 'brief auth-a ship row buttons')).toContain('prompt box')
    expect(seen.filled[0]).toContain('Reply to: uds:/tmp/1.sock')
    expect(seen.filled[0]).toContain('Goal: ship row buttons')

    // Off: the tools refuse, nothing more is written.
    await coord($, 'off')
    const refused = await $.tool.call({ tool: 'mcp__coordinator__board', append: 'after off' } as any)
    expect(JSON.stringify(refused)).toContain('off in this session')
    expect(files[BOARD]).not.toContain('after off')
  })

  test('a coordinator bound to a project sees only its builders', async ($, on) => {
    const files: Record<string, string> = {}
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, files, seen, { named: true })
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })

    expect(await coord($, 'on nope')).toContain('No project nope')
    expect(await coord($, 'project all x-*')).toContain("can't be a project name")
    expect(await coord($, `project auth auth-* ${BOARD}`)).toContain('Created auth: folders matching auth-*')
    expect(await coord($, 'project')).toContain('auth: folders matching auth-*')

    expect(await coord($, 'on auth')).toContain('Coordinator on for project auth')
    expect(seen.titles.at(-1)).toBe('Coordinator · auth')
    let status = await coord($, 'status')
    expect(status).toContain('Project auth')
    expect(status).toContain('auth-a-6b')
    expect(status).not.toContain('billing-x-1a')
    expect(status).toContain(`Board: ${BOARD}`)
    expect(await coord($, 'status all')).toContain('billing-x-1a')

    // A builder outside the project: its messages stay out of the project's log.
    await $.session.receive({
      origin: { kind: 'peer-send-message' },
      text: '<cross-session-message from="uds:/tmp/4.sock" from-name="billing-x-1a">billing plan</cross-session-message>',
    } as any)
    expect(files['/w/app/coord/x/messages.md'] ?? '').not.toContain('billing plan')

    // Briefs stay inside the project too.
    expect(await coord($, 'brief billing-x')).toContain("No live session in this coordinator's scope")

    expect(await coord($, 'add billing-x')).toBe('Added billing-x to auth.')
    status = await coord($, 'status')
    expect(status).toContain('billing-x-1a')
    expect(status).toContain('+billing-x')

    expect(await coord($, 'drop auth-a')).toBe('Dropped auth-a from auth.')
    status = await coord($, 'status')
    expect(status).not.toContain('auth-a-6b')
    expect(status).toContain('-auth-a')

    // Removing the project falls back to the folder group of the same name, drops and all forgotten.
    expect(await coord($, `project auth remove ${BOARD}`)).toContain('nothing after it')
    expect(await coord($, 'project auth remove')).toContain('Removed project auth')
    status = await coord($, 'status')
    expect(status).toContain('auth (automatic): folders matching auth-*')
    expect(status).toContain('auth-a-6b')

    // A removed project that can't be a group shows nothing rather than everyone, and its board writes go nowhere.
    await coord($, 'off')
    await coord($, 'board-path /w/app/root-board.md')
    await coord($, 'project auth-two auth-*')
    await coord($, 'on auth-two')
    expect(await coord($, 'project auth-two remove')).toContain('Removed project auth-two')
    expect(await coord($, 'status')).toContain('no longer exists')
    expect(await coord($, 'board lost line')).toContain('no longer exists')
    expect(await coord($, 'board-path /w/app/other.md')).toContain('no longer exists')
    expect(store_(seen)[`board:${ROOT}`]).toBe('/w/app/root-board.md')
    expect(files['/w/app/root-board.md']).toBeUndefined()

    // Back to everything under the root.
    expect(await coord($, 'on all')).toContain('everything under /w/app')
    expect(await coord($, 'status')).toContain('auth-a-6b')
  })

  test('the binding comes back in the next session: by folder, or by name when the session is named', async ($, on) => {
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, {}, seen, { named: true })
    const store = seen.store!
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    await coord($, 'project auth auth-*')
    expect(await coord($, 'on auth')).toContain('remembered for this session name')
    expect(store['active-name:Coordinator']).toBe('auth')
    expect(store[`active:${ROOT}`]).toBeUndefined()

    // A folder binding left in the root from before they were refused; the named one keeps its own,
    // even after /clear gives it a new id its session file doesn't carry yet (found by process id).
    store[`active:${ROOT}`] = true
    seen.titles.length = 0
    seen.sessionId = 'after-clear'
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    expect(seen.titles.at(-1)).toBe('Coordinator · auth')
    expect(await coord($, 'status')).not.toContain('billing-x-1a')

    // /clear: no session.start, but the session's end says so, and the project comes back.
    seen.titles.length = 0
    // The id changes only after the end hooks finish; the mod waits for it.
    await $.session.end({ reason: 'clear', sessionId: 'after-clear', resume: {} } as any)
    await seen.clock!.advance(1_000)
    expect(seen.titles).toEqual([])
    seen.sessionId = 'second-clear'
    await seen.clock!.advance(1_000)
    expect(seen.titles.at(-1)).toBe('Coordinator · auth')

    // Off under a name stays off, and clears the old folder binding in this shared folder.
    await coord($, 'off')
    expect(store['active-name:Coordinator']).toBe(false)
    expect(store[`active:${ROOT}`]).toBeUndefined()
    seen.tools.length = 0
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    expect(seen.tools).toEqual([])
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`the panel lists builders, the one waiting on you first (${surface})`, async ($, on) => {
      engine(on, {}, { filled: [], tools: [], titles: [] }, { named: true })
      await $.session.start({ cwd: ROOT, surface, isInteractive: true })
      await coord($, 'on')
      await $.session.receive({
        origin: { kind: 'peer-send-message' },
        text: '<cross-session-message from="uds:/tmp/2.sock" from-name="auth-a-6b">head is abc</cross-session-message>',
      } as any)

      const ui = await $.ui.mount({
        plugin: 'coordinator',
        surface,
        component: 'Pane',
        requestId: 'coordinator',
        props: { title: 'Coordinator', isFocused: false, bodyColumns: 60, placement: 'dock' },
      } as any)
      expect(await ui.find({ type: 'Text', text: /auth-a-6b/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /you owe a reply/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /old-1/ })).toBeUndefined()
    })
  }

  test("a builder shows its project's label and names its tab, even when the project is on the other account", async ($, on) => {
    const files: Record<string, string> = {}
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, files, seen, { selfCwd: `${ROOT}/branches/auth-b` })
    const shared = '/home/.claude/coordinator-projects.json'
    files[shared] = JSON.stringify({ '.claude-work': [{ name: 'auth', pattern: 'auth-*', emoji: '🌸', members: [], dropped: [] }] })

    await $.session.start({ cwd: `${ROOT}/branches/auth-b`, surface: 'terminal', isInteractive: true })
    expect(seen.status?.at(-1)).toBe('🌸 auth · b')
    expect(seen.tmux).toContainEqual(['rename-window', '-t', 'dev:@3', '🌸 b'])
    expect(seen.store!['tab:1']).toEqual({ window: 'dev:@3', name: '🌸 b' })

    // The tab now carries our name; the project and the other auth builder go away; the next check gives the tab back.
    seen.tab = ['dev:@3', '🌸 b', '0']
    files[shared] = JSON.stringify({ '.claude-work': [] })
    delete files['/home/.claude-work/sessions/2.json']
    await seen.clock!.advance(60_000)
    expect(seen.status?.at(-1)).toBeUndefined()
    expect(seen.tmux).toContainEqual(['set-option', '-w', '-t', 'dev:@3', 'automatic-rename', 'on'])
    expect(seen.store!['tab:1']).toBeUndefined()
  })

  test('a tab named by hand is left alone; a coordinator keeps its own status', async ($, on) => {
    const files: Record<string, string> = {}
    const seen: Seen = { filled: [], tools: [], titles: [], tab: ['dev:@3', 'scratch1', '0'] }
    engine(on, files, seen, { selfCwd: `${ROOT}/branches/auth-b` })
    await $.session.start({ cwd: `${ROOT}/branches/auth-b`, surface: 'terminal', isInteractive: true })
    // A project made in this account reaches the other account's builders through the shared file.
    await coord($, 'project auth auth-* 🌸')
    expect(JSON.parse(files['/home/.claude/coordinator-projects.json']!)['.claude'][0].emoji).toBe('🌸')
    await seen.clock!.advance(60_000)
    expect(seen.status?.at(-1)).toBe('🌸 auth · b')
    expect((seen.tmux ?? []).some(a => a[0] === 'rename-window')).toBe(false)

    await coord($, 'on auth')
    await seen.clock!.advance(60_000)
    expect(seen.status?.at(-1)).toMatch(/^coord auth/)
  })

  test('the panel shows each folder, and a row jumps to its tmux tab', async ($, on) => {
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, {}, seen, { named: true })
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    await coord($, 'on')
    const ui = await $.ui.mount({
      plugin: 'coordinator',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'coordinator',
      props: { title: 'Coordinator', isFocused: false, bodyColumns: 60, placement: 'dock' },
    } as any)
    expect(await ui.find({ type: 'Text', text: /· auth-a ·/ })).toBeDefined()
    // billing-x-1a's session file has no tmux field: no button to press.
    expect(await ui.find({ key: 'jump:uds:/tmp/4.sock' } as any)).toBeUndefined()
    await ui.press({ key: 'jump:uds:/tmp/2.sock' })
    expect(seen.tmux).toContainEqual(['select-window', '-t', 'dev:@8', ';', 'select-pane', '-t', 'dev:@8.%56'])
  })

  test('builders that share a folder prefix label themselves with no setup; a lone one stays plain', async ($, on) => {
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, {}, seen, { selfCwd: `${ROOT}/branches/auth-b` })
    await $.session.start({ cwd: `${ROOT}/branches/auth-b`, surface: 'terminal', isInteractive: true })
    const e = groupEmoji('auth')
    expect(seen.status?.at(-1)).toBe(`${e} auth · b`)
    expect(seen.tmux).toContainEqual(['rename-window', '-t', 'dev:@3', `${e} b`])
  })

  test('a group of one live session gets no label', async ($, on) => {
    const seen: Seen = { filled: [], tools: [], titles: [] }
    // A stale file on the other account under our own live pid, in the same group, doesn't count twice.
    const files: Record<string, string> = {}
    engine(on, files, seen, { selfCwd: `${ROOT}/branches/lone-z` })
    files['/home/.claude-work/sessions/1.json'] = file({
      pid: 1,
      sessionId: 'stale',
      cwd: `${ROOT}/branches/lone-y`,
      messagingSocketPath: '/tmp/stale.sock',
      name: 'old lone',
      status: 'idle',
    })
    await $.session.start({ cwd: `${ROOT}/branches/lone-z`, surface: 'terminal', isInteractive: true })
    expect(seen.status?.at(-1)).toBeUndefined()
    expect((seen.tmux ?? []).some(a => a[0] === 'rename-window')).toBe(false)
  })

  test('a project that drops the folder keeps it out of the group too', async ($, on) => {
    const files: Record<string, string> = {}
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, files, seen, { selfCwd: `${ROOT}/branches/auth-b` })
    files['/home/.claude/coordinator-projects.json'] = JSON.stringify({
      '.claude-work': [{ name: 'authx', pattern: 'auth-*', emoji: '🌸', members: [], dropped: ['auth-b'] }],
    })
    await $.session.start({ cwd: `${ROOT}/branches/auth-b`, surface: 'terminal', isInteractive: true })
    expect(seen.status?.at(-1)).toBeUndefined()
    expect((seen.tmux ?? []).some(a => a[0] === 'rename-window')).toBe(false)
  })

  test('plain /coord on in a grouped folder coordinates that group; add/drop make it a project', async ($, on) => {
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, {}, seen, { selfCwd: `${ROOT}/branches/auth-coord` })
    await $.session.start({ cwd: `${ROOT}/branches/auth-coord`, surface: 'terminal', isInteractive: true })
    const e = groupEmoji('auth')

    expect(await coord($, 'on')).toContain(`Coordinator on for group ${e} auth (folders auth-*`)
    expect(seen.store![`active:${ROOT}/branches/auth-coord`]).toBe('auth')
    // An unnamed coordinator in its own worktree gets its group back in the next session.
    seen.titles.length = 0
    seen.sessionId = 'next'
    await $.session.start({ cwd: `${ROOT}/branches/auth-coord`, surface: 'terminal', isInteractive: true })
    expect(seen.titles.at(-1)).toBe('Coordinator · auth')
    let status = await coord($, 'status')
    expect(status).toContain('auth (automatic)')
    expect(status).toContain('auth-a-6b')
    expect(status).not.toContain('billing-x-1a')
    expect(await coord($, 'project')).toContain(`* ${e} auth (automatic): folders matching auth-*; 2 live`)
    expect(await coord($, 'project auth')).toBe(`${e} auth (automatic): folders matching auth-*; 2 live`)

    // Any live group binds by name; a name nobody uses doesn't.
    expect(await coord($, 'on billing')).toContain('group')
    expect(await coord($, 'status')).toContain('billing-x-1a')
    expect(await coord($, 'on nope')).toContain('No project nope')

    await coord($, 'on auth')
    expect(await coord($, 'drop auth-a')).toBe('Dropped auth-a from auth.')
    expect(seen.store!['project:auth']).toEqual({ name: 'auth', pattern: 'auth-*', emoji: e, members: [], dropped: ['auth-a'] })
    status = await coord($, 'status')
    expect(status).not.toContain('auth-a-6b')
    expect(status).not.toContain('automatic')
  })

  for (const where of [ROOT, `${ROOT}/main`, `${ROOT}/branches/main`, `${ROOT}/branches/master`]) {
    test(`an unnamed session in a shared folder is never made the coordinator (${where.replace(ROOT, 'root')})`, async ($, on) => {
      const seen: Seen = { filled: [], tools: [], titles: [], store: { [`active:${where}`]: 'auth' } }
      engine(on, {}, seen, { selfCwd: where })
      const store = seen.store!

      // A folder binding saved before they were refused does not turn a new session on...
      await $.session.start({ cwd: where, surface: 'terminal', isInteractive: true })
      expect(seen.tools).toEqual([])
      expect(seen.titles).toEqual([])

      // ...nor does /clear.
      await $.session.end({ reason: 'clear', sessionId: 'self', resume: {} } as any)
      seen.sessionId = 'after-clear'
      await seen.clock!.advance(1_000)
      expect(seen.tools).toEqual([])

      // /coord on refuses and saves nothing, with or without a project.
      // (Through the main symlink no auth session shares its root, so `on auth` is refused as an unknown project first.)
      for (const args of rootOf(where) === ROOT ? ['on', 'on auth', 'on all', ''] : ['on', 'on all', '']) {
        const text = await coord($, args)
        expect(text).toContain('Name this session first')
        expect(text).toContain('claude -w <workstream>-coord')
      }
      expect(seen.tools).toEqual([])
      expect(Object.keys(store).filter(k => k.startsWith('active'))).toEqual([`active:${where}`])

      // /coord off clears the stale folder binding.
      await coord($, 'off')
      expect(store[`active:${where}`]).toBeUndefined()
    })
  }

  test('a named session in the root still binds by name', async ($, on) => {
    const seen: Seen = { filled: [], tools: [], titles: [] }
    engine(on, {}, seen, { named: true })
    await $.session.start({ cwd: ROOT, surface: 'terminal', isInteractive: true })
    expect(await coord($, 'on')).toContain('remembered for this session name')
    expect(seen.store!['active-name:Coordinator']).toBe(true)
    expect(seen.store![`active:${ROOT}`]).toBeUndefined()
  })
})
