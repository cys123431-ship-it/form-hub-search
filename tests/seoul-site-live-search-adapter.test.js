import test from "node:test";
import assert from "node:assert/strict";
import { SeoulSiteLiveSearchAdapter } from "../src/services/live/seoul-site-live-search-adapter.js";

const sampleHtml = `
  <html>
    <body>
      <a href="https://www.seoul.go.kr/news/news_report.do#view/411743?tr_code=snews">서울시 하수구 정비 안내</a>
      <a href="https://mediahub.seoul.go.kr/archives/2008344?tr_code=snews">장마 시작됐다! 침수취약지역 하수구 점검</a>
      <a href="http://www.seoul.go.kr/realmnews/in/list.do?tr_code=gnb_news">서울소식</a>
      <a href="http://www.k-apt.go.kr/bid/bidDetail.do?bidNum=1&tr_code=sweb">외부 사이트</a>
    </body>
  </html>
`;

test("SeoulSiteLiveSearchAdapter keeps official seoul search results and drops navigation links", async (t) => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(sampleHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  t.after(() => {
    global.fetch = originalFetch;
  });

  const adapter = new SeoulSiteLiveSearchAdapter();
  const items = await adapter.search("하수구", {
    region: "서울특별시",
    limit: 5,
    requireQueryMatch: true,
  });

  assert.equal(items.length, 2);
  assert.equal(items.some((item) => item.pageUrl.includes("realmnews")), false);
  assert.equal(items.some((item) => item.pageUrl.includes("k-apt.go.kr")), false);
});
