import { runPromise } from "effect/Effect";

import { renderMediaContainerFixture } from "./render-fixture";

const result = await runPromise(renderMediaContainerFixture());

console.log(JSON.stringify(result));
