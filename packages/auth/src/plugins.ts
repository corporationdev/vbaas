import { apiKey } from "@better-auth/api-key";
import { organization } from "better-auth/plugins";

export const authPlugins = [
  organization(),
  apiKey({
    defaultPrefix: "vbaas_",
    enableMetadata: true,
    references: "organization",
    requireName: true,
  }),
] as const;
