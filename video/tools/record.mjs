// Records the demo takes from the deployed app in headless Chromium at 1920×1080.
// Frames come from the DevTools screencast (CSS viewport 1440×810 at 1.333× density, so text is
// rendered natively at 1080p, not upscaled) and are assembled by ffmpeg at a constant 30 fps.
// A drawn cursor with click ripples is injected because headless Chrome has no visible pointer.
//
//   node video/tools/record.mjs --take=A --dry   # rehearse: stops before every irreversible click
//   node video/tools/record.mjs --take=A         # real take (sends to the PayPal sandbox)
// Env: BASE (default https://counterclaim.aansl.com), RESOLVE_IP (pin the host's IP), CHROME.
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "https://counterclaim.aansl.com";
const DRY = process.argv.includes("--dry");
const TAKE = process.argv.find((a) => a.startsWith("--take="))?.slice(7);
const OUT = new URL("../recordings/", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = {
	defend: "PP-R-DMM-10199608",
	decide: "PP-R-MGU-10200190",
	honest: "PP-R-CXI-10199610",
};

// ─── browser + cursor ────────────────────────────────────────────────────────

async function launch() {
	const args = ["--hide-scrollbars", "--force-color-profile=srgb"];
	if (process.env.RESOLVE_IP)
		args.push(
			`--host-resolver-rules=MAP ${new URL(BASE).hostname} ${process.env.RESOLVE_IP}`,
		);
	const browser = await puppeteer.launch({
		executablePath: process.env.CHROME ?? "/usr/bin/chromium",
		headless: true,
		args,
		defaultViewport: { width: 1440, height: 810, deviceScaleFactor: 4 / 3 },
	});
	const page = await browser.newPage();
	await page.evaluateOnNewDocument(() => {
		try {
			localStorage.setItem("cc-theme", "light");
		} catch {}
		const mount = () => {
			if (document.getElementById("__cursor")) return;
			const c = document.createElement("div");
			c.id = "__cursor";
			c.style.cssText =
				"position:fixed;left:0;top:0;width:24px;height:24px;z-index:2147483647;pointer-events:none;will-change:transform;";
			c.innerHTML =
				'<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 2.5l15 9-6.6 1.5L9.3 20z" fill="#14231a" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
			const p = window.__cursorPos ?? { x: 720, y: 405 };
			c.style.transform = `translate(${p.x - 4}px,${p.y - 3}px)`;
			document.documentElement.appendChild(c);
		};
		addEventListener(
			"mousemove",
			(e) => {
				window.__cursorPos = { x: e.clientX, y: e.clientY };
				const c = document.getElementById("__cursor");
				if (c)
					c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 3}px)`;
			},
			true,
		);
		addEventListener(
			"mousedown",
			(e) => {
				const r = document.createElement("div");
				r.style.cssText = `position:fixed;left:${e.clientX - 16}px;top:${e.clientY - 16}px;width:32px;height:32px;border-radius:50%;background:rgba(46,110,72,.32);z-index:2147483646;pointer-events:none;transform:scale(.3);opacity:1;transition:transform .4s ease-out,opacity .4s ease-out;`;
				document.documentElement.appendChild(r);
				requestAnimationFrame(() => {
					r.style.transform = "scale(1.5)";
					r.style.opacity = "0";
				});
				setTimeout(() => r.remove(), 450);
			},
			true,
		);
		if (document.readyState === "loading")
			addEventListener("DOMContentLoaded", mount);
		else mount();
		setInterval(mount, 500);
	});
	return { browser, page };
}

let mx = 720;
let my = 405;
async function moveTo(page, el, opts = {}) {
	await el.scrollIntoView?.().catch(() => {});
	const b = await el.boundingBox();
	if (!b) throw new Error("element not visible");
	const x = b.x + (opts.dx ?? b.width / 2);
	const y = b.y + (opts.dy ?? b.height / 2);
	const steps = Math.max(14, Math.round(Math.hypot(x - mx, y - my) / 14));
	await page.mouse.move(x, y, { steps });
	mx = x;
	my = y;
}
async function click(page, el, pause = 380) {
	await moveTo(page, el);
	await sleep(pause);
	await page.mouse.down();
	await sleep(90);
	await page.mouse.up();
}
async function wheel(page, dy, steps = 10) {
	for (let i = 0; i < steps; i++) {
		await page.mouse.wheel({ deltaY: dy / steps });
		await sleep(28);
	}
}

/** First visible element matching `css` whose text includes `text` (exact if `exact`). */
async function find(page, css, text, { exact = false, timeout = 20000, within } = {}) {
	const t0 = Date.now();
	while (Date.now() - t0 < timeout) {
		const h = await page.evaluateHandle(
			(css, text, exact, within) => {
				const deepest = (list) =>
					list.find((e) => !list.some((o) => o !== e && e.contains(o))) ?? null;
				const root = within
					? deepest(
							[...document.querySelectorAll(within.css)].filter((n) =>
								n.textContent?.includes(within.text),
							),
						)
					: document;
				if (!root) return null;
				const els = [...root.querySelectorAll(css)].filter((e) => {
					const r = e.getBoundingClientRect();
					const s = getComputedStyle(e);
					return r.width > 0 && r.height > 0 && s.visibility !== "hidden";
				});
				const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
				return deepest(
					els.filter((e) =>
						exact ? norm(e.textContent) === text : norm(e.textContent).includes(text),
					),
				);
			},
			css,
			text,
			exact,
			within ?? null,
		);
		const el = h.asElement();
		if (el) return el;
		await sleep(250);
	}
	throw new Error(`not found: ${css} "${text}"`);
}

async function settle(page) {
	await page.mouse.move(mx, my);
	await sleep(400);
}

// ─── recording ───────────────────────────────────────────────────────────────

async function record(page, name, fn) {
	const dir = `${OUT}${name}-frames/`;
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	const cdp = await page.createCDPSession();
	const frames = [];
	const writes = [];
	cdp.on("Page.screencastFrame", (f) => {
		const file = `${dir}${String(frames.length).padStart(6, "0")}.jpg`;
		frames.push({ file, t: Date.now() / 1000 });
		writes.push(writeFile(file, Buffer.from(f.data, "base64")));
		cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
	});
	await cdp.send("Page.startScreencast", {
		format: "jpeg",
		quality: 94,
		maxWidth: 1920,
		maxHeight: 1080,
		everyNthFrame: 1,
	});
	try {
		await fn();
	} catch (err) {
		await page.screenshot({ path: `${OUT}${name}-error.png` }).catch(() => {});
		throw err;
	} finally {
		await sleep(600);
		await cdp.send("Page.stopScreencast");
		await Promise.all(writes);
	}
	const end = Date.now() / 1000;
	let list = "";
	frames.forEach((f, i) => {
		const next = i + 1 < frames.length ? frames[i + 1].t : end;
		list += `file '${f.file}'\nduration ${Math.max(next - f.t, 1 / 60).toFixed(4)}\n`;
	});
	list += `file '${frames.at(-1).file}'\n`;
	await writeFile(`${dir}list.txt`, list);
	const out = `${OUT}${name}${DRY ? "-dry" : ""}.mp4`;
	execFileSync("ffmpeg", [
		"-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${dir}list.txt`,
		"-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p",
		"-c:v", "libx264", "-crf", "16", "-preset", "slow", "-movflags", "+faststart", out,
	]);
	await rm(dir, { recursive: true, force: true });
	console.log(`${name}: ${frames.length} frames → ${out}`);
}

/** Irreversible click (sends to PayPal). In --dry mode: hover it, screenshot, and back out. */
async function commit(page, el, label) {
	if (DRY) {
		await moveTo(page, el);
		await sleep(600);
		await page.screenshot({ path: `${OUT}dry-${label}.png` });
		console.log(`dry: would click "${label}"`);
		await page.keyboard.press("Escape");
		await sleep(500);
		return false;
	}
	await click(page, el);
	return true;
}

// ─── takes ───────────────────────────────────────────────────────────────────

const takes = {
	/** Prevent: Overview → Orders → #9009 at risk → Mark shipped → Protected. */
	async A(page) {
		await page.goto(`${BASE}/app`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-A-prevent", async () => {
			await sleep(2200);
			await moveTo(page, await find(page, "*", "Protected", { exact: true }));
			await sleep(1200);
			await click(page, await find(page, "a", "Orders", { exact: true }));
			await sleep(2600);
			const row = { css: ".ag-row", text: "#9009" };
			await moveTo(page, await find(page, ".ag-cell", "#9009", { within: row }));
			await sleep(900);
			await click(page, await find(page, "button", "Mark shipped", { within: row }));
			await sleep(1400);
			await moveTo(page, await find(page, "span", "Generate tracking number", { exact: true }));
			await sleep(1300);
			const go = await find(page, "button", "Confirm and add tracking", { exact: true });
			if (await commit(page, go, "confirm-tracking")) {
				await find(page, ".ag-row", "Protected", { timeout: 30000, within: row }).catch(() => {});
				await sleep(800);
				await moveTo(page, await find(page, ".ag-cell", "#9009", { within: row }));
				await sleep(3200);
			}
		});
	},

	/** Defend: inbox → case → verdict, facts, trace → evidence PDF → Approve → PayPal toast. */
	async B(page) {
		await page.goto(`${BASE}/app/disputes`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-B-defend", async () => {
			await sleep(2600);
			const row = { css: ".ag-row", text: "#9010" };
			await moveTo(page, await find(page, ".ag-cell", "#9010", { within: row }));
			await sleep(900);
			await click(page, await find(page, ".ag-cell", "Item not received", { within: row }));
			await sleep(3200);
			await moveTo(page, await find(page, "span", "Win likelihood", { exact: true }));
			await sleep(2200);
			await click(page, await find(page, "button", "Reasoning", { exact: true }));
			await sleep(1600);
			const chip = await find(page, 'button[aria-label^="Fact "]', "", { timeout: 4000 }).catch(() => null);
			if (chip) {
				await moveTo(page, chip);
				await sleep(1800);
			}
			await click(page, await find(page, "button", "Trace", { exact: true }));
			await sleep(2600);
			await click(page, await find(page, "button", "Timeline", { exact: true }));
			await sleep(1000);
			await click(page, await find(page, "button", "evidence packet"));
			await sleep(4200);
			await click(page, await find(page, "button", "Close", { exact: true }));
			await sleep(1000);
			await click(page, await find(page, "button", "Approve", { exact: true }));
			await sleep(1800);
			const send = await find(page, "button", "Approve and send", { exact: true });
			if (await commit(page, send, "approve-evidence")) {
				await find(page, "li, div", "PayPal accepted the response", { timeout: 45000 }).catch(() => {});
				await sleep(4500);
			}
		});
	},

	/** Defend, outcome: the case after PayPal's (sandbox) decision. */
	async B2(page) {
		const id = process.env.B2_CASE ?? CASES.defend;
		await page.goto(`${BASE}/app/disputes/${id}`, { waitUntil: "domcontentloaded" });
		await record(page, "take-B2-won", async () => {
			await sleep(1500);
			await moveTo(page, await find(page, "*", "recovered"));
			await sleep(4500);
		});
	},

	/** Defend, insert: the Trace tab (which Agent Toolkit tools the model called). Read-only. */
	async T(page) {
		const id = process.env.T_CASE ?? CASES.defend;
		await page.goto(`${BASE}/app/disputes/${id}`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-T-trace", async () => {
			await sleep(500);
			await click(page, await find(page, "button", "Reasoning", { exact: true }));
			await sleep(1200);
			await click(page, await find(page, "button", "Trace", { exact: true }));
			await sleep(1600);
			const rows = await page.$$("main li, main tr, main details");
			for (const r of rows.slice(0, 3)) {
				await moveTo(page, r).catch(() => {});
				await sleep(900);
			}
			await sleep(1200);
		});
	},

	/** Defend, insert: the evidence packet PDF (rendered on demand, so it shows the current design). Read-only. */
	async P(page) {
		const id = process.env.T_CASE ?? CASES.defend;
		await page.goto(`${BASE}/app/disputes/${id}`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-P-pdf", async () => {
			await sleep(400);
			await page.goto(`${BASE}/api/disputes/${id}/evidence-preview`, { waitUntil: "networkidle2" }).catch(() => {});
			await sleep(2500);
			await page.mouse.move(720, 500, { steps: 20 });
			await wheel(page, 400, 24);
			await sleep(1800);
			await wheel(page, 500, 24);
			await sleep(1800);
		});
	},

	/** Decide: SNAD case → partial refund proposal → adjust amount → Approve. */
	async C(page) {
		await page.goto(`${BASE}/app/disputes`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-C-decide", async () => {
			await sleep(1600);
			const row = { css: ".ag-row", text: "#9018" };
			await click(page, await find(page, ".ag-cell", "Not as described", { within: row }));
			await sleep(3200);
			await moveTo(page, await find(page, "span", "Win likelihood", { exact: true }));
			await sleep(1800);
			const amount = await find(page, 'input[inputmode="decimal"]:not([disabled])', "", { timeout: 8000 });
			await click(page, amount);
			await page.keyboard.down("Control");
			await page.keyboard.press("a");
			await page.keyboard.up("Control");
			await sleep(250);
			const offer = process.env.OFFER ?? "15.00";
			await page.keyboard.type(offer, { delay: 140 });
			await sleep(900);
			// The note goes to the buyer with the offer: keep it consistent with the new amount.
			const note = await find(page, "textarea", "", {
				timeout: 8000,
				within: { css: "div", text: "partial refund" },
			}).catch(() => null);
			if (note) {
				await click(page, note);
				await page.keyboard.down("Control");
				await page.keyboard.press("a");
				await page.keyboard.up("Control");
				await page.keyboard.type(
					`Thank you for your message. Each Celadon bowl is hand-glazed, so the colour varies from the photos, as the listing says. We'd like to offer a $${offer} partial refund so you can keep the bowl. Kiln & Thread`,
					{ delay: 12 },
				);
				await sleep(1000);
			}
			await click(page, await find(page, "button", "Approve", { exact: true }));
			await sleep(2000);
			const send = await find(page, "button", "Approve and send", { exact: true });
			if (await commit(page, send, "approve-offer")) {
				await find(page, "li, div", "PayPal accepted the response", { timeout: 45000 }).catch(() => {});
				await sleep(4500);
			}
		});
	},

	/** Honest: no-tracking INR → Accept and refund, "never protected" link (no click). */
	async D(page) {
		await page.goto(`${BASE}/app/disputes/${CASES.honest}`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-D-honest", async () => {
			await sleep(2600);
			await moveTo(page, await find(page, "span", "Win likelihood", { exact: true }));
			await sleep(1800);
			await moveTo(page, await find(page, "a", "never protected"));
			await sleep(2600);
			await moveTo(page, await find(page, "button", "Accept and refund"));
			await sleep(2600);
		});
	},

	/** Opener B-roll: the shop. */
	async E(page) {
		await page.goto(`${BASE}/shop`, { waitUntil: "networkidle2" });
		await settle(page);
		await record(page, "take-E-shop", async () => {
			await sleep(1500);
			await wheel(page, 420, 18);
			await sleep(1200);
			await moveTo(page, await find(page, "a", "Speckled Stoneware Vase"));
			await sleep(2000);
		});
	},
};

const { browser, page } = await launch();
try {
	const list = TAKE ? TAKE.split(",") : Object.keys(takes);
	await mkdir(OUT, { recursive: true });
	for (const t of list) await takes[t](page);
} finally {
	await browser.close();
}
