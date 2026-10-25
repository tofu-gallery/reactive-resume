// Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Reactive Resume.
//
// Storage kept in the app's own PostgreSQL database (STORAGE_BACKEND=database), for hosts with no disk that outlives a
// restart and no object storage of their own: Tofu's container hosting, where the local backend's /app/data is lost on
// every restart and redeploy. Each file is one row of `tofu_storage_object`, which the server makes at start
// (apps/server/src/startup/tofu-database.ts). Keys, prefixes and answers follow the S3 backend's: `list` and `delete`
// match a key exactly or as a string prefix, and `delete` of a folder removes everything under it.

const TABLE = "tofu_storage_object";

async function pool() {
	const { getPool } = await import("@reactive-resume/db/client");
	return getPool();
}

/** A LIKE pattern matching every key that starts with `prefix`, with LIKE's own characters taken literally. */
function startsWith(prefix: string): string {
	return `${prefix.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function checkKey(key: string): string {
	const normalized = key.replace(/^\/+/, "");
	if (!normalized || normalized.split("/").some((part) => part === "." || part === "..")) {
		throw new Error("Invalid storage key");
	}
	return normalized;
}

export class DatabaseStorageService {
	async list(prefix: string): Promise<string[]> {
		const result = await (await pool()).query<{ key: string }>(
			`SELECT key FROM ${TABLE} WHERE key LIKE $1 ESCAPE '\\' ORDER BY key`,
			[startsWith(prefix.replace(/^\/+/, ""))],
		);
		return result.rows.map((row) => row.key);
	}

	async write(input: { key: string; data: Uint8Array; contentType: string; private?: boolean }): Promise<void> {
		await (await pool()).query(
			`INSERT INTO ${TABLE} (key, data, content_type, size, private, updated_at) VALUES ($1, $2, $3, $4, $5, now())
			ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, content_type = EXCLUDED.content_type, size = EXCLUDED.size,
				private = EXCLUDED.private, updated_at = EXCLUDED.updated_at`,
			[checkKey(input.key), Buffer.from(input.data), input.contentType, input.data.byteLength, input.private === true],
		);
	}

	async read(key: string) {
		const result = await (await pool()).query<{
			data: Buffer;
			content_type: string;
			size: number;
			updated_at: Date;
		}>(`SELECT data, content_type, size, updated_at FROM ${TABLE} WHERE key = $1`, [checkKey(key)]);
		const row = result.rows[0];
		if (!row) return null;
		return {
			data: new Uint8Array(row.data.buffer, row.data.byteOffset, row.data.byteLength),
			size: row.size,
			etag: `"${row.size}-${row.updated_at.getTime()}"`,
			lastModified: row.updated_at,
			contentType: row.content_type,
		};
	}

	async delete(keyOrPrefix: string): Promise<boolean> {
		const key = checkKey(keyOrPrefix);
		const folder = key.endsWith("/") ? key : `${key}/`;
		const result = await (await pool()).query(
			`DELETE FROM ${TABLE} WHERE key = $1 OR key LIKE $2 ESCAPE '\\'`,
			[key, startsWith(folder)],
		);
		return (result.rowCount ?? 0) > 0;
	}

	async healthcheck() {
		try {
			await (await pool()).query(`SELECT 1 FROM ${TABLE} LIMIT 1`);
			return {
				type: "database" as const,
				status: "healthy" as const,
				message: "Database storage is reachable.",
			};
		} catch (error: unknown) {
			return {
				type: "database" as const,
				status: "unhealthy" as const,
				message: "Database storage is not reachable, or its table is missing.",
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}
}
