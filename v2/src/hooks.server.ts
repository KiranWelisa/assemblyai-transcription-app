import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import type { Handle } from '@sveltejs/kit';
import type { JWT } from '@auth/core/jwt';
import { sequence } from '@sveltejs/kit/hooks';

const ALLOWED_DOMAIN = '@welisa.com';

function isAuthorizedEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

// Refresh access token using Google OAuth2
async function refreshAccessToken(
	token: JWT,
	clientId: string,
	clientSecret: string
): Promise<JWT> {
	try {
		const response = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: 'refresh_token',
				refresh_token: token.refreshToken as string
			})
		});

		const refreshed = await response.json();

		if (!response.ok) {
			console.error('Token refresh failed:', refreshed);
			return { ...token, error: 'RefreshAccessTokenError' };
		}

		return {
			...token,
			accessToken: refreshed.access_token,
			expiresAt: Math.floor(Date.now() / 1000 + refreshed.expires_in),
			// Use new refresh token if provided, otherwise keep old one
			refreshToken: refreshed.refresh_token ?? token.refreshToken
		};
	} catch (error) {
		console.error('Token refresh error:', error);
		return { ...token, error: 'RefreshAccessTokenError' };
	}
}

// Auth handle - configured dynamically with platform env
const authHandle: Handle = async ({ event, resolve }) => {
	const { platform } = event;

	const clientId = platform?.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '';
	const clientSecret = platform?.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? '';

	const auth = SvelteKitAuth({
		providers: [
			Google({
				clientId,
				clientSecret,
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
				// Initial sign in - store tokens and expiry
				if (account) {
					return {
						...token,
						accessToken: account.access_token,
						refreshToken: account.refresh_token,
						expiresAt: account.expires_at
					};
				}

				// Return token if not expired (5 minute buffer)
				const expiresAt = token.expiresAt as number | undefined;
				if (expiresAt && Date.now() < (expiresAt - 300) * 1000) {
					return token;
				}

				// Token expired or expiring soon, refresh it
				console.log('Token expiring, refreshing...');
				return refreshAccessToken(token, clientId, clientSecret);
			},
			async session({ session, token }) {
				return {
					...session,
					accessToken: token.accessToken as string,
					error: token.error as string | undefined
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
