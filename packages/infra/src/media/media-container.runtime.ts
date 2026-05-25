import { gen, succeed } from "effect/Effect";
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest";
import { json } from "effect/unstable/http/HttpServerResponse";

import { MediaContainer } from "./media-container";
import { renderMediaContainerFixture } from "./render-fixture";

const MediaContainerLive = MediaContainer.make(
  succeed(
    MediaContainer.of({
      fetch: gen(function* () {
        const request = yield* HttpServerRequest;
        const url = new URL(request.url, "http://media-container");

        if (request.method === "POST" && url.pathname === "/render-fixture") {
          const result = yield* renderMediaContainerFixture();
          return yield* json(result);
        }

        return yield* json({
          method: request.method,
          ok: true,
          path: url.pathname,
          role: "media",
          url: request.url,
        });
      }),
      health: () =>
        succeed({
          ok: true,
          role: "media",
        }),
      renderFixture: () => renderMediaContainerFixture(),
    })
  )
);

export default MediaContainerLive;
