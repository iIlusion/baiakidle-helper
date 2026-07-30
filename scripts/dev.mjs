import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "vite";

const bundle = "dist/baiakidle-helper.user.js";
const watcher = await build({ configFile: "vite.config.ts", build: { watch: {} } });
const server = createServer(async (request, response) => {
  if (request.url?.split("?")[0] !== "/baiakidle-helper.user.js") {
    response.writeHead(404).end();
    return;
  }
  try {
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }).end(await readFile(bundle));
  } catch {
    response.writeHead(503).end("bundle not ready");
  }
});

server.listen(8946, "127.0.0.1", () => {
  console.log("[baiakidle-helper] http://127.0.0.1:8946/baiakidle-helper.user.js");
});

async function close() {
  await watcher.close();
  server.close();
}
process.once("SIGINT", close);
process.once("SIGTERM", close);