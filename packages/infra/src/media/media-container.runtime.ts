import { succeed } from "effect/Effect";
import { json } from "effect/unstable/http/HttpServerResponse";

import { MediaContainer } from "./media-container";
import { renderMediaContainerFixture } from "./render-fixture";

const MediaContainerLive = MediaContainer.make(
  succeed(
    MediaContainer.of({
      fetch: json({
        ok: true,
        role: "media",
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
