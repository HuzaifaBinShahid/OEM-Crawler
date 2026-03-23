import { hashPassword } from "./hash.js";
import { ensureAdminUser } from "./user-repo.js";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function seedAdminIfNeeded(): Promise<void> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables",
    );
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  await ensureAdminUser({
    email: ADMIN_EMAIL,
    passwordHash,
  });
}
