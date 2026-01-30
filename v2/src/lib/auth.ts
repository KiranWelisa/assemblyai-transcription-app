import { SvelteKitAuth } from '@auth/sveltekit';
import Google from '@auth/core/providers/google';
import type { Handle } from '@sveltejs/kit';

const ALLOWED_DOMAIN = '@welisa.com';

export function isAuthorizedEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	return email.toLowerCase().endsWith(ALLOWED_DOMAIN);
}

export function createAuthHandle(platform: App.Platform | undefined): Handle {
	return SvelteKitAuth({
		providers: [
			Google({
				clientId: platform?.env.GOOGLE_CLIENT_ID ?? '',
				clientSecret: platform?.env.GOOGLE_CLIENT_SECRET ?? '',
				authorization: {
					params: {
						scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
						access_type: 'offline',
						prompt: 'consent'
					}
				}
			})
		],
		secret: platform?.env.AUTH_SECRET,
		trustHost: true,
		callbacks: {
			async signIn({ user }) {
				// Only allow @welisa.com emails
				return isAuthorizedEmail(user.email);
			},
			async jwt({ token, account }) {
				// Persist access_token for Google Drive API
				if (account) {
					token.accessToken = account.access_token;
					token.refreshToken = account.refresh_token;
				}
				return token;
			},
			async session({ session, token }) {
				// Add access token to session for client-side Drive API calls
				return {
					...session,
					accessToken: token.accessToken as string
				};
			}
		}
	});
}
