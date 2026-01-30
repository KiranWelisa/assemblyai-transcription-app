import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/db';

export const POST: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = createDb(platform!.env.DB);
	await db.transcriptions.markAllViewed(locals.user.email);

	return json({ success: true });
};
