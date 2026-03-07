import { resolveNamedRegion } from "../search/search-region.js";
import { fetchTextWithTimeout } from "../../utils/request.js";
import {
  createSearchIntentText,
  selectRankedResults,
  toAbsoluteUrl,
  toText,
} from "./live-search-utils.js";

const baseUrl = "https://www.work24.go.kr";
const listUrl = `${baseUrl}/wk/a/b/1200/retriveDtlEmpSrchList.do`;
const rowPattern = /<tr id="list\d+">([\s\S]*?)<\/tr>/giu;

const unique = (values) => [...new Set(values.filter(Boolean))];

const normalizeDate = (value) => {
  const raw = toText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
    return null;
  }
  return `${raw}T00:00:00+09:00`;
};

const getBlockValue = (block, pattern) => toText(block.match(pattern)?.[1] ?? "");

const buildItemKey = (detailHref) => {
  try {
    const url = new URL(detailHref, baseUrl);
    const wantedAuthNo = url.searchParams.get("wantedAuthNo");
    const infoTypeCd = url.searchParams.get("infoTypeCd");
    return [wantedAuthNo, infoTypeCd].filter(Boolean).join(":") || url.toString();
  } catch {
    return detailHref;
  }
};

const createParsedPosting = ({
  detailHref,
  companyName,
  title,
  providerName,
  payText,
  memberText,
  workConditionText,
  locationText,
  closeDate,
  registeredAt,
  queryText,
  regionLabel,
}) => {
  const pageUrl = toAbsoluteUrl(baseUrl, detailHref);
  const normalizedCompany = toText(companyName);
  const normalizedTitle = toText(title);
  const normalizedProvider = toText(providerName);
  const normalizedLocation = toText(locationText);
  const normalizedCloseDate = toText(closeDate);
  const normalizedRegisteredAt = toText(registeredAt);
  const locationHints = unique([regionLabel, normalizedLocation]);

  return {
    sourceItemKey: buildItemKey(pageUrl),
    pageUrl,
    canonicalUrl: pageUrl,
    sourceTitle: `${normalizedCompany} 채용 - ${normalizedTitle}`,
    bodyText: [
      normalizedCompany,
      normalizedTitle,
      normalizedProvider ? `정보제공처 ${normalizedProvider}` : "",
      normalizedLocation ? `근무예정지 ${normalizedLocation}` : "",
      payText ? `임금조건 ${payText}` : "",
      memberText ? `지원자격 ${memberText}` : "",
      workConditionText ? `근무조건 ${workConditionText}` : "",
      normalizedCloseDate ? `마감일 ${normalizedCloseDate}` : "",
      normalizedRegisteredAt ? `등록일 ${normalizedRegisteredAt}` : "",
      regionLabel ? `지역 ${regionLabel}` : "",
      "고용24 공식 채용 검색",
      createSearchIntentText(queryText),
    ]
      .filter(Boolean)
      .join(". "),
    organizationHints: [normalizedCompany],
    locationHints,
    publishedAt: normalizeDate(registeredAt),
    assets: [],
    matchText: [
      normalizedCompany,
      normalizedTitle,
      normalizedProvider,
      normalizedLocation,
      payText,
      memberText,
      workConditionText,
    ]
      .filter(Boolean)
      .join(" "),
  };
};

const extractRows = (html, queryText, regionLabel) => {
  const items = [];
  const seen = new Set();

  for (const match of html.matchAll(rowPattern)) {
    const block = match[1];
    const detailHref = getBlockValue(block, /href="([^"]*empDetailAuthView\.do[^"]*)"/iu);
    if (!detailHref) {
      continue;
    }

    const pageUrl = toAbsoluteUrl(baseUrl, detailHref);
    if (seen.has(pageUrl)) {
      continue;
    }

    seen.add(pageUrl);
    items.push(
      createParsedPosting({
        detailHref,
        companyName: getBlockValue(block, /class="cp_name[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/iu),
        title: getBlockValue(block, /data-emp-detail[\s\S]*?>\s*([\s\S]*?)\s*<\/a>/iu),
        providerName: getBlockValue(block, /alt="정보제공처\s*([^"]+)"/iu),
        payText: getBlockValue(block, /li class="dollar"[\s\S]*?<span class="item b1_sb">\s*([\s\S]*?)\s*<\/span>/iu),
        memberText: getBlockValue(block, /li class="member"[\s\S]*?<p[^>]*>\s*([\s\S]*?)\s*<\/p>/iu),
        workConditionText: getBlockValue(block, /li class="time"[\s\S]*?<p[^>]*>\s*([\s\S]*?)\s*<\/p>/iu),
        locationText: getBlockValue(block, /li class="site"[\s\S]*?<p>\s*([\s\S]*?)\s*<\/p>/iu),
        closeDate: getBlockValue(block, /마감일\s*:\s*([^<]+)/iu),
        registeredAt: getBlockValue(block, /등록일\s*:\s*([^<]+)/iu),
        queryText,
        regionLabel,
      }),
    );
  }

  return items;
};

export class Work24LiveSearchAdapter {
  constructor({ timeoutMs = 8000 } = {}) {
    this.timeoutMs = timeoutMs;
  }

  async search(queryText, { limit = 8, requireQueryMatch = false, region = "" } = {}) {
    const resolvedRegion = resolveNamedRegion(region);
    const params = new URLSearchParams();

    if (resolvedRegion) {
      const regionCodeMap = {
        "서울특별시": "11000",
        "부산광역시": "26000",
        "대구광역시": "27000",
        "인천광역시": "28000",
        "광주광역시": "29000",
        "대전광역시": "30000",
        "울산광역시": "31000",
        "세종특별자치시": "36110",
        경기도: "41000",
        "강원특별자치도": "42000",
        충청북도: "43000",
        충청남도: "44000",
        "전북특별자치도": "52000",
        전라남도: "51000",
        경상북도: "47000",
        경상남도: "48000",
        "제주특별자치도": "50000",
      };

      const regionCode = regionCodeMap[resolvedRegion.canonical];
      if (regionCode) {
        params.set("region", regionCode);
      }
    }

    if (queryText.trim()) {
      params.set("keyword", queryText.trim());
      params.set("keywordWantedTitle", "Y");
      params.set("keywordBusiNm", "Y");
      params.set("keywordJobCont", "Y");
      params.set("keywordStaAreaNm", "Y");
    }

    const requestUrl = params.size > 0 ? `${listUrl}?${params.toString()}` : listUrl;
    const html = await fetchTextWithTimeout(requestUrl, this.timeoutMs);
    const items = extractRows(html, queryText, resolvedRegion?.canonical ?? "");
    return selectRankedResults(items, queryText, { limit, requireQueryMatch });
  }
}

