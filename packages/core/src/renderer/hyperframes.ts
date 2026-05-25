import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createRenderJob,
  executeRenderJob,
  type ProducerLogger,
} from "@hyperframes/producer";
import { Effect, Layer } from "effect";

import type { CaptionTrack, Layout, TextClip } from "../schema";
import { HyperframesFailed } from "./errors";
import { Hyperframes } from "./services";
import type { HtmlLayer, RenderCanvas, RenderOverlayInput } from "./types";

const compositionFileName = "overlay.html";
const compositionId = "vbaas-overlay-graphics";
const indexFileName = "index.html";
const rootCompositionId = "vbaas-overlay";
const noopLog = () => {
  return;
};
const silentProducerLogger: ProducerLogger = {
  debug: noopLog,
  error: noopLog,
  info: noopLog,
  isLevelEnabled: () => false,
  warn: noopLog,
};

export const HyperframesLive = Layer.succeed(Hyperframes, {
  renderOverlay: (input) =>
    Effect.tryPromise({
      catch: (error) =>
        new HyperframesFailed({
          message:
            error instanceof Error
              ? error.message
              : "Unable to render Hyperframes overlay.",
        }),
      try: async () => {
        const projectDir = join(input.tempDir, "hyperframes-overlay");
        const compositionsDir = join(projectDir, "compositions");

        await mkdir(compositionsDir, { recursive: true });
        await writeFile(
          join(projectDir, indexFileName),
          buildRootHtml(input),
          "utf8"
        );
        await writeFile(
          join(compositionsDir, compositionFileName),
          buildCompositionHtml(input),
          "utf8"
        );
        await executeRenderJob(
          createRenderJob({
            format: "mov",
            fps: input.plan.canvas.fps,
            logger: silentProducerLogger,
            quality: input.quality ?? "standard",
            workers: 1,
          }),
          projectDir,
          input.outputPath
        );

        return input.outputPath;
      },
    }),
});

