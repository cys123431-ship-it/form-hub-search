import { getAppContext } from "../../../src/app-context.js";
import { sendJson } from "../../../src/utils/http.js";

export default async function handler(request, response) {
  const { adminService } = await getAppContext();

  if (request.method === "POST") {
    sendJson(response, 201, { runs: await adminService.runCrawl() });
    return;
  }

  sendJson(response, 200, await adminService.listCrawlRuns());
}
