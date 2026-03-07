import crypto from "node:crypto";

export const createId = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
