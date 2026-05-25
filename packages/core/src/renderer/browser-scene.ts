import { fileURLToPath, pathToFileURL } from "node:url";

import type { HtmlLayer, RenderPlan, VisualLayer } from "./types";

const defaultTextColor = "#ffffff";

export interface BrowserRenderScene {
  readonly canvas: {
    readonly fps: number;
    readonly height: number;
    readonly width: number;
  };
  readonly durationFrames: number;
  readonly layers: BrowserRenderLayer[];
}

export type BrowserRenderLayer =
  | BrowserCaptionLayer
  | BrowserMediaLayer
  | BrowserTextLayer;

export interface BrowserMediaLayer {
  readonly assetUrl: string;
  readonly durationFrames: number;
  readonly fit: "contain" | "cover" | "fill" | "none";
  readonly height: number;
  readonly id: string;
  readonly opacity: number;
  readonly playbackRate: number;
  readonly rotation: number;
  readonly sourceStartFrame: number;
  readonly startFrame: number;
  readonly type: "image" | "video";
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface BrowserTextLayer {
  readonly align: "center" | "left" | "right";
  readonly color: string;
  readonly durationFrames: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly height: number;
  readonly id: string;
  readonly lineHeight: number;
  readonly opacity: number;
  readonly rotation: number;
  readonly startFrame: number;
  readonly text: string;
  readonly type: "text";
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface BrowserCaptionLayer {
  readonly align: "center" | "left" | "right";
  readonly backgroundColor: string;
  readonly color: string;
  readonly durationFrames: number;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: string;
  readonly id: string;
  readonly lineHeight: number;
  readonly maxWidth: number;
  readonly position: "bottom" | "center" | "top";
  readonly startFrame: number;
  readonly text: string;
  readonly type: "caption";
}

export const buildBrowserRenderScene = (
  plan: RenderPlan
): BrowserRenderScene => ({
  canvas: plan.canvas,
  durationFrames: plan.durationFrames,
  layers: [
    ...plan.visualLayers
      .map((visualLayer) => visualLayerToBrowserLayer(visualLayer, plan))
      .filter((layer) => layer !== undefined),
    ...plan.htmlLayers.map((htmlLayer) =>
      htmlLayerToBrowserLayer(htmlLayer, plan)
    ),
  ].toSorted((a, b) => getLayerOrder(a) - getLayerOrder(b)),
});

export const withBrowserServedAssets = (
  scene: BrowserRenderScene,
  origin: string
): BrowserRenderScene => ({
  ...scene,
  layers: scene.layers.map((layer) => {
    if (layer.type !== "image" && layer.type !== "video") {
      return layer;
    }

    if (!layer.assetUrl.startsWith("file://")) {
      return layer;
    }

    return {
      ...layer,
      assetUrl: `${origin}/asset?path=${encodeURIComponent(
        fileURLToPath(layer.assetUrl)
      )}`,
    };
  }),
});

const visualLayerToBrowserLayer = (
  visualLayer: VisualLayer,
  plan: RenderPlan
): BrowserRenderLayer | undefined => {
  const mediaInput = plan.inputs.find(
    (input) => input.inputIndex === visualLayer.inputIndex
  );

  if (!mediaInput) {
    return;
  }

  const layout = resolveLayout({
    height: plan.canvas.height,
    layout: visualLayer.layout,
    width: plan.canvas.width,
  });

  return {
    ...layout,
    assetUrl: sourceToBrowserUrl(mediaInput.asset.resolvedSource),
    durationFrames: visualLayer.durationFrames,
    id: visualLayer.clipId,
    playbackRate: mediaInput.playbackRate,
    sourceStartFrame: mediaInput.sourceStartFrame,
    startFrame: visualLayer.startFrame,
    type: visualLayer.type,
  };
};

const htmlLayerToBrowserLayer = (
  htmlLayer: HtmlLayer,
  plan: RenderPlan
): BrowserRenderLayer => {
  const track = htmlLayer.track;

  if (htmlLayer.kind === "caption" && track) {
    return captionLayerToBrowserLayer(htmlLayer, track, plan);
  }

  return textLayerToBrowserLayer(htmlLayer, plan);
};

const captionLayerToBrowserLayer = (
  htmlLayer: HtmlLayer,
  track: NonNullable<HtmlLayer["track"]>,
  plan: RenderPlan
): BrowserRenderLayer => ({
  align: track.layout.align ?? "center",
  backgroundColor: track.style.backgroundColor ?? "rgba(0, 0, 0, 0.65)",
  color: track.style.color ?? defaultTextColor,
  durationFrames: htmlLayer.durationFrames,
  fontFamily: track.style.fontFamily ?? "Inter",
  fontSize: track.style.fontSize ?? 42,
  fontWeight: track.style.fontWeight ?? "700",
  id: htmlLayer.id,
  lineHeight:
    track.style.lineHeight ?? Math.round((track.style.fontSize ?? 42) * 1.2),
  maxWidth: track.layout.maxWidth ?? plan.canvas.width * 0.86,
  position: track.layout.position ?? "bottom",
  startFrame: htmlLayer.startFrame,
  text: htmlLayer.text,
  type: "caption",
});

const textLayerToBrowserLayer = (
  htmlLayer: HtmlLayer,
  plan: RenderPlan
): BrowserRenderLayer => {
  const layout = resolveLayout({
    height: plan.canvas.height,
    layout: htmlLayer.clip?.layout,
    width: plan.canvas.width,
  });

  return {
    align: htmlLayer.clip?.style.align ?? "center",
    color: htmlLayer.clip?.style.color ?? defaultTextColor,
    durationFrames: htmlLayer.durationFrames,
    fontFamily: htmlLayer.clip?.style.fontFamily ?? "Inter",
    fontSize: htmlLayer.clip?.style.fontSize ?? 64,
    fontWeight: htmlLayer.clip?.style.fontWeight ?? "700",
    height: layout.height,
    id: htmlLayer.id,
    lineHeight:
      htmlLayer.clip?.style.lineHeight ??
      (htmlLayer.clip?.style.fontSize ?? 64) * 1.18,
    opacity: layout.opacity,
    rotation: layout.rotation,
    startFrame: htmlLayer.startFrame,
    text: htmlLayer.text,
    type: "text",
    width: layout.width,
    x: layout.x,
    y: layout.y,
  };
};

const sourceToBrowserUrl = (source: string): string => {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return source;
  }

  return pathToFileURL(source).href;
};

const resolveLayout = ({
  height,
  layout,
  width,
}: {
  readonly height: number;
  readonly layout: RenderPlan["visualLayers"][number]["layout"];
  readonly width: number;
}) => ({
  fit: layout?.fit ?? "cover",
  height: layout?.height ?? height,
  opacity: layout?.opacity ?? 1,
  rotation: layout?.rotation ?? 0,
  width: layout?.width ?? width,
  x: layout?.x ?? 0,
  y: layout?.y ?? 0,
});

const getLayerOrder = (layer: BrowserRenderLayer): number => {
  if (layer.type === "image" || layer.type === "video") {
    return 0;
  }

  if (layer.type === "text") {
    return 1;
  }

  return 2;
};
