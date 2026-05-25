import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { extname, join, normalize, sep } from "node:path";

export const rendererHtml =
  '<!doctype html><html><body style="margin:0;background:transparent"><canvas id="frame"></canvas></body></html>';

export interface FrameReceiver {
  readonly close: () => Promise<void>;
  readonly endpoint: string;
  readonly nextFrame: () => Promise<Uint8Array>;
}

export interface StaticFileServer {
  readonly close: () => Promise<void>;
  readonly origin: string;
}

export const createStaticFileServer = async (
  rootDirectory: string
): Promise<StaticFileServer> => {
  const root = normalize(rootDirectory);
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");

    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname);

      if (pathname === "/renderer.html") {
        response.setHeader("Content-Type", "text/html");
        response.writeHead(200);
        response.end(rendererHtml);
        return;
      }

      if (pathname === "/asset") {
        const assetPath = requestUrl.searchParams.get("path");
        if (!assetPath) {
          response.writeHead(400);
          response.end();
          return;
        }

        const content = await readFile(assetPath);
        response.setHeader("Content-Type", getContentType(assetPath));
        response.writeHead(200);
        response.end(content);
        return;
      }

      const normalizedPath = normalize(join(root, pathname));

      if (!(normalizedPath === root || normalizedPath.startsWith(root + sep))) {
        response.writeHead(403);
        response.end();
        return;
      }

      const content = await readFile(normalizedPath);
      response.setHeader("Content-Type", getContentType(normalizedPath));
      response.writeHead(200);
      response.end(content);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  await listenOnLoopback(server);

  return {
    close: () => closeServer(server),
    origin: `http://127.0.0.1:${getServerPort(server)}`,
  };
};

export const createFrameReceiver = async (): Promise<FrameReceiver> => {
  let pendingResolve: ((frame: Uint8Array) => void) | undefined;
  let pendingReject: ((error: Error) => void) | undefined;
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method !== "POST") {
      response.writeHead(405);
      response.end();
      return;
    }

    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("error", (error) => {
      pendingReject?.(error);
    });
    request.on("end", () => {
      pendingResolve?.(Buffer.concat(chunks));
      pendingResolve = undefined;
      pendingReject = undefined;
      response.writeHead(204);
      response.end();
    });
  });

  await listenOnLoopback(server);

  return {
    close: () => closeServer(server),
    endpoint: `http://127.0.0.1:${getServerPort(server)}/frame`,
    nextFrame: () =>
      new Promise<Uint8Array>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
      }),
  };
};

const listenOnLoopback = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

const getServerPort = (server: Server): number => {
  const address = server.address();

  if (!(address && typeof address === "object")) {
    throw new Error("Frame receiver did not bind to a port.");
  }

  return address.port;
};

const getContentType = (path: string): string => {
  if (extname(path) === ".js" || extname(path) === ".mjs") {
    return "text/javascript";
  }

  if (extname(path) === ".json") {
    return "application/json";
  }

  return "application/octet-stream";
};
