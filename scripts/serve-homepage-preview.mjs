import http from "http";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.HOMEPAGE_PREVIEW_PORT || 4173);
const root = path.join(process.cwd(), "public");
const gsapRoot = path.join(process.cwd(), "node_modules", "gsap", "dist");

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function streamFile(filePath, response, contentType) {
  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const urlPath = (request.url || "/").split("?")[0];

  if (urlPath === "/api/public/runtime") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ privateMode: false, earlyAccess: true, brand: "ShimmerStock" }));
    return;
  }

  if (urlPath === "/assets/vendor/gsap/gsap.min.js") {
    streamFile(path.join(gsapRoot, "gsap.min.js"), response, mime[".js"]);
    return;
  }

  if (urlPath === "/assets/vendor/gsap/ScrollTrigger.min.js") {
    streamFile(path.join(gsapRoot, "ScrollTrigger.min.js"), response, mime[".js"]);
    return;
  }

  let filePath = path.join(root, decodeURIComponent(urlPath));
  if (urlPath === "/" || urlPath === "") filePath = path.join(root, "index.html");
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  streamFile(filePath, response, mime[ext] || "application/octet-stream");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`homepage preview server listening on http://0.0.0.0:${PORT}`);
});
