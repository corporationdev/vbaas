import type { CaptionTrack, Clip, Track, VbaasComposition } from "../schema";
import type { PreviewLayer, PreviewRenderScene } from "./types";

export const createPreviewScene = (
  composition: VbaasComposition
): PreviewRenderScene => {
  const layers: PreviewLayer[] = [];

  for (const track of composition.tracks) {
    addTrackLayers({ layers, track });
  }

  return {
    composition,
    durationFrames:
      composition.durationFrames ?? getDurationFrames(composition),
    layers,
  };
};

export const resolvePreviewFrame = ({
  frame,
  scene,
}: {
  readonly frame: number;
  readonly scene: PreviewRenderScene;
}) => ({
  activeLayers: scene.layers
    .filter((layer) => isFrameInLayer({ frame, layer }))
    .toSorted((a, b) => getLayerRenderOrder(a) - getLayerRenderOrder(b)),
  frame,
});

const addTrackLayers = ({
  layers,
  track,
}: {
  readonly layers: PreviewLayer[];
  readonly track: Track;
}) => {
  if (track.hidden) {
    return;
  }

  if (track.kind === "caption") {
    addCaptionLayers({ layers, track });
    return;
  }

  if (track.kind === "audio") {
    return;
  }

  for (const clip of track.clips) {
    if (clip.hidden) {
      continue;
    }

    addClipLayer({ clip, layers });
  }
};

const addClipLayer = ({
  clip,
  layers,
}: {
  readonly clip: Clip;
  readonly layers: PreviewLayer[];
}) => {
  if (clip.type === "audio") {
    return;
  }

  if (clip.type === "image") {
    layers.push({
      assetId: clip.assetId,
      clip,
      durationFrames: clip.durationFrames,
      id: clip.id,
      layout: clip.layout,
      startFrame: clip.startFrame,
      type: "image",
    });
    return;
  }

  if (clip.type === "video") {
    layers.push({
      assetId: clip.media.assetId,
      clip,
      durationFrames: clip.durationFrames,
      id: clip.id,
      layout: clip.layout,
      sourceStartFrame: clip.media.sourceStartFrame,
      startFrame: clip.startFrame,
      type: "video",
    });
    return;
  }

  layers.push({
    clip,
    durationFrames: clip.durationFrames,
    id: clip.id,
    layout: clip.layout,
    startFrame: clip.startFrame,
    text: clip.text,
    type: "text",
  });
};

const addCaptionLayers = ({
  layers,
  track,
}: {
  readonly layers: PreviewLayer[];
  readonly track: CaptionTrack;
}) => {
  for (const [cueIndex, cue] of track.cues.entries()) {
    layers.push({
      durationFrames: cue.durationFrames,
      id: `${track.id}:cue:${cueIndex}`,
      startFrame: cue.startFrame,
      text: cue.text,
      track,
      type: "caption",
    });
  }
};

const isFrameInLayer = ({
  frame,
  layer,
}: {
  readonly frame: number;
  readonly layer: PreviewLayer;
}): boolean =>
  frame >= layer.startFrame && frame < layer.startFrame + layer.durationFrames;

const getLayerRenderOrder = (layer: PreviewLayer): number => {
  if (layer.type === "image" || layer.type === "video") {
    return 0;
  }

  if (layer.type === "text") {
    return 1;
  }

  return 2;
};

const getDurationFrames = (composition: VbaasComposition): number => {
  let durationFrames = 1;

  for (const track of composition.tracks) {
    if (track.kind === "caption") {
      for (const cue of track.cues) {
        durationFrames = Math.max(
          durationFrames,
          cue.startFrame + cue.durationFrames
        );
      }
      continue;
    }

    for (const clip of track.clips) {
      durationFrames = Math.max(
        durationFrames,
        clip.startFrame + clip.durationFrames
      );
    }
  }

  return durationFrames;
};
