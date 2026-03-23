import type { Request, Response } from "express";

import { signToken } from "./jwt.js";
import { hashPassword, verifyPassword } from "./hash.js";
import { findUserByEmail, createUser, type UserSafe } from "./user-repo.js";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function apiResponse(
  res: Response,
  status: number,
  data: unknown,
  message: string,
  error: string | null = null,
): void {
  res.status(status).json({ data, message, error });
}

function toSafeUser(user: {
  id: number;
  email: string;
  role: string;
}): UserSafe {
  return {
    id: user.id,
    email: user.email,
    role: user.role as UserSafe["role"],
  };
}

export async function handleSignup(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: string; password?: string };
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email) {
    apiResponse(res, 400, null, "Bad request", "Email is required");
    return;
  }
  if (!EMAIL_REGEX.test(email)) {
    apiResponse(res, 400, null, "Bad request", "Invalid email format");
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    apiResponse(
      res,
      400,
      null,
      "Bad request",
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
    return;
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    apiResponse(res, 409, null, "Conflict", "Email already registered");
    return;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    email,
    passwordHash,
    role: "customer",
  });

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  apiResponse(res, 201, { user: toSafeUser(user), token }, "Created", null);
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const body = req.body as { email?: string; password?: string };
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    apiResponse(
      res,
      400,
      null,
      "Bad request",
      "Email and password are required",
    );
    return;
  }

  const user = await findUserByEmail(email);
  if (!user) {
    apiResponse(res, 401, null, "Unauthorized", "Invalid email or password");
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    apiResponse(res, 401, null, "Unauthorized", "Invalid email or password");
    return;
  }

  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  apiResponse(res, 200, { user: toSafeUser(user), token }, "Success", null);
}

export function handleMe(req: Request, res: Response): void {
  if (!req.user) {
    apiResponse(res, 401, null, "Unauthorized", "Not authenticated");
    return;
  }
  apiResponse(
    res,
    200,
    { id: req.user.id, email: req.user.email, role: req.user.role },
    "Success",
    null,
  );
}
