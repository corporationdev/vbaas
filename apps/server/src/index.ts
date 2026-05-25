import type { Worker as CloudflareWorker } from "alchemy/Cloudflare";
import { Worker } from "alchemy/Cloudflare";
import type { HttpEffect } from "alchemy/Http";
import {
  redacted as redactedConfig,
  string as stringConfig,
} from "effect/Config";
import { type Effect, gen, orDie } from "effect/Effect";
import type { MediaContainerObjectNamespace } from "./media-internal";
import { getRequiredRuntimeEnv } from "./runtime-env";
import { makeServerFetch } from "./server";

interface ServerOptions {
  readonly main?: string;
  readonly mediaContainerObjects?: Effect<
    MediaContainerObjectNamespace,
    never,
    CloudflareWorker
  >;
}

const makeServer = ({
  main = import.meta.filename,
  mediaContainerObjects,
}: ServerOptions = {}): ReturnType<typeof Worker> =>
  Worker(
    "server",
    gen(function* () {
      const betterAuthSecret =
        yield* redactedConfig("BETTER_AUTH_SECRET").pipe(orDie);
      const betterAuthUrl = yield* stringConfig("BETTER_AUTH_URL").pipe(orDie);
      const corsOrigin = yield* stringConfig("CORS_ORIGIN").pipe(orDie);
      const databaseUrl = yield* redactedConfig("DATABASE_URL").pipe(orDie);

      return {
        compatibility: {
          flags: ["nodejs_compat", "nodejs_compat_populate_process_env"],
        },
        env: {
          BETTER_AUTH_SECRET: betterAuthSecret,
          BETTER_AUTH_URL: betterAuthUrl,
          CORS_ORIGIN: corsOrigin,
          DATABASE_URL: databaseUrl,
        },
        main,
      };
    }),
    gen(function* () {
      const mediaContainerObjectNamespace = mediaContainerObjects
        ? yield* mediaContainerObjects
        : undefined;
      const fetch = yield* makeServerFetch({
        getCorsOrigin: getRequiredRuntimeEnv("CORS_ORIGIN"),
        mediaContainerObjects: mediaContainerObjectNamespace,
      });

      return { fetch: fetch as HttpEffect };
    })
  );

const Server = makeServer();

export { makeServer };
export default Server;
