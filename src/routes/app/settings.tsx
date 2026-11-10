import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Page, PageHeader } from "#/components/page";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Skeleton } from "#/components/ui/skeleton";
import { Slider } from "#/components/ui/slider";
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { api, qk } from "#/lib/api";
import { relativeTime } from "#/lib/format";
import { formatMoney, toMinor } from "#/lib/money";
import type { AutopilotSettings } from "#/server/db/schema";
import type { getSettingsDto } from "#/server/queries";
import { ErrorBox } from "./disputes.index";

export const Route = createFileRoute("/app/settings")({
	component: SettingsPage,
});

type Dto = Awaited<ReturnType<typeof getSettingsDto>>;

function SettingsPage() {
	const qc = useQueryClient();
	const q = useQuery({
		queryKey: qk.settings,
		queryFn: () => api<Dto>("/api/settings"),
	});
	const [auto, setAuto] = useState<AutopilotSettings | null>(null);
	const [hours, setHours] = useState(1);
	const [policies, setPolicies] = useState<Record<string, string>>({});

	useEffect(() => {
		if (!q.data) return;
		setAuto(q.data.settings.autopilot);
		setHours(q.data.settings.atRiskAfterHours);
		setPolicies(
			Object.fromEntries(q.data.policies.map((p) => [p.section, p.body])),
		);
	}, [q.data]);

	const save = useMutation({
		mutationFn: (body: unknown) =>
			api<Dto>("/api/settings", { method: "PUT", json: body }),
		onSuccess: (d) => {
			qc.setQueryData(qk.settings, d);
			toast.success("Settings saved");
		},
		onError: (e: Error) =>
			toast.error("Couldn't save", { description: e.message }),
	});

	const setA = <K extends keyof AutopilotSettings>(
		k: K,
		v: AutopilotSettings[K],
	) => setAuto((a) => (a ? { ...a, [k]: v } : a));

	if (q.isError)
		return (
			<div className="p-6">
				<ErrorBox
					message={(q.error as Error).message}
					onRetry={() => q.refetch()}
				/>
			</div>
		);
	if (!q.data || !auto)
		return (
			<Page className="max-w-[1120px]">
				<Skeleton className="h-14 w-64 rounded-xl" />
				<Skeleton className="h-72 rounded-xl" />
			</Page>
		);
	const c = q.data.connection;

	return (
		<Page className="max-w-[1120px] gap-16 md:gap-20">
			<PageHeader
				eyebrow="Setup"
				title="Settings"
				subtitle="How much Counterclaim may do on its own, and what it knows about your store."
			/>

			<Section
				title="Autopilot"
				desc={
					<>
						Off by default: every action waits for your approval. Autopilot
						actions still appear in the timeline with an "Autopilot" badge and
						wait {auto.undoWindowSeconds} seconds before they're sent, so you
						can undo them.
					</>
				}
			>
				<SwitchRow
					id="ack"
					label="Acknowledge new inquiries"
					desc="Send a short, polite message to the buyer when a dispute opens in the inquiry stage."
					checked={auto.autoAcknowledgeInquiry}
					onChange={(v) => setA("autoAcknowledgeInquiry", v)}
				/>
				<SwitchRow
					id="fulfil"
					label="Submit proof of delivery on strong cases"
					desc="Send PROOF_OF_FULFILLMENT with tracking and the evidence PDF when the rule score is high and delivery is confirmed."
					checked={auto.autoSubmitFulfillment}
					onChange={(v) => setA("autoSubmitFulfillment", v)}
				>
					<div className="flex items-center gap-3 pt-2">
						<Label className="w-40 text-xs text-muted-foreground">
							Minimum rule score
						</Label>
						<Slider
							className="max-w-48"
							min={50}
							max={100}
							step={1}
							value={[auto.autoSubmitMinScore]}
							onValueChange={([v]) => setA("autoSubmitMinScore", v)}
							disabled={!auto.autoSubmitFulfillment}
						/>
						<Input
							className="h-9 w-16 bg-background font-mono"
							inputMode="numeric"
							value={auto.autoSubmitMinScore}
							onChange={(e) =>
								setA(
									"autoSubmitMinScore",
									Math.min(100, Math.max(50, Number(e.target.value) || 0)),
								)
							}
							disabled={!auto.autoSubmitFulfillment}
							aria-label="Minimum rule score"
						/>
					</div>
				</SwitchRow>
				<SwitchRow
					id="accept"
					label="Accept small claims you'd likely lose"
					desc="Refund automatically when the amount is small and the win likelihood is low. Fighting would cost more time than it saves."
					checked={auto.autoAcceptSmallClaims}
					onChange={(v) => setA("autoAcceptSmallClaims", v)}
				>
					<div className="grid gap-2 pt-2 sm:grid-cols-2">
						<div className="flex items-center gap-2">
							<Label className="text-xs text-muted-foreground">Up to</Label>
							<Input
								className="h-9 w-24 bg-background font-mono"
								inputMode="decimal"
								defaultValue={(auto.autoAcceptMaxMinor / 100).toFixed(2)}
								onBlur={(e) => {
									try {
										setA("autoAcceptMaxMinor", toMinor(e.target.value || "0"));
									} catch {}
								}}
								disabled={!auto.autoAcceptSmallClaims}
								aria-label="Maximum amount in dollars"
							/>
							<span className="text-xs text-muted-foreground">
								{formatMoney(auto.autoAcceptMaxMinor)}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<Label className="text-xs text-muted-foreground">
								Likelihood below
							</Label>
							<Input
								className="h-9 w-16 bg-background font-mono"
								inputMode="numeric"
								value={auto.autoAcceptMaxLikelihood}
								onChange={(e) =>
									setA(
										"autoAcceptMaxLikelihood",
										Math.min(60, Math.max(0, Number(e.target.value) || 0)),
									)
								}
								disabled={!auto.autoAcceptSmallClaims}
								aria-label="Maximum win likelihood"
							/>
							<span className="text-xs text-muted-foreground">%</span>
						</div>
					</div>
				</SwitchRow>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5">
						<Label htmlFor="undo">Undo window (seconds)</Label>
						<Input
							id="undo"
							className="w-28 bg-background font-mono"
							inputMode="numeric"
							value={auto.undoWindowSeconds}
							onChange={(e) =>
								setA(
									"undoWindowSeconds",
									Math.min(600, Math.max(30, Number(e.target.value) || 30)),
								)
							}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="risk">Flag unshipped orders after (hours)</Label>
						<Input
							id="risk"
							className="w-28 bg-background font-mono"
							inputMode="numeric"
							value={hours}
							onChange={(e) =>
								setHours(
									Math.min(240, Math.max(0, Number(e.target.value) || 0)),
								)
							}
						/>
					</div>
				</div>
				<Button
					onClick={() =>
						save.mutate({ autopilot: auto, atRiskAfterHours: hours })
					}
					disabled={save.isPending}
				>
					Save autopilot
				</Button>
			</Section>

			<Section
				title="Store policies"
				desc={
					<>
						Counterclaim quotes these in its reasoning and in evidence packets.
						Keep them accurate.
					</>
				}
			>
				{q.data.policies.map((p) => (
					<div key={p.section} className="space-y-1.5">
						<Label htmlFor={`pol-${p.section}`}>{p.title}</Label>
						<Textarea
							id={`pol-${p.section}`}
							rows={4}
							value={policies[p.section] ?? ""}
							onChange={(e) =>
								setPolicies((s) => ({ ...s, [p.section]: e.target.value }))
							}
						/>
					</div>
				))}
				<Button
					variant="outline"
					onClick={() =>
						save.mutate({
							policies: Object.entries(policies).map(([section, body]) => ({
								section,
								body,
							})),
						})
					}
					disabled={save.isPending}
				>
					Save policies
				</Button>
			</Section>

			<Section
				title="Connection"
				desc="Live status of the PayPal sandbox link, webhooks, the poller and the AI model."
			>
				<dl className="field grid gap-x-6 gap-y-4 p-6 text-sm sm:grid-cols-[180px_1fr]">
					<dt className="text-muted-foreground">PayPal ({c.paypalEnv})</dt>
					<dd>
						<StatusLine
							ok={c.tokenOk}
							okText="Token OK"
							badText={
								c.paypalConfigured
									? `Token failed: ${c.tokenError}`
									: "Not configured"
							}
						/>
					</dd>
					<dt className="text-muted-foreground">Webhook</dt>
					<dd className="space-y-0.5">
						<StatusLine
							ok={c.webhookId ? true : null}
							okText={<span className="font-mono text-xs">{c.webhookId}</span>}
							badText="No webhook ID; the poller keeps things in sync"
						/>
						<p className="font-mono text-xs text-muted-foreground">
							{c.webhookUrl}
						</p>
						<p className="text-xs text-muted-foreground">
							Last received:{" "}
							{c.lastWebhook
								? `${c.lastWebhook.type} · ${relativeTime(c.lastWebhook.at)}`
								: "never"}
						</p>
					</dd>
					<dt className="text-muted-foreground">Dispute poller</dt>
					<dd>
						{c.pollerLastRun
							? `Last run ${relativeTime(c.pollerLastRun.at)} · ${c.pollerLastRun.found} updated`
							: "Not run yet"}
					</dd>
					<dt className="text-muted-foreground">AI model</dt>
					<dd>
						<span className="font-mono text-xs">{c.models.assess}</span>{" "}
						<span className="text-muted-foreground">
							via{" "}
							{c.aiProvider === "anthropic"
								? "Anthropic"
								: "OpenAI-compatible API"}
						</span>
					</dd>
					<dt className="text-muted-foreground">Sandbox controls</dt>
					<dd>{c.labEnabled ? "Enabled (Lab)" : "Disabled"}</dd>
				</dl>
			</Section>
		</Page>
	);
}

