import { paypalRequest } from "../src/server/paypal/rest";
const [cap, trk] = process.argv.slice(2);
try {
	const r = await paypalRequest({ method: "GET", path: `/v1/shipping/trackers/${cap}-${trk}` });
	console.log(r.status, JSON.stringify(r.data).slice(0, 600), r.debugId);
} catch (e) { console.log("ERR", (e as Error).message.slice(0, 600)); }
process.exit(0);
