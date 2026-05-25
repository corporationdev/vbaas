import { betterAuth } from "better-auth";

import { authPlugins } from "./src/plugins";

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
  },
  plugins: authPlugins,
});
