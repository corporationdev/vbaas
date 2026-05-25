import { createFileRoute } from "@tanstack/react-router";
import {
  createCanvasPreviewRenderer,
  createPreviewScene,
  type PreviewAssetProvider,
  type PreviewRenderScene,
} from "@vbaas/core/preview";
import type { VbaasComposition } from "@vbaas/core/schema";
import { Button } from "@vbaas/ui/components/button";
import {
  ImageIcon,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Upload,
  Video,
} from "lucide-react";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export const Route = createFileRoute("/_app/studio")({
  component: StudioRoute,
});

const studioDirectoryName = "vbaas-studio";
const manifestFileName = "manifest.json";
const defaultFps = 30;
const defaultDurationFrames = 150;
const defaultCanvas = {
  height: 720,
  width: 1280,
} as const;

interface StoredStudioAsset {
  readonly fileName: string;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly name: string;
  readonly size: number;
  readonly type: "image" | "video";
  readonly width?: number;
}

interface RuntimeStudioAsset extends StoredStudioAsset {
  readonly url: string;
}

interface StudioManifest {
  readonly assets: readonly StoredStudioAsset[];
  readonly composition: VbaasComposition;
}

type OpfsDirectoryHandle = FileSystemDirectoryHandle & {
  getDirectoryHandle: (
    name: string,
    options?: { readonly create?: boolean }
  ) => Promise<OpfsDirectoryHandle>;
  getFileHandle: (
    name: string,
    options?: { readonly create?: boolean }
  ) => Promise<FileSystemFileHandle>;
  removeEntry: (
    name: string,
    options?: { readonly recursive?: boolean }
  ) => Promise<void>;
};

