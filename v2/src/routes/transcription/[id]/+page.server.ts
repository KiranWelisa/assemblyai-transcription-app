import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/db';

export const load: PageServerLoad = async ({ params, locals, platform }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const db = createDb(platform!.env.DB);
	const transcription = await db.transcriptions.findById(params.id);

	if (!transcription) {
		throw error(404, 'Transcription not found');
	}

	if (transcription.userEmail !== locals.user.email) {
		throw error(403, 'Access denied');
	}

	// Mark as viewed
	if (transcription.isNew) {
		await db.transcriptions.markViewed(params.id);
	}

	return {
		transcription: {
			...transcription,
			isNew: false
		}
	};
};
