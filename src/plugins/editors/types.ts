// Re-export the canonical contract from @ports. Existing @plugins consumers
// keep their imports unchanged.
export type {
  EditorAsset,
  EditorContext,
  EditorHandle,
  EditorMeta,
  EditorModule,
  EditorMount,
} from "@ports";
