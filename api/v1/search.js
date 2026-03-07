import { getAppContext } from "../../src/app-context.js";
import { parseSearchParams } from "../../src/services/search/search-service.js";
import { sendJson } from "../../src/utils/http.js";

export default async function handler(request, response) {
  const { searchService } = await getAppContext();
  const url = new URL(request.url, "http://localhost");
  const payload = await searchService.search(parseSearchParams(url));
  sendJson(response, 200, payload);
}
