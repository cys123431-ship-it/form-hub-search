import path from "node:path";
import { fetchTextWithTimeout } from "../../utils/request.js";
import { createSearchIntentText, selectRankedResults, toAbsoluteUrl, toText } from "./live-search-utils.js";

const baseUrl = "https://job.alio.go.kr";
const listUrl = `${baseUrl}/recruit.do`;
const detailUrl = `${baseUrl}/recruitview.do`;
const rowPattern =
  /<tr>\s*<td[^>]*><label><input[^>]*name="idxs" value="(\d+)"[\s\S]*?<td>(\d+)<\/td>[\s\S]*?<td class="left">[\s\S]*?<a href="\/recruitview\.do\?idx=\d+"[^>]*\/?>([\s\S]*?)<\/a>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<td>([\d.]+)<\/td>[\s\S]*?<td>([\d.]{8,10}|상시채용|채용시까지)[\s\S]*?<\/td>[\s\S]*?<td><span[^>]*>([\s\S]*?)<\/span><\/td>/giu;
const detailBlockPattern = /<div id="tab-1" class="tab-content current">([\s\S]*?)<div id="tab-2"/iu;
const topInfoPattern = /<div class="topInfo">[\s\S]*?<h2>([\s\S]*?)<\/h2>[\s\S]*?<p class="titleH2"[^>]*>([\s\S]*?)<\/p>/iu;
const tableRowPattern = /<tr>[\s\S]*?<th>([\s\S]*?)<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<th>([\s\S]*?)<\/th>[\s\S]*?<td>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/giu;
const attachmentPattern = /<a href="(https:\/\/www\.alio\.go\.kr\/download\/download\.json\?fileNo=\d+)"[\s\S]*?>([\s\S]*?)<\/a>/giu;
const applyUrlPattern = /공고 URL\s*:\s*[\s\S]*?<a href="([^"]+)"/iu;

const normalizeDate = (value) => {
  const raw = toText(value);
  if (!raw || raw === "상시채용" || raw === "채용시까지") {
    return null;
  }

  if (/^\d{4}\.\d{2}\.\d{2}$/u.test(raw)) {
    return `${raw.replace(/\./g, "-")}T00:00:00+09:00`;
  }

  if (/^\d{2}\.\d{2}\.\d{2}$/u.test(raw)) {
    return `20${raw.replace(/\./g, "-")}T00:00:00+09:00`;
  }

  return null;
};

const buildFileType = (fileName) => path.extname(fileName).replace(".", "").toLowerCase() || "file";

const createListItem = ({
  idx,
  title,
  organizationName,
  location,
  employmentType,
  registeredAt,
  applyEndAt,
  statusText,
  queryText,
}) => ({
  sourceItemKey: idx,
  pageUrl: `${detailUrl}?idx=${idx}`,
  canonicalUrl: `${detailUrl}?idx=${idx}`,
  sourceTitle: toText(title),
  bodyText: [
    toText(organizationName),
    toText(title),
    `근무지 ${toText(location)}`,
    `고용형태 ${toText(employmentType)}`,
    `등록일 ${toText(registeredAt)}`,
    `마감일 ${toText(applyEndAt)}`,
    `상태 ${toText(statusText)}`,
    "공공기관 채용 공고 JOB-ALIO",
    createSearchIntentText(queryText),
  ].join(". "),
  organizationHints: [toText(organizationName)],
  locationHints: [toText(location)],
  publishedAt: normalizeDate(registeredAt),
  assets: [],
  matchText: [organizationName, title, location, employmentType].map((value) => toText(value)).join(" "),
  previewHint: {
    location: toText(location),
    employmentType: toText(employmentType),
    registeredAt: toText(registeredAt),
    applyEndAt: toText(applyEndAt),
    statusText: toText(statusText),
  },
});

const extractListItems = (html, queryText) => {
  const items = [];

  for (const match of html.matchAll(rowPattern)) {
    items.push(
      createListItem({
        idx: match[1],
        title: match[3],
        organizationName: match[4],
        location: match[5],
        employmentType: match[6],
        registeredAt: match[7],
        applyEndAt: match[8],
        statusText: match[9],
        queryText,
      }),
    );
  }

  return items;
};

const enrichWithDetail = (item, html, queryText) => {
  const topInfo = html.match(topInfoPattern);
  const organizationName = toText(topInfo?.[1] ?? item.organizationHints[0]);
  const title = toText(topInfo?.[2] ?? item.sourceTitle);
  const detailTablePairs = [];

  for (const match of html.matchAll(tableRowPattern)) {
    detailTablePairs.push(`${toText(match[1])}: ${toText(match[2])}`);
    detailTablePairs.push(`${toText(match[3])}: ${toText(match[4])}`);
  }

  const detailText = toText(html.match(detailBlockPattern)?.[1] ?? "");
  const attachments = [...html.matchAll(attachmentPattern)].map((match) => {
    const fileName = toText(match[2]);
    return {
      url: toAbsoluteUrl(baseUrl, match[1]),
      fileName,
      fileType: buildFileType(fileName),
    };
  });
  const officialApplyUrl = toAbsoluteUrl(baseUrl, html.match(applyUrlPattern)?.[1] ?? "");

  return {
    ...item,
    pageUrl: item.pageUrl,
    canonicalUrl: item.canonicalUrl,
    sourceTitle: title,
    bodyText: [
      organizationName,
      title,
      ...detailTablePairs,
      detailText,
      officialApplyUrl ? `공고URL ${officialApplyUrl}` : "",
      "공공기관 채용 공고 JOB-ALIO",
      createSearchIntentText(queryText),
    ]
      .filter(Boolean)
      .join(". "),
    organizationHints: [organizationName],
    locationHints: [item.previewHint?.location ?? ""],
    publishedAt: item.publishedAt,
    assets: attachments,
    matchText: [organizationName, title, detailText].join(" "),
  };
};

export class JobAlioLiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 6, requireQueryMatch = false } = {}) {
    const params = new URLSearchParams({
      pageNo: "1",
      ing: "2",
      keyword: queryText,
      search_type: "",
    });
    const listHtml = await fetchTextWithTimeout(`${listUrl}?${params.toString()}`, this.timeoutMs);
    const listItems = extractListItems(listHtml, queryText);
    const selectedItems = selectRankedResults(listItems, queryText, { limit, requireQueryMatch });

    const enrichedItems = await Promise.all(
      selectedItems.map(async (item) => {
        try {
          const detailHtml = await fetchTextWithTimeout(item.pageUrl, this.timeoutMs);
          return enrichWithDetail(item, detailHtml, queryText);
        } catch {
          return item;
        }
      }),
    );

    return enrichedItems;
  }
}
