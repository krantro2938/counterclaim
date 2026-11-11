import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	FileSearch,
	HandCoins,
	HelpCircle,
	MessageSquareText,
	Send,
} from "lucide-react";
import { useState } from "react";
import { post, qk } from "#/lib/api";
import { cn } from "#/lib/utils";
import { Button } from "../ui/button";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGESTIONS: {
	text: string;
	Icon: React.ComponentType<{ className?: string }>;
	tint: string;
}[] = [
	{
		text: "Why do you think this?",
		Icon: HelpCircle,
		tint: "bg-review-soft text-review",
	},
	{
		text: "Draft a softer message",
		Icon: MessageSquareText,
		tint: "bg-won-soft text-won",
	},
	{
		text: "What if I offer $10 instead?",
		Icon: HandCoins,
		tint: "bg-deadline-soft text-deadline",
	},
	{
		text: "What evidence is missing?",
		Icon: FileSearch,
		tint: "bg-simulated-soft text-simulated",
	},
];

/** Ask Counterclaim about this case. Read-only; revisions become new proposals that still need approval. */
export function AgentChat({ disputeId }: { disputeId: string }) {
	const qc = useQueryClient();
	const [input, setInput] = useState("");
	const [msgs, setMsgs] = useState<Msg[]>([]);
	const ask = useMutation({
		mutationFn: (message: string) =>
			post<{ reply: string; revisedActionId: string | null }>(
				`/api/disputes/${disputeId}/chat`,
				{ message, history: msgs },
			),
		onSuccess: (r) => {
			setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
			if (r.revisedActionId)
				qc.invalidateQueries({ queryKey: qk.dispute(disputeId) });
		},
		onError: (e: Error) =>
			setMsgs((m) => [
				...m,
				{ role: "assistant", content: `Couldn't answer: ${e.message}` },
			]),
	});
	const send = (text: string) => {
		const t = text.trim();
		if (!t || ask.isPending) return;
		setMsgs((m) => [...m, { role: "user", content: t }]);
		setInput("");
		ask.mutate(t);
	};
	return (
		<section
			className="field space-y-4 p-5 sm:p-6"
			aria-label="Ask Counterclaim"
		>
			<h3 className="text-[15px] font-semibold">Ask Counterclaim</h3>
			{msgs.length === 0 ? (
				<div className="grid grid-cols-2 gap-2">
					{SUGGESTIONS.map((s) => (
						<button
							key={s.text}
							type="button"
							onClick={() => send(s.text)}
							className="tile flex min-h-[84px] flex-col justify-between gap-3 p-3 text-left text-[13px] font-medium leading-snug transition-colors hover:bg-accent"
						>
							<span
								className={cn(
									"flex size-7 items-center justify-center rounded-lg",
									s.tint,
								)}
							>
								<s.Icon className="size-3.5" />
							</span>
							{s.text}
						</button>
					))}
				</div>
			) : (
				<ul className="max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
					{msgs.map((m, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only transcript
						<li
							key={i}
							className={cn(
								"w-fit max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
								m.role === "user"
									? "ml-auto bg-accent text-accent-foreground"
									: "bg-review-soft text-foreground",
							)}
						>
							{m.content}
						</li>
					))}
					{ask.isPending && (
						<li className="w-fit animate-pulse rounded-2xl bg-review-soft px-4 py-2.5 text-sm text-muted-foreground">
							Thinking…
						</li>
					)}
				</ul>
			)}
			<form
				className="flex items-center gap-2 rounded-full bg-muted py-1 pr-1 pl-4 focus-within:ring-2 focus-within:ring-ring/40"
				onSubmit={(e) => {
					e.preventDefault();
					send(input);
				}}
			>
				<input
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="Ask why, or ask for a change…"
					className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					aria-label="Message Counterclaim"
				/>
				<Button
					type="submit"
					size="icon"
					className="size-9"
					aria-label="Send"
					disabled={ask.isPending || !input.trim()}
				>
					<Send className="size-4" />
				</Button>
			</form>
			<p className="text-center text-[11px] text-muted-foreground">
				Chat can explain and revise proposals. Nothing is sent to PayPal until
				you approve.
			</p>
		</section>
	);
}
