import { serveStatic, sendError } from "../utils/http.js";

const matchDocumentDetail = (pathname) => {
  const matched = pathname.match(/^\/api\/v1\/documents\/([^/]+)$/);
  return matched ? { documentId: matched[1] } : null;
};

export const createRouter = ({ publicController, adminController, publicDir }) =>
  async function route(request, response) {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname;

    try {
      if (request.method === "GET" && pathname === "/api/health") {
        return publicController.health(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/search") {
        return publicController.search(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/tags") {
        return publicController.tags(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/organizations") {
        return publicController.organizations(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/admin/sources") {
        return adminController.sources(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/admin/summary") {
        return adminController.summary(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/admin/crawl-runs") {
        return adminController.crawlRuns(request, response, url);
      }
      if (request.method === "POST" && pathname === "/api/v1/admin/crawl-runs") {
        return adminController.runCrawl(request, response, url);
      }
      if (request.method === "GET" && pathname === "/api/v1/admin/review-queue") {
        return adminController.reviewQueue(request, response, url);
      }

      const detailParams = matchDocumentDetail(pathname);
      if (request.method === "GET" && detailParams) {
        return publicController.documentDetail(request, response, url, detailParams);
      }

      const served = await serveStatic(response, publicDir, pathname);
      if (served) {
        return;
      }

      sendError(response, 404, "not_found");
    } catch {
      sendError(response, 500, "internal_error");
    }
  };
