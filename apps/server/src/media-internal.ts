import type { DurableObjectNamespace } from "alchemy/Cloudflare";
import { pretty as prettyCause } from "effect/Cause";
import { catchCause, type Effect, gen } from "effect/Effect";
import { mergeAll as mergeLayers } from "effect/Layer";
import { add as addRoute } from "effect/unstable/http/HttpRouter";
import { json } from "effect/unstable/http/HttpServerResponse";

interface MediaContainerRenderFixtureResult {
  readonly durationFrames: number;
  readonly outputPath: string;
  readonly sizeBytes: number;
}

interface MediaContainerHealth {
  readonly ok: true;
  readonly role: "media";
}

export interface MediaContainerObjectShape {
  readonly health: () => Effect<MediaContainerHealth>;
  readonly renderFixture: () => Effect<MediaContainerRenderFixtureResult>;
  readonly restart: () => Effect<MediaContainerHealth>;
}

export type MediaContainerObjectNamespace =
  DurableObjectNamespace<MediaContainerObjectShape>;

export const makeMediaInternalLayer = (
  mediaContainerObjects: MediaContainerObjectNamespace
) =>
  mergeLayers(
    addRoute("GET", "/internal/media/ping", () =>
      json({
        ok: true,
        role: "server",
      })
    ),
    addRoute("GET", "/internal/media/health", () =>
      gen(function* () {
        const result = yield* mediaContainerObjects.getByName("media").health();
        return yield* json(result);
      }).pipe(
        catchCause((cause) =>
          json(
            {
              error: prettyCause(cause),
            },
            { status: 500 }
          )
        )
      )
    ),
    addRoute("POST", "/internal/media/restart", () =>
      gen(function* () {
        const result = yield* mediaContainerObjects
          .getByName("media")
          .restart();
        return yield* json(result);
      }).pipe(
        catchCause((cause) =>
          json(
            {
              error: prettyCause(cause),
            },
            { status: 500 }
          )
        )
      )
    ),
    addRoute("POST", "/internal/media/render-fixture", () =>
      gen(function* () {
        const result = yield* mediaContainerObjects
          .getByName("media")
          .renderFixture();
        return yield* json(result);
      }).pipe(
        catchCause((cause) =>
          json(
            {
              error: prettyCause(cause),
            },
            { status: 500 }
          )
        )
      )
    )
  );
