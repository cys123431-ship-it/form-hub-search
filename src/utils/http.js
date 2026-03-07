import fs from "node:fs/promises";
import path from "node:path";

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

export const sendError = (response, statusCode, message) => {
  sendJson(response, statusCode, { error: message });
};

export const parseJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const rawText = Buffer.concat(chunks).toString("utf8").trim();
  return rawText ? JSON.parse(rawText) : {};
};

export const serveStatic = async (response, publicDir, pathname) => {
  const targetPath = pathname === "/" ? path.join(publicDir, "index.html") : path.join(publicDir, pathname);
  const filePath = path.normalize(targetPath);
  const normalizedPublicDir = path.normalize(publicDir + path.sep);

  if (filePath !== path.join(publicDir, "index.html") && !filePath.startsWith(normalizedPublicDir)) {
    return false;
  }

  try {
    const fileBuffer = await fs.readFile(filePath);
    const extension = path.extname(filePath);
    response.writeHead(200, { "content-type": mimeTypes[extension] ?? "application/octet-stream" });
    response.end(fileBuffer);
    return true;
  } catch {
    return false;
  }
};
