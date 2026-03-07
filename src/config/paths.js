import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const configDir = path.dirname(currentFile);
const srcDir = path.dirname(configDir);
const stateFileName = "form-hub-state.json";

export const projectRoot = path.dirname(srcDir);
export const publicDir = path.join(projectRoot, "public");
export const samplesDir = path.join(projectRoot, "data", "samples");
export const stateFilePath =
  process.env.STATE_FILE_PATH ??
  (process.env.VERCEL
    ? path.join("/tmp", stateFileName)
    : path.join(projectRoot, "data", "state", stateFileName));
