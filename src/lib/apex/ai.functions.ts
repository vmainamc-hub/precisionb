import { createServerFn } from "@tanstack/react-start";

import type { ApexBrief, ApexReasoning } from "./ai.types";

export type { ApexBrief, ApexReasoning };

/**
 * Server boundary for the Apex reasoning chain. The provider client and the
 * API key live in `ai.server`, which is imported *inside* the handler so it
 * never enters the client bundle.
 */
export const apexReasoning = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async ({ data }): Promise<ApexReasoning> => {
    try {
      const { briefSchema, runReasoningChain } = await import("./ai.server");
      const parsed = briefSchema.parse(data);
      return await runReasoningChain(parsed);
    } catch (err) {
      return {
        analyst: "",
        devilsAdvocate: "",
        chief: "",
        available: false,
        error:
          err instanceof Error
            ? `Brief parsing failed: ${err.message}`
            : "AI reasoning brief validation failed.",
      };
    }
  });
