import { getPool } from "./connection.js";

export type RoleCounts = {
  admin: number;
  internal: number;
  customer: number;
};

export type LookupsByDay = {
  date: string;
  count: number;
}[];

export interface DashboardStats {
  totalUsers: number;
  usersByRole: RoleCounts;
  totalLookups: number;
  lookupsLast7Days: number;
  lookupsByDay: LookupsByDay;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const pool = getPool();

  const usersResult = await pool.query<{
    total: string;
    admin: string;
    internal: string;
    customer: string;
  }>(
    `
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE role = 'admin')::text AS admin,
      COUNT(*) FILTER (WHERE role = 'internal')::text AS internal,
      COUNT(*) FILTER (WHERE role = 'customer')::text AS customer
    FROM users
  `
  );

  const usersRow = usersResult.rows[0] ?? {
    total: "0",
    admin: "0",
    internal: "0",
    customer: "0",
  };

  const totalUsers = Number(usersRow.total) || 0;
  const usersByRole: RoleCounts = {
    admin: Number(usersRow.admin) || 0,
    internal: Number(usersRow.internal) || 0,
    customer: Number(usersRow.customer) || 0,
  };

  const lookupsTotalResult = await pool.query<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM vin_lookups"
  );
  const totalLookups = Number(lookupsTotalResult.rows[0]?.total ?? "0") || 0;

  const lookupsLast7Result = await pool.query<{ total: string }>(
    "SELECT COUNT(*)::text AS total FROM vin_lookups WHERE created_at >= NOW() - INTERVAL '7 days'"
  );
  const lookupsLast7Days = Number(lookupsLast7Result.rows[0]?.total ?? "0") || 0;

  const lookupsByDayResult = await pool.query<{ day: string; count: string }>(
    `
      SELECT
        TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::text AS count
      FROM vin_lookups
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at)
    `
  );

  const lookupsByDay: LookupsByDay = lookupsByDayResult.rows.map((row) => ({
    date: row.day,
    count: Number(row.count) || 0,
  }));

  return {
    totalUsers,
    usersByRole,
    totalLookups,
    lookupsLast7Days,
    lookupsByDay,
  };
}

