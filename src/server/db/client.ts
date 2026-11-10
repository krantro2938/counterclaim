import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

type Db = ReturnType<typeof makeDb>;

function makeDb(sql: postgres.Sql) {
	return drizzle({ client: sql, schema, casing: "snake_case" });
}

const g = globalThis as unknown as { __ccSql?: postgres.Sql; __ccDb?: Db };

/** Shared postgres.js connection (one pool per process, survives HMR). */
export function sql(): postgres.Sql {
	if (!g.__ccSql) {
		g.__ccSql = postgres(env().DATABASE_URL, {
			max: 10,
			onnotice: () => {},
		});
	}
	return g.__ccSql;
}

export function db(): Db {
	if (!g.__ccDb) g.__ccDb = makeDb(sql());
	return g.__ccDb;
}

export { schema };
