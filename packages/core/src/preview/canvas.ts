import type { CaptionTrack, Layout, TextClip } from "../schema";
import { resolvePreviewFrame } from "./scene";
import type {
  CanvasPreviewRenderer,
  PreviewAssetProvider,
  PreviewLayer,
  PreviewRenderScene,
} from "./types";

const defaultBackground = "#050507";
const defaultTextColor = "#ffffff";
const defaultTextShadowColor = "rgba(0, 0, 0, 0.72)";
const maxPreviewPixels = 1280 * 720;
const whitespacePattern = /\s+/;

interface ResolvedLayout {
  readonly fit: "contain" | "cover" | "fill" | "none";
  readonly height: number;
  readonly opacity: number;
  readonly rotation: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

type PreparedPreviewLayer =
  | {
      readonly layer: Extract<PreviewLayer, { readonly type: "image" }>;
      readonly source: CanvasImageSource;
      readonly type: "media";
    }
  | {
      readonly layer: Extract<PreviewLayer, { readonly type: "video" }>;
      readonly source: HTMLVideoElement;
      readonly type: "media";
    }
  | {
      readonly layer: Extract<PreviewLayer, { readonly type: "caption" }>;
      readonly type: "caption";
    }
  | {
      readonly layer: Extract<PreviewLayer, { readonly type: "text" }>;
      readonly type: "text";
    };

export const createCanvasPreviewRenderer = (): CanvasPreviewRenderer => {
  let latestRenderId = 0;

  return {
    renderFrame: async ({ assetProvider, canvas, frame, quality, scene }) => {
      const renderId = latestRenderId + 1;
      latestRenderId = renderId;

      sizeCanvas({ canvas, scene, quality });

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create preview canvas context.");
      }

      const resolvedFrame = resolvePreviewFrame({ frame, scene });
      const preparedLayers: PreparedPreviewLayer[] = [];

      for (const layer of resolvedFrame.activeLayers) {
        const preparedLayer = await prepareLayer({
          assetProvider,
          frame,
          layer,
          scene,
        });

        if (renderId !== latestRenderId) {
          return;
        }

        if (preparedLayer) {
          preparedLayers.push(preparedLayer);
        }
      }

      if (renderId !== latestRenderId) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = defaultBackground;
      context.fillRect(0, 0, canvas.width, canvas.height);

      for (const preparedLayer of preparedLayers) {
        drawPreparedLayer({
          canvas,
          context,
          preparedLayer,
        });
      }
    },
  };
};

const sizeCanvas = ({
  canvas,
  quality,
  scene,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly quality: "draft" | "standard" | undefined;
  readonly scene: PreviewRenderScene;
}) => {
  const { width, height } = scene.composition.settings.canvas;
  const scale =
    quality === "draft"
      ? Math.min(1, Math.sqrt(maxPreviewPixels / (width * height)))
      : 1;
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));

  if (canvas.width !== nextWidth) {
    canvas.width = nextWidth;
  }

  if (canvas.height !== nextHeight) {
    canvas.height = nextHeight;
  }
};

const prepareLayer = async ({
  assetProvider,
  frame,
  layer,
  scene,
}: {
  readonly assetProvider: PreviewAssetProvider;
  readonly frame: number;
  readonly layer: PreviewLayer;
  readonly scene: PreviewRenderScene;
}): Promise<PreparedPreviewLayer | undefined> => {
  if (layer.type === "image") {
    const source = await assetProvider.getImageSource(layer.assetId);
    if (!source) {
      return;
    }

    return { layer, source, type: "media" };
  }

  if (layer.type === "video") {
    const source = await assetProvider.getVideoSource(layer.assetId);
    if (!source || source.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }
    const fps = scene.composition.settings.fps;
    const sourceFrame =
      layer.sourceStartFrame + Math.max(0, frame - layer.startFrame);
    const sourceTimeSeconds = sourceFrame / fps;

    if (Number.isFinite(sourceTimeSeconds)) {
      await seekVideoSource({ source, timeSeconds: sourceTimeSeconds });
    }

    return { layer, source, type: "media" };
  }

  if (layer.type === "caption") {
    return { layer, type: "caption" };
  }

  return { layer, type: "text" };
};

const drawPreparedLayer = ({
  canvas,
  context,
  preparedLayer,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly preparedLayer: PreparedPreviewLayer;
}) => {
  if (preparedLayer.type === "media") {
    drawMediaLayer({
      canvas,
      context,
      layout: preparedLayer.layer.layout,
      source: preparedLayer.source,
    });
    return;
  }

  if (preparedLayer.type === "caption") {
    drawCaptionLayer({
      canvas,
      context,
      text: preparedLayer.layer.text,
      track: preparedLayer.layer.track,
    });
    return;
  }

  drawTextLayer({
    canvas,
    clip: preparedLayer.layer.clip,
    context,
    layout: preparedLayer.layer.layout,
    text: preparedLayer.layer.text,
  });
};

