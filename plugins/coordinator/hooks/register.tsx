// Coordinator: one long-lived session routes work to several builder sessions, each in
// its own worktree, possibly on another Claude account (another CLAUDE_CONFIG_DIR). This
// mod finds those sessions (ListAgents can't see another account), tracks who owes whom a
// reply, keeps the board, and shows it all in a side panel. Off until `/coord on` in a
// directory, so the builders that load the same marketplace get only the one /coord command.

import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { CoordPr, CoordProject, CoordSession, CoordThread } from '../types'

const PANE = 'coordinator'
// Where worktrees live under a repo: `claude -w` puts them in .claude/worktrees/; a bare-repo
// layout often uses branches/. The part before the marker is the root, the next segment the folder.
const WORKTREE_DIRS = ['/.claude/worktrees/', '/branches/']
const SCAN_EVERY_MS = 20_000
const PRS_EVERY_MS = 120_000
// A builder we're waiting on that has sat idle this long probably missed the message.
const NUDGE_AFTER_MS = 15 * 60_000
const CLEAR_REBIND_MS = 1_000
const CLEAR_REBIND_TRIES = 10
// A folder group labels its builders only once this many of its sessions are live, so a lone
// worktree that happens to have a dash in its name stays unlabeled.
const GROUP_MIN = 2

const isActive = atom({ plugin: 'coordinator', key: 'isActive' } as const, false)
const project = atom({ plugin: 'coordinator', key: 'project' } as const, '')
const sessions = atom({ plugin: 'coordinator', key: 'sessions' } as const, [] as CoordSession[])
const branches = atom({ plugin: 'coordinator', key: 'branches' } as const, {} as Record<string, string>)
const prs = atom({ plugin: 'coordinator', key: 'prs' } as const, [] as CoordPr[])
const threads = atom({ plugin: 'coordinator', key: 'threads' } as const, {} as Record<string, CoordThread>)
const scannedAt = atom({ plugin: 'coordinator', key: 'scannedAt' } as const, 0)

type Host = EngineInterface

// ---- pure helpers (tested directly) ----

function markerIn(cwd: string): { at: number; len: number } | undefined {
  for (const m of WORKTREE_DIRS) {
    const at = cwd.indexOf(m)
    if (at >= 0) return { at, len: m.length }
  }
  return undefined
}

export function inWorktree(cwd: string): boolean {
  return markerIn(cwd) !== undefined
}

export function rootOf(cwd: string): string {
  const m = markerIn(cwd)
  return m ? cwd.slice(0, m.at) : cwd
}

export function under(root: string, cwd: string): boolean {
  return cwd === root || cwd.startsWith(`${root}/`)
}

// The worktree folder name (.claude/worktrees/<name> or branches/<name>), or the whole path
// for a session outside any worktree.
export function folderOf(cwd: string): string {
  const m = markerIn(cwd)
  return m ? (cwd.slice(m.at + m.len).split('/')[0] ?? cwd) : cwd
}

