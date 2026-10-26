import type { MigrationMeta } from "drizzle-orm/migrator";
import type { PoolClient } from "pg";
import { constants, existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/pg-core/async/session";
import { Pool } from "pg";
import { env } from "@reactive-resume/env/server";
import { getLocalDataDirectory } from "@reactive-resume/utils/monorepo.node";
import { verifyMigratedSchema } from "./schema-check";
import { prepareTofuDatabase } from "./tofu-database";

function resolveFromCurrentModule(relativePath: string) {
	return fileURLToPath(new URL(relativePath, import.meta.url));
}

function resolveWorkspaceFolder(folderName: string): string {
	let dir = resolveFromCurrentModule(".");

	while (dir !== path.dirname(dir)) {
		const candidate = path.join(dir, folderName);
		if (existsSync(candidate)) return candidate;
		dir = path.dirname(dir);
	}

	throw new Error(`Could not locate ${folderName} folder relative to ${resolveFromCurrentModule(".")}`);
}

// Tofu (2026-10-26): several starts of one copy can run at the same moment on the same database (Tofu's container
// hosting starts a new deployment several times within a second or two), and on an empty database each would create
// the same tables. All of a start's schema work therefore runs in ONE transaction whose first statement takes a
// transaction-level advisory lock: one start does the work while the others wait, and each of them then reads the
// migration ledger again inside the lock and finds nothing left to do. PostgreSQL releases the lock when that
// transaction ends, however the start ends, and a pooler (transaction or session mode) keeps a transaction on one
// server connection from BEGIN to its end. Upstream took a session-level lock (pg_advisory_lock) on this connection
// instead, which only a connection that keeps its session can hold. The key is upstream's.
const SCHEMA_LOCK_KEY = 721830451;
// The wait for the lock is bounded; the schema work after it is not, as upstream's was not.
const SCHEMA_LOCK_WAIT = "120s";
// Errors a start meets when another start made the same object beside it (a table, type, schema, column, function, or
// the catalog row behind one): the whole step is tried once more.
const DUPLICATE_OBJECT_CODES = new Set(["42P06", "42P07", "42701", "42710", "42723"]);

function databaseErrorOf(error: unknown): { code?: string; constraint?: string } | undefined {
	let current = error;
	for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
		const candidate = current as { code?: unknown; constraint?: string; cause?: unknown };
		if (typeof candidate.code === "string") return candidate as { code: string; constraint?: string };
		current = candidate.cause;
	}
	return undefined;
}

function isDuplicateObjectError(error: unknown) {
	const databaseError = databaseErrorOf(error);
	if (!databaseError?.code) return false;
	if (DUPLICATE_OBJECT_CODES.has(databaseError.code)) return true;
	return databaseError.code === "23505" && (databaseError.constraint ?? "").startsWith("pg_");
}

async function migrateUnderLock(client: PoolClient, migrations: MigrationMeta[], migrationsFolder: string) {
	const db = drizzle({ client });
	const result = await db.transaction(async (tx) => {
		await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${SCHEMA_LOCK_WAIT}'`));
		try {
			await tx.execute(sql.raw(`SELECT pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`));
		} catch (error) {
			if (databaseErrorOf(error)?.code !== "55P03") throw error;
			throw new Error(
				`Another start of this server has held the database schema lock for more than ${SCHEMA_LOCK_WAIT}, ` +
					"so this one stops instead of changing the schema beside it.",
				{ cause: error },
			);
		}
		await tx.execute(sql.raw("SET LOCAL lock_timeout = DEFAULT"));

		// Holding the lock, drizzle reads its ledger (drizzle.__drizzle_migrations) again and applies only the migrations
		// it does not list; its own transaction becomes a savepoint inside this one.
		await migrate(migrations, tx, { migrationsFolder });
		const applied = await client.query(
			"SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations WHERE applied_at = now()",
		);

		// The database storage table, and row-level security on the app's tables for Supabase's Data API
		// (./tofu-database.ts), in the same transaction. A failure there is logged and the server starts anyway.
		let protectedTables = 0;
		await client.query("SAVEPOINT tofu_prepare");
		try {
			protectedTables = await prepareTofuDatabase(client);
			await client.query("RELEASE SAVEPOINT tofu_prepare");
		} catch (error) {
			await client.query("ROLLBACK TO SAVEPOINT tofu_prepare");
			console.error("Preparing the database for Tofu failed", { error });
		}
		return { applied: Number(applied.rows[0]?.count ?? 0), protectedTables };
	});

	console.info(
		result.applied > 0
			? `Database migrations completed (${result.applied} applied)`
			: "Database migrations completed (none to apply: another start or an earlier one applied them)",
	);
	if (result.protectedTables > 0) {
		console.info(`Enabled row-level security on ${result.protectedTables} tables for Supabase's Data API`);
	}
}

export async function runDatabaseMigrations() {
	console.info("Running database migrations...");

	const pool = new Pool({
		connectionString: env.DATABASE_MIGRATION_URL ?? env.DATABASE_URL,
		max: 1,
		connectionTimeoutMillis: 10_000,
	});

	try {
		const client = await pool.connect();
		try {
			const migrationsFolder = resolveWorkspaceFolder("migrations");
			const migrations = readMigrationFiles({ migrationsFolder });
			for (let attempt = 1; ; attempt++) {
				try {
					await migrateUnderLock(client, migrations, migrationsFolder);
					break;
				} catch (error) {
					if (attempt === 1 && isDuplicateObjectError(error)) {
						console.warn("Database migrations met an object another start made; trying the whole step once more", {
							error,
						});
						continue;
					}
					console.error("Database migrations failed", { error });
					throw error;
				}
			}

			// Post-migration verification is not a migration failure, so it gets its own log
			// message. A drifted schema still lets the server boot; STRICT_SCHEMA_CHECK=true
			// makes the drift fatal instead.
			try {
				await verifyMigratedSchema(client);
			} catch (error) {
				console.error("Database schema verification failed", { error });
				if (env.STRICT_SCHEMA_CHECK) throw error;
				console.error(
					"Continuing with a drifted database schema; set STRICT_SCHEMA_CHECK=true to refuse startup instead.",
				);
			}
		} finally {
			client.release();
		}
	} finally {
		await pool.end();
	}
}

async function validateLocalStoragePath() {
	if (env.STORAGE_BACKEND !== "local") return;

	const dataDirectory = getLocalDataDirectory(env.LOCAL_STORAGE_PATH);
	console.info(`Validating local storage path: ${dataDirectory}`);

	try {
		await fs.mkdir(dataDirectory, { recursive: true });
		await fs.access(dataDirectory, constants.R_OK | constants.W_OK);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error(
			`Local storage path is not writable: ${dataDirectory}\n` +
				`  ${message}\n` +
				"Set LOCAL_STORAGE_PATH to a writable directory or fix permissions on the existing path.",
		);
		throw error;
	}
}

async function reapStaleAgentRuns() {
	try {
		const { reapStaleAgentRunsAtBoot } = await import("@reactive-resume/api/features/agent/runs");
		await reapStaleAgentRunsAtBoot();
	} catch (error) {
		// A reap failure must not block serving traffic; stuck runs also heal lazily on access.
		console.error("Failed to reap stale agent runs at boot", { error });
	}
}

export async function runStartupChecks() {
	await runDatabaseMigrations();
	await validateLocalStoragePath();
	await reapStaleAgentRuns();
}
