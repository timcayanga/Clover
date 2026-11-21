import { z } from "zod";

export const groupCoverPatch = z.object({
  avatarUrl: z.string().max(200_000).regex(/^(?:\/assets\/split-group-covers\/shape-[0-7]\.jpg|data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=]+)$/).nullable(),
}).strict();
