import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/disputes/$disputeId")({ component: () => <div className="p-6">Case detail</div> });
