import { parseSearchParams } from "../../services/search/search-service.js";

export const createPublicController = ({ searchService }) => ({
  async health(_request, response) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ status: "ok" }));
  },

  async search(request, response, url) {
    const payload = await searchService.search(parseSearchParams(url));
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  },

  async documentDetail(_request, response, _url, params) {
    const payload = await searchService.getDocumentDetail(params.documentId);
    if (!payload) {
      response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: "document_not_found" }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  },

  async tags(_request, response) {
    const payload = await searchService.listTags();
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  },

  async organizations(_request, response) {
    const payload = await searchService.listOrganizations();
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  },
});
