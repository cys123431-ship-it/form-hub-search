export const normalizeWhitespace = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const normalizeSearchText = (value) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const compactSearchText = (value) => normalizeSearchText(value).replace(/\s+/g, "");

export const normalizeUrl = (value) => {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    url.hash = "";
    if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
      url.port = "";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value).trim();
  }
};

export const splitQueryTokens = (value) =>
  normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);

export const hasAllTokens = (text, tokens) => {
  const normalized = compactSearchText(text);
  return tokens.every((token) => normalized.includes(compactSearchText(token)));
};

export const hasAnyToken = (text, tokens) => {
  if (tokens.length === 0) {
    return true;
  }

  const normalized = compactSearchText(text);
  return tokens.some((token) => normalized.includes(compactSearchText(token)));
};

export const firstSentences = (value, count = 2) => {
  const text = normalizeWhitespace(value);
  const sentences = text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return text.slice(0, 140);
  }

  return sentences.slice(0, count).join(" ").slice(0, 180);
};