const seekVideoSource = async ({
  source,
  timeSeconds,
}: {
  readonly source: HTMLVideoElement;
  readonly timeSeconds: number;
}) => {
  const duration = Number.isFinite(source.duration)
    ? source.duration
    : undefined;
  const targetTime =
    duration === undefined
      ? timeSeconds
      : Math.min(Math.max(timeSeconds, 0), Math.max(0, duration - 0.001));

  if (Math.abs(source.currentTime - targetTime) < 0.016) {
    return;
  }

  await new Promise<void>((resolve) => {
    const onSeeked = () => {
      source.removeEventListener("seeked", onSeeked);
      resolve();
    };

    source.addEventListener("seeked", onSeeked, { once: true });
    source.currentTime = targetTime;
  });
};

const drawMediaLayer = ({
  canvas,
  context,
  layout,
  source,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly layout: Layout | undefined;
  readonly source: CanvasImageSource;
}) => {
  const resolvedLayout = resolveLayout({ canvas, layout });
  const sourceWidth = getSourceWidth(source);
  const sourceHeight = getSourceHeight(source);

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return;
  }

  const drawRect = getFittedRect({
    fit: resolvedLayout.fit,
    height: resolvedLayout.height,
    sourceHeight,
    sourceWidth,
    width: resolvedLayout.width,
  });

  context.save();
  context.globalAlpha = resolvedLayout.opacity;
  context.translate(
    resolvedLayout.x + resolvedLayout.width / 2,
    resolvedLayout.y + resolvedLayout.height / 2
  );
  context.rotate((resolvedLayout.rotation * Math.PI) / 180);
  context.drawImage(
    source,
    drawRect.x - resolvedLayout.width / 2,
    drawRect.y - resolvedLayout.height / 2,
    drawRect.width,
    drawRect.height
  );
  context.restore();
};

const drawTextLayer = ({
  canvas,
  clip,
  context,
  layout,
  text,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly clip: TextClip;
  readonly context: CanvasRenderingContext2D;
  readonly layout: Layout | undefined;
  readonly text: string;
}) => {
  const resolvedLayout = resolveLayout({ canvas, layout });
  const fontSize = clip.style.fontSize ?? 64;
  const lineHeight = clip.style.lineHeight ?? fontSize * 1.18;
  const lines = wrapText({
    context,
    font: buildFontString({ clip, fontSize }),
    maxWidth: resolvedLayout.width,
    text,
  });

  context.save();
  context.globalAlpha = resolvedLayout.opacity;
  context.translate(
    resolvedLayout.x + resolvedLayout.width / 2,
    resolvedLayout.y + resolvedLayout.height / 2
  );
  context.rotate((resolvedLayout.rotation * Math.PI) / 180);
  context.font = buildFontString({ clip, fontSize });
  context.fillStyle = clip.style.color ?? defaultTextColor;
  context.textAlign = clip.style.align ?? "center";
  context.textBaseline = "middle";
  context.shadowBlur = 22;
  context.shadowColor = defaultTextShadowColor;
  context.lineWidth = Math.max(2, fontSize * 0.04);
  context.strokeStyle = "rgba(0, 0, 0, 0.62)";

  const totalHeight = lines.length * lineHeight;
  const firstY = -totalHeight / 2 + lineHeight / 2;

  for (const [lineIndex, line] of lines.entries()) {
    const y = firstY + lineIndex * lineHeight;
    const x = getTextAlignX({
      align: clip.style.align ?? "center",
      width: resolvedLayout.width,
    });
    context.strokeText(line, x, y);
    context.fillText(line, x, y);
  }

  context.restore();
};

const drawCaptionLayer = ({
  canvas,
  context,
  text,
  track,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly text: string;
  readonly track: CaptionTrack;
}) => {
  const maxWidth = track.layout.maxWidth ?? canvas.width * 0.86;
  const fontSize = track.style.fontSize ?? 42;
  const lineHeight = track.style.lineHeight ?? fontSize * 1.2;
  const height = lineHeight * 2.4;
  const x = (canvas.width - maxWidth) / 2;
  const y = getCaptionY({ canvas, height, track });

  context.save();
  context.fillStyle = track.style.backgroundColor ?? "rgba(0, 0, 0, 0.65)";
  context.beginPath();
  context.roundRect(x, y, maxWidth, height, 14);
  context.fill();

  context.font = buildCaptionFontString({ fontSize, track });
  context.fillStyle = track.style.color ?? defaultTextColor;
  context.textAlign = track.layout.align ?? "center";
  context.textBaseline = "middle";
  context.shadowBlur = 14;
  context.shadowColor = defaultTextShadowColor;

  const lines = wrapText({
    context,
    font: buildCaptionFontString({ fontSize, track }),
    maxWidth: maxWidth - 68,
    text,
  }).slice(0, 2);
  const totalHeight = lines.length * lineHeight;
  const firstY = y + height / 2 - totalHeight / 2 + lineHeight / 2;

  for (const [lineIndex, line] of lines.entries()) {
    context.fillText(
      line.toUpperCase(),
      getBoxTextAlignX({
        align: track.layout.align ?? "center",
        padding: 34,
        width: maxWidth,
        x,
      }),
      firstY + lineIndex * lineHeight
    );
  }

  context.restore();
};

