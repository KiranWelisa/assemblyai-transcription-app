import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const ALLOWED_DOMAIN = '@welisa.com';

function isAuthorizedEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

// Auth handle - configured dynamically with platform env
const authHandle: Handle = async ({ event, resolve }) => {
	const { platform } = event;

	const auth = SvelteKitAuth({
		providers: [
			Google({
				clientId: platform?.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '',
				clientSecret: platform?.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '',
				authorization: {
					params: {
						scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
						access_type: 'offline',
						prompt: 'consent'
					}
				}
			})
		],
		secret: platform?.env.AUTH_SECRET ?? process.env.AUTH_SECRET,
		trustHost: true,
		callbacks: {
			async signIn({ user }) {
				return isAuthorizedEmail(user.email);
			},
			async jwt({ token, account }) {
				if (account) {
					token.accessToken = account.access_token;
					token.refreshToken = account.refresh_token;
				}
				return token;
			},
			async session({ session, token }) {
				return {
					...session,
					accessToken: token.accessToken as string
				};
			}
		}
	});

	return auth.handle({ event, resolve });
};

// Set user in locals for easy access
const userHandle: Handle = async ({ event, resolve }) => {
	const session = await event.locals.auth?.();

	if (session?.user?.email) {
		event.locals.user = {
			email: session.user.email,
			name: session.user.name ?? undefined,
			image: session.user.image ?? undefined
		};
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};

export const handle = sequence(authHandle, userHandle);