export function globMatch(pattern: string, text: string): boolean {
  const re = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${re}$`).test(text)
}

export function inProject(p: CoordProject | undefined, s: CoordSession, root: string): boolean {
  if (!p) return under(root, s.cwd)
  const folder = folderOf(s.cwd)
  if (p.dropped.includes(folder)) return false
  if (p.members.includes(folder)) return true
  return under(root, s.cwd) && s.cwd !== root && globMatch(p.pattern, folder)
}

export function describeProject(p: CoordProject): string {
  const extra = [p.members.length ? `+${p.members.join(', +')}` : '', p.dropped.length ? `-${p.dropped.join(', -')}` : '']
  return [`${p.emoji ? `${p.emoji} ` : ''}${p.name}${p.auto ? ' (automatic)' : ''}: folders matching ${p.pattern}`, ...extra.filter(Boolean)].join('; ')
}

// Convention over configuration: worktrees named <group>-<anything> form a group with no setup.
// Worktree `auth-login` is in group `auth`; a folder with no dash, or outside a worktree, is in none.
export function groupOf(cwd: string): string | undefined {
  if (!inWorktree(cwd)) return undefined
  const g = /^([\w.]+)-./.exec(folderOf(cwd))?.[1]
  return g && canBeGroup(g) ? g : undefined
}

export function canBeGroup(name: string): boolean {
  return /^[\w.]+$/.test(name) && name !== 'all'
}

// One code point each, all drawn two columns wide, so a tab or status line never shifts.
const GROUP_EMOJI = [
  '🍋',
  '🐙',
  '🦊',
  '🌵',
  '🍄',
  '🐝',
  '🦋',
  '🍉',
  '🌊',
  '🔥',
  '🍀',
  '🐳',
  '🦉',
  '🌙',
  '⭐',
  '🍒',
  '🐢',
  '🦄',
  '🌈',
  '🍩',
  '🎈',
  '🧊',
  '🌻',
  '🐧',
]

// A hash of the name (FNV-1a), so every session on either account picks the same emoji with nothing stored.
export function groupEmoji(group: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < group.length; i++) h = Math.imul(h ^ group.charCodeAt(i), 0x01000193) >>> 0
  return GROUP_EMOJI[h % GROUP_EMOJI.length] ?? '◆'
}

export function autoProject(group: string): CoordProject {
  return { name: group, pattern: `${group}-*`, emoji: groupEmoji(group), members: [], dropped: [], auto: true }
}

// What a builder shows for its project: `🌸 auth · login` on its status line, `🌸 login`
// on its tmux tab. The part of the folder its pattern spells out (auth-) is dropped.
export function labelFor(p: CoordProject, folder: string): { status: string; tab: string } {
  const base = folder.split('/').filter(Boolean).pop() ?? folder
  const prefix = p.pattern.split(/[*?]/)[0] ?? ''
  const short = prefix && base.startsWith(prefix) && base.length > prefix.length ? base.slice(prefix.length) : base
  const mark = p.emoji || '◆'
  // tmux expands formats in a window name, and #(…) runs a shell command: no # reaches it.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters is the point
  return { status: `${mark} ${p.name} · ${short}`, tab: `${mark} ${short}`.replace(/[#\x00-\x1f\x7f]/g, '') }
}

// `dev:@8.%56` → tmux targets for its window and pane. They keep the session name, so on
// another tmux server (no session `dev`) a command fails rather than reaching a stranger's @8.
export function tmuxTarget(t: string | undefined): { window: string; pane: string } | undefined {
  const m = /^(.+):(@\d+)\.(%\d+)$/.exec(t ?? '')
  return m?.[1] && m[2] && m[3] ? { window: `${m[1]}:${m[2]}`, pane: `${m[1]}:${m[2]}.${m[3]}` } : undefined
}

// `/coord project <name> <pattern> [emoji|-] [board]`, either order. The board is the absolute
// path; the emoji is a short token with no ASCII in it, so a mistyped path is never taken for
// one; `-` clears it (emoji '').
export function projectArgs(rest: string[]): { emoji?: string; board?: string; bad?: string } {
  const out: { emoji?: string; board?: string; bad?: string } = {}
  for (const a of rest) {
    if (a.startsWith('/') && !out.board) out.board = a
    else if (a === '-' && out.emoji === undefined) out.emoji = ''
    else if (isEmoji(a) && out.emoji === undefined) out.emoji = a
    else out.bad = a
  }
  return out
}

export function isEmoji(a: unknown): a is string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: any ASCII at all means it isn't an emoji
  return typeof a === 'string' && a.length > 0 && a.length <= 16 && !/[\x00-\x7f]/.test(a)
}

// `ps -o pid=,comm=` lines → the pids running Claude (node or bun when run from source).
export function livePids(ps: string): Set<number> {
  const out = new Set<number>()
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line)
    const cmd = m?.[2]?.split('/').pop() ?? ''
    if (m && (/claude/i.test(cmd) || cmd === 'node' || cmd === 'bun')) out.add(Number(m[1]))
  }
  return out
}

export function parseSession(raw: string, account: CoordSession['account'], selfId: string, selfPid = 0): CoordSession | null {
  let j: Record<string, unknown>
  try {
    j = JSON.parse(raw)
  } catch {
    return null
  }
  const pid = Number(j.pid)
  const socket = typeof j.messagingSocketPath === 'string' ? j.messagingSocketPath : ''
  if (!Number.isInteger(pid) || pid <= 0 || !socket || typeof j.cwd !== 'string') return null
  return {
    name: typeof j.name === 'string' && j.name ? j.name : `pid ${pid}`,
    account,
    pid,
    cwd: j.cwd,
    socket: `uds:${socket}`,
    status: typeof j.status === 'string' ? j.status : 'unknown',
    statusSince: Number(j.statusUpdatedAt ?? j.updatedAt ?? 0),
    // The file keeps the id it was written with until the session next changes state, so a
    // /clear (a new id) would otherwise not find itself; the process id never changes.
    isSelf: j.sessionId === selfId || (selfPid > 0 && pid === selfPid),
    isNamed: j.nameSource === 'user',
    tmux: typeof j.tmux === 'string' && j.tmux ? j.tmux : undefined,
  }
}

// A peer's message reaches the model wrapped as <cross-session-message from="uds:…" from-name="…">.
export function peerOf(text: string): { socket: string; name?: string } | null {
  const m = /<cross-session-message\s+from="(uds:[^"]+)"(?:\s+from-name="([^"]*)")?/.exec(text)
  return m?.[1] ? { socket: m[1], name: m[2] || undefined } : null
}

export function firstLine(text: string, max = 100): string {
  const body = text.replace(/<\/?cross-session-message[^>]*>/g, '').trim()
  const line = body.split('\n').find(l => l.trim()) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// Local time, like 3:05pm.
export function clockTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' AM', 'am').replace(' PM', 'pm')
  } catch {
    return new Date(ms).toISOString().slice(11, 16) + 'Z'
  }
}

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  return `${Math.round(s / 3600)}h`
}

export type Waiting = { text: string; tone: 'owe' | 'nudge' | 'wait' | 'none' }

export function waitingOn(t: CoordThread | undefined, s: CoordSession, now: number): Waiting {
  const lastIn = t?.lastIn ?? 0
  const lastOut = t?.lastOut ?? 0
  if (lastIn === 0 && lastOut === 0) return { text: 'no messages yet', tone: 'none' }
  if (lastIn > lastOut) return { text: `you owe a reply (since ${clockTime(lastIn)})`, tone: 'owe' }
  if (s.status !== 'busy' && now - Math.max(lastOut, s.statusSince) > NUDGE_AFTER_MS) {
    return { text: `idle ${ago(s.statusSince, now)} since your ${clockTime(lastOut)} message — nudge?`, tone: 'nudge' }
  }
  return { text: `waiting on them (sent ${clockTime(lastOut)})`, tone: 'wait' }
}

// Threads are keyed by worktree folder so a builder that restarts (new socket, new name
// suffix) keeps its history; by socket when two live sessions share a folder or it's unknown.
export function threadKey(live: CoordSession[], socket: string): string {
  const s = live.find(x => x.socket === socket)
  if (!s) return socket
  return live.filter(x => x.cwd === s.cwd).length === 1 ? s.cwd : socket
}

export function threadFor(t: Record<string, CoordThread>, live: CoordSession[], s: CoordSession): CoordThread | undefined {
  return t[threadKey(live, s.socket)] ?? t[s.socket]
}

export function tail(text: string, n: number): string {
  return text.trimEnd().split('\n').slice(-n).join('\n')
}

export function briefTemplate(target: CoordSession, replyTo: string, goal: string): string {
  return [
    `Brief for ${target.name} (${target.socket}, ${target.cwd})`,
    '',
    '1. Who I am: the coordinator for this push. I route work, approve plans and review PRs; the user decides.',
    `2. Goal: ${goal || '<one sentence a user could see>'}`,
    '3. Facts: <what we already know, with file:line>',
    '4. Jobs, in order: <1..N>',
    '5. Rules: stay out of files other builders own (<list>); never merge or force-push; ask the user before anything that touches production.',
    '6. Process: send me a plan of 10 lines or fewer before building; open a draft PR; send me the head SHA after each push.',
    `7. Reply to: ${replyTo}`,
  ].join('\n')
}

// ---- reading the machine ----

let knownPid = 0

// Our own Claude process: the parent of a shell it starts. A failed lookup is tried again next time.
async function ownPid($: Host): Promise<number> {
  if (knownPid) return knownPid
  const r = await $.process.run(['/bin/sh', '-c', 'echo $PPID']).catch(() => null)
  knownPid = r?.exitCode === 0 ? Number(r.stdout.trim()) || 0 : 0
  return knownPid
}

async function ownConfigDir($: Host): Promise<string> {
  const home = (await $.env.get('HOME')) ?? ''
  return ((await $.env.get('CLAUDE_CONFIG_DIR')) || `${home}/.claude`).replace(/\/+$/, '')
}

// The process id is only ours in our own account's folder: another account's may hold a
// stale file from a process that once had the same id.
async function ownSessionsDir($: Host): Promise<string> {
  return `${await ownConfigDir($)}/sessions`
}

// An account is a Claude config folder, named by its last part (.claude, .claude-work).
export function accountOf(dir: string): string {
  return dir.replace(/\/+$/, '').split('/').pop() || dir
}

// Our own config folder, ~/.claude, and any listed in CLAUDE_COORD_CONFIG_DIRS (colon-separated),
// so a builder started on another account is found too.
async function configDirs($: Host): Promise<string[]> {
  const home = (await $.env.get('HOME')) ?? ''
  const extra = ((await $.env.get('CLAUDE_COORD_CONFIG_DIRS')) ?? '').split(':').filter(Boolean)
  return [...new Set([await ownConfigDir($), `${home}/.claude`, ...extra].map(d => d.replace(/\/+$/, '')))]
}

async function ownAccount($: Host): Promise<CoordSession['account']> {
  return accountOf(await ownConfigDir($))
}

// Our own session file, named by process id, so a lookup reads one file instead of scanning all.
// `quick` skips the full scan when our own file isn't where we expect: the once-a-minute label
// check runs in every session and must stay cheap.
async function selfOf($: Host, quick = false): Promise<CoordSession | undefined> {
  const own = await ownSessionsDir($)
  const pid = await ownPid($)
  const id = await $.session.id()
  const account = await ownAccount($)
  if (pid) {
    const raw = await $.fs.read(`${own}/${pid}.json`).catch(() => '')
    const s = raw ? parseSession(String(raw), account, id, pid) : null
    if (s?.isSelf) return s
  }
  return quick ? undefined : (await scan($)).find(s => s.isSelf)
}

// `keep` filters before the liveness check, so a caller after a few sessions asks ps about only those.
async function scan($: Host, keep: (s: CoordSession) => boolean = () => true): Promise<CoordSession[]> {
  const selfId = await $.session.id()
  const selfPid = await ownPid($)
  const own = await ownSessionsDir($)
  const found: CoordSession[] = []
  for (const dir of await configDirs($)) {
    const account = accountOf(dir)
    const folder = `${dir}/sessions`
    const entries = await $.fs.list(folder).catch(() => [])
    for (const f of entries) {
      if (f.kind !== 'file' || !f.name.endsWith('.json')) continue
      const raw = await $.fs.read(`${folder}/${f.name}`).catch(() => '')
      const s = parseSession(String(raw), account, selfId, folder === own ? selfPid : 0)
      if (s && keep(s)) found.push(s)
    }
  }
  if (found.length === 0) return []
  // Session files outlive their process; keep the ones whose pid is still a Claude process
  // (a stale file's pid may since have gone to something else).
  const ps = await $.process.run(['ps', '-o', 'pid=,comm=', '-p', found.map(s => s.pid).join(',')]).catch(() => null)
  const alive = livePids(ps?.stdout ?? '')
  return found.filter(s => alive.has(s.pid)).sort((a, b) => a.name.localeCompare(b.name))
}

async function refresh($: Host, withPrs = false): Promise<void> {
  const live = await scan($)
  await update($, sessions, () => live)
  await update($, scannedAt, () => Date.now())

  // Only a branch actually read is cached, so a failed read is retried on the next scan;
  // the slower PR refresh re-reads them all, since a worktree can switch branches.
  const known = withPrs ? {} : await read($, branches)
  const missing = [...new Set(live.filter(s => !s.isSelf && !known[s.cwd]).map(s => s.cwd))]
  if (missing.length > 0) {
    const found: Record<string, string> = {}
    for (const cwd of missing) {
      const r = await $.process.run(['git', '-C', cwd, 'branch', '--show-current']).catch(() => null)
      const branch = r?.exitCode === 0 ? r.stdout.trim() : ''
      if (branch) found[cwd] = branch
    }
    await update($, branches, b => ({ ...b, ...found }))
  }

  if (withPrs) await refreshPrs($, live)
  if (await read($, isActive)) await showStatus($)
}

async function refreshPrs($: Host, live: CoordSession[]): Promise<void> {
  // The coordinator often runs in the worktree root, a different repo: ask gh from a builder's folder.
  const repoDir = live.find(s => !s.isSelf && inWorktree(s.cwd))?.cwd
  if (!repoDir) return
  const r = await $.process
    .run(['gh', 'pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,headRefName,isDraft,title,headRefOid'], {
      cwd: repoDir,
    })
    .catch(() => null)
  if (r?.exitCode !== 0) return
  try {
    const rows = JSON.parse(r.stdout) as {
      number: number
      headRefName: string
      isDraft: boolean
      title: string
      headRefOid: string
    }[]
    const list: CoordPr[] = rows.map(p => ({
      number: p.number,
      branch: p.headRefName,
      isDraft: p.isDraft,
      title: p.title,
      sha: p.headRefOid.slice(0, 9),
    }))
    await update($, prs, () => list)
  } catch {
    // gh printed something that isn't JSON; keep the last good list.
  }
}

// ---- projects ----

const projectKey = (name: string) => `project:${name}`

async function getProject($: Host, name: string): Promise<CoordProject | undefined> {
  const v = (await $.store.get(projectKey(name))) as CoordProject | undefined
  return v && typeof v === 'object' && typeof v.pattern === 'string' ? v : undefined
}

// A stored project by that name, else the folder group of that name: explicit projects override groups.
async function projectFor($: Host, name: string): Promise<CoordProject | undefined> {
  return (await allProjects($)).find(p => p.name === name) ?? (canBeGroup(name) ? autoProject(name) : undefined)
}

// The first add, drop or board path on a group turns it into a stored project, keeping its emoji.
async function saveProject($: Host, p: CoordProject): Promise<void> {
  const { auto: _, ...stored } = p
  await $.store.set(projectKey(p.name), stored)
  await shareProjects($)
}

// Groups with enough live sessions under the root that no project of the same name overrides.
async function liveGroups($: Host, root: string, taken: CoordProject[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  for (const s of await scan($, s => rootOf(s.cwd) === root)) {
    const g = groupOf(s.cwd)
    if (g && !taken.some(p => p.name === g)) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return new Map([...counts].filter(([, n]) => n >= GROUP_MIN))
}

async function listProjects($: Host): Promise<CoordProject[]> {
  const keys = await $.store.keys()
  const found: CoordProject[] = []
  for (const k of keys.filter(k => k.startsWith('project:'))) {
    const p = await getProject($, k.slice('project:'.length))
    if (p) found.push(p)
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

// $.store is per account, and a builder may be on another one. Each account's projects are
// copied, under its own key, to one file both read, so every builder can find its label.
// CLAUDE_COORD_PROJECTS moves it, so a test session's projects never label real builders.
async function sharedPath($: Host): Promise<string> {
  return (await $.env.get('CLAUDE_COORD_PROJECTS')) || `${(await $.env.get('HOME')) ?? ''}/.claude/coordinator-projects.json`
}

async function readShared($: Host): Promise<Record<string, CoordProject[]>> {
  try {
    const v = JSON.parse(String(await $.fs.read(await sharedPath($))))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

async function shareProjects($: Host): Promise<void> {
  const account = await ownAccount($)
  const all = await readShared($)
  all[account] = await listProjects($)
  await $.fs.write(await sharedPath($), `${JSON.stringify(all, null, 2)}\n`).catch(() => {})
}

// This account's projects first, then the others'.
async function allProjects($: Host): Promise<CoordProject[]> {
  const own = await listProjects($)
  const account = await ownAccount($)
  const shared = Object.entries(await readShared($))
    .filter(([k, v]) => k !== account && Array.isArray(v))
    .flatMap(([, v]) => v)
    .filter(p => p && typeof p.name === 'string' && typeof p.pattern === 'string' && Array.isArray(p.members) && Array.isArray(p.dropped))
    .map(p => ({ ...p, emoji: isEmoji(p.emoji) ? p.emoji : undefined }))
  return [...own, ...shared.filter(p => !own.some(o => o.name === p.name))]
}

// ---- tmux: jump to a session, label a builder's tab ----

// The session's own server when the mod's env carries $TMUX, else the default socket.
const TMUX_SH = 'S="${TMUX%%,*}"; [ -S "$S" ] || S="${TMUX_TMPDIR:-/tmp}/tmux-$(id -u)/default"; exec tmux -S "$S" "$@"'

function tmux($: Host, ...args: string[]) {
  return $.process.run(['/bin/sh', '-c', TMUX_SH, 'sh', ...args]).catch(() => null)
}

// Under iTerm's tmux integration a tmux window is an iTerm tab, so this switches tabs.
async function jump($: Host, s: CoordSession): Promise<void> {
  const t = tmuxTarget(s.tmux)
  if (!t) return
  const r = await tmux($, 'select-window', '-t', t.window, ';', 'select-pane', '-t', t.pane)
  if (r?.exitCode !== 0) return $.ui.toast(`Couldn't switch to ${s.name}: ${r?.stderr.trim() || 'tmux failed'}`)
  // Each tmux session is its own iTerm window under -CC: the tab changed there, not here.
  const there = t.window.slice(0, t.window.lastIndexOf(':'))
  const here = tmuxTarget((await selfOf($, true))?.tmux)?.window
  if (here && !here.startsWith(`${there}:`)) $.ui.toast(`${s.name} is in tmux session ${there}: its tab is now selected in that window.`)
}

