import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Send, Sparkle } from "lucide-react";
import { useState } from "react";
import { post, qk } from "#/lib/api";
import { cn } from "#/lib/utils";
import { Button } from "../ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "../ui/collapsible";
import { Textarea } from "../ui/textarea";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = [
	"Why do you think this?",
	"Draft a softer message",
	"What if I offer $10 instead?",
];

/** Ask Counterclaim about this case. Read-only; revisions become new proposals that still need approval. */
export function AgentChat({ disputeId }: { disputeId: string }) {
	const qc = useQueryClient();
	const [open, setOpen] = useState(false);
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
		<Collapsible
			open={open}
			onOpenChange={setOpen}
			className="rounded-lg border bg-card"
		>
			<CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium">
				<Sparkle className="size-4 text-primary" /> Ask Counterclaim about this
				case
				<ChevronDown
					className={cn(
						"ml-auto size-4 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="space-y-3 px-4 pb-4">
				{msgs.length === 0 && (
					<div className="flex flex-wrap gap-1.5">
						{SUGGESTIONS.map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => send(s)}
								className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
							>
								{s}
							</button>
						))}
					</div>
				)}
				<ul className="max-h-80 space-y-2 overflow-y-auto" aria-live="polite">
					{msgs.map((m, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: append-only transcript
						<li
							key={i}
							className={cn(
								"rounded-md px-3 py-2 text-sm whitespace-pre-wrap",
								m.role === "user"
									? "ml-8 bg-accent text-accent-foreground"
									: "mr-4 bg-muted",
							)}
						>
							{m.content}
						</li>
					))}
					{ask.isPending && (
						<li className="mr-4 animate-pulse rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
							Thinking…
						</li>
					)}
				</ul>
				<form
					className="flex items-end gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						send(input);
					}}
				>
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								send(input);
							}
						}}
						rows={2}
						placeholder="Ask why, or ask for a change…"
						className="min-h-0 text-sm"
						aria-label="Message Counterclaim"
					/>
					<Button
						type="submit"
						size="icon"
						aria-label="Send"
						disabled={ask.isPending || !input.trim()}
					>
						<Send className="size-4" />
					</Button>
				</form>
				<p className="text-[11px] text-muted-foreground">
					Chat can explain and revise proposals. Nothing is sent to PayPal until
					you approve.
				</p>
			</CollapsibleContent>
		</Collapsible>
	);
}