const resolveLayout = ({
  canvas,
  layout,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly layout: Layout | undefined;
}): ResolvedLayout => ({
  fit: layout?.fit ?? "cover",
  height: layout?.height ?? canvas.height,
  opacity: layout?.opacity ?? 1,
  rotation: layout?.rotation ?? 0,
  width: layout?.width ?? canvas.width,
  x: layout?.x ?? 0,
  y: layout?.y ?? 0,
});

const getFittedRect = ({
  fit,
  height,
  sourceHeight,
  sourceWidth,
  width,
}: {
  readonly fit: ResolvedLayout["fit"];
  readonly height: number;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly width: number;
}) => {
  if (fit === "fill") {
    return { height, width, x: 0, y: 0 };
  }

  if (fit === "none") {
    return {
      height: sourceHeight,
      width: sourceWidth,
      x: (width - sourceWidth) / 2,
      y: (height - sourceHeight) / 2,
    };
  }

  const scale =
    fit === "contain"
      ? Math.min(width / sourceWidth, height / sourceHeight)
      : Math.max(width / sourceWidth, height / sourceHeight);
  const fittedWidth = sourceWidth * scale;
  const fittedHeight = sourceHeight * scale;

  return {
    height: fittedHeight,
    width: fittedWidth,
    x: (width - fittedWidth) / 2,
    y: (height - fittedHeight) / 2,
  };
};

const getSourceWidth = (source: CanvasImageSource): number => {
  if ("videoWidth" in source) {
    return source.videoWidth;
  }

  if ("naturalWidth" in source) {
    return source.naturalWidth;
  }

  if ("displayWidth" in source) {
    return source.displayWidth;
  }

  if ("width" in source && typeof source.width === "number") {
    return source.width;
  }

  return 0;
};

const getSourceHeight = (source: CanvasImageSource): number => {
  if ("videoHeight" in source) {
    return source.videoHeight;
  }

  if ("naturalHeight" in source) {
    return source.naturalHeight;
  }

  if ("displayHeight" in source) {
    return source.displayHeight;
  }

  if ("height" in source && typeof source.height === "number") {
    return source.height;
  }

  return 0;
};

const buildFontString = ({
  clip,
  fontSize,
}: {
  readonly clip: TextClip;
  readonly fontSize: number;
}): string =>
  `${clip.style.fontWeight ?? "700"} ${fontSize}px ${quoteFontFamily(
    clip.style.fontFamily ?? "Inter"
  )}, Arial, sans-serif`;

const buildCaptionFontString = ({
  fontSize,
  track,
}: {
  readonly fontSize: number;
  readonly track: CaptionTrack;
}): string =>
  `${track.style.fontWeight ?? "700"} ${fontSize}px ${quoteFontFamily(
    track.style.fontFamily ?? "Inter"
  )}, Arial, sans-serif`;

const quoteFontFamily = (fontFamily: string): string =>
  `"${fontFamily.replaceAll('"', '\\"')}"`;

const wrapText = ({
  context,
  font,
  maxWidth,
  text,
}: {
  readonly context: CanvasRenderingContext2D;
  readonly font: string;
  readonly maxWidth: number;
  readonly text: string;
}): string[] => {
  context.save();
  context.font = font;

  const lines: string[] = [];
  for (const sourceLine of text.split("\n")) {
    const words = sourceLine.split(whitespacePattern).filter(Boolean);
    let line = "";

    for (const word of words) {
      const nextLine = line ? `${line} ${word}` : word;
      if (context.measureText(nextLine).width <= maxWidth || !line) {
        line = nextLine;
        continue;
      }

      lines.push(line);
      line = word;
    }

    lines.push(line);
  }

  context.restore();
  return lines.length > 0 ? lines : [""];
};

const getTextAlignX = ({
  align,
  width,
}: {
  readonly align: "center" | "left" | "right";
  readonly width: number;
}): number => {
  if (align === "left") {
    return -width / 2;
  }

  if (align === "right") {
    return width / 2;
  }

  return 0;
};

const getBoxTextAlignX = ({
  align,
  padding,
  width,
  x,
}: {
  readonly align: "center" | "left" | "right";
  readonly padding: number;
  readonly width: number;
  readonly x: number;
}): number => {
  if (align === "left") {
    return x + padding;
  }

  if (align === "right") {
    return x + width - padding;
  }

  return x + width / 2;
};

const getCaptionY = ({
  canvas,
  height,
  track,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly height: number;
  readonly track: CaptionTrack;
}): number => {
  if (track.layout.position === "top") {
    return canvas.height * 0.1;
  }

  if (track.layout.position === "center") {
    return (canvas.height - height) / 2;
  }

  return canvas.height - height - canvas.height * 0.1;
};
