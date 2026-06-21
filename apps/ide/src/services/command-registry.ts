import type {
  Command,
  CommandContext,
  CommandRegistry,
} from '@ports'
import { InternalError } from '@ports'

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>()

  return {
    register(command) {
      if (commands.has(command.id)) {
        throw new InternalError(`command "${command.id}" already registered`)
      }
      commands.set(command.id, command as Command)
      return () => commands.delete(command.id)
    },

    unregister(id) {
      commands.delete(id)
    },

    has(id) {
      return commands.has(id)
    },

    list() {
      return [...commands.values()]
    },

    async run<T>(id: string, ctx: CommandContext, args?: T): Promise<void> {
      const cmd = commands.get(id)
      if (!cmd) throw new InternalError(`unknown command "${id}"`)
      if (cmd.when && !cmd.when(ctx)) return
      await cmd.run(ctx, args)
    },
  }
}
