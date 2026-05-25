import { createDb } from "@vbaas/db";
import {
  account,
  accountRelations,
  apikey,
  invitation,
  invitationRelations,
  member,
  memberRelations,
  organizationRelations,
  organization as organizationTable,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} from "@vbaas/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authPlugins } from "./plugins";

const schema = {
  account,
  accountRelations,
  apikey,
  invitation,
  invitationRelations,
  member,
  memberRelations,
  organization: organizationTable,
  organizationRelations,
  session,
  sessionRelations,
  user,
  userRelations,
  verification,
} as const;

export interface AuthConfig {
  betterAuthSecret: string;
  betterAuthUrl: string;
  corsOrigin: string;
  databaseUrl: string;
}

export function createAuth(config: AuthConfig) {
  const db = createDb(config.databaseUrl);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema,
    }),
    trustedOrigins: [config.corsOrigin],
    emailAndPassword: {
      enabled: true,
    },
    plugins: authPlugins,
    // uncomment cookieCache setting when ready to deploy to Cloudflare using *.workers.dev domains
    // session: {
    //   cookieCache: {
    //     enabled: true,
    //     maxAge: 60,
    //   },
    // },
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
      // uncomment crossSubDomainCookies setting when ready to deploy and replace <your-workers-subdomain> with your actual workers subdomain
      // https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
      // crossSubDomainCookies: {
      //   enabled: true,
      //   domain: "<your-workers-subdomain>",
      // },
    },
  });
}
