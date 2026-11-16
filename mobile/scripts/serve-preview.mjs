import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/web");
if (!existsSync(resolve(root, "index.html")))
  throw new Error("Run npm run build:preview first.");
const types = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".css": "text/css",
};
createServer((request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405);
    response.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }
  let file = resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403);
    response.end();
    return;
  }
  if (!existsSync(file) || !statSync(file).isFile())
    file = resolve(root, "index.html");
  response.writeHead(200, {
    "Content-Type": types[extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}).listen(8127, "127.0.0.1", () =>
  console.log(
    "Clover native UI preview: http://127.0.0.1:8127 (sample data; not a native simulator)",
  ),
);
