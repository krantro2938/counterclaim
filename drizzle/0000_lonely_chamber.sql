CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" text NOT NULL,
	"assessment_id" integer,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"source" text DEFAULT 'agent' NOT NULL,
	"rationale" text,
	"rel" text,
	"paypal_request_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"paypal_debug_id" text,
	"response" jsonb,
	"error" jsonb,
	"execute_after" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispute_id" text,
	"order_id" uuid,
	"actor" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"assessment_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispute_id" text NOT NULL,
	"version" integer NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"rubric_score" integer,
	"llm_score" integer,
	"final_score" integer,
	"recommended_action" text,
	"confidence" text,
	"headline" text,
	"reasoning" jsonb,
	"risks" jsonb,
	"missing" jsonb,
	"facts" jsonb,
	"rubric" jsonb,
	"degraded" boolean DEFAULT false NOT NULL,
	"mode" text,
	"model" text,
	"latency_ms" integer,
	"tokens_in" integer,
	"tokens_out" integer,
	"error" text,
	"status_at_assessment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carrier_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipment_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"location" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"dispute_id" text,
	"direction" text NOT NULL,
	"channel" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" uuid,
	"reason" text NOT NULL,
	"stage" text,
	"status" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"seller_response_due_at" timestamp with time zone,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"outcome" text,
	"outcome_code" text,
	"buyer_name" text,
	"buyer_transaction_id" text,
	"seller_transaction_id" text,
	"create_time" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_response_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paypal_update_time" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "evidence_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispute_id" text NOT NULL,
	"action_id" uuid,
	"filename" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"locked_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"store_name" text DEFAULT 'Kiln & Thread' NOT NULL,
	"owner_name" text DEFAULT 'Maya' NOT NULL,
	"autopilot" jsonb NOT NULL,
	"at_risk_after_hours" integer DEFAULT 1 NOT NULL,
	"fee_constants" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer NOT NULL,
	"paypal_order_id" text,
	"capture_id" text,
	"buyer_email" text,
	"buyer_name" text,
	"payer_id" text,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"items" jsonb NOT NULL,
	"shipping_address" jsonb,
	"paypal_shipping_address" jsonb,
	"status" text DEFAULT 'created' NOT NULL,
	"captured_at" timestamp with time zone,
	"protection_status" text DEFAULT 'pending' NOT NULL,
	"protection_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"origin" text DEFAULT 'paypal' NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_paypalOrderId_unique" UNIQUE("paypal_order_id"),
	CONSTRAINT "orders_captureId_unique" UNIQUE("capture_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"image_url" text NOT NULL,
	"disclaimer" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"shipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_to_paypal_at" timestamp with time zone,
	"paypal_response" jsonb,
	"simulated" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"section" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	CONSTRAINT "store_policies_section_unique" UNIQUE("section")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verify_detail" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carrier_events" ADD CONSTRAINT "carrier_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_messages" ADD CONSTRAINT "customer_messages_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_dispute_id_disputes_id_fk" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_files" ADD CONSTRAINT "evidence_files_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_dispute_idx" ON "actions" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "activity_at_idx" ON "activity" USING btree ("at");--> statement-breakpoint
CREATE INDEX "activity_dispute_idx" ON "activity" USING btree ("dispute_id");--> statement-breakpoint
CREATE INDEX "agent_steps_assessment_idx" ON "agent_steps" USING btree ("assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessments_dispute_version_idx" ON "assessments" USING btree ("dispute_id","version");--> statement-breakpoint
CREATE INDEX "disputes_status_idx" ON "disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs" USING btree ("run_after") WHERE done_at is null;--> statement-breakpoint
CREATE INDEX "orders_captured_at_idx" ON "orders" USING btree ("captured_at");