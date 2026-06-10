// AssetPipelineService — wraps the Phase 7 recipe engine. M3 hides the
// existing converter registry behind this surface; M5+ plugin work makes
// converters first-class PluginRegistry entries.

import type { BuildError, Result } from '../errors'

export interface RecipeRunResult {
  recipeId: string
  output: string
  /** Wall-clock duration in ms. */
  durationMs: number
}

export interface AssetPipelineService {
  runAll(projectId: string): Promise<Result<RecipeRunResult[], BuildError>>
  runOne(projectId: string, recipeId: string): Promise<Result<RecipeRunResult, BuildError>>
  /** Only rerun recipes whose tracked inputs changed since last run. */
  runAffected(projectId: string): Promise<Result<RecipeRunResult[], BuildError>>
}
