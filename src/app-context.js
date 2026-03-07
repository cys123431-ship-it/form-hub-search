import { seedCatalogIfNeeded } from "./bootstrap.js";
import { stateFilePath, samplesDir } from "./config/paths.js";
import { JsonStateRepository } from "./repositories/json/json-state-repository.js";
import { AdminService } from "./services/admin/admin-service.js";
import { ClassificationService } from "./services/classify/classification-service.js";
import { CrawlService } from "./services/crawl/crawl-service.js";
import { ManualJsonSourceAdapter } from "./services/crawl/manual-json-source-adapter.js";
import { DaejeonGosiLiveSearchAdapter } from "./services/live/daejeon-gosi-live-search-adapter.js";
import { DaejeonJobEventLiveSearchAdapter } from "./services/live/daejeon-job-event-live-search-adapter.js";
import { GojobsLiveSearchAdapter } from "./services/live/gojobs-live-search-adapter.js";
import { JobAlioLiveSearchAdapter } from "./services/live/job-alio-live-search-adapter.js";
import { JobKoreaLiveSearchAdapter } from "./services/live/jobkorea-live-search-adapter.js";
import { LiveRecruitmentService } from "./services/live/live-recruitment-service.js";
import { MunicipalOfficialSearchAdapter } from "./services/live/municipal-official-search-adapter.js";
import { SaraminLiveSearchAdapter } from "./services/live/saramin-live-search-adapter.js";
import { SearchService } from "./services/search/search-service.js";
import { Work24LiveSearchAdapter } from "./services/live/work24-live-search-adapter.js";

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
  const adapterRegistry = new Map([
    ["manual_json_source", new ManualJsonSourceAdapter(samplesDir)],
    ["jobkorea_live_search", new JobKoreaLiveSearchAdapter()],
    ["saramin_live_search", new SaraminLiveSearchAdapter()],
    ["municipal_official_search", new MunicipalOfficialSearchAdapter()],
    ["work24_live_search", new Work24LiveSearchAdapter()],
    ["gojobs_live_search", new GojobsLiveSearchAdapter()],
    ["job_alio_live_search", new JobAlioLiveSearchAdapter()],
    ["daejeon_job_event_live_search", new DaejeonJobEventLiveSearchAdapter()],
    ["daejeon_gosi_live_search", new DaejeonGosiLiveSearchAdapter()],
  ]);
  const crawlService = new CrawlService({ repository, classificationService, adapterRegistry });
  const liveRecruitmentService = new LiveRecruitmentService({ repository, classificationService, adapterRegistry });
  const searchService = new SearchService(repository, liveRecruitmentService);
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
