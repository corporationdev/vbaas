import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  initializeBrowserRenderer,
  launchBrowser,
  renderBrowserFrame,
  renderBrowserFrameToEndpoint,
} from "./browser-renderer";
import { buildBrowserRenderScene } from "./browser-scene";
import { createFrameReceiver, rendererHtml } from "./browser-server";
import type {
  RenderFrameSequenceInput,
  RenderFrameSequenceResult,
  RenderFrameStreamResult,
} from "./types";

export const renderFrameStream = ({
  outputDirectory,
  plan,
}: RenderFrameSequenceInput): RenderFrameStreamResult => ({
  frameRate: plan.canvas.fps,
  frames: createPngFrameStream({ outputDirectory, plan }),
});

export const renderFrameSequence = async ({
  outputDirectory,
  plan,
}: RenderFrameSequenceInput): Promise<RenderFrameSequenceResult> => {
  await mkdir(outputDirectory, { recursive: true });

  const rendererHtmlPath = join(outputDirectory, "renderer.html");
  await writeFile(rendererHtmlPath, rendererHtml);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewport({
      height: plan.canvas.height,
      width: plan.canvas.width,
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(rendererHtmlPath).href);

    const scene = buildBrowserRenderScene(plan);
    await page.evaluate(initializeBrowserRenderer, scene);

    for (let frame = 0; frame < plan.durationFrames; frame++) {
      const dataUrl = await page.evaluate(renderBrowserFrame, frame);
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const frameName = `frame-${frame.toString().padStart(6, "0")}.png`;
      await writeFile(join(outputDirectory, frameName), base64, "base64");
    }
  } finally {
    await browser.close();
  }

  return {
    framePattern: join(outputDirectory, "frame-%06d.png"),
    frameRate: plan.canvas.fps,
  };
};

async function* createPngFrameStream({
  outputDirectory,
  plan,
}: RenderFrameSequenceInput): AsyncIterable<Uint8Array> {
  await mkdir(outputDirectory, { recursive: true });

  const rendererHtmlPath = join(outputDirectory, "renderer.html");
  await writeFile(rendererHtmlPath, rendererHtml);

  const browser = await launchBrowser();
  const frameReceiver = await createFrameReceiver();

  try {
    const page = await browser.newPage();
    await page.setViewport({
      height: plan.canvas.height,
      width: plan.canvas.width,
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(rendererHtmlPath).href);

    const scene = buildBrowserRenderScene(plan);
    await page.evaluate(initializeBrowserRenderer, scene);

    for (let frame = 0; frame < plan.durationFrames; frame++) {
      const nextFrame = frameReceiver.nextFrame();
      await page.evaluate(renderBrowserFrameToEndpoint, {
        endpoint: frameReceiver.endpoint,
        frame,
      });
      yield await nextFrame;
    }
  } finally {
    await frameReceiver.close();
    await browser.close();
  }
}
