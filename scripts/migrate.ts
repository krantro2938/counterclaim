import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "../src/server/db/client";

await migrate(db(), { migrationsFolder: "./drizzle" });
console.log("migrations applied");
await sql().end();
