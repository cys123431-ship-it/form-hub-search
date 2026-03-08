import test from "node:test";
import assert from "node:assert/strict";
import { fetchDuckDuckGoResults, fetchNaverResults } from "../src/services/live/ddg-search.js";

const duckDuckGoHtml = `
  <html>
    <body>
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcareers.example.com%2Fjobs%2F1">Example Careers</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcareers.example.com%2Fjobs%2F1">careers.example.com/jobs/1</a>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fcareers.example.com%2Fjobs%2F1">공식 채용 공고</a>
    </body>
  </html>
`;

const naverHtml = `
  <html>
    <body>
      <a href="https://careers.example.com/jobs/1" target="_blank">Example Careers 채용</a>
    </body>
  </html>
`;

test("fetchDuckDuckGoResults reuses cached provider results for the same query", async (t) => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return new Response(duckDuckGoHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const query = "cache-test-duckduckgo";
  const first = await fetchDuckDuckGoResults(query, 500);
  const second = await fetchDuckDuckGoResults(query, 500);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(fetchCount, 1);
});

test("fetchNaverResults reuses cached provider results for the same query", async (t) => {
  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    return new Response(naverHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const query = "cache-test-naver";
  const first = await fetchNaverResults(query, 500);
  const second = await fetchNaverResults(query, 500);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(fetchCount, 1);
});