function StudioRoute() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rendererRef = useRef(createCanvasPreviewRenderer());
  const animationFrameRef = useRef<number | null>(null);
  const lastRenderedFrameRef = useRef(-1);
  const sceneRef = useRef<PreviewRenderScene | null>(null);
  const [assets, setAssets] = useState<RuntimeStudioAsset[]>([]);
  const [composition, setComposition] = useState<VbaasComposition>(
    createDefaultComposition()
  );
  const [playheadFrame, setPlayheadFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState("Loading Studio");

  const assetProvider = useMemo<PreviewAssetProvider>(
    () => createBrowserAssetProvider({ assets }),
    [assets]
  );
  const durationFrames =
    composition.durationFrames ?? getCompositionDurationFrames(composition);
  const timelineClips = getTimelineClips(composition);

  useEffect(() => {
    let isMounted = true;

    loadStudioManifest()
      .then((manifest) => {
        if (!isMounted) {
          return;
        }

        setComposition(manifest.composition);
        setAssets(manifest.assets);
        setStatus("Ready");
      })
      .catch((error) => {
        setStatus(
          error instanceof Error ? error.message : "Unable to load Studio"
        );
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    sceneRef.current = createPreviewScene(composition);
    lastRenderedFrameRef.current = -1;
  }, [composition]);

  useEffect(
    () => () => {
      for (const asset of assets) {
        URL.revokeObjectURL(asset.url);
      }
    },
    [assets]
  );

  const renderCurrentFrame = useCallback(
    async (frame: number) => {
      const canvas = canvasRef.current;
      const scene = sceneRef.current;

      if (!(canvas && scene)) {
        return;
      }

      await rendererRef.current.renderFrame({
        assetProvider,
        canvas,
        frame,
        quality: "draft",
        scene,
      });
      lastRenderedFrameRef.current = frame;
    },
    [assetProvider]
  );

  useEffect(() => {
    if (!isPlaying && lastRenderedFrameRef.current === playheadFrame) {
      return;
    }

    renderCurrentFrame(playheadFrame).catch((error) => {
      setStatus(
        error instanceof Error ? error.message : "Preview render failed"
      );
    });
  }, [isPlaying, playheadFrame, renderCurrentFrame]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let startedAt = performance.now();
    let startFrame = playheadFrame;

    const tick = (time: number) => {
      const elapsedFrames = Math.floor(
        ((time - startedAt) / 1000) * composition.settings.fps
      );
      const nextFrame = Math.min(
        startFrame + elapsedFrames,
        durationFrames - 1
      );
      setPlayheadFrame(nextFrame);

      if (nextFrame >= durationFrames - 1) {
        setIsPlaying(false);
        return;
      }

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      startedAt = performance.now();
      startFrame = playheadFrame;
    };
  }, [composition.settings.fps, durationFrames, isPlaying, playheadFrame]);

  const persistComposition = useCallback(
    async (nextComposition: VbaasComposition, nextAssets = assets) => {
      setComposition(nextComposition);
      await saveStudioManifest({
        assets: nextAssets.map(({ url: _url, ...asset }) => asset),
        composition: nextComposition,
      });
    },
    [assets]
  );

  const handleImportFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";

    if (files.length === 0) {
      return;
    }

    setStatus("Importing assets");
    const importedAssets = await importAssetFiles(files);
    const nextAssets = [...assets, ...importedAssets];
    const nextComposition = addAssetsToComposition({
      assets: importedAssets,
      composition,
    });

    setAssets(nextAssets);
    setPlayheadFrame(0);
    await saveStudioManifest({
      assets: nextAssets.map(({ url: _url, ...asset }) => asset),
      composition: nextComposition,
    });
    setComposition(nextComposition);
    setStatus("Ready");
  };

  const handleAddTitle = async () => {
    const nextComposition = addTextClipToComposition(composition);
    await persistComposition(nextComposition);
  };

  const handleReset = async () => {
    const nextComposition = createDefaultComposition();
    setPlayheadFrame(0);
    await persistComposition(nextComposition);
  };

  const handleTimelineClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(
      Math.max((event.clientX - rect.left) / rect.width, 0),
      1
    );

    setPlayheadFrame(Math.round(ratio * Math.max(0, durationFrames - 1)));
  };

  return (
    <main className="flex min-h-[calc(100svh-5rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-semibold text-xl">Studio</h1>
          <p className="text-muted-foreground text-xs">
            Browser preview powered by the portable core renderer
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            accept="image/*,video/*"
            className="hidden"
            multiple
            onChange={handleImportFiles}
            ref={fileInputRef}
            type="file"
          />
          <Button onClick={() => fileInputRef.current?.click()} size="sm">
            <Upload />
            Upload
          </Button>
          <Button onClick={handleAddTitle} size="sm" variant="secondary">
            <Plus />
            Text
          </Button>
          <Button onClick={handleReset} size="icon" variant="outline">
            <RotateCcw />
          </Button>
        </div>
      </div>

      <section className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[18rem_1fr]">
        <aside className="flex min-h-0 flex-col gap-3 rounded-lg border p-3">
          <div>
            <h2 className="font-medium text-sm">Assets</h2>
            <p className="text-muted-foreground text-xs">{status}</p>
          </div>
          <div className="grid gap-2 overflow-y-auto">
            {assets.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-muted-foreground text-xs">
                Upload an image or video to add it to the OPFS-backed project.
              </div>
            ) : (
              assets.map((asset) => <AssetRow asset={asset} key={asset.id} />)
            )}
          </div>
        </aside>

        <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(0,1fr)_11rem]">
          <section className="flex min-h-0 items-center justify-center rounded-lg border bg-muted/20 p-3">
            <div
              className="relative max-h-full max-w-full overflow-hidden rounded-md border bg-black"
              style={{
                aspectRatio: `${defaultCanvas.width} / ${defaultCanvas.height}`,
              }}
            >
              <canvas className="block h-full w-full" ref={canvasRef} />
            </div>
          </section>

          <section className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsPlaying((value) => !value)}
                  size="icon"
                  variant="secondary"
                >
                  {isPlaying ? <Pause /> : <Play />}
                </Button>
                <span className="font-mono text-muted-foreground text-xs">
                  {formatTimecode({
                    fps: composition.settings.fps,
                    frame: playheadFrame,
                  })}
                </span>
              </div>
              <span className="text-muted-foreground text-xs">
                {timelineClips.length} clips
              </span>
            </div>

            <button
              className="relative grid cursor-pointer gap-2 overflow-hidden rounded-md border bg-muted/20 p-3 text-left"
              onClick={handleTimelineClick}
              type="button"
            >
              <div
                className="pointer-events-none absolute top-2 bottom-2 z-10 w-px bg-primary"
                style={{
                  left: `${(playheadFrame / Math.max(1, durationFrames - 1)) * 100}%`,
                }}
              />
              <TimelineRow
                clips={timelineClips.filter((clip) => clip.kind === "visual")}
                durationFrames={durationFrames}
                label="Visual"
              />
              <TimelineRow
                clips={timelineClips.filter((clip) => clip.kind === "text")}
                durationFrames={durationFrames}
                label="Text"
              />
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}

