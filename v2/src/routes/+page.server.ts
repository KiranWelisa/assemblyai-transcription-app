import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createDb } from '$lib/db';

export const load: PageServerLoad = async ({ locals, platform }) => {
	// Redirect to login if not authenticated
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const db = createDb(platform!.env.DB);
	const transcriptions = await db.transcriptions.findMany(locals.user.email);

	// Get session with accessToken
	const session = await locals.auth?.();

	return {
		transcriptions,
		user: locals.user,
		accessToken: (session as { accessToken?: string })?.accessToken ?? ''
	};
};
