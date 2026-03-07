import { getAppContext } from "../../src/app-context.js";
import { sendError, sendJson } from "../../src/utils/http.js";

export default async function handler(request, response) {
  const { searchService } = await getAppContext();
  const url = new URL(request.url, "http://localhost");
  const documentId = url.searchParams.get("documentId");

  if (!documentId) {
    sendError(response, 400, "document_id_required");
    return;
  }

  const payload = await searchService.getDocumentDetail(documentId);
  if (!payload) {
    sendError(response, 404, "document_not_found");
    return;
  }

  sendJson(response, 200, payload);
}
