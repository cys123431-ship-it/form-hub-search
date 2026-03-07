import http from "node:http";
import { createAdminController } from "./api/controllers/admin-controller.js";
import { createPublicController } from "./api/controllers/public-controller.js";
import { createRouter } from "./api/router.js";
import { getAppContext } from "./app-context.js";
import { env } from "./config/env.js";
import { publicDir } from "./config/paths.js";

const createApp = async () => {
  const { searchService, adminService } = await getAppContext();

  return createRouter({
    publicController: createPublicController({ searchService }),
    adminController: createAdminController({ adminService }),
    publicDir,
  });
};

const startServer = async () => {
  const router = await createApp();
  const server = http.createServer((request, response) => {
    router(request, response);
  });

  server.listen(env.port, env.host, () => {
    console.log(`Form Hub listening on http://${env.host}:${env.port}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start Form Hub", error);
  process.exitCode = 1;
});
