import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createDb } from '$lib/db';

export const POST: RequestHandler = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const db = createDb(platform!.env.DB);

	// Verify ownership
	const transcription = await db.transcriptions.findById(params.id);
	if (!transcription || transcription.userEmail !== locals.user.email) {
		throw error(404, 'Transcription not found');
	}

	await db.transcriptions.markViewed(params.id);

	return json({ success: true });
};
