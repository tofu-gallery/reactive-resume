// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Reactive Resume.
import { env } from "@reactive-resume/env/server";

interface Queryable {
	query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * Runs right after the migrations, on their connection and under their lock (./checks.ts).
 *
 * 1. With STORAGE_BACKEND=database, makes the table that storage keeps its files in
 *    (packages/api/src/features/storage/database.ts).
 * 2. On a database that has Supabase's Data API roles (`anon` and `authenticated`), turns row-level security on for the
 *    app's own tables in `public` that do not have it yet. A Supabase database whose default privileges still give every
 *    new table in `public` to those roles would otherwise let anyone holding the project's public key read and change
 *    these tables through the Data API: accounts, sessions, password hashes and every resume. With row-level security on
 *    and no policy, those roles see no row; the app's own connection owns the tables, so it is not limited. This never
 *    turns row-level security off, touches only tables the app's role owns, and does nothing on a PostgreSQL without
 *    those roles.
 */
export async function prepareTofuDatabase(client: Queryable): Promise<void> {
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

	const roles = await client.query(
		"SELECT count(*)::int AS count FROM pg_catalog.pg_roles WHERE rolname IN ('anon', 'authenticated')",
	);
	if (Number(roles.rows[0]?.count) !== 2) return;

	const tables = await client.query(
		`SELECT c.relname AS name
			FROM pg_catalog.pg_class c
			JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
			WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
				AND pg_catalog.pg_has_role(c.relowner, 'MEMBER')
			ORDER BY c.relname`,
	);
	for (const row of tables.rows) {
		const name = String(row.name).replaceAll('"', '""');
		await client.query(`ALTER TABLE public."${name}" ENABLE ROW LEVEL SECURITY`);
	}
	if (tables.rows.length > 0) {
		console.info(`Enabled row-level security on ${tables.rows.length} tables for Supabase's Data API`);
	}
}