const buildRootHtml = (input: RenderOverlayInput): string => {
  const { fps, height, width } = input.plan.canvas;
  const durationSeconds = framesToSeconds(input.plan.durationFrames, fps);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      html,
      body {
        width: ${width}px;
        height: ${height}px;
        margin: 0;
        overflow: hidden;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="${rootCompositionId}"
      data-start="0"
      data-duration="${formatSeconds(durationSeconds)}"
      data-width="${width}"
      data-height="${height}"
    >
      <div
        id="overlay-composition"
        data-composition-id="${compositionId}"
        data-composition-src="compositions/${compositionFileName}"
        data-start="0"
        data-duration="${formatSeconds(durationSeconds)}"
        data-track-index="0"
        data-width="${width}"
        data-height="${height}"
      ></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["${rootCompositionId}"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;
};

const buildCompositionHtml = (input: RenderOverlayInput): string => {
  const { fps, height, width } = input.plan.canvas;
  const durationSeconds = framesToSeconds(input.plan.durationFrames, fps);

  return `<template id="${compositionId}-template">
  <div
    data-composition-id="${compositionId}"
    data-width="${width}"
    data-height="${height}"
    data-duration="${formatSeconds(durationSeconds)}"
  >
    ${input.plan.htmlLayers
      .map((layer, layerIndex) =>
        htmlLayerToElement(layer, getDomId(layerIndex), input.plan.canvas)
      )
      .join("\n    ")}

    <style>
      [data-composition-id="${compositionId}"] {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        font-family: Inter, Arial, sans-serif;
      }

      .vbaas-overlay-layer {
        position: absolute;
        box-sizing: border-box;
        white-space: pre-wrap;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
    </style>

    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${input.plan.htmlLayers
        .map((layer, layerIndex) =>
          htmlLayerToTimeline(layer, getDomId(layerIndex), input.plan.canvas)
        )
        .join("\n      ")}
      window.__timelines["${compositionId}"] = tl;
    </script>
  </div>
</template>
`;
};

const htmlLayerToElement = (
  layer: HtmlLayer,
  domId: string,
  canvas: RenderCanvas
): string => {
  const style =
    layer.kind === "caption" && layer.track
      ? captionLayerStyle(layer.track, canvas)
      : textLayerStyle(layer.clip, canvas);

  return `<div
      id="${domId}"
      class="vbaas-overlay-layer"
      data-vbaas-layer-id="${escapeHtmlAttribute(layer.id)}"
      data-start="${formatSeconds(framesToSeconds(layer.startFrame, canvas.fps))}"
      data-duration="${formatSeconds(
        framesToSeconds(layer.durationFrames, canvas.fps)
      )}"
      data-track-index="${layer.kind === "caption" ? 1 : 0}"
      style="${escapeHtmlAttribute(style)}"
    >${escapeHtml(layer.text)}</div>`;
};

const htmlLayerToTimeline = (
  layer: HtmlLayer,
  domId: string,
  canvas: RenderCanvas
): string => {
  const startSeconds = framesToSeconds(layer.startFrame, canvas.fps);
  const endSeconds = framesToSeconds(
    layer.startFrame + layer.durationFrames,
    canvas.fps
  );

  return `tl.set("#${domId}", { opacity: ${formatNumber(
    getLayerOpacity(layer)
  )} }, ${formatSeconds(
    startSeconds
  )}); tl.set("#${domId}", { opacity: 0 }, ${formatSeconds(endSeconds)});`;
};

const getDomId = (layerIndex: number): string => `vbaas-overlay-${layerIndex}`;

const getLayerOpacity = (layer: HtmlLayer): number => {
  if (layer.kind === "text") {
    return layer.clip?.layout?.opacity ?? 1;
  }

  return 1;
};

const textLayerStyle = (
  clip: TextClip | undefined,
  canvas: RenderCanvas
): string => {
  const layout = getTextLayout(clip?.layout, canvas);
  const style = clip?.style;

  return styleObjectToString({
    color: style?.color ?? "#ffffff",
    "font-family": style?.fontFamily,
    "font-size": style?.fontSize ? `${style.fontSize}px` : "64px",
    "font-weight": style?.fontWeight,
    height: `${layout.height}px`,
    left: `${layout.x}px`,
    "line-height": style?.lineHeight ? `${style.lineHeight}px` : undefined,
    opacity: layout.opacity.toString(),
    "text-align": style?.align ?? "center",
    "text-shadow": "0 8px 28px rgba(0, 0, 0, 0.85)",
    top: `${layout.y}px`,
    transform: layout.rotation ? `rotate(${layout.rotation}deg)` : undefined,
    "-webkit-text-stroke": "2px rgba(0, 0, 0, 0.72)",
    width: `${layout.width}px`,
  });
};

const captionLayerStyle = (
  track: CaptionTrack,
  canvas: RenderCanvas
): string => {
  const maxWidth = track.layout.maxWidth ?? canvas.width * 0.86;
  const fontSize = track.style.fontSize ?? 42;
  const lineHeight = track.style.lineHeight ?? Math.round(fontSize * 1.2);
  const height = lineHeight * 2.4;
  const y = getCaptionY(track, canvas, height);

  return styleObjectToString({
    "background-color": track.style.backgroundColor ?? "rgba(0, 0, 0, 0.65)",
    "border-radius": "14px",
    color: track.style.color ?? "#ffffff",
    "font-family": track.style.fontFamily,
    "font-size": `${fontSize}px`,
    "font-weight": track.style.fontWeight,
    height: `${height}px`,
    left: `${(canvas.width - maxWidth) / 2}px`,
    "line-height": `${lineHeight}px`,
    padding: "22px 34px",
    "text-shadow": "0 7px 22px rgba(0, 0, 0, 0.8)",
    "text-align": track.layout.align ?? "center",
    "text-transform": "uppercase",
    top: `${y}px`,
    "-webkit-text-stroke": "2px rgba(0, 0, 0, 0.65)",
    width: `${maxWidth}px`,
  });
};

const getTextLayout = (
  layout: Layout | undefined,
  canvas: RenderCanvas
): Required<
  Pick<Layout, "height" | "opacity" | "rotation" | "width" | "x" | "y">
> => ({
  height: layout?.height ?? canvas.height,
  opacity: layout?.opacity ?? 1,
  rotation: layout?.rotation ?? 0,
  width: layout?.width ?? canvas.width,
  x: layout?.x ?? 0,
  y: layout?.y ?? 0,
});

const getCaptionY = (
  track: CaptionTrack,
  canvas: RenderCanvas,
  height: number
): number => {
  if (track.layout.position === "top") {
    return canvas.height * 0.1;
  }

  if (track.layout.position === "center") {
    return (canvas.height - height) / 2;
  }

  return canvas.height - height - canvas.height * 0.1;
};

const styleObjectToString = (
  styles: Readonly<Record<string, string | undefined>>
): string =>
  Object.entries(styles)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const escapeHtmlAttribute = escapeHtml;

const framesToSeconds = (frames: number, fps: number): number => frames / fps;

const formatSeconds = (seconds: number): string =>
  Number.isInteger(seconds) ? seconds.toString() : seconds.toFixed(6);

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? value.toString() : value.toFixed(6);
