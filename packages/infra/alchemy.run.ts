import { Stack, type StackServices, Variable } from "alchemy";
import {
  type AssetsProps,
  type ProviderRequirements,
  providers,
  state,
  Vite,
} from "alchemy/Cloudflare";
import { config } from "dotenv";
import { gen, provide } from "effect/Effect";
import type { Layer } from "effect/Layer";

import { MediaBucket } from "./src/media/media-bucket";
import MediaContainerLive from "./src/media/media-container.runtime";
import Server from "./src/server-worker";

config({ path: "./.env" });
config({ path: "../../apps/web/.env" });
config({ path: "../../apps/server/.env" });

const webAssets = {
  config: {
    notFoundHandling: "single-page-application",
  },
  directory: "../../apps/web/dist",
} satisfies AssetsProps;

export const Web = Vite("web", {
  assets: webAssets,
  env: {
    VITE_SERVER_URL: Variable("VITE_SERVER_URL"),
  },
  rootDir: "../../apps/web",
});

const cloudflareProviders = providers() as Layer<
  ProviderRequirements,
  never,
  StackServices
>;

export default Stack(
  "vbaas",
  {
    providers: cloudflareProviders,
    state: state(),
  },
  gen(function* () {
    const mediaBucket = yield* MediaBucket;
    const web = yield* Web;
    const server = yield* Server;

    return {
      mediaBucketName: mediaBucket.bucketName,
      serverUrl: server.url,
      webUrl: web.url,
    };
  }).pipe(provide(MediaContainerLive))
);
