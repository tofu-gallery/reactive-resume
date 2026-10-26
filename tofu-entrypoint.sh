# Tofu (2026-10-25): this file is Tofu's addition; it is not part of upstream Reactive Resume.
#
# The image starts through this file (the Dockerfile runs it with /bin/sh, so it needs no execute bit). It fills in
# what a copy on Tofu needs from the settings Tofu gives every app, then starts the command it was given (the server)
# as the user the image starts as, root: Tofu sends traffic to PORT, which is 80 unless the app sets another, and only
# root may listen on a port below 1024. Upstream's apps/server/docker-entrypoint.sh, which switches to the `node` user,
# is not used. A value the owner set themselves is always kept as it is.
#
#   AUTH_SECRET, ENCRYPTION_SECRET  When unset, each is derived from DATABASE_URL (SHA-256 of a fixed label and the URL),
#                                   so a copy needs no secret setting and keeps the same values across restarts.
#   DATABASE_URL                    `sslmode=require` (or `prefer`) becomes `sslmode=no-verify`. node-postgres reads
#                                   `require` as full certificate verification, which fails against a managed
#                                   database's pooler; `no-verify` encrypts without checking the certificate, which is
#                                   what `require` means to libpq. A URL with its own `sslrootcert` is left alone.
#   DATABASE_MIGRATION_URL          When unset and DATABASE_URL names a pooler host (a `.pooler.` label) on port 6543,
#                                   the same URL on port 5432, the pooler's session mode. Listening for resume updates
#                                   (LISTEN) needs a connection that keeps its session, which a transaction-mode pooler
#                                   cannot give; the migrations run on it too (Tofu, 2026-10-26: under a
#                                   transaction-level lock, which holds on either mode).
#   STORAGE_BACKEND                 When unset and S3 is not configured, `database`: uploads are kept in PostgreSQL,
#                                   since no disk outlives a restart on Tofu.
set -eu

derive_secret() {
	node -e 'process.stdout.write(require("node:crypto").createHash("sha256").update(process.argv[1] + "\n" + process.env.DATABASE_URL).digest("hex"))' "$1"
}

if [ -n "${DATABASE_URL:-}" ]; then
	if [ -z "${AUTH_SECRET:-}" ]; then
		AUTH_SECRET=$(derive_secret "reactive-resume auth secret (tofu)")
		export AUTH_SECRET
	fi
	if [ -z "${ENCRYPTION_SECRET:-}" ]; then
		ENCRYPTION_SECRET=$(derive_secret "reactive-resume encryption secret (tofu)")
		export ENCRYPTION_SECRET
	fi

	case $DATABASE_URL in
	*sslrootcert=* | *uselibpqcompat=*) ;;
	*)
		DATABASE_URL=$(printf '%s' "$DATABASE_URL" | sed -E 's/([?&])sslmode=(require|prefer)(&|$)/\1sslmode=no-verify\3/')
		export DATABASE_URL
		;;
	esac

	if [ -z "${DATABASE_MIGRATION_URL:-}" ]; then
		# postgresql://user:password@host:port/database?query: the host is what follows the last @ of the authority.
		rest=${DATABASE_URL#*://}
		scheme=${DATABASE_URL%%://*}
		authority=${rest%%/*}
		path=
		case $rest in */*) path=/${rest#*/} ;; esac
		userinfo=
		hostport=$authority
		case $authority in
		*@*)
			userinfo=${authority%@*}@
			hostport=${authority##*@}
			;;
		esac
		case $hostport in
		*.pooler.*:6543)
			DATABASE_MIGRATION_URL="$scheme://$userinfo${hostport%:6543}:5432$path"
			export DATABASE_MIGRATION_URL
			;;
		esac
	fi
fi

if [ -z "${STORAGE_BACKEND:-}" ] && { [ -z "${S3_ACCESS_KEY_ID:-}" ] || [ -z "${S3_SECRET_ACCESS_KEY:-}" ] || [ -z "${S3_BUCKET:-}" ]; }; then
	STORAGE_BACKEND=database
	export STORAGE_BACKEND
fi

exec "$@"
