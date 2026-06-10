export * from "./core/index.ts";
export { ratingAutomation } from "./rating/index.ts";
export { mergeConfig as mergeRatingConfig, RATING_DEFAULT_CONFIG } from "./rating/index.ts";
export type { RatingConfig, RatingFireCtx } from "./rating/index.ts";
export { handleRatingButtonReply, parseStarPayload } from "./rating/index.ts";
export type { HandleButtonReplyResult } from "./rating/index.ts";

import { registerAutomation } from "./core/registry.ts";
import { ratingAutomation } from "./rating/index.ts";

let _bootstrapped = false;

/** Register every automation that ships with the platform. Idempotent. */
export function bootstrapAutomations(): void {
  if (_bootstrapped) return;
  registerAutomation(ratingAutomation);
  _bootstrapped = true;
}
