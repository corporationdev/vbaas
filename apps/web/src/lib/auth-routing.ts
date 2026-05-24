import z from "zod";

export const authRedirectSearchSchema = z.object({
  redirect: z.string().optional(),
});

export type AuthRedirectSearch = z.infer<typeof authRedirectSearchSchema>;

export const parseAuthRedirectSearch = (
  search: Record<string, unknown>
): AuthRedirectSearch => {
  const parsedSearch = authRedirectSearchSchema.safeParse(search);

  if (!parsedSearch.success) {
    return {};
  }

  return parsedSearch.data;
};

export const getAuthRedirectTarget = (redirect?: string): string => {
  if (redirect?.startsWith("/")) {
    return redirect;
  }

  return "/dashboard";
};

export const buildAuthPageSearch = (
  redirect?: string
): AuthRedirectSearch | undefined => {
  if (!redirect?.startsWith("/")) {
    return;
  }

  return { redirect };
};
