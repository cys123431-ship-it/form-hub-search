import { parseJsonBody, sendError, sendJson } from "../../utils/http.js";

export const createAdminController = ({ adminService }) => ({
  async sources(_request, response) {
    sendJson(response, 200, await adminService.listSources());
  },

  async crawlRuns(_request, response) {
    sendJson(response, 200, await adminService.listCrawlRuns());
  },

  async runCrawl(request, response) {
    try {
      await parseJsonBody(request);
      sendJson(response, 201, { runs: await adminService.runCrawl() });
    } catch {
      sendError(response, 400, "invalid_json_body");
    }
  },

  async reviewQueue(_request, response) {
    sendJson(response, 200, await adminService.listReviewQueue());
  },
});
