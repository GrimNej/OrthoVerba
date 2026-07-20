import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const root = normalize(join(scriptDirectory, "..", "..", "app"));
const port = Number(process.env.PORT ?? 4173);
const mime = new Map([
  [".html", "text/html; charset=utf-8"], [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"], [".svg", "image/svg+xml"],
  [".json", "application/json; charset=utf-8"], [".webmanifest", "application/manifest+json"],
]);

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  let target = normalize(join(root, relative));
  if (!target.startsWith(root)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (statSync(target).isDirectory()) target = join(target, "index.html");
  } catch {
    target = join(root, "index.html");
  }
  response.setHeader("Cache-Control", target.endsWith("index.html") ? "no-cache" : "public, max-age=3600");
  response.setHeader("Content-Type", mime.get(extname(target)) ?? "application/octet-stream");
  createReadStream(target).on("error", () => response.writeHead(404).end("Not found")).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`OrthoVerba is running at http://127.0.0.1:${port}`);
  console.log("Press Ctrl+C to stop.");
});
