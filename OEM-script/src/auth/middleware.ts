import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "./jwt.js";

export type AuthUser = {
  id: number;
  email: string;
  role: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return null;
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({
      data: null,
      message: "Unauthorized",
      error: "Missing or invalid token",
    });
    return;
  }
  const payload = verifyToken(token) as JwtPayload | null;
  if (!payload || !payload.sub || !payload.email || !payload.role) {
    res
      .status(401)
      .json({ data: null, message: "Unauthorized", error: "Invalid token" });
    return;
  }
  req.user = { id: payload.sub, email: payload.email, role: payload.role };
  next();
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    res.status(401).json({
      data: null,
      message: "Unauthorized",
      error: "Missing or invalid token",
    });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({
      data: null,
      message: "Forbidden",
      error: "Admin access required",
    });
    return;
  }
  next();
}