const LABEL_EVERY_MS = 60_000
const tabKey = (pid: number) => `tab:${pid}`
type Tab = { window: string; name: string }

// Renames only a tab tmux is still naming by itself, and puts back only a name we set.
async function nameTab($: Host, me: CoordSession, want: string | undefined): Promise<void> {
  const t = tmuxTarget(me.tmux)
  const saved = (await $.store.get(tabKey(me.pid))) as Tab | undefined
  if (!t || (!want && !saved)) return
  const r = await tmux($, 'display-message', '-p', '-t', t.pane, '#{session_name}:#{window_id}\t#{window_name}\t#{automatic-rename}')
  if (r?.exitCode !== 0) return
  const [win = '', name = '', auto = ''] = r.stdout.replace(/\n$/, '').split('\t')
  const ours = saved?.window === win && saved.name === name
  if (want) {
    if (name === want || (auto !== '1' && !ours)) return
    const done = await tmux($, 'rename-window', '-t', win, want)
    if (done?.exitCode === 0) await $.store.set(tabKey(me.pid), { window: win, name: want })
  } else if (saved) {
    if (ours) await tmux($, 'set-option', '-w', '-t', win, 'automatic-rename', 'on')
    await $.store.delete(tabKey(me.pid))
  }
}

// This session's folder group, when no project overrides it and enough of the group is live.
// Only a session in a group pays for this: the session files are read, and ps asked about the
// group's few pids, once a minute.
async function groupFor($: Host, me: CoordSession, projects: CoordProject[]): Promise<CoordProject | undefined> {
  const group = groupOf(me.cwd)
  const folder = folderOf(me.cwd)
  if (!group || projects.some(p => p.name === group || p.dropped.includes(folder))) return undefined
  const root = rootOf(me.cwd)
  const live = await scan($, s => groupOf(s.cwd) === group && rootOf(s.cwd) === root)
  // One process counts once: another account may hold a stale file under a live pid.
  return new Set(live.map(s => s.pid)).size >= GROUP_MIN ? autoProject(group) : undefined
}

