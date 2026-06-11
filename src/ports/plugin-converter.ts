// Converter plugin contract (Phase 7). Lifted into @ports during the TS
// project-references work so that @adapters/storage-idb can declare Recipe[]
// in the persisted Manifest without crossing into @plugins.

export type OptionType = 'number' | 'string' | 'boolean' | 'enum'

export type OptionSpec =
  | { name: string; label?: string; type: 'number'; default: number; min?: number; max?: number }
  | { name: string; label?: string; type: 'string'; default: string }
  | { name: string; label?: string; type: 'boolean'; default: boolean }
  | { name: string; label?: string; type: 'enum'; options: string[]; default: string }

export interface ConverterMeta {
  id: string
  label: string
  inputExt: string[]
  optionsSchema: OptionSpec[]
}

export interface ConvertOutput {
  bytes: Uint8Array
  mimeHint?: string
  summary?: string
}

export type ConvertFn = (
  input: Uint8Array,
  opts: Record<string, unknown>,
) => Promise<ConvertOutput>

export interface ConverterModule {
  meta: ConverterMeta
  convert: ConvertFn
}

export interface Recipe {
  input: string
  output: string
  converter: string
  options?: Record<string, unknown>
}
