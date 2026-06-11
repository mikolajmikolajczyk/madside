import type {
  AssetPipelineFile,
  AssetPipelineInput,
  AssetPipelineService,
  BuildError as BuildErrorType,
  EventBus,
  Logger,
  RecipeRunResult,
  Result,
} from '@ports'
import { BuildError, err, ok } from '@ports'

// AssetPipelineService wraps the Phase 7 recipe engine. Same DI pattern as
// BuildService — @app injects the concrete runRecipes function so the
// service stays adapter-free per ADR-0002.
//
// Events emitted on the workbench EventBus:
//   recipes:start { projectId }
//   recipes:done  { projectId, updated: [output paths] }

export interface RecipeRunnerResultLike {
  ok: boolean
  output?: AssetPipelineFile
  recipe: { converter: string; input: string; output: string }
  error?: string
}

export type RecipeRunnerFn = (
  projectId: string,
  recipes: AssetPipelineInput['recipes'],
  files: AssetPipelineFile[],
) => Promise<RecipeRunnerResultLike[]>

export interface AssetPipelineServiceDeps {
  events: EventBus
  recipes: RecipeRunnerFn
  logger?: Logger
}

const toResult = (
  r: RecipeRunnerResultLike,
  durationMs: number,
): RecipeRunResult => ({
  recipeId: r.recipe.output, // recipes are id'd by output path here; M5 narrows
  output: r.recipe.output,
  bytes: r.output?.content,
  durationMs,
  error: r.error,
})

export function createAssetPipelineService(
  deps: AssetPipelineServiceDeps,
): AssetPipelineService {
  const log = deps.logger?.child('recipes') ?? deps.logger

  const runMany = async (
    input: AssetPipelineInput,
    recipes: AssetPipelineInput['recipes'],
  ): Promise<Result<RecipeRunResult[], BuildErrorType>> => {
    deps.events.emit('recipes:start', { projectId: input.projectId })
    const t0 = Date.now()
    try {
      const raw = await deps.recipes(input.projectId, recipes, input.files)
      const elapsed = Date.now() - t0
      const perRecipe = elapsed / Math.max(1, raw.length)
      const results = raw.map((r) => toResult(r, perRecipe))
      const updated = results.filter((r) => !r.error).map((r) => r.output)
      deps.events.emit('recipes:done', { projectId: input.projectId, updated })
      return ok(results)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'recipe run failed'
      log?.error('asset pipeline threw', cause, { projectId: input.projectId })
      const e = cause instanceof BuildError ? cause : new BuildError(message, undefined, cause)
      return err(e)
    }
  }

  return {
    async runAll(input) {
      return runMany(input, input.recipes)
    },

    async runOne(input, recipeId) {
      const recipe = input.recipes.find((r) => r.output === recipeId)
      if (!recipe) return err(new BuildError(`no recipe with output ${recipeId}`))
      const results = await runMany(input, [recipe])
      if (!results.ok) return err(results.error)
      const [only] = results.value
      if (!only) return err(new BuildError(`recipe ${recipeId} produced no result`))
      return ok(only)
    },

    async runAffected(input) {
      // Affected-recipes tracking lives in a follow-up (0b0a786). For now
      // runAffected is equivalent to runAll — services contract is honest:
      // returns every recipe's result. The optimisation is opt-in.
      return runMany(input, input.recipes)
    },
  }
}
