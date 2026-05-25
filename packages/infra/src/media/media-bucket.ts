import { R2Bucket } from "alchemy/Cloudflare";

const daysToSeconds = (days: number): number => days * 24 * 60 * 60;

export const MediaBucket = R2Bucket("media-bucket", {
  lifecycleRules: [
    {
      abortMultipartUploadsTransition: {
        condition: {
          maxAge: daysToSeconds(7),
          type: "Age",
        },
      },
      id: "abort-stale-multipart-uploads",
    },
  ],
  storageClass: "Standard",
});
