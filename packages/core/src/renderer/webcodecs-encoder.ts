import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { initializeBrowserRenderer, launchBrowser } from "./browser-renderer";
import {
  buildBrowserRenderScene,
  withBrowserServedAssets,
} from "./browser-scene";
import { createStaticFileServer } from "./browser-server";
import type {
  RenderEncodedVideoResult,
  RenderFrameSequenceInput,
} from "./types";

export const renderEncodedVideo = async ({
  outputDirectory,
  plan,
}: RenderFrameSequenceInput): Promise<RenderEncodedVideoResult> => {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "mediabunny.mjs"),
    await readMediabunnyBrowserBundle()
  );

  const browser = await launchBrowser();
  const moduleServer = await createStaticFileServer(outputDirectory);

  try {
    const page = await browser.newPage();
    await page.setViewport({
      height: plan.canvas.height,
      width: plan.canvas.width,
      deviceScaleFactor: 1,
    });
    await page.goto(`${moduleServer.origin}/renderer.html`);

    const scene = withBrowserServedAssets(
      buildBrowserRenderScene(plan),
      moduleServer.origin
    );
    await page.evaluate(initializeBrowserRenderer, scene);

    const encodedVideoBytes = await page.evaluate(encodeBrowserVideo, {
      durationFrames: plan.durationFrames,
      fps: plan.canvas.fps,
      mediabunnyUrl: `${moduleServer.origin}/mediabunny.mjs`,
    });
    const outputPath = join(outputDirectory, "webcodecs-video.mp4");
    await writeFile(outputPath, Buffer.from(encodedVideoBytes));

    return {
      path: outputPath,
    };
  } finally {
    await moduleServer.close();
    await browser.close();
  }
};

const readMediabunnyBrowserBundle = async (): Promise<string> => {
  const candidates = [
    resolve(
      process.cwd(),
      "node_modules/mediabunny/dist/bundles/mediabunny.mjs"
    ),
    resolve(
      import.meta.dirname,
      "../../node_modules/mediabunny/dist/bundles/mediabunny.mjs"
    ),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Try the next known install layout.
    }
  }

  throw new Error("Unable to locate mediabunny browser bundle.");
};

async function encodeBrowserVideo({
  durationFrames,
  fps,
  mediabunnyUrl,
}: {
  durationFrames: number;
  fps: number;
  mediabunnyUrl: string;
}): Promise<number[]> {
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } =
    await import(mediabunnyUrl);
  const canvas = document.getElementById("frame") as HTMLCanvasElement | null;

  if (!canvas) {
    throw new Error("Frame canvas not found.");
  }

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    bitrate: QUALITY_HIGH,
    codec: "avc",
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  await output.start();

  const renderReady = (
    window as typeof window & { __vbaasRenderReady?: Promise<void> }
  ).__vbaasRenderReady;
  const renderFrame = (
    window as typeof window & {
      __vbaasRenderFrame?: (frame: number) => Promise<void>;
    }
  ).__vbaasRenderFrame;

  if (!renderFrame) {
    throw new Error("Browser renderer was not initialized.");
  }

  await renderReady;

  for (let frame = 0; frame < durationFrames; frame++) {
    await renderFrame(frame);
    await videoSource.add(frame / fps, 1 / fps);
  }

  await output.finalize();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("Mediabunny did not produce an output buffer.");
  }

  return Array.from(new Uint8Array(buffer));
}
