/// <reference types="@cloudflare/workers-types" />

declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			user: {
				email: string;
				name?: string;
				image?: string;
			} | null;
		}
		interface PageData {
			user: App.Locals['user'];
		}
		interface Platform {
			env: {
				DB: D1Database;
				GOOGLE_CLIENT_ID: string;
				GOOGLE_CLIENT_SECRET: string;
				ASSEMBLYAI_API_KEY: string;
				GEMINI_API_KEY: string;
				AUTH_SECRET: string;
			};
			context: ExecutionContext;
			caches: CacheStorage & { default: Cache };
		}
	}
}

export {};
