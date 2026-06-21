// CommandRegistry — every user action becomes a named command. M3 wires
// toolbar buttons + keybindings + future palette through this single
// dispatcher. Plugins can register commands via their context.

export interface CommandContext {
  /** Project the command runs against. Plugins / commands that don't need a
   *  project (e.g. settings) leave this undefined. */
  projectId?: string
}

export interface Command<TArgs = unknown> {
  id: string
  title: string
  /** Optional accelerator in KeyboardEvent.code/key form, e.g. "Ctrl+S". */
  shortcut?: string
  /** Predicate the dispatcher consults before running; defaults to `true`. */
  when?: (ctx: CommandContext) => boolean
  run(ctx: CommandContext, args?: TArgs): Promise<void> | void
}

export interface CommandRegistry {
  register<T>(command: Command<T>): () => void
  unregister(id: string): void
  has(id: string): boolean
  list(): Command[]
  run<T>(id: string, ctx: CommandContext, args?: T): Promise<void>
}
