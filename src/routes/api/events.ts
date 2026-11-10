import { createFileRoute } from "@tanstack/react-router";
import { subscribe } from "#/server/events/bus";

/** Server-Sent Events, fed by LISTEN cc_events. */
export const Route = createFileRoute("/api/events")({
	server: {
		handlers: {
			GET: async ({ request }: { request: Request }) => {
				const enc = new TextEncoder();
				let cleanup = () => {};
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						const write = (s: string) => {
							try {
								controller.enqueue(enc.encode(s));
							} catch {
								cleanup();
							}
						};
						write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
						const unsub = subscribe((e) => write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
						const hb = setInterval(() => write(`: ping ${Date.now()}\n\n`), 15_000);
						cleanup = () => {
							unsub();
							clearInterval(hb);
							try {
								controller.close();
							} catch {}
						};
						request.signal.addEventListener("abort", () => cleanup());
					},
					cancel() {
						cleanup();
					},
				});
				return new Response(stream, {
					headers: {
						"Content-Type": "text/event-stream; charset=utf-8",
						"Cache-Control": "no-cache, no-transform",
						Connection: "keep-alive",
						"X-Accel-Buffering": "no",
					},
				});
			},
		},
	},
});