function AssetRow({ asset }: { readonly asset: RuntimeStudioAsset }) {
  const Icon = asset.type === "video" ? Video : ImageIcon;

  return (
    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-3 rounded-md border p-2">
      <div className="flex size-10 items-center justify-center overflow-hidden rounded-sm bg-muted">
        {asset.type === "image" ? (
          <img
            alt={asset.name}
            className="size-full object-cover"
            height={40}
            src={asset.url}
            width={40}
          />
        ) : (
          <Icon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium text-xs">{asset.name}</div>
        <div className="text-[0.7rem] text-muted-foreground">
          {asset.type} · {formatFileSize(asset.size)}
        </div>
      </div>
    </div>
  );
}

interface TimelineClip {
  readonly durationFrames: number;
  readonly id: string;
  readonly kind: "text" | "visual";
  readonly label: string;
  readonly startFrame: number;
}

function TimelineRow({
  clips,
  durationFrames,
  label,
}: {
  readonly clips: readonly TimelineClip[];
  readonly durationFrames: number;
  readonly label: string;
}) {
  return (
    <div className="grid grid-cols-[4rem_1fr] items-center gap-2">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="relative h-10 rounded-sm bg-background">
        {clips.map((clip) => (
          <div
            className="absolute top-1 bottom-1 overflow-hidden rounded-sm bg-primary/80 px-2 py-1 text-primary-foreground text-xs"
            key={clip.id}
            style={{
              left: `${(clip.startFrame / durationFrames) * 100}%`,
              width: `${(clip.durationFrames / durationFrames) * 100}%`,
            }}
          >
            <span className="block truncate">{clip.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const createDefaultComposition = (): VbaasComposition => ({
  assets: [],
  durationFrames: defaultDurationFrames,
  id: "studio-project",
  name: "Studio Project",
  schemaVersion: "0.1",
  settings: {
    canvas: defaultCanvas,
    fps: defaultFps,
  },
  tracks: [
    {
      clips: [
        {
          durationFrames: defaultDurationFrames,
          effects: [],
          hidden: false,
          id: "studio-title",
          layout: {
            fit: "fill",
            height: 160,
            opacity: 1,
            rotation: 0,
            width: 900,
            x: 190,
            y: 280,
          },
          startFrame: 0,
          style: {
            align: "center",
            color: "#ffffff",
            fontSize: 72,
            fontWeight: "bold",
            lineHeight: 84,
          },
          text: "Live Preview",
          type: "text",
        },
      ],
      hidden: false,
      id: "text-track",
      kind: "text",
    },
    {
      clips: [],
      hidden: false,
      id: "visual-track",
      kind: "visual",
    },
  ],
});

const loadStudioManifest = async (): Promise<{
  readonly assets: RuntimeStudioAsset[];
  readonly composition: VbaasComposition;
}> => {
  const directory = await getStudioDirectory();
  let manifest = await readManifest(directory);

  if (!manifest) {
    manifest = {
      assets: [],
      composition: createDefaultComposition(),
    };
    await writeManifest({ directory, manifest });
  }

  const runtimeAssets = await Promise.all(
    manifest.assets.map(async (asset) => {
      const fileHandle = await directory.getFileHandle(asset.fileName);
      const file = await fileHandle.getFile();

      return {
        ...asset,
        url: URL.createObjectURL(file),
      };
    })
  );

  return {
    assets: runtimeAssets,
    composition: manifest.composition,
  };
};

const saveStudioManifest = async (manifest: StudioManifest): Promise<void> => {
  const directory = await getStudioDirectory();
  await writeManifest({ directory, manifest });
};

const importAssetFiles = async (
  files: readonly File[]
): Promise<RuntimeStudioAsset[]> => {
  const directory = await getStudioDirectory();
  const importedAssets: RuntimeStudioAsset[] = [];

  for (const file of files) {
    const assetType = getAssetType(file);
    if (!assetType) {
      continue;
    }

    const id = crypto.randomUUID();
    const fileName = `${id}-${sanitizeFileName(file.name)}`;
    const fileHandle = await directory.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();

    importedAssets.push({
      fileName,
      id,
      mimeType: file.type,
      name: file.name,
      size: file.size,
      type: assetType,
      url: URL.createObjectURL(file),
    });
  }

  return importedAssets;
};

const getStudioDirectory = async (): Promise<OpfsDirectoryHandle> => {
  if (!navigator.storage?.getDirectory) {
    throw new Error("OPFS is not available in this browser.");
  }

  const root = (await navigator.storage.getDirectory()) as OpfsDirectoryHandle;
  return root.getDirectoryHandle(studioDirectoryName, { create: true });
};

const readManifest = async (
  directory: OpfsDirectoryHandle
): Promise<StudioManifest | null> => {
  try {
    const fileHandle = await directory.getFileHandle(manifestFileName);
    const file = await fileHandle.getFile();
    return JSON.parse(await file.text()) as StudioManifest;
  } catch {
    return null;
  }
};

const writeManifest = async ({
  directory,
  manifest,
}: {
  readonly directory: OpfsDirectoryHandle;
  readonly manifest: StudioManifest;
}) => {
  const fileHandle = await directory.getFileHandle(manifestFileName, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(manifest, null, 2));
  await writable.close();
};

const createBrowserAssetProvider = ({
  assets,
}: {
  readonly assets: readonly RuntimeStudioAsset[];
}): PreviewAssetProvider => {
  const sources = new Map<
    string,
    Promise<HTMLImageElement | HTMLVideoElement>
  >();

  const loadSource = (asset: RuntimeStudioAsset) => {
    const existing = sources.get(asset.id);
    if (existing) {
      return existing;
    }

    const nextSource =
      asset.type === "image" ? loadImage(asset.url) : loadVideo(asset.url);
    sources.set(asset.id, nextSource);
    return nextSource;
  };

  return {
    getImageSource: (assetId) => {
      const asset = assets.find((candidate) => candidate.id === assetId);
      if (!asset || asset.type !== "image") {
        return Promise.resolve(undefined);
      }

      return loadSource(asset);
    },
    getVideoSource: async (assetId) => {
      const asset = assets.find((candidate) => candidate.id === assetId);
      if (!asset || asset.type !== "video") {
        return;
      }

      const source = await loadSource(asset);
      return source instanceof HTMLVideoElement ? source : undefined;
    },
  };
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load image asset."));
    image.src = url;
  });

const loadVideo = (url: string): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error("Unable to load video asset."));
    video.src = url;
    video.load();
  });

const addAssetsToComposition = ({
  assets,
  composition,
}: {
  readonly assets: readonly RuntimeStudioAsset[];
  readonly composition: VbaasComposition;
}): VbaasComposition => {
  const nextAssets = [
    ...composition.assets,
    ...assets.map((asset) => ({
      id: asset.id,
      mimeType: asset.mimeType,
      name: asset.name,
      source: {
        kind: "file" as const,
        path: asset.fileName,
      },
      type: asset.type,
    })),
  ];
  const visualTrack = composition.tracks.find(
    (track) => track.kind === "visual"
  );
  const nextVisualTrack =
    visualTrack?.kind === "visual"
      ? {
          ...visualTrack,
          clips: [
            ...visualTrack.clips,
            ...assets.map((asset, index) =>
              asset.type === "image"
                ? {
                    assetId: asset.id,
                    durationFrames: defaultDurationFrames,
                    effects: [],
                    hidden: false,
                    id: `${asset.id}-clip`,
                    layout: {
                      fit: "contain" as const,
                      height: defaultCanvas.height,
                      opacity: 1,
                      rotation: 0,
                      width: defaultCanvas.width,
                      x: 0,
                      y: 0,
                    },
                    startFrame: index * 15,
                    type: "image" as const,
                  }
                : {
                    durationFrames: defaultDurationFrames,
                    effects: [],
                    hidden: false,
                    id: `${asset.id}-clip`,
                    layout: {
                      fit: "cover" as const,
                      height: defaultCanvas.height,
                      opacity: 1,
                      rotation: 0,
                      width: defaultCanvas.width,
                      x: 0,
                      y: 0,
                    },
                    media: {
                      assetId: asset.id,
                      playbackRate: 1,
                      sourceStartFrame: 0,
                    },
                    startFrame: index * 15,
                    type: "video" as const,
                  }
            ),
          ],
        }
      : {
          clips: [],
          hidden: false,
          id: "visual-track",
          kind: "visual" as const,
        };
  const nextTracks = composition.tracks.some((track) => track.kind === "visual")
    ? composition.tracks.map((track) =>
        track.kind === "visual" ? nextVisualTrack : track
      )
    : [...composition.tracks, nextVisualTrack];

  return {
    ...composition,
    assets: nextAssets,
    durationFrames: Math.max(
      composition.durationFrames ?? defaultDurationFrames,
      defaultDurationFrames
    ),
    tracks: nextTracks,
  };
};

const addTextClipToComposition = (
  composition: VbaasComposition
): VbaasComposition => {
  const textClip = {
    durationFrames: defaultDurationFrames,
    effects: [],
    hidden: false,
    id: `text-${crypto.randomUUID()}`,
    layout: {
      fit: "fill" as const,
      height: 110,
      opacity: 1,
      rotation: 0,
      width: 720,
      x: 280,
      y: 500,
    },
    startFrame: 0,
    style: {
      align: "center" as const,
      color: "#f8fafc",
      fontSize: 54,
      fontWeight: "bold" as const,
      lineHeight: 64,
    },
    text: "Canvas text layer",
    type: "text" as const,
  };
  const hasTextTrack = composition.tracks.some(
    (track) => track.kind === "text"
  );
  const tracks = hasTextTrack
    ? composition.tracks.map((track) =>
        track.kind === "text"
          ? { ...track, clips: [...track.clips, textClip] }
          : track
      )
    : [
        ...composition.tracks,
        {
          clips: [textClip],
          hidden: false,
          id: "text-track",
          kind: "text" as const,
        },
      ];

  return {
    ...composition,
    tracks,
  };
};

const getTimelineClips = (composition: VbaasComposition): TimelineClip[] => {
  const clips: TimelineClip[] = [];

  for (const track of composition.tracks) {
    if (track.kind === "visual") {
      clips.push(
        ...track.clips.map((clip) => ({
          durationFrames: clip.durationFrames,
          id: clip.id,
          kind: "visual" as const,
          label: clip.type,
          startFrame: clip.startFrame,
        }))
      );
    }

    if (track.kind === "text") {
      clips.push(
        ...track.clips.map((clip) => ({
          durationFrames: clip.durationFrames,
          id: clip.id,
          kind: "text" as const,
          label: clip.text,
          startFrame: clip.startFrame,
        }))
      );
    }
  }

  return clips;
};

const getCompositionDurationFrames = (
  composition: VbaasComposition
): number => {
  let durationFrames = defaultDurationFrames;

  for (const clip of getTimelineClips(composition)) {
    durationFrames = Math.max(
      durationFrames,
      clip.startFrame + clip.durationFrames
    );
  }

  return durationFrames;
};

const getAssetType = (file: File): StoredStudioAsset["type"] | null => {
  if (file.type.startsWith("image/")) {
    return "image";
  }

  if (file.type.startsWith("video/")) {
    return "video";
  }

  return null;
};

const sanitizeFileName = (fileName: string): string =>
  fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "-");

const formatFileSize = (size: number): string => {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTimecode = ({
  fps,
  frame,
}: {
  readonly fps: number;
  readonly frame: number;
}): string => {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor(frame % fps);

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
};
