import type {
  CaptionTrack,
  ImageClip,
  Layout,
  TextClip,
  VbaasComposition,
  VideoClip,
} from "../schema";

export type PreviewQuality = "draft" | "standard";

export type PreviewAssetSource =
  | CanvasImageSource
  | HTMLImageElement
  | HTMLVideoElement;

export interface PreviewAssetProvider {
  readonly getImageSource: (
    assetId: string
  ) => Promise<PreviewAssetSource | undefined>;
  readonly getVideoSource: (
    assetId: string
  ) => Promise<HTMLVideoElement | undefined>;
}

export interface PreviewRenderScene {
  readonly composition: VbaasComposition;
  readonly durationFrames: number;
  readonly layers: readonly PreviewLayer[];
}

export type PreviewLayer =
  | ImagePreviewLayer
  | VideoPreviewLayer
  | TextPreviewLayer
  | CaptionPreviewLayer;

export interface BasePreviewLayer {
  readonly durationFrames: number;
  readonly id: string;
  readonly startFrame: number;
}

export interface ImagePreviewLayer extends BasePreviewLayer {
  readonly assetId: string;
  readonly clip: ImageClip;
  readonly layout?: Layout;
  readonly type: "image";
}

export interface VideoPreviewLayer extends BasePreviewLayer {
  readonly assetId: string;
  readonly clip: VideoClip;
  readonly layout?: Layout;
  readonly sourceStartFrame: number;
  readonly type: "video";
}

export interface TextPreviewLayer extends BasePreviewLayer {
  readonly clip: TextClip;
  readonly layout?: Layout;
  readonly text: string;
  readonly type: "text";
}

export interface CaptionPreviewLayer extends BasePreviewLayer {
  readonly text: string;
  readonly track: CaptionTrack;
  readonly type: "caption";
}

export interface ResolvedPreviewFrame {
  readonly activeLayers: readonly PreviewLayer[];
  readonly frame: number;
}

export interface CanvasPreviewRenderer {
  readonly renderFrame: (input: {
    readonly assetProvider: PreviewAssetProvider;
    readonly canvas: HTMLCanvasElement;
    readonly frame: number;
    readonly quality?: PreviewQuality;
    readonly scene: PreviewRenderScene;
  }) => Promise<void>;
}
