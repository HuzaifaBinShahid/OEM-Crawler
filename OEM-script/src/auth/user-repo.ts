import { getPool } from "../db/connection.js";

export type UserRole = "admin" | "internal" | "customer";

export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export interface UserSafe {
  id: number;
  email: string;
  role: UserRole;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  const pool = getPool();
  const result = await pool.query<User>(
    "SELECT id, email, password_hash, role, created_at, updated_at FROM users WHERE email = $1",
    [normalized],
  );
  return result.rows[0] ?? null;
}

export async function findUserById(id: number): Promise<User | null> {
  const pool = getPool();
  const result = await pool.query<User>(
    "SELECT id, email, password_hash, role, created_at, updated_at FROM users WHERE id = $1",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findAllUsers(): Promise<UserSafe[]> {
  const pool = getPool();
  const result = await pool.query<User>(
    "SELECT id, email, password_hash, role, created_at, updated_at FROM users ORDER BY created_at DESC",
  );
  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
  }));
}

export async function createUser(params: {
  email: string;
  passwordHash: string;
  role: UserRole;
}): Promise<User> {
  const normalized = params.email.trim().toLowerCase();
  const pool = getPool();
  const result = await pool.query<User>(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, password_hash, role, created_at, updated_at",
    [normalized, params.passwordHash, params.role],
  );
  return result.rows[0]!;
}

export async function updateUser(params: {
  id: number;
  email?: string;
  passwordHash?: string;
}): Promise<User> {
  const { id } = params;
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (typeof params.email === "string") {
    fields.push(`email = $${idx++}`);
    values.push(params.email.trim().toLowerCase());
  }
  if (typeof params.passwordHash === "string") {
    fields.push(`password_hash = $${idx++}`);
    values.push(params.passwordHash);
  }

  if (fields.length === 0) {
    const existing = await findUserById(id);
    if (!existing) {
      throw new Error("User not found");
    }
    return existing;
  }

  const pool = getPool();
  values.push(id);
  const result = await pool.query<User>(
    `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx} RETURNING id, email, password_hash, role, created_at, updated_at`,
    values,
  );
  if (result.rows.length === 0) {
    throw new Error("User not found");
  }
  return result.rows[0]!;
}

export async function deleteUser(id: number): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
}

export async function ensureAdminUser(params: {
  email: string;
  passwordHash: string;
}): Promise<void> {
  const normalized = params.email.trim().toLowerCase();
  const pool = getPool();
  await pool.query(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') ON CONFLICT (email) DO NOTHING",
    [normalized, params.passwordHash],
  );
}
