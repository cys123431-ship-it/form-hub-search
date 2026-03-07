import crypto from "node:crypto";

export const createId = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

export const createStableId = (prefix, seed) => {
  const digest = crypto.createHash("sha256").update(String(seed)).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
};
