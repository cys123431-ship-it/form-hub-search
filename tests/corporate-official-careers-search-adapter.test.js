import test from "node:test";
import assert from "node:assert/strict";
import { CorporateOfficialCareersSearchAdapter } from "../src/services/live/corporate-official-careers-search-adapter.js";

const sampleHtml = `
  <html>
    <body>
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcareers.navercorp.com%2Fjobs%2F123">NAVER Careers 채용</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcareers.navercorp.com%2Fjobs%2F123">careers.navercorp.com/jobs/123</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcareers.navercorp.com%2Fjobs%2F123">네이버 공식 커리어 페이지 채용 공고</a>

      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.jobkorea.co.kr%2FRecruit%2FGI_Read%2F123">잡코리아 네이버 채용</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.jobkorea.co.kr%2FRecruit%2FGI_Read%2F123">www.jobkorea.co.kr/Recruit/GI_Read/123</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.jobkorea.co.kr%2FRecruit%2FGI_Read%2F123">잡코리아 채용 결과</a>
    </body>
  </html>
`;

test("CorporateOfficialCareersSearchAdapter filters out job portals and keeps likely official career pages", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(sampleHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const adapter = new CorporateOfficialCareersSearchAdapter();
  const items = await adapter.search("채용", {
    organization: "네이버",
    limit: 5,
    requireQueryMatch: true,
  });

  assert.equal(items.length > 0, true);
  assert.equal(items.some((item) => item.pageUrl.includes("careers.navercorp.com")), true);
  assert.equal(items.some((item) => item.pageUrl.includes("jobkorea.co.kr")), false);
});
