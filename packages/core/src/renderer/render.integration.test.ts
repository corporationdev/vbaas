import { beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "bun";

import { Effect } from "effect";
import { decodeUnknownSync } from "effect/Schema";

import { type VbaasComposition, vbaasCompositionSchema } from "../schema";
import { RendererLive, renderComposition } from "./index";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const renderTestDir = join(packageRoot, "tmp", "render-tests");
const audioPath = join(renderTestDir, "tone.wav");
const canonicalOutputPath = join(renderTestDir, "canonical-output.mp4");
const imagePath = join(renderTestDir, "overlay.png");
const sourcePath = join(renderTestDir, "source.mp4");
const textDecoder = new TextDecoder();
const tiktokCanvas = {
  height: 1920,
  width: 1080,
} as const;

describe("RendererLive integration", () => {
  beforeAll(async () => {
    await rm(renderTestDir, {
      force: true,
      recursive: true,
    });
    await mkdir(renderTestDir, {
      recursive: true,
    });
    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=#18204a:s=${tiktokCanvas.width}x${tiktokCanvas.height}:r=30:d=1`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      sourcePath,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=360x360",
      "-frames:v",
      "1",
      imagePath,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      audioPath,
    ]);
  });

  test("renders video, image overlays, audio, text, and captions", async () => {
    const composition = decodeComposition({
      assets: [
        {
          durationFrames: 30,
          fps: 30,
          height: tiktokCanvas.height,
          id: "source-video",
          source: {
            kind: "file",
            path: "tmp/render-tests/source.mp4",
          },
          type: "video",
          width: tiktokCanvas.width,
        },
        {
          height: 360,
          id: "overlay-image",
          source: {
            kind: "file",
            path: "tmp/render-tests/overlay.png",
          },
          type: "image",
          width: 360,
        },
        {
          durationFrames: 30,
          id: "tone-audio",
          source: {
            kind: "file",
            path: "tmp/render-tests/tone.wav",
          },
          type: "audio",
        },
      ],
      id: "layered-render",
      schemaVersion: "0.1",
      settings: {
        canvas: tiktokCanvas,
        fps: 30,
      },
      tracks: [
        {
          clips: [
            {
              durationFrames: 30,
              id: "background-video",
              media: {
                assetId: "source-video",
              },
              startFrame: 0,
              type: "video",
            },
          ],
          id: "background-track",
          kind: "visual",
        },
        {
          clips: [
            {
              assetId: "overlay-image",
              durationFrames: 30,
              id: "image-overlay",
              layout: {
                fit: "fill",
                height: 360,
                width: 360,
                x: 360,
                y: 620,
              },
              startFrame: 0,
              type: "image",
            },
          ],
          id: "overlay-track",
          kind: "visual",
        },
        {
          clips: [
            {
              durationFrames: 30,
              id: "tone",
              media: {
                assetId: "tone-audio",
              },
              startFrame: 0,
              type: "audio",
              volume: 0.5,
            },
          ],
          id: "audio-track",
          kind: "audio",
        },
        {
          clips: [
            {
              durationFrames: 30,
              id: "title",
              layout: {
                fit: "fill",
                height: 140,
                width: 1080,
                x: 0,
                y: 96,
              },
              startFrame: 0,
              style: {
                color: "#ffffff",
                fontSize: 86,
                fontWeight: "bold",
              },
              text: "VBaaS",
              type: "text",
            },
          ],
          id: "text-track",
          kind: "text",
        },
        {
          cues: [
            {
              durationFrames: 15,
              startFrame: 15,
              text: "AI VIDEO INFRA",
            },
          ],
          id: "caption-track",
          kind: "caption",
          layout: {
            maxWidth: 920,
            position: "bottom",
          },
          style: {
            backgroundColor: "#ffe600",
            color: "#000000",
            fontSize: 96,
            fontWeight: "bold",
            lineHeight: 108,
          },
        },
      ],
    });

    const result = await Effect.runPromise(
      renderComposition({
        composition,
        outputPath: canonicalOutputPath,
        projectRoot: packageRoot,
        quality: "high",
      }).pipe(Effect.provide(RendererLive))
    );
    const outputStats = await stat(canonicalOutputPath);
    const probe = await probeVideo(canonicalOutputPath);
    const imageOverlayPixel = await readRgbPixel(canonicalOutputPath, 540, 800);
    const hiddenCaptionPixel = await readRgbPixel(
      canonicalOutputPath,
      540,
      1500
    );
    const captionOverlayPixel = await readRgbPixel(
      canonicalOutputPath,
      540,
      1500,
      0.7
    );

    expect(result.outputPath).toBe(canonicalOutputPath);
    expect(outputStats.size).toBeGreaterThan(0);
    expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(
      true
    );
    expect(
      probe.streams.some(
        (stream) =>
          stream.codec_type === "video" &&
          stream.width === tiktokCanvas.width &&
          stream.height === tiktokCanvas.height
      )
    ).toBe(true);
    expect(Number(probe.format.duration)).toBeCloseTo(1, 1);
    expect(imageOverlayPixel.red).toBeGreaterThan(150);
    expect(imageOverlayPixel.blue).toBeLessThan(100);
    expect(hiddenCaptionPixel.red).toBeLessThan(80);
    expect(hiddenCaptionPixel.green).toBeLessThan(90);
    expect(captionOverlayPixel.red).toBeGreaterThan(150);
    expect(captionOverlayPixel.green).toBeGreaterThan(150);
    expect(captionOverlayPixel.blue).toBeLessThan(120);
  }, 60_000);
});

const decodeComposition = (input: unknown): VbaasComposition =>
  decodeUnknownSync(vbaasCompositionSchema)(input);

interface ProbeResult {
  readonly format: {
    readonly duration: string;
  };
  readonly streams: ReadonlyArray<{
    readonly codec_type: "audio" | "video";
    readonly height?: number;
    readonly width?: number;
  }>;
}

const probeVideo = async (path: string): Promise<ProbeResult> => {
  const result = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_type,width,height:format=duration",
    "-of",
    "json",
    path,
  ]);

  return JSON.parse(textDecoder.decode(result.stdout)) as ProbeResult;
};

const readRgbPixel = async (
  path: string,
  x: number,
  y: number,
  seekSeconds = 0
): Promise<{
  readonly blue: number;
  readonly green: number;
  readonly red: number;
}> => {
  const seekArgs =
    seekSeconds > 0 ? ["-ss", seekSeconds.toString()] : ([] as string[]);
  const result = await runProcess("ffmpeg", [
    "-v",
    "error",
    ...seekArgs,
    "-i",
    path,
    "-vf",
    `format=rgb24,crop=1:1:${x}:${y}`,
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-",
  ]);
  const bytes = new Uint8Array(result.stdout);

  return {
    blue: bytes[2] ?? 0,
    green: bytes[1] ?? 0,
    red: bytes[0] ?? 0,
  };
};

const runProcess = async (
  binary: string,
  args: readonly string[]
): Promise<{ readonly stderr: string; readonly stdout: ArrayBuffer }> => {
  const process = spawn([binary, ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).arrayBuffer(),
    new Response(process.stderr).text(),
    process.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`${binary} failed with ${exitCode}: ${stderr}`);
  }

  return {
    stderr,
    stdout,
  };
};
