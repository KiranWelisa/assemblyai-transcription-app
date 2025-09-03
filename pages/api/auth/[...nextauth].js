import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          // Hier vragen we om de benodigde permissies voor Google Drive.
          scope: "https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive",
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    // Deze callback wordt aangeroepen bij het aanmaken of bijwerken van een JSON Web Token.
    // We slaan hier het accessToken van Google op in de token.
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    // Deze callback wordt aangeroepen wanneer een sessie wordt opgevraagd door de client.
    // We voegen het accessToken toe aan het sessie-object, zodat het in de frontend beschikbaar is.
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    },
  },
});