const defaultHeaders = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
};

export const fetchTextWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: defaultHeaders,
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`fetch_failed:${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
};
