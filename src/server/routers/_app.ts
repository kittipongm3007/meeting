// src/server/routers/_app.ts
import { router } from "../trpc";
import { meetingRouter } from "./meeting";

export const appRouter = router({
    meeting: meetingRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