/** Settings section: serif title + description on the left, controls on the right (DESIGN §7.5). */
function Section({
	title,
	desc,
	children,
}: {
	title: string;
	desc: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="grid gap-6 md:grid-cols-[260px_minmax(0,1fr)] md:gap-14">
			<div>
				<h2 className="font-display text-[30px] leading-tight">{title}</h2>
				<p className="mt-3 text-sm leading-relaxed text-muted-foreground">
					{desc}
				</p>
			</div>
			<div className="min-w-0 space-y-3">{children}</div>
		</section>
	);
}

function SwitchRow({
	id,
	label,
	desc,
	checked,
	onChange,
	children,
}: {
	id: string;
	label: string;
	desc: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	children?: React.ReactNode;
}) {
	return (
		<div className="field p-6">
			<div className="flex items-start justify-between gap-6">
				<div>
					<Label htmlFor={id} className="text-[15px] font-medium">
						{label}
					</Label>
					<p className="mt-1 text-sm leading-relaxed text-muted-foreground">
						{desc}
					</p>
				</div>
				<Switch id={id} checked={checked} onCheckedChange={onChange} />
			</div>
			{children}
		</div>
	);
}

function StatusLine({
	ok,
	okText,
	badText,
}: {
	ok: boolean | null;
	okText: React.ReactNode;
	badText: React.ReactNode;
}) {
	if (ok === true)
		return (
			<span className="inline-flex items-center gap-1.5 text-won">
				<CheckCircle2 className="size-4" /> {okText}
			</span>
		);
	if (ok === false)
		return (
			<span className="inline-flex items-center gap-1.5 text-lost">
				<CircleAlert className="size-4" /> {badText}
			</span>
		);
	return (
		<span className="inline-flex items-center gap-1.5 text-muted-foreground">
			<CircleDashed className="size-4" /> {badText}
		</span>
	);
}
