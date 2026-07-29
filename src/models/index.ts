/**
 * Barrel for every Mongoose model. Importing from here registers all schemas on
 * the connection, which matters for `populate()` — a ref to a model that was
 * never imported throws `MissingSchemaError`.
 *
 * Server-only: import this from server components, route handlers, server
 * actions and scripts, never from a client component.
 */
export { User, generateReferralCode, type IUser } from "@/models/user";
export { PasswordResetToken, type IPasswordResetToken } from "@/models/password-reset-token";
export { GameCategory, type IGameCategory, type IMarketTemplate } from "@/models/game-category";
export { Tournament, type ITournament } from "@/models/tournament";
export { Team, type ITeam } from "@/models/team";
export { Match, type IMatch } from "@/models/match";
export { Question, type IQuestion, type IQuestionOption } from "@/models/question";
export { Bet, type IBet } from "@/models/bet";
export { Transaction, type ITransaction } from "@/models/transaction";
export {
  ReferralSetting,
  REFERRAL_SETTING_KEY,
  getReferralSetting,
  type IReferralSetting,
} from "@/models/referral-setting";
export {
  SupportTicket,
  type ISupportMessage,
  type ISupportTicket,
} from "@/models/support-ticket";
export { AuditLog, type IAuditLog } from "@/models/audit-log";
