import { getAppContext } from "../../../src/app-context.js";
import { sendJson } from "../../../src/utils/http.js";

export default async function handler(_request, response) {
  const { adminService } = await getAppContext();
  sendJson(response, 200, await adminService.listReviewQueue());
}