// A builder in some project or group shows it; a coordinator keeps its own status line.
async function labelSelf($: Host): Promise<void> {
  const active = await read($, isActive)
  const projects = active ? [] : await allProjects($)
  const grouped = !active && groupOf(await $.session.cwd()) !== undefined
  const hadTab = (await $.store.keys()).some(k => k.startsWith('tab:'))
  if (!active && projects.length === 0 && !grouped && !hadTab) {
    $.ui.status(undefined)
    return
  }
  const me = await selfOf($, true)
  if (!me) return
  const p = projects.find(x => inProject(x, me, rootOf(me.cwd))) ?? (active ? undefined : await groupFor($, me, projects))
  const label = p ? labelFor(p, folderOf(me.cwd)) : undefined
  if (!active) $.ui.status(label?.status)
  await nameTab($, me, label?.tab)
}

let labelTimer: { cancel: () => void } | undefined

type Scope = { root: string; project?: CoordProject; missing?: string; has: (s: CoordSession) => boolean }

// What this coordinator looks after: its project's builders, or everything under the root.
async function scope($: Host): Promise<Scope> {
  const root = rootOf(await $.session.cwd())
  const name = await read($, project)
  const p = name ? await projectFor($, name) : undefined
  // A bound project that was removed (and can't fall back to a group) shows nothing rather than quietly showing everyone.
  if (name && !p) return { root, missing: name, has: () => false }
  return { root, project: p, has: s => !s.isSelf && inProject(p, s, root) }
}

async function showStatus($: Host): Promise<void> {
  const sc = await scope($)
  const live = (await read($, sessions)).filter(sc.has)
  const t = await read($, threads)
  const owed = live.filter(s => waitingOn(threadFor(t, live, s), s, Date.now()).tone === 'owe').length
  const label = sc.project ? `coord ${sc.project.name}` : 'coord'
  $.ui.status(owed > 0 ? `${label}: ${owed} waiting on you` : `${label}: ${live.length} builders`)
}

// ---- board ----

const boardKey = (root: string) => `board:${root}`

// The project's board; without one, the root's board from before projects existed.
async function boardPath($: Host): Promise<string | undefined> {
  const sc = await scope($)
  if (sc.missing) return undefined
  if (sc.project?.board) return sc.project.board
  const v = await $.store.get(boardKey(sc.root))
  return typeof v === 'string' && v ? v : undefined
}

