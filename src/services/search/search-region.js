import { compactSearchText } from "../../utils/normalize.js";

export const municipalRegionProfiles = [
  {
    canonical: "서울특별시",
    aliases: ["서울", "서울시", "서울특별시"],
    districts: [
      "종로구",
      "중구",
      "용산구",
      "성동구",
      "광진구",
      "동대문구",
      "중랑구",
      "성북구",
      "강북구",
      "도봉구",
      "노원구",
      "은평구",
      "서대문구",
      "마포구",
      "양천구",
      "강서구",
      "구로구",
      "금천구",
      "영등포구",
      "동작구",
      "관악구",
      "서초구",
      "강남구",
      "송파구",
      "강동구",
    ],
    officialDomains: [
      "seoul.go.kr",
      "job.seoul.go.kr",
      "news.seoul.go.kr",
      "gangnam.go.kr",
      "seocho.go.kr",
      "songpa.go.kr",
      "mapo.go.kr",
      "jongno.go.kr",
      "gwanak.go.kr",
      "yongsan.go.kr",
      "guro.go.kr",
      "gwangjin.go.kr",
      "yangcheon.go.kr",
      "yeongdeungpo.go.kr",
      "dongdaemun.go.kr",
      "seongbuk.go.kr",
      "gangbuk.go.kr",
      "dobong.go.kr",
      "seongdong.go.kr",
      "seodaemun.go.kr",
      "eunpyeong.go.kr",
      "dongjak.go.kr",
      "geumcheon.go.kr",
      "nowon.kr",
    ],
  },
  {
    canonical: "부산광역시",
    aliases: ["부산", "부산시", "부산광역시"],
    districts: [
      "중구",
      "서구",
      "동구",
      "영도구",
      "부산진구",
      "동래구",
      "남구",
      "북구",
      "해운대구",
      "사하구",
      "금정구",
      "강서구",
      "연제구",
      "수영구",
      "사상구",
      "기장군",
    ],
    officialDomains: ["busan.go.kr", "haeundae.go.kr", "suyeong.go.kr", "dongnae.go.kr", "geumjeong.go.kr", "yeonje.go.kr", "gijang.go.kr"],
  },
  {
    canonical: "대구광역시",
    aliases: ["대구", "대구시", "대구광역시"],
    districts: ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"],
    officialDomains: ["daegu.go.kr", "suseong.kr"],
  },
  {
    canonical: "인천광역시",
    aliases: ["인천", "인천시", "인천광역시"],
    districts: ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
    officialDomains: ["incheon.go.kr", "namdong.go.kr", "yeonsu.go.kr", "bupyeong.go.kr", "gyeyang.go.kr"],
  },
  {
    canonical: "광주광역시",
    aliases: ["광주", "광주시", "광주광역시"],
    districts: ["동구", "서구", "남구", "북구", "광산구"],
    officialDomains: ["gwangju.go.kr", "bukgu.gwangju.kr", "namgu.gwangju.kr", "donggu.gwangju.kr", "gwangsan.go.kr"],
  },
  {
    canonical: "대전광역시",
    aliases: ["대전", "대전시", "대전광역시"],
    districts: ["동구", "중구", "서구", "유성구", "대덕구"],
    officialDomains: ["daejeon.go.kr", "yuseong.go.kr", "daedeok.go.kr", "waterworks.daejeon.kr"],
  },
  {
    canonical: "울산광역시",
    aliases: ["울산", "울산시", "울산광역시"],
    districts: ["중구", "남구", "동구", "북구", "울주군"],
    officialDomains: ["ulsan.go.kr", "donggu.ulsan.kr", "bukgu.ulsan.kr", "ulju.ulsan.kr"],
  },
  {
    canonical: "세종특별자치시",
    aliases: ["세종", "세종시", "세종특별자치시"],
    districts: [],
    officialDomains: ["sejong.go.kr"],
  },
  { canonical: "경기도", aliases: ["경기", "경기도"], districts: [], officialDomains: ["gg.go.kr"] },
  { canonical: "강원특별자치도", aliases: ["강원", "강원도", "강원특별자치도"], districts: [], officialDomains: ["provin.gangwon.kr"] },
  { canonical: "충청북도", aliases: ["충북", "충청북도"], districts: [], officialDomains: ["chungbuk.go.kr"] },
  { canonical: "충청남도", aliases: ["충남", "충청남도"], districts: [], officialDomains: ["cn.go.kr"] },
  { canonical: "전북특별자치도", aliases: ["전북", "전라북도", "전북특별자치도"], districts: [], officialDomains: ["jeonbuk.go.kr"] },
  { canonical: "전라남도", aliases: ["전남", "전라남도"], districts: [], officialDomains: ["jeonnam.go.kr"] },
  { canonical: "경상북도", aliases: ["경북", "경상북도"], districts: [], officialDomains: ["gb.go.kr"] },
  { canonical: "경상남도", aliases: ["경남", "경상남도"], districts: [], officialDomains: ["gyeongnam.go.kr"] },
  { canonical: "제주특별자치도", aliases: ["제주", "제주도", "제주특별자치도"], districts: [], officialDomains: ["jeju.go.kr"] },
];

