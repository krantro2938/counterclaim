import type { getDisputeDetail } from "#/server/queries";

export type DisputeDetail = NonNullable<
	Awaited<ReturnType<typeof getDisputeDetail>>
>;
export type ActionDto = DisputeDetail["actions"][number];
export type FactDto = {
	id: string;
	text: string;
	source: "paypal" | "carrier_sim" | "store" | "messages";
	strength: string;
	simulated?: boolean;
	tag?: string;
};
