import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export function createPreviewServer(directory = "dist") {
  const root = path.resolve(directory);
  const types = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".png": "image/png",
  };
  return createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (url.startsWith("/preview/")) url = url.slice(8);
      const p = path.resolve(
        root,
        "." + (url.endsWith("/") ? url + "index.html" : url),
      );
      if (!p.startsWith(root + path.sep) && p !== root) throw Error();
      const body = await readFile(p);
      res.writeHead(200, {
        "Content-Type": types[path.extname(p)] || "application/octet-stream",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.argv[2] || 4173);
  createPreviewServer().listen(port, "0.0.0.0", () =>
    console.log(`Squeek Market preview at http://localhost:${port}/preview/`),
  );
}
