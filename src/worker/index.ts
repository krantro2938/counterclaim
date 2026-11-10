import { log } from "../server/log";
import { startWorker } from "../server/worker";

process.on("unhandledRejection", (err) => log.error({ err }, "unhandled rejection"));

startWorker().catch((err) => {
	log.fatal({ err }, "worker crashed");
	process.exit(1);
});
