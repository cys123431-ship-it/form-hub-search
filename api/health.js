import { sendJson } from "../src/utils/http.js";

export default function handler(_request, response) {
  sendJson(response, 200, { status: "ok" });
}