// An O_APPEND write by the shell: no read-modify-write, so two appends at once both land
// and a board too big to read is never truncated.
async function appendTo($: Host, path: string, line: string): Promise<void> {
  const r = await $.process.run(['/bin/sh', '-c', 'mkdir -p "$(dirname "$2")" && printf \'%s\\n\' "$1" >> "$2"', 'sh', line, path])
  if (r.exitCode !== 0) throw new Error(`could not append to ${path}: ${r.stderr.trim()}`)
}

// A project's log holds only its own builders; a session started since the last scan is looked up first.
async function logsFor($: Host, socket: string): Promise<boolean> {
  const sc = await scope($)
  if (!sc.project && !sc.missing) return true
  let s = (await read($, sessions)).find(x => x.socket === socket)
  if (!s) {
    await refresh($)
    s = (await read($, sessions)).find(x => x.socket === socket)
  }
  return s ? sc.has(s) : false
}

function messageLog(board: string): string {
  return `${board.slice(0, board.lastIndexOf('/'))}/messages.md`
}

async function boardCommand($: Host, args: string): Promise<string> {
  const path = await boardPath($)
  if (!path) {
    const gone = (await scope($)).missing
    return gone
      ? `Project ${gone} no longer exists, so it has no board. /coord on <project|all> first.`
      : 'No board set. Run: /coord board-path <absolute path to the .md board>'
  }
  if (args.trim()) {
    await appendTo($, path, `- ${clockTime(Date.now())}: ${args.trim()}`)
    return `Added to ${path}`
  }
  const text = String(await $.fs.read(path).catch(() => ''))
  return text ? tail(text, 15) : `${path} is empty.`
}

// ---- reports ----

async function report($: Host, all: boolean): Promise<string> {
  await refresh($, true)
  const sc = await scope($)
  const root = sc.root
  const now = Date.now()
  const live = (await read($, sessions)).filter(s => !s.isSelf && (all || sc.has(s)))
  const b = await read($, branches)
  const p = await read($, prs)
  const t = await read($, threads)
  const head = sc.missing
    ? `Project ${sc.missing} no longer exists: /coord project ${sc.missing} <pattern> to recreate it, or /coord on all.`
    : sc.project && !all
      ? `Project ${describeProject(sc.project)}`
      : ''
  if (live.length === 0) {
    const none = all
      ? 'No other live sessions.'
      : sc.project
        ? `No live sessions in project ${sc.project.name}. Try /coord status all.`
        : `No live sessions under ${root}. Try /coord status all.`
    return [head, none].filter(Boolean).join('\n')
  }
  const lines = live.map(s => {
    const branch = b[s.cwd] ?? ''
    const pr = p.find(x => x.branch === branch)
    const prText = pr ? ` · #${pr.number}${pr.isDraft ? ' draft' : ''} @ ${pr.sha}` : ''
    return [
      `${s.name} (${s.account}) — ${s.status} ${ago(s.statusSince, now)}${prText}`,
      `  ${s.socket}  ${s.cwd === root ? '(worktree root)' : s.cwd.replace(`${root}/`, '')}${branch ? ` [${branch}]` : ''}`,
      `  ${waitingOn(threadFor(t, live, s), s, now).text}`,
    ].join('\n')
  })
  const board = await boardPath($)
  lines.push(board ? `Board: ${board}` : 'Board: not set (/coord board-path <path>)')
  return [head, ...lines].filter(Boolean).join('\n')
}

async function selfSocket($: Host): Promise<string> {
  const me = (await read($, sessions)).find(s => s.isSelf)
  return me?.socket ?? '<your socket: run /coord status>'
}

function findSession(list: CoordSession[], query: string): CoordSession | undefined {
  const q = query.trim().toLowerCase()
  if (!q) return undefined
  return (
    list.find(s => s.socket === q || s.socket === `uds:${q}` || s.name.toLowerCase() === q) ??
    list.find(s => !s.isSelf && (s.name.toLowerCase().startsWith(q) || s.cwd.toLowerCase().endsWith(`/${q}`)))
  )
}

// With a project, only its builders: a brief to another project's builder is that coordinator's job.
// Without one, the root's sessions first, then any live one.
async function lookup($: Host, query: string): Promise<CoordSession | undefined> {
  const sc = await scope($)
  const all = await read($, sessions)
  const own = findSession(all.filter(sc.has), query)
  return own ?? (sc.project || sc.missing ? undefined : findSession(all, query))
}

// ---- turning it on ----

let timers: { cancel: () => void }[] = []

const paneTitle = (name: string) => (name ? `Coordinator · ${name}` : 'Coordinator')

