// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Reactive Resume.
import { env } from "@reactive-resume/env/server";

interface Queryable {
	query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

// The schemas the app makes tables in: `public`, which holds all of its data, and `drizzle`, where the migrator keeps
// its ledger (drizzle.__drizzle_migrations).
const APP_SCHEMAS = ["public", "drizzle"];

/**
 * Runs right after the migrations, in their transaction and under their lock (./checks.ts).
 *
 * 1. With STORAGE_BACKEND=database, makes the table that storage keeps its files in
 *    (packages/api/src/features/storage/database.ts).
 * 2. On a database that has Supabase's Data API roles (`anon` and `authenticated`), turns row-level security on for
 *    every ordinary table of the app's schemas that does not have it yet, the migration ledger included. A Supabase
 *    database whose default privileges still give every new table in `public` to those roles would otherwise let
 *    anyone holding the project's public key read and change these tables through the Data API: accounts, sessions,
 *    password hashes and every resume. With row-level security on and no policy, those roles see no row and can write
 *    none; the app's own connection owns the tables, so it is not limited. This never turns row-level security off,
 *    touches only tables the app's role owns, and does nothing on a PostgreSQL without those roles.
 *
 * Tofu (2026-10-26): three round trips at most, whatever the number of tables: one query finds the tables (and
 * whether the roles exist), one batch turns row-level security on for all of them. Returns how many tables it turned
 * it on for.
 */
export async function prepareTofuDatabase(client: Queryable): Promise<number> {
	if (env.STORAGE_BACKEND === "database") {
		await client.query(
			`CREATE TABLE IF NOT EXISTS public.tofu_storage_object (
				key text PRIMARY KEY,
				data bytea NOT NULL,
				content_type text NOT NULL,
				size integer NOT NULL,
				private boolean NOT NULL DEFAULT false,
				updated_at timestamptz NOT NULL DEFAULT now()
			)`,
		);
	}

	const tables = await client.query(
		`SELECT n.nspname AS schema, c.relname AS name
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = ANY ($1::text[]) AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
				AND pg_catalog.pg_has_role(c.relowner, 'MEMBER')
				AND (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')) = 2
			ORDER BY n.nspname, c.relname`,
		[APP_SCHEMAS],
	);
	if (tables.rows.length === 0) return 0;

	const quote = (identifier: unknown) => `"${String(identifier).replaceAll('"', '""')}"`;
	const statements = tables.rows.map(
		(row) => `ALTER TABLE ${quote(row.schema)}.${quote(row.name)} ENABLE ROW LEVEL SECURITY;`,
	);
	await client.query(statements.join("\n"));
	return tables.rows.length;
}
