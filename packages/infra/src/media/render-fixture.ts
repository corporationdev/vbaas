import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RendererLive, renderComposition } from "@vbaas/core/renderer";
import { vbaasCompositionSchema } from "@vbaas/core/schema";
import { spawn } from "bun";
import { gen, promise, provide, tryPromise } from "effect/Effect";
import { decodeUnknownSync } from "effect/Schema";

import type { MediaContainerRenderFixtureResult } from "./media-container";

export const renderMediaContainerFixture = () =>
  gen(function* () {
    const workspace = join(
      tmpdir(),
      `vbaas-media-container-${crypto.randomUUID()}`
    );
    const sourcePath = join(workspace, "source.mp4");
    const audioPath = join(workspace, "tone.wav");
    const outputPath = join(workspace, "output.mp4");

    yield* tryPromise(() => mkdir(workspace, { recursive: true }));

    try {
      yield* runProcess("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=#18204a:s=320x568:r=30:d=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        sourcePath,
      ]);
      yield* runProcess("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        audioPath,
      ]);

      const composition = decodeUnknownSync(vbaasCompositionSchema)({
        assets: [
          {
            durationFrames: 60,
            fps: 30,
            height: 568,
            id: "source-video",
            source: {
              kind: "file",
              path: sourcePath,
            },
            type: "video",
            width: 320,
          },
          {
            durationFrames: 60,
            id: "tone-audio",
            source: {
              kind: "file",
              path: audioPath,
            },
            type: "audio",
          },
        ],
        durationFrames: 60,
        id: "media-container-fixture",
        schemaVersion: "0.1",
        settings: {
          canvas: {
            height: 568,
            width: 320,
          },
          fps: 30,
        },
        tracks: [
          {
            clips: [
              {
                durationFrames: 60,
                id: "background-video",
                media: {
                  assetId: "source-video",
                },
                startFrame: 0,
                type: "video",
              },
            ],
            id: "visual-track",
            kind: "visual",
          },
          {
            clips: [
              {
                durationFrames: 60,
                id: "title",
                layout: {
                  fit: "fill",
                  height: 110,
                  width: 320,
                  x: 0,
                  y: 72,
                },
                startFrame: 0,
                style: {
                  color: "#ffffff",
                  fontSize: 44,
                  fontWeight: "bold",
                },
                text: "Media OK",
                type: "text",
              },
            ],
            id: "text-track",
            kind: "text",
          },
          {
            clips: [
              {
                durationFrames: 60,
                id: "tone",
                media: {
                  assetId: "tone-audio",
                },
                startFrame: 0,
                type: "audio",
                volume: 0.4,
              },
            ],
            id: "audio-track",
            kind: "audio",
          },
        ],
      });

      const result = yield* renderComposition({
        composition,
        outputPath,
        projectRoot: workspace,
        quality: "standard",
      }).pipe(provide(RendererLive));
      const outputStats = yield* tryPromise(() => stat(outputPath));

      return {
        durationFrames: result.durationFrames,
        outputPath,
        sizeBytes: outputStats.size,
      } satisfies MediaContainerRenderFixtureResult;
    } finally {
      yield* promise(() =>
        rm(workspace, {
          force: true,
          recursive: true,
        })
      );
    }
  });

const runProcess = (binary: string, args: readonly string[]) =>
  tryPromise({
    catch: (error) =>
      error instanceof Error
        ? error
        : new Error(`${binary} failed with an unknown error.`),
    try: async () => {
      const process = spawn([binary, ...args], {
        stderr: "pipe",
        stdout: "pipe",
      });
      const [stderr, exitCode] = await Promise.all([
        new Response(process.stderr).text(),
        process.exited,
      ]);

      if (exitCode !== 0) {
        throw new Error(`${binary} exited with ${exitCode}: ${stderr}`);
      }
    },
  });
