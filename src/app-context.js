import { seedCatalogIfNeeded } from "./bootstrap.js";
import { stateFilePath, samplesDir } from "./config/paths.js";
import { JsonStateRepository } from "./repositories/json/json-state-repository.js";
import { AdminService } from "./services/admin/admin-service.js";
import { ClassificationService } from "./services/classify/classification-service.js";
import { CrawlService } from "./services/crawl/crawl-service.js";
import { ManualJsonSourceAdapter } from "./services/crawl/manual-json-source-adapter.js";
import { SearchService } from "./services/search/search-service.js";

const bootstrapData = async (repository, crawlService) => {
  const seededState = await seedCatalogIfNeeded({ repository, samplesDir });
  if (seededState.documents.length === 0) {
    await crawlService.crawlAll({ reason: "startup" });
  }
};

let appContextPromise = null;

export const createAppContext = async () => {
  const repository = new JsonStateRepository(stateFilePath);
  const classificationService = new ClassificationService();
  const adapterRegistry = new Map([["manual_json_source", new ManualJsonSourceAdapter(samplesDir)]]);
  const crawlService = new CrawlService({ repository, classificationService, adapterRegistry });
  const searchService = new SearchService(repository);
  const adminService = new AdminService({ repository, crawlService });

  await bootstrapData(repository, crawlService);

  return { repository, crawlService, searchService, adminService };
};

export const getAppContext = () => {
  if (!appContextPromise) {
    appContextPromise = createAppContext();
  }
  return appContextPromise;
};
