import { describe, expect, it, vi } from "vite-plus/test";

const verified = vi.hoisted(() => [] as { userId: string; hostname: string }[]);
// Verified domains for the provider; the background re-check finds none stale.
vi.mock("@reactive-resume/db/client", () => ({
	db: {
		select: () => ({
			from: () => ({ where: () => Object.assign(Promise.resolve(verified), { limit: async () => [] }) }),
		}),
	},
}));
vi.mock("@reactive-resume/env/server", () => ({
	env: {
		APP_URL: "https://rxresu.me",
		APP_ALIAS_URL: "https://rx.cv",
		CUSTOM_DOMAIN_TARGET: "domains.rx.cv",
		CUSTOM_DOMAIN_PROVIDER_SECRET: "x".repeat(32),
	},
}));

const { normalizeHostname, traefikConfiguration } = await import("./service");

describe("normalizeHostname", () => {
	it.each([
		["resume.example.com", "resume.example.com"],
		["  https://Resume.Example.com/path?x=1  ", "resume.example.com"],
		["example.com.", "example.com"],
		["example.com:8443", "example.com"],
		["bücher.example", "xn--bcher-kva.example"],
	])("reads %j as the host DNS knows: %s", (input, expected) => {
		expect(normalizeHostname(input)).toBe(expected);
	});

	it.each([
		"localhost",
		"192.168.0.1",
		"[::1]",
		"rxresu.me",
		"evil.rxresu.me",
		"rx.cv",
		"jane.rx.cv",
		"domains.rx.cv",
		"bad_label.example.com",
		"-dash.example.com",
		"example.123",
	])("refuses %s", (input) => {
		expect(normalizeHostname(input)).toBeNull();
	});
});

describe("traefikConfiguration", () => {
	const options = { service: "app@swarm", entryPoint: "websecure", certResolver: "customdomains" };

	it("sends Traefik an empty document, not an empty map, when no domain is verified", async () => {
		verified.length = 0;
		expect(await traefikConfiguration(options)).toEqual({});
	});

	it("routes each verified domain to the app with its own certificate", async () => {
		verified.splice(0, verified.length, { userId: "u1", hostname: "resume.example.com" });
		expect(await traefikConfiguration(options)).toEqual({
			http: {
				routers: {
					"custom-domain-u1": {
						rule: "Host(`resume.example.com`)",
						entryPoints: ["websecure"],
						service: "app@swarm",
						tls: { certResolver: "customdomains" },
					},
				},
			},
		});
	});
});
