/**
 * Barrel for the Zod input schemas. Every API route, server action and form
 * parses through one of these before it reaches a model — Mongoose validation
 * is the backstop, not the front door.
 */
export * from "@/schemas/common";
export * from "@/schemas/user";
export * from "@/schemas/game-category";
export * from "@/schemas/tournament";
export * from "@/schemas/team";
export * from "@/schemas/match";
export * from "@/schemas/question";
export * from "@/schemas/bet";
export * from "@/schemas/transaction";
export * from "@/schemas/referral-setting";
export * from "@/schemas/support-ticket";
export * from "@/schemas/audit-log";
