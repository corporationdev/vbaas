import { Data } from "effect";

import type { CompositionValidationIssue } from "../schema";

export class CompositionInvalid extends Data.TaggedError("CompositionInvalid")<{
  readonly issues: readonly CompositionValidationIssue[];
}> {}

export class RenderPlanInvalid extends Data.TaggedError("RenderPlanInvalid")<{
  readonly message: string;
}> {}

export class AssetResolveFailed extends Data.TaggedError("AssetResolveFailed")<{
  readonly assetId: string;
  readonly message: string;
}> {}

export class FrameSequenceFailed extends Data.TaggedError(
  "FrameSequenceFailed"
)<{
  readonly message: string;
}> {}

export class FfmpegFailed extends Data.TaggedError("FfmpegFailed")<{
  readonly message: string;
}> {}

export class TempDirectoryFailed extends Data.TaggedError(
  "TempDirectoryFailed"
)<{
  readonly message: string;
}> {}

export class CommandExecutionFailed extends Data.TaggedError(
  "CommandExecutionFailed"
)<{
  readonly args: readonly string[];
  readonly binary: string;
  readonly exitCode?: number;
  readonly message: string;
  readonly stderr?: string;
}> {}

export type RenderError =
  | AssetResolveFailed
  | CompositionInvalid
  | FfmpegFailed
  | FrameSequenceFailed
  | RenderPlanInvalid
  | TempDirectoryFailed;
