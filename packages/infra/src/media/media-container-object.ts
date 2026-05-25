import { Container, DurableObjectNamespace, start } from "alchemy/Cloudflare";
import { andThen, flatMap, gen, map } from "effect/Effect";
import {
  get as getRequest,
  post as postRequest,
} from "effect/unstable/http/HttpClientRequest";

import {
  MediaContainer,
  type MediaContainerHealth,
  type MediaContainerRenderFixtureResult,
} from "./media-container";

const mediaContainerOrigin = "http://media-container";
const containerPort = 3000;

const fetchContainerJson = <Result>(container: AwaitedContainer, url: string) =>
  container.getTcpPort(containerPort).pipe(
    flatMap((port) => port.fetch(getRequest(url))),
    flatMap((response) => response.json),
    map((result) => result as Result)
  );

type AwaitedContainer = Awaited<ReturnType<typeof start>>;

export default class MediaContainerObject extends DurableObjectNamespace<MediaContainerObject>()(
  "MediaContainerObject",
  gen(function* () {
    const mediaContainer = yield* Container.bind(MediaContainer);

    return gen(function* () {
      const container = yield* start(mediaContainer);

      return {
        health: () =>
          fetchContainerJson<MediaContainerHealth>(
            container,
            `${mediaContainerOrigin}/`
          ),
        renderFixture: () =>
          container.getTcpPort(containerPort).pipe(
            flatMap((port) =>
              port.fetch(postRequest(`${mediaContainerOrigin}/render-fixture`))
            ),
            flatMap((response) => response.json),
            map((result) => result as MediaContainerRenderFixtureResult)
          ),
        restart: () =>
          container
            .destroy()
            .pipe(
              andThen(container.start()),
              andThen(
                fetchContainerJson<MediaContainerHealth>(
                  container,
                  `${mediaContainerOrigin}/`
                )
              )
            ),
      };
    });
  })
) {}
