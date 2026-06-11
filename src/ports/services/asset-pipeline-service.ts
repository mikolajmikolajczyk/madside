// AssetPipelineService — wraps the Phase 7 recipe engine. Today: runs
// converters from @plugins/converters. M5+ plugin work routes through
// PluginRegistry instead.

import type { BuildError, Result } from '../errors'
import type { Recipe } from '../plugin-converter'

// Re-export Recipe from the converter port — recipe is a converter contract
// concern, but a pipeline consumer typically reaches it through this service.
export type { Recipe }

export interface AssetPipelineFile {
  path: string
  content: Uint8Array
}

export interface AssetPipelineInput {
  projectId: string
  files: AssetPipelineFile[]
  recipes: Recipe[]
}

export interface RecipeRunResult {
  recipeId: string
  /** Output file path. */
  output: string
  /** Output bytes — present on success, undefined on failure. */
  bytes?: Uint8Array
  /** Wall-clock duration in ms. */
  durationMs: number
  /** Error message when the recipe failed. */
  error?: string
}

export interface AssetPipelineService {
  /** Run every recipe in `input.recipes` against `input.files`. */
  runAll(input: AssetPipelineInput): Promise<Result<RecipeRunResult[], BuildError>>

  /** Run a single recipe by id. */
  runOne(
    input: AssetPipelineInput,
    recipeId: string,
  ): Promise<Result<RecipeRunResult, BuildError>>

  /** Only rerun recipes whose tracked inputs changed since last run.
   *  Returns the affected set; recipes that were skipped are not included.
   *  (Tracking lives in the implementation — see issue 0b0a786.) */
  runAffected(input: AssetPipelineInput): Promise<Result<RecipeRunResult[], BuildError>>
}
