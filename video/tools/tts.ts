/**
 * Voice-over with Mistral Voxtral TTS (hosted API), one file per segment (VIDEO.md §3).
 *
 *   # every segment of video/script.md in one voice
 *   pnpm tsx --env-file=.env video/tools/tts.ts --script video/script.md --voice voice_478
 *   # one line in several candidate voices (voice audition)
 *   pnpm tsx --env-file=.env video/tools/tts.ts --id 03 --text "…" --voices voice_478,voice_3150,en_paul_neutral --out video/audio/candidates
 *
 * Output: 48 kHz mono WAV, loudness-normalised to about −16 LUFS, 300 ms of silence at both ends.
 * script.md rows look like: `| 03 | 0:24–0:32 | Counterclaim is an AI agent… |` (id | time | spoken text).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.mistral.ai/v1/audio/speech";
const MODEL = "voxtral-mini-tts-3-0";

function arg(name: string): string | undefined {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : undefined;
}

async function speak(text: string, voice: string): Promise<Buffer> {
	const key = process.env.MISTRAL_API_KEY;
	if (!key) throw new Error("MISTRAL_API_KEY is not set");
	let res: Response | undefined;
	for (let attempt = 0; attempt < 6; attempt++) {
		res = await fetch(API, {
			method: "POST",
			headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
			body: JSON.stringify({ model: MODEL, input: text, voice_id: voice, response_format: "wav" }),
		});
		if (res.status !== 429) break;
		const wait = 5000 * 2 ** attempt;
		console.warn(`rate limited, retrying in ${wait / 1000} s`);
		await new Promise((r) => setTimeout(r, wait));
	}
	if (!res?.ok) throw new Error(`Voxtral ${res?.status}: ${(await res?.text())?.slice(0, 300)}`);
	const { audio_data } = (await res.json()) as { audio_data: string };
	return Buffer.from(audio_data, "base64");
}

/** 24 kHz Voxtral WAV → 48 kHz mono, loudnorm −16 LUFS, 300 ms pads. */
function finish(raw: Buffer, outPath: string) {
	const tmp = `${outPath}.raw.wav`;
	writeFileSync(tmp, raw);
	execFileSync("ffmpeg", [
		"-y", "-loglevel", "error", "-i", tmp,
		"-af", "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,adelay=300:all=1,apad=pad_dur=0.3",
		"-ar", "48000", "-ac", "1", outPath,
	]);
	rmSync(tmp);
}

function duration(path: string): number {
	return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString().trim());
}

type Seg = { id: string; text: string };

function readScript(path: string): Seg[] {
	return readFileSync(path, "utf8")
		.split("\n")
		.map((l) => /^\|\s*(\d{2})\s*\|[^|]*\|\s*(.+?)\s*\|\s*$/.exec(l))
		.filter((m): m is RegExpExecArray => Boolean(m))
		.map((m) => ({ id: m[1], text: m[2].replace(/^"|"$/g, "") }));
}

const out = arg("out") ?? "video/audio";
mkdirSync(out, { recursive: true });
const voices = (arg("voices") ?? arg("voice") ?? "voice_478").split(",");
const segs: Seg[] = arg("script") ? readScript(arg("script") as string) : [{ id: arg("id") ?? "00", text: arg("text") ?? "" }];
const only = arg("only");

for (const s of segs.filter((x) => !only || only.split(",").includes(x.id))) {
	if (!s.text) continue;
	for (const v of voices) {
		const file = join(out, voices.length > 1 ? `seg-${s.id}-${v}.wav` : `seg-${s.id}.wav`);
		finish(await speak(s.text, v), file);
		await new Promise((r) => setTimeout(r, 2500)); // stay under the per-minute limit
		console.log(`${file}  ${duration(file).toFixed(2)} s  "${s.text.slice(0, 60)}${s.text.length > 60 ? "…" : ""}"`);
	}
}
