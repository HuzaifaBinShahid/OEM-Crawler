import { loadConfig } from "../config.js";
import jwt, { type SignOptions } from "jsonwebtoken";

export type JwtPayload = {
  sub: number;
  email: string;
  role: string;
};

export function signToken(payload: JwtPayload): string {
  const config = loadConfig();
  const options: SignOptions = { expiresIn: config.jwtExpiresIn };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const config = loadConfig();
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded && typeof decoded === "object" && "sub" in decoded && "email" in decoded && "role" in decoded) {
      return decoded as JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}
