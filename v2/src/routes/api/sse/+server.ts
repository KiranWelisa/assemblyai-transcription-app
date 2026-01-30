import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/db';

// Store active connections (in-memory - works per edge instance)
const connections = new Map<string, ReadableStreamDefaultController>();

export const GET: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const userEmail = locals.user.email;
	const connectionId = crypto.randomUUID();

	const stream = new ReadableStream({
		start(controller) {
			// Store connection
			connections.set(connectionId, controller);

			// Send initial connection message
			const data = JSON.stringify({ type: 'connected', connectionId });
			controller.enqueue(`data: ${data}\n\n`);

			// Set up polling for updates (since we can't use global state in edge workers)
			const checkForUpdates = async () => {
				try {
					const db = createDb(platform!.env.DB);
					const transcriptions = await db.transcriptions.findMany(userEmail);

					// Check for recently completed transcriptions
					const recentlyCompleted = transcriptions.filter((t) => {
						const updatedAt = new Date(t.updatedAt).getTime();
						const now = Date.now();
						return t.status === 'completed' && now - updatedAt < 10000; // Last 10 seconds
					});

					for (const t of recentlyCompleted) {
						const message = JSON.stringify({
							type: 'transcription_completed',
							data: {
								id: t.id,
								title: t.title,
								preview: t.preview,
								duration: t.duration,
								language: t.language,
								fileName: t.fileName
							}
						});
						controller.enqueue(`data: ${message}\n\n`);
					}
				} catch (err) {
					console.error('SSE polling error:', err);
				}
			};

			// Poll every 5 seconds
			const interval = setInterval(checkForUpdates, 5000);

			// Cleanup when connection closes
			return () => {
				clearInterval(interval);
				connections.delete(connectionId);
			};
		},
		cancel() {
			connections.delete(connectionId);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};

// Helper to broadcast to all connections for a user (used by webhook)
// Prefixed with _ to make it a valid SvelteKit export
export function _broadcastToUser(userEmail: string, message: object) {
	// Note: This won't work across edge instances
	// For production, use Durable Objects or a pub/sub system
	const data = JSON.stringify(message);
	connections.forEach((controller) => {
		try {
			controller.enqueue(`data: ${data}\n\n`);
		} catch {
			// Connection closed
		}
	});
}
