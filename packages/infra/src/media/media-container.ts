import { Container } from "alchemy/Cloudflare";
import type { Effect } from "effect/Effect";

export interface MediaContainerHealth {
  readonly ok: true;
  readonly role: "media";
}

export interface MediaContainerRenderFixtureResult {
  readonly durationFrames: number;
  readonly outputPath: string;
  readonly sizeBytes: number;
}

export interface MediaContainerApi {
  readonly health: () => Effect<MediaContainerHealth>;
  readonly renderFixture: () => Effect<MediaContainerRenderFixtureResult>;
}

const mediaContainerDockerfile = `
FROM oven/bun:1

RUN apt-get update \\
  && apt-get install -y --no-install-recommends \\
    ca-certificates \\
    chromium \\
    ffmpeg \\
    fonts-liberation \\
  && rm -rf /var/lib/apt/lists/*

ENV CHROME_BIN=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
`;

const mediaContainerRuntimeUrl =
  typeof import.meta.url === "string" ? import.meta.url : "";

const mediaContainerRuntimePath = mediaContainerRuntimeUrl.startsWith("file:")
  ? new URL("./media-container.runtime.ts", mediaContainerRuntimeUrl).pathname
  : "./media-container.runtime.ts";

export class MediaContainer extends Container<
  MediaContainer,
  MediaContainerApi
>()("MediaContainer", {
  dockerfile: mediaContainerDockerfile,
  external: ["mediabunny"],
  instanceType: "dev",
  main: mediaContainerRuntimePath,
  maxInstances: 1,
  observability: {
    logs: {
      enabled: true,
    },
  },
}) {}
