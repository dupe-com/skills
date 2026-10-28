export type CoordSession = {
  name: string
  // The Claude config folder the session runs under, by its last part (.claude, .claude-work).
  account: string
  pid: number
  cwd: string
  socket: string
  status: string
  statusSince: number
  isSelf: boolean
  // The person named the session (claude -n / /rename), so the name survives a /clear.
  isNamed: boolean
  // Where it runs in tmux, as session:@window.%pane (e.g. dev:@8.%56); absent outside tmux.
  tmux?: string
}

export type CoordThread = {
  name: string
  lastIn?: number
  lastOut?: number
  inText?: string
  outText?: string
}

// A workstream: the builders whose worktree folder matches `pattern`, plus `members`,
// minus `dropped` (folder names, or the full path of a session outside any worktree). `emoji`
// marks its builders' status line and tmux tab. `auto` marks a folder group made up on the
// fly (auth-* for worktrees named auth-…), never stored.
export type CoordProject = {
  name: string
  pattern: string
  board?: string
  emoji?: string
  members: string[]
  dropped: string[]
  auto?: boolean
}

export type CoordPr = { number: number; branch: string; isDraft: boolean; title: string; sha: string }

declare module 'claude-code' {
  interface PluginState {
    coordinator: {
      isActive: boolean
      // The project this coordinator is bound to; '' means every session under the root.
      project: string
      sessions: CoordSession[]
      branches: Record<string, string>
      prs: CoordPr[]
      threads: Record<string, CoordThread>
      scannedAt: number
    }
  }
}
