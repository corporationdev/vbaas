import { makeServer } from "../../../apps/server/src/index";
import MediaContainerObject from "./media/media-container-object";

const Server = makeServer({
  main: import.meta.filename,
  mediaContainerObjects: MediaContainerObject,
});

export default Server;
