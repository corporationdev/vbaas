import { Effect, Layer } from "effect";

import { FrameSequenceFailed } from "./errors";
import { renderFrameSequence, renderFrameStream } from "./png-frame-stream";
import { FrameSequenceRenderer } from "./services";
import { renderEncodedVideo } from "./webcodecs-encoder";

export const FrameSequenceRendererLive = Layer.succeed(FrameSequenceRenderer, {
  renderEncodedVideo: (input) =>
    Effect.tryPromise({
      catch: (error) =>
        new FrameSequenceFailed({
          message:
            error instanceof Error
              ? error.message
              : "Unable to encode video in browser.",
        }),
      try: () => renderEncodedVideo(input),
    }),
  renderFrameSequence: (input) =>
    Effect.tryPromise({
      catch: (error) =>
        new FrameSequenceFailed({
          message:
            error instanceof Error
              ? error.message
              : "Unable to render frame sequence.",
        }),
      try: () => renderFrameSequence(input),
    }),
  renderFrameStream: (input) => Effect.succeed(renderFrameStream(input)),
});
