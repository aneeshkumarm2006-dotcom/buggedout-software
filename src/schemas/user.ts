import { z } from "zod";

import { USER_STATUSES } from "@/lib/enums";
import { PERMISSIONS } from "@/lib/permissions";
import { ROLES } from "@/lib/roles";

import { checkbox, coinAmount, objectId, optionalImagePath } from "@/schemas/common";

// Trim/lowercase first, then validate — in Zod 4 a chained `z.email().trim()`
// runs the format check against the raw, untrimmed value.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email"));

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username must be at most 20 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only");

// 72 bytes is bcrypt's hard input limit — anything longer is silently truncated.
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters");

export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(8, "Referral codes are 8 characters")
  .regex(/^[A-Z0-9]+$/, "Invalid referral code");

const permissionSchema = z.enum(PERMISSIONS);

/** Admin-side user/staff creation (Phase 6.3). Signup uses `signupSchema` below. */
export const createUserSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(ROLES).default("user"),
  permissions: z.array(permissionSchema).default([]),
  coinBalance: coinAmount.default(0),
  status: z.enum(USER_STATUSES).default("active"),
  avatar: optionalImagePath.optional(),
  referredBy: objectId.optional(),
});

/**
 * `coinBalance` is deliberately absent — balances move only through the wallet
 * service, never through a user update (use `adjustCoinsSchema`).
 */
export const updateUserSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    role: z.enum(ROLES),
    permissions: z.array(permissionSchema),
    status: z.enum(USER_STATUSES),
    avatar: optionalImagePath,
  })
  .partial();

/** Self-service profile edit (Phase 5.11). */
export const updateProfileSchema = z
  .object({
    username: usernameSchema,
    avatar: optionalImagePath,
  })
  .partial();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** The signup field is optional, so an untouched input ("") means "no code", not "invalid code". */
export const optionalReferralCode = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  referralCodeSchema.optional(),
);

export const signupSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  referralCode: optionalReferralCode,
});

export const loginSchema = z.object({
  // Either an email or a username — resolved server-side.
  identifier: z.string().trim().min(3, "Enter your email or username").max(254),
  password: z.string().min(1, "Enter your password"),
  rememberMe: checkbox,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

/** The token arrives from the emailed link, carried through the form as a hidden field. */
export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "This reset link is incomplete"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Manual credit/debit from the admin user detail page (Phase 6.13). */
export const adjustCoinsSchema = z.object({
  userId: objectId,
  direction: z.enum(["credit", "debit"]),
  amount: z.coerce.number().int().positive("Amount must be greater than zero"),
  note: z.string().trim().min(1, "A reason is required").max(300),
});

export const setUserStatusSchema = z.object({
  userId: objectId,
  status: z.enum(USER_STATUSES),
  note: z.string().trim().max(300).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AdjustCoinsInput = z.infer<typeof adjustCoinsSchema>;
export type SetUserStatusInput = z.infer<typeof setUserStatusSchema>;
