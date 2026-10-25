// Tofu (2026-10-25): Tofu's own file. A copy sends no email until its owner adds SMTP settings, so the sign-up and
// forgot-password pages say which ones, instead of promising a link that never arrives.
import { Trans } from "@lingui/react/macro";

function Setting({ children }: { children: string }) {
	return <code className="rounded bg-sunken px-1 py-0.5 font-mono text-xs">{children}</code>;
}

/** The settings that turn email on: packages/email/src/transport.ts sends only once host, user, password and sender are set. */
export function EmailSettingsNote() {
	return (
		<Trans>
			Its owner has to save <Setting>SMTP_HOST</Setting>, <Setting>SMTP_PORT</Setting>, <Setting>SMTP_USER</Setting>{" "}
			and <Setting>SMTP_FROM</Setting> as settings, and <Setting>SMTP_PASS</Setting> as a hidden value. Until then,
			nobody can reset a forgotten password.
		</Trans>
	);
}
