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
const highAudioPath = join(renderTestDir, "tone-high.wav");
const shortAudioPath = join(renderTestDir, "tone-short.wav");
const trimSourceAudioPath = join(renderTestDir, "tone-trim-source.wav");
const audioMixOutputPath = join(renderTestDir, "audio-mix-output.mp4");
const audioNoTrackOutputPath = join(renderTestDir, "audio-no-track-output.mp4");
const audioOffsetOutputPath = join(renderTestDir, "audio-offset-output.mp4");
const audioLongOutputPath = join(renderTestDir, "audio-long-output.mp4");
const audioShortOutputPath = join(renderTestDir, "audio-short-output.mp4");
const audioSourceTrimOutputPath = join(
  renderTestDir,
  "audio-source-trim-output.mp4"
);
const canonicalOutputPath = join(renderTestDir, "canonical-output.mp4");
const imagePath = join(renderTestDir, "overlay.png");
const sourcePath = join(renderTestDir, "source.mp4");
const textDecoder = new TextDecoder();
const audioContractDurationFrames = 120;
const audioContractDurationSeconds = 4;
const longAudioDurationFrames = 180;
const longAudioDurationSeconds = 6;
const shortAudioDurationFrames = 30;
const shortAudioDurationSeconds = 1;
const silentRmsThreshold = 0.002;
const audibleRmsThreshold = 0.01;
const testDurationFrames = 300;
const testDurationSeconds = 10;
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
      `color=c=#18204a:s=${tiktokCanvas.width}x${tiktokCanvas.height}:r=30:d=${testDurationSeconds}`,
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
      `sine=frequency=440:duration=${testDurationSeconds}`,
      audioPath,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=880:duration=${testDurationSeconds}`,
      highAudioPath,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=660:duration=${shortAudioDurationSeconds}`,
      shortAudioPath,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=mono:sample_rate=44100:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=550:duration=3",
      "-filter_complex",
      "[0:a][1:a]concat=n=2:v=0:a=1",
      trimSourceAudioPath,
    ]);
  });

  test("renders video, image overlays, audio, text, and captions", async () => {
    const composition = decodeComposition({
      assets: [
        {
          durationFrames: testDurationFrames,
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
          durationFrames: testDurationFrames,
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
              durationFrames: testDurationFrames,
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
              durationFrames: testDurationFrames,
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
              durationFrames: testDurationFrames,
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
              durationFrames: testDurationFrames,
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
              durationFrames: 150,
              startFrame: 150,
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
      5.7
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
    expect(Number(probe.format.duration)).toBeCloseTo(testDurationSeconds, 1);
    expect(imageOverlayPixel.red).toBeGreaterThan(150);
    expect(imageOverlayPixel.blue).toBeLessThan(100);
    expect(hiddenCaptionPixel.red).toBeLessThan(80);
    expect(hiddenCaptionPixel.green).toBeLessThan(90);
    expect(captionOverlayPixel.red).toBeGreaterThan(150);
    expect(captionOverlayPixel.green).toBeGreaterThan(150);
    expect(captionOverlayPixel.blue).toBeLessThan(120);
  }, 120_000);

  test("mixes multiple audio tracks with independent start offsets", async () => {
    await renderAudioContractComposition({
      audioClips: [
        {
          assetId: "tone-audio",
          durationFrames: audioContractDurationFrames,
          id: "base-tone",
          startFrame: 0,
          volume: 0.35,
        },
        {
          assetId: "high-tone-audio",
          durationFrames: 60,
          id: "delayed-high-tone",
          startFrame: 60,
          volume: 0.35,
        },
      ],
      audioTracks: 2,
      id: "audio-mix-contract",
      outputPath: audioMixOutputPath,
    });

    const singleToneRms = await readAudioRms(audioMixOutputPath, 1);
    const mixedToneRms = await readAudioRms(audioMixOutputPath, 2.5);

    expect(singleToneRms).toBeGreaterThan(audibleRmsThreshold);
    expect(mixedToneRms).toBeGreaterThan(singleToneRms * 1.15);
  }, 120_000);

  test("honors audio start offsets and clip trimming", async () => {
    await renderAudioContractComposition({
      audioClips: [
        {
          assetId: "tone-audio",
          durationFrames: 30,
          id: "trimmed-offset-tone",
          startFrame: 30,
          volume: 0.8,
        },
      ],
      id: "audio-offset-trim-contract",
      outputPath: audioOffsetOutputPath,
    });

    const beforeClipRms = await readAudioRms(audioOffsetOutputPath, 0.5);
    const duringClipRms = await readAudioRms(audioOffsetOutputPath, 1.25);
    const afterClipRms = await readAudioRms(audioOffsetOutputPath, 2.25);

    expect(beforeClipRms).toBeLessThan(silentRmsThreshold);
    expect(duringClipRms).toBeGreaterThan(audibleRmsThreshold);
    expect(afterClipRms).toBeLessThan(silentRmsThreshold);
  }, 120_000);

  test("honors source trimming inside audio assets", async () => {
    await renderAudioContractComposition({
      audioClips: [
        {
          assetId: "trim-source-audio",
          durationFrames: 30,
          id: "source-trimmed-tone",
          sourceStartFrame: 30,
          startFrame: 0,
          volume: 0.8,
        },
      ],
      id: "audio-source-trim-contract",
      outputPath: audioSourceTrimOutputPath,
    });

    const sourceTrimmedRms = await readAudioRms(
      audioSourceTrimOutputPath,
      0.25
    );

    expect(sourceTrimmedRms).toBeGreaterThan(audibleRmsThreshold);
  }, 120_000);

  test("omits the audio stream when the composition has no audio tracks", async () => {
    await renderAudioContractComposition({
      audioClips: [],
      id: "no-audio-contract",
      outputPath: audioNoTrackOutputPath,
    });

    const probe = await probeVideo(audioNoTrackOutputPath);

    expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(
      false
    );
    expect(Number(probe.format.duration)).toBeCloseTo(
      audioContractDurationSeconds,
      1
    );
  }, 120_000);

  test("pads shorter audio with silence to the video duration", async () => {
    await renderAudioContractComposition({
      audioClips: [
        {
          assetId: "short-tone-audio",
          durationFrames: shortAudioDurationFrames,
          id: "short-tone",
          startFrame: 0,
          volume: 0.8,
        },
      ],
      id: "short-audio-contract",
      outputPath: audioShortOutputPath,
    });

    const probe = await probeVideo(audioShortOutputPath);
    const duringAudioRms = await readAudioRms(audioShortOutputPath, 0.5);
    const afterAudioRms = await readAudioRms(audioShortOutputPath, 2.5);

    expect(Number(probe.format.duration)).toBeCloseTo(
      audioContractDurationSeconds,
      1
    );
    expect(duringAudioRms).toBeGreaterThan(audibleRmsThreshold);
    expect(afterAudioRms).toBeLessThan(silentRmsThreshold);
  }, 120_000);

  test("lets longer audio define the render duration when no explicit duration is set", async () => {
    await renderAudioContractComposition({
      audioClips: [
        {
          assetId: "tone-audio",
          durationFrames: longAudioDurationFrames,
          id: "long-tone",
          startFrame: 0,
          volume: 0.8,
        },
      ],
      durationFrames: null,
      id: "long-audio-contract",
      outputPath: audioLongOutputPath,
    });

    const probe = await probeVideo(audioLongOutputPath);
    const lateAudioRms = await readAudioRms(audioLongOutputPath, 5);

    expect(Number(probe.format.duration)).toBeCloseTo(
      longAudioDurationSeconds,
      1
    );
    expect(lateAudioRms).toBeGreaterThan(audibleRmsThreshold);
  }, 120_000);
});

const decodeComposition = (input: unknown): VbaasComposition =>
  decodeUnknownSync(vbaasCompositionSchema)(input);

interface AudioContractClip {
  readonly assetId: string;
  readonly durationFrames: number;
  readonly id: string;
  readonly sourceStartFrame?: number;
  readonly startFrame: number;
  readonly volume: number;
}

const renderAudioContractComposition = async ({
  audioClips,
  audioTracks = 1,
  durationFrames,
  id,
  outputPath,
}: {
  readonly audioClips: readonly AudioContractClip[];
  readonly audioTracks?: number;
  readonly durationFrames?: number | null;
  readonly id: string;
  readonly outputPath: string;
}): Promise<void> => {
  const tracks: VbaasComposition["tracks"] = [
    {
      clips: [
        {
          durationFrames: audioContractDurationFrames,
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
  ];

  for (let index = 0; index < audioTracks; index += 1) {
    const clips = audioClips.filter((_, clipIndex) => clipIndex === index);

    if (clips.length === 0) {
      continue;
    }

    tracks.push({
      clips: clips.map((clip) => ({
        durationFrames: clip.durationFrames,
        id: clip.id,
        media: {
          assetId: clip.assetId,
          sourceStartFrame: clip.sourceStartFrame ?? 0,
        },
        startFrame: clip.startFrame,
        type: "audio",
        volume: clip.volume,
      })),
      id: `audio-track-${index}`,
      kind: "audio",
    });
  }

  const composition = decodeComposition({
    assets: [
      {
        durationFrames: testDurationFrames,
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
        durationFrames: testDurationFrames,
        id: "tone-audio",
        source: {
          kind: "file",
          path: "tmp/render-tests/tone.wav",
        },
        type: "audio",
      },
      {
        durationFrames: testDurationFrames,
        id: "high-tone-audio",
        source: {
          kind: "file",
          path: "tmp/render-tests/tone-high.wav",
        },
        type: "audio",
      },
      {
        durationFrames: audioContractDurationFrames,
        id: "trim-source-audio",
        source: {
          kind: "file",
          path: "tmp/render-tests/tone-trim-source.wav",
        },
        type: "audio",
      },
      {
        durationFrames: shortAudioDurationFrames,
        id: "short-tone-audio",
        source: {
          kind: "file",
          path: "tmp/render-tests/tone-short.wav",
        },
        type: "audio",
      },
    ],
    ...(durationFrames === null
      ? {}
      : { durationFrames: durationFrames ?? audioContractDurationFrames }),
    id,
    schemaVersion: "0.1",
    settings: {
      canvas: tiktokCanvas,
      fps: 30,
    },
    tracks,
  });

  await Effect.runPromise(
    renderComposition({
      composition,
      outputPath,
      projectRoot: packageRoot,
      quality: "high",
    }).pipe(Effect.provide(RendererLive))
  );
};

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

const readAudioRms = async (
  path: string,
  seekSeconds: number,
  durationSeconds = 0.25
): Promise<number> => {
  const result = await runProcess("ffmpeg", [
    "-v",
    "error",
    "-ss",
    seekSeconds.toString(),
    "-t",
    durationSeconds.toString(),
    "-i",
    path,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-f",
    "f32le",
    "-",
  ]);
  const view = new DataView(result.stdout);
  const sampleCount = Math.floor(
    view.byteLength / Float32Array.BYTES_PER_ELEMENT
  );

  if (sampleCount === 0) {
    return 0;
  }

  let sumSquares = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = view.getFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      true
    );
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / sampleCount);
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
