// src/server/routers/_app.ts
import { router } from "../trpc/trpc";
import { meetingRouter } from "./meeting";

export const appRouter = router({
  meeting: meetingRouter,
});

export type AppRouter = typeof appRouter;