async function activate($: Host, projectName: string): Promise<void> {
  await update($, isActive, () => true)
  await update($, project, () => projectName)
  await $.tool.register({
    name: 'sessions',
    description:
      'Live Claude Code sessions on every Claude account this machine uses, with name, folder, branch, open PR, busy/idle, the uds: address to SendMessage to, and who owes whom a reply. Use this instead of reading ~/.claude*/sessions by hand; sockets change when a session restarts, so look up again before sending.',
    inputSchema: {
      type: 'object',
      properties: { all: { type: 'boolean', description: "Include sessions outside this coordinator's project (or worktree root)" } },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'board',
    description:
      'The coordinator board: an append-only markdown log of decisions, SHAs, verdicts and owed checks. Pass `append` to add one timestamped line (the local time is added for you), or nothing to read the last lines.',
    inputSchema: {
      type: 'object',
      properties: {
        append: { type: 'string', description: 'One line to add' },
        tail: { type: 'number', description: 'How many last lines to read (default 15)' },
      },
    },
    isDeferred: false,
  })
  await $.tool.register({
    name: 'brief',
    description:
      'The house brief template for a builder session, filled with its address and your reply-to. Fill the <…> parts, then send it with SendMessage to the address it names.',
    inputSchema: {
      type: 'object',
      properties: {
        session: { type: 'string', description: 'Session name, name prefix, worktree folder or uds: address' },
        goal: { type: 'string' },
      },
      required: ['session'],
    },
    isDeferred: false,
  })

  for (const t of timers) t.cancel()
  timers = [
    $.clock.every(SCAN_EVERY_MS, () => void refresh($)),
    // Re-sharing heals a copy the other account's coordinator overwrote at the same moment.
    $.clock.every(PRS_EVERY_MS, () => void refresh($, true).then(() => shareProjects($))),
  ]
  await refresh($, true)
  await shareProjects($)
  void $.ui.open({ id: PANE, title: paneTitle(projectName) })
}

async function deactivate($: Host): Promise<void> {
  for (const t of timers) t.cancel()
  timers = []
  await update($, isActive, () => false)
  await update($, project, () => '')
  $.ui.status(undefined)
  await labelSelf($).catch(() => {})
}

// Where `/coord on` is remembered. A session the person named keeps its own binding, so two
// coordinators launched in the same folder don't share one, and a named coordinator gets its
// project back after /clear or a handoff. The value is true (everything) or a project name;
// false under a name means off, and stops the folder's setting from applying.
const activeKey = (cwd: string) => `active:${cwd}`
const nameKey = (name: string) => `active-name:${name}`

// The main checkout (the worktree root) and a main worktree are where unrelated sessions start
// all day. A folder binding there turned every new session into the coordinator, so those bind
// by name only. The handoff skill's handoff-path.sh draws the same line for /handoff notes.
const MAIN_FOLDERS = ['main', 'master']

// A worktree root is a folder holding .claude/worktrees/ or branches/, not just any folder
// outside one. `<root>/main` is the symlink spelling of branches/main.
export function isSharedFolder(cwd: string, holdsBranches: (dir: string) => boolean): boolean {
  if (inWorktree(cwd)) return MAIN_FOLDERS.includes(folderOf(cwd))
  const dir = cwd.replace(/\/+$/, '')
  const parent = dir.slice(0, dir.lastIndexOf('/'))
  return holdsBranches(dir) || (MAIN_FOLDERS.includes(dir.slice(parent.length + 1)) && holdsBranches(parent))
}

async function sharedFolder($: Host, cwd: string): Promise<boolean> {
  if (inWorktree(cwd)) return isSharedFolder(cwd, () => false)
  const dir = cwd.replace(/\/+$/, '')
  const roots = new Set<string>()
  for (const d of [dir, dir.slice(0, dir.lastIndexOf('/'))]) {
    for (const m of WORKTREE_DIRS) {
      if (
        await $.fs.list(`${d}${m.replace(/\/$/, '')}`).then(
          () => true,
          () => false,
        )
      )
        roots.add(d)
    }
  }
  return isSharedFolder(cwd, d => roots.has(d))
}

export const SHARED_REFUSAL =
  'Not turned on: this folder is shared by unrelated sessions, so the coordinator is only remembered by session name here. Name this session first (/rename "Auth Coordinator", or start it with claude -n), or run the coordinator in its own worktree: claude -w <workstream>-coord.'

// undefined: an unnamed session in a shared folder, which has nowhere to remember it.
async function bindingKey($: Host, cwd: string): Promise<string | undefined> {
  const me = await selfOf($)
  if (me?.isNamed) return nameKey(me.name)
  return (await sharedFolder($, cwd)) ? undefined : activeKey(cwd)
}

export function bindingOf(byName: unknown, byFolder: unknown): string | false {
  const v = byName !== undefined ? byName : byFolder
  if (v === true) return ''
  return typeof v === 'string' && v ? v : false
}

async function savedBinding($: Host, cwd: string): Promise<string | false> {
  // Every builder runs this at start; only look up our own name when some session saved one.
  const named = (await $.store.keys()).some(k => k.startsWith('active-name:'))
  const me = named ? await selfOf($) : undefined
  const byName = me?.isNamed ? await $.store.get(nameKey(me.name)) : undefined
  return bindingOf(byName, (await sharedFolder($, cwd)) ? undefined : await $.store.get(activeKey(cwd)))
}

// An exact session name or uds: address becomes its folder; a path becomes its worktree folder; else the text is one.
// No prefix matching: `/coord drop auth` must not drop whichever auth-… session sorts first.
export function memberFor(live: CoordSession[], query: string): string {
  const q = query.trim().replace(/\/+$/, '')
  const s = live.find(x => !x.isSelf && (x.socket === q || x.socket === `uds:${q}` || x.name.toLowerCase() === q.toLowerCase()))
  if (s) return folderOf(s.cwd)
  for (const m of WORKTREE_DIRS) {
    const rel = m.slice(1)
    if (q.startsWith(rel)) return q.slice(rel.length).split('/')[0] ?? q
  }
  return folderOf(q)
}

async function memberOf($: Host, query: string): Promise<string> {
  await refresh($)
  return memberFor(await read($, sessions), query)
}

async function projectCommand($: Host, args: string[]): Promise<string> {
  const [name = '', pattern = '', ...more] = args
  const { emoji, board = '', bad } = projectArgs(more)
  if (!name) {
    const all = await allProjects($)
    const groups = await liveGroups($, rootOf(await $.session.cwd()), all)
    if (all.length === 0 && groups.size === 0)
      return 'No projects yet. /coord project <name> <folder pattern> [emoji] [board path], e.g. /coord project auth auth-* 🌸'
    const current = await read($, project)
    return [
      ...all.map(p => `${p.name === current ? '* ' : '  '}${describeProject(p)}${p.board ? `\n    board: ${p.board}` : ''}`),
      ...[...groups].map(([g, n]) => `${g === current ? '* ' : '  '}${describeProject(autoProject(g))}; ${n} live`),
    ].join('\n')
  }
  if (!/^[\w.-]+$/.test(name) || name === 'all') return `"${name}" can't be a project name: use letters, digits, - _ or ., and not "all".`
  const old = await getProject($, name)
  if (pattern === 'remove') {
    if (more.length) return `To remove it: /coord project ${name} remove (nothing after it). A pattern can't be "remove".`
    if (!old) return `No project ${name}.`
    await $.store.delete(projectKey(name))
    await shareProjects($)
    if ((await read($, isActive)) && (await read($, project)) === name) await refresh($)
    return canBeGroup(name)
      ? `Removed project ${name}. A coordinator bound to it now follows the ${name}-* folder group.`
      : `Removed project ${name}. A coordinator bound to it shows nothing until /coord on <another project|all>.`
  }
  if (!pattern) {
    const shown = (await allProjects($)).find(p => p.name === name)
    if (shown) return describeProject(shown) + (shown.board ? `\nboard: ${shown.board}` : '')
    const n = (await liveGroups($, rootOf(await $.session.cwd()), [])).get(name)
    return n ? `${describeProject(autoProject(name))}; ${n} live` : `No project ${name}.`
  }
  if (bad)
    return `"${bad}" is neither an emoji nor an absolute board path. /coord project <name> <folder pattern> [emoji or - to clear it] [absolute board path]`
  const next: CoordProject = {
    name,
    pattern,
    board: board || old?.board,
    emoji: emoji === '' ? undefined : (emoji ?? old?.emoji),
    members: old?.members ?? [],
    dropped: old?.dropped ?? [],
  }
  await $.store.set(projectKey(name), next)
  await shareProjects($)
  if ((await read($, isActive)) && (await read($, project)) === name) await refresh($)
  return `${old ? 'Updated' : 'Created'} ${describeProject(next)}${next.board ? `\nBoard: ${next.board}` : ''}\nBind a coordinator to it with /coord on ${name}.`
}

async function memberCommand($: Host, sub: 'add' | 'drop', query: string): Promise<string> {
  const name = await read($, project)
  const p = name ? await projectFor($, name) : undefined
  if (!(await read($, isActive)) || !p) return 'Bind this coordinator to a project first: /coord on <project>.'
  if (!query.trim()) return `Usage: /coord ${sub} <session name, uds: address or worktree folder>`
  const folder = await memberOf($, query)
  const next: CoordProject =
    sub === 'add'
      ? { ...p, members: [...new Set([...p.members, folder])], dropped: p.dropped.filter(f => f !== folder) }
      : { ...p, members: p.members.filter(f => f !== folder), dropped: [...new Set([...p.dropped, folder])] }
  await saveProject($, next)
  await refresh($)
  return `${sub === 'add' ? 'Added' : 'Dropped'} ${folder} ${sub === 'add' ? 'to' : 'from'} ${p.name}.`
}

// ---- hooks ----

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'coord',
      description: 'Coordinator: panel, status, projects, board, brief, on/off',
      argumentHint:
        '[on [project|all]|off|status [all]|project [name pattern [emoji] [board]]|add|drop <session>|board [line]|board-path <path>|brief <session> [goal]]',
    })
    const bound = await savedBinding($, e.cwd)
    if (bound !== false) await activate($, bound)
    // Every session, coordinator or not: a builder picks up a project made after it started.
    labelTimer?.cancel()
    labelTimer = $.clock.every(LABEL_EVERY_MS, () => void labelSelf($).catch(() => {}))
    await labelSelf($).catch(() => {})
    return started
  })

  // /clear fires no session.start and starts the session's state over. A timer set as the old
  // session ends runs in the new one: bind again from the store there.
  on('session.end', async ($, e, next) => {
    const ended = await next(e)
    // Wait for the new session id, so the bind lands after the reset rather than before it.
    if (e.reason === 'clear') {
      const rebind = (tries: number) =>
        $.clock.after(CLEAR_REBIND_MS, async () => {
          if ((await $.session.id()) === e.sessionId) {
            if (tries > 1) rebind(tries - 1)
            return
          }
          const bound = await savedBinding($, await $.session.cwd())
          if (bound !== false) await activate($, bound)
          else await deactivate($)
        })
      rebind(CLEAR_REBIND_TRIES)
    } else {
      // The process is going; give its tab back to tmux's own naming.
      labelTimer?.cancel()
      labelTimer = undefined
      const me = await selfOf($).catch(() => undefined)
      if (me) await nameTab($, me, undefined).catch(() => {})
    }
    return ended
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'coord' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    const args = rest.join(' ')
    const cwd = await $.session.cwd()

    if (sub === 'off') {
      const key = await bindingKey($, cwd)
      if (key !== undefined && key !== activeKey(cwd)) await $.store.set(key, false)
      // In a shared folder this also clears a folder binding saved before they were refused.
      if (key === activeKey(cwd) || (await sharedFolder($, cwd))) await $.store.delete(activeKey(cwd))
      await deactivate($)
      return { text: `Coordinator off for ${cwd}.` }
    }
    if (sub === 'project') return { text: await projectCommand($, rest) }
    if (sub === 'add' || sub === 'drop') return { text: await memberCommand($, sub, args) }

    const active = await read($, isActive)
    // `/coord on <project>` binds (or rebinds) to a project; `/coord on all` to everything.
    const wanted = sub === 'on' && args ? (args === 'all' ? '' : args) : undefined
    // A group name works with no setup once a session of it is live (or it is this folder's own).
    const isGroup = async (g: string) =>
      canBeGroup(g) && (groupOf(cwd) === g || (await scan($, s => groupOf(s.cwd) === g && rootOf(s.cwd) === rootOf(cwd))).length > 0)
    if (wanted && !(await allProjects($)).some(p => p.name === wanted) && !(await isGroup(wanted))) {
      return { text: `No project ${wanted}. Create it with /coord project ${wanted} <folder pattern> [board path]; /coord project lists them.` }
    }
    const current = await read($, project)
    // Only these turn it on (and keep it on); status, board and brief work either way.
    if ((sub === 'on' || sub === '' || sub === 'panel') && (!active || (wanted !== undefined && wanted !== current))) {
      // Plain `/coord on` in a grouped folder (a worktree named auth-coord) coordinates that group.
      const name = wanted ?? (active ? current : (groupOf(cwd) ?? ''))
      const key = await bindingKey($, cwd)
      if (key === undefined) return { text: SHARED_REFUSAL }
      await $.store.set(key, name || true)
      await activate($, name)
      if (sub !== 'panel') {
        const p = name ? await projectFor($, name) : undefined
        const what = !name
          ? `everything under ${rootOf(cwd)}`
          : p?.auto
            ? `group ${p.emoji} ${name} (folders ${p.pattern}; /coord on all for everything)`
            : `project ${name}`
        return {
          text: `Coordinator on for ${what} (remembered for this ${key.startsWith('active-name:') ? 'session name' : 'folder'}; /coord off to stop).`,
          context: [
            `[coordinator] The sessions, board and brief tools are now available (mcp__coordinator__*), scoped to ${what}. Use them to find builder sessions and their uds: addresses, log decisions, and draft briefs. If you write a handoff, say to run /coord on${name ? ` ${name}` : ''} in the next session.`,
          ],
        }
      }
    }

    if (sub === 'on') {
      // Already on this project, perhaps from the folder's binding: save it under this session too.
      const key = wanted !== undefined ? await bindingKey($, cwd) : undefined
      if (key !== undefined) await $.store.set(key, wanted || true)
      return { text: `Coordinator is already on${current ? ` for project ${current}` : ` for ${cwd}`}.` }
    }
    if (sub === '' || sub === 'panel') {
      await $.ui.open({ id: PANE, title: paneTitle(await read($, project)), focus: true })
      return { text: 'Coordinator panel opened.' }
    }
    if (sub === 'status') return { text: await report($, args === 'all') }
    if (sub === 'board') return { text: await boardCommand($, args) }
    if (sub === 'board-path') {
      if (!args.startsWith('/')) return { text: 'Give the absolute path of the board file, e.g. /coord board-path /Users/you/coord/<workstream>/board.md' }
      const gone = (await read($, isActive)) ? (await scope($)).missing : undefined
      if (gone) return { text: `Project ${gone} no longer exists. /coord on <project|all> first, then set the board.` }
      const bound = (await read($, isActive)) ? await read($, project) : ''
      const p = bound ? await projectFor($, bound) : undefined
      if (p) await saveProject($, { ...p, board: args })
      else await $.store.set(boardKey(rootOf(cwd)), args)
      return { text: `Board for ${p ? `project ${p.name}` : rootOf(cwd)}: ${args}\nMessages to and from builders are logged beside it in messages.md.` }
    }
    if (sub === 'brief') {
      await refresh($)
      const [who = '', ...goal] = rest
      const target = await lookup($, who)
      if (!target) return { text: `No live session in this coordinator's scope matches "${who}". /coord status lists them.` }
      await $.prompt.fill({
        text: `Write and send a brief to ${target.name} using this template; keep it under 40 lines.\n\n${briefTemplate(target, await selfSocket($), goal.join(' '))}`,
        mode: 'replace',
      })
      return { text: `Brief request for ${target.name} is in the prompt box: edit it, then press Enter.` }
    }
    return {
      text: 'Usage: /coord [on [project|all]|off|panel|status [all]|project [<name> <folder pattern> [emoji] [board path] | <name> remove]|add <session>|drop <session>|board [line]|board-path <path>|brief <session> [goal]]',
    }
  })

  on('tool.call', { tool: 'mcp__coordinator__sessions' }, async ($, e) => {
    if (!(await read($, isActive))) return { result: 'The coordinator is off in this session. Ask the user to run /coord on.', isError: true }
    const input = e as unknown as { all?: boolean }
    return { result: await report($, input.all === true) }
  })

  on('tool.call', { tool: 'mcp__coordinator__board' }, async ($, e) => {
    if (!(await read($, isActive))) return { result: 'The coordinator is off in this session. Ask the user to run /coord on.', isError: true }
    const input = e as unknown as { append?: string; tail?: number }
    const path = await boardPath($)
    if (!path) return { result: await boardCommand($, ''), isError: true }
    if (input.append?.trim()) return { result: await boardCommand($, input.append) }
    const text = String(await $.fs.read(path).catch(() => ''))
    return { result: tail(text, input.tail ?? 15) || `${path} is empty.` }
  })

  on('tool.call', { tool: 'mcp__coordinator__brief' }, async ($, e) => {
    if (!(await read($, isActive))) return { result: 'The coordinator is off in this session. Ask the user to run /coord on.', isError: true }
    const input = e as unknown as { session?: string; goal?: string }
    await refresh($)
    const target = await lookup($, input.session ?? '')
    if (!target) return { result: `No live session in this coordinator's scope matches "${input.session}". Call sessions to list them.`, isError: true }
    return { result: briefTemplate(target, await selfSocket($), input.goal ?? '') }
  })

  // Who owes whom: every message out to a session's socket and every one in from it.
  on('session.send', async ($, e, next) => {
    const sent = await next(e)
    if (!sent.isDelivered || !(await read($, isActive)) || e.agentId !== undefined || !e.to.startsWith('uds:')) return sent
    const now = Date.now()
    const all = await read($, sessions)
    const name = all.find(s => s.socket === e.to)?.name ?? e.to
    const key = threadKey(all, e.to)
    await update($, threads, t => ({
      ...t,
      [key]: { ...t[key], name, lastOut: now, outText: firstLine(e.text) },
    }))
    const board = await boardPath($)
    if (board && (await logsFor($, e.to))) await appendTo($, messageLog(board), `- ${clockTime(now)} → ${name}: ${firstLine(e.text)}`).catch(() => {})
    await showStatus($)
    return sent
  }).catch(($, e, next) => next(e))

  on('session.receive', async ($, e, next) => {
    const kind: string = e.origin.kind
    const peer = kind === 'peer-send-message' || kind === 'peer' ? peerOf(e.text) : null
    if (peer && e.agentId === undefined && (await read($, isActive))) {
      const now = Date.now()
      const all = await read($, sessions)
      const name = peer.name ?? all.find(s => s.socket === peer.socket)?.name ?? peer.socket
      const key = threadKey(all, peer.socket)
      await update($, threads, t => ({
        ...t,
        [key]: { ...t[key], name, lastIn: now, inText: firstLine(e.text) },
      }))
      const board = await boardPath($)
      if (board && (await logsFor($, peer.socket))) await appendTo($, messageLog(board), `- ${clockTime(now)} ← ${name}: ${firstLine(e.text)}`).catch(() => {})
      await showStatus($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    if (!(await read($, isActive))) return <Text dimColor>Coordinator is off here. /coord on to start.</Text>

    const sc = await scope($)
    const now = await $.clock.now()
    const live = (await read($, sessions)).filter(sc.has)
    const b = await read($, branches)
    const p = await read($, prs)
    const t = await read($, threads)
    const at = await read($, scannedAt)
    const width = Math.max(20, e.props.bodyColumns)
    const cut = (s: string) => (s.length > width ? `${s.slice(0, width - 1)}…` : s)
    const tone = { owe: 'red', nudge: 'yellow', wait: undefined, none: undefined } as const

    // Sessions that owe us nothing sink; the ones waiting on us float up.
    const order = { owe: 0, nudge: 1, wait: 2, none: 3 } as const
    const rows = live
      .map(s => ({ s, w: waitingOn(threadFor(t, live, s), s, now) }))
      .sort((x, y) => order[x.w.tone] - order[y.w.tone] || x.s.name.localeCompare(y.s.name))

    return (
      <Box flexDirection="column">
        {sc.missing && <Text color="yellow">{cut(`Project ${sc.missing} no longer exists.`)}</Text>}
        {rows.length === 0 && !sc.missing && (
          <Text dimColor>{sc.project ? `No builder sessions in ${sc.project.name}.` : `No builder sessions under ${sc.root}.`}</Text>
        )}
        {rows.map(({ s, w }) => {
          const branch = b[s.cwd] ?? ''
          const pr = p.find(x => x.branch === branch)
          const dot = s.status === 'busy' ? 'yellow' : s.status === 'idle' ? 'green' : 'gray'
          const folder = s.cwd === sc.root ? '(root)' : folderOf(s.cwd)
          const canJump = tmuxTarget(s.tmux) !== undefined
          // The dot and the jump hint take 9 columns.
          const room = canJump ? width - 9 : width - 2
          const name = s.name.length > room ? `${s.name.slice(0, room - 1)}…` : s.name
          return (
            <Box key={s.socket} flexDirection="column" marginBottom={1}>
              {canJump ? (
                <Button key={`jump:${s.socket}`} plain onPress={() => void jump($, s)}>
                  <Text color={dot}>●</Text> <Text bold>{name}</Text> <Text dimColor>↗ jump</Text>
                </Button>
              ) : (
                <Text>
                  <Text color={dot}>●</Text> <Text bold>{name}</Text>
                </Text>
              )}
              <Text dimColor>
                {cut(
                  `  ${s.status} ${ago(s.statusSince, now)} · ${folder}${pr ? ` · #${pr.number}${pr.isDraft ? ' draft' : ''}` : branch ? ` · ${branch}` : ''}`,
                )}
              </Text>
              <Text color={tone[w.tone]} bold={w.tone === 'owe'}>
                {cut(`  ${w.text}`)}
              </Text>
            </Box>
          )
        })}
        <Text dimColor>{at ? `checked ${ago(at, now)} ago` : 'checking…'}</Text>
      </Box>
    )
  })
}
