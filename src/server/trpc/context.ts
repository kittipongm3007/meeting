// src/server/trpc/context.ts
export type Context = {
  ip?: string;
};

export async function createContext(): Promise<Context> {
  return {};
}