const unique = (values) => [...new Set(values.filter(Boolean))];
const regionGroups = municipalRegionProfiles.map(({ canonical, aliases }) => ({ canonical, aliases }));

const matchesLooseKey = (candidate, key) => {
  const candidateKey = compactSearchText(candidate);
  return candidateKey === key || candidateKey.includes(key) || key.includes(candidateKey);
};

const findRegionGroup = (value) => {
  const key = compactSearchText(value);
  if (!key) {
    return null;
  }

  return regionGroups.find((group) => group.aliases.some((alias) => matchesLooseKey(alias, key))) ?? null;
};

const findMunicipalProfileMatch = (value) => {
  const key = compactSearchText(value);
  if (!key) {
    return null;
  }

  for (const profile of municipalRegionProfiles) {
    const matchedAlias = profile.aliases.find((alias) => matchesLooseKey(alias, key));
    if (matchedAlias) {
      return { profile, matchedLabel: matchedAlias, matchedType: "alias" };
    }

    const matchedDistrict = profile.districts.find((district) => matchesLooseKey(district, key));
    if (matchedDistrict) {
      return { profile, matchedLabel: matchedDistrict, matchedType: "district" };
    }
  }

  return null;
};

const enrichProfile = (profile, matchedLabel = profile.canonical, matchedType = "alias") => ({
  canonical: profile.canonical,
  aliases: [...profile.aliases],
  districts: [...profile.districts],
  officialDomains: [...profile.officialDomains],
  matchedLabel,
  matchedType,
});

export const splitRegionQueries = (value) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const expandRegionQueryVariants = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return [];
  }

  const matchedGroup = findRegionGroup(raw);
  if (!matchedGroup) {
    return [raw];
  }

  return unique([raw, matchedGroup.canonical, ...matchedGroup.aliases]);
};

export const buildRegionSearchKeys = (value) =>
  unique(expandRegionQueryVariants(value).map((entry) => compactSearchText(entry)));

export const matchesRegionText = (text, regionQueries) => {
  const textKey = compactSearchText(text);
  if (!textKey || regionQueries.length === 0) {
    return false;
  }

  return regionQueries.some((regionQuery) => {
    const queryKeys = buildRegionSearchKeys(regionQuery);
    return queryKeys.some((queryKey) => textKey.includes(queryKey) || queryKey.includes(textKey));
  });
};

export const matchesAnyRegionQuery = (locationTexts, regionQueries) =>
  locationTexts.some((locationText) => matchesRegionText(locationText, regionQueries));

export const resolveNamedRegion = (value) => {
  const matched = findMunicipalProfileMatch(value);
  return matched ? enrichProfile(matched.profile, matched.matchedLabel, matched.matchedType) : null;
};

export const getMunicipalSearchProfiles = ({ region = "", text = "" } = {}) => {
  const matchedProfiles = new Map();

  splitRegionQueries(region).forEach((regionQuery) => {
    const matched = findMunicipalProfileMatch(regionQuery);
    if (!matched) {
      return;
    }

    matchedProfiles.set(matched.profile.canonical, enrichProfile(matched.profile, matched.matchedLabel, matched.matchedType));
  });

  if (matchedProfiles.size === 0) {
    const textKey = compactSearchText(text);
    if (!textKey) {
      return [];
    }

    municipalRegionProfiles.forEach((profile) => {
      const matchedAlias = profile.aliases.find((alias) => textKey.includes(compactSearchText(alias)));
      if (matchedAlias) {
        matchedProfiles.set(profile.canonical, enrichProfile(profile, matchedAlias, "alias"));
        return;
      }

      const matchedDistrict = profile.districts.find((district) => textKey.includes(compactSearchText(district)));
      if (matchedDistrict) {
        matchedProfiles.set(profile.canonical, enrichProfile(profile, matchedDistrict, "district"));
      }
    });
  }

  return [...matchedProfiles.values()];
};

export const collectMunicipalSearchTerms = (profile) =>
  unique([profile.canonical, ...profile.aliases, ...profile.districts]);

export const extractMatchedLocations = (text, profile) => {
  const textKey = compactSearchText(text);
  if (!textKey) {
    return [];
  }

  const matchedDistricts = profile.districts.filter((district) => textKey.includes(compactSearchText(district)));
  if (matchedDistricts.length > 0) {
    return unique([profile.canonical, ...matchedDistricts]);
  }

  if ([profile.canonical, ...profile.aliases].some((alias) => textKey.includes(compactSearchText(alias)))) {
    return [profile.canonical];
  }

  return [];
};
