import { hashPassword } from "./hash.js";
import { ensureAdminUser } from "./user-repo.js";

const ADMIN_EMAIL = "admin@gmail.com";
const ADMIN_PASSWORD = "admin@123";

export async function seedAdminIfNeeded(): Promise<void> {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await ensureAdminUser({ email: ADMIN_EMAIL, passwordHash });
}
