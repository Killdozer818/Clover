import { auth } from "@clerk/nextjs/server";
import { neon } from "@neondatabase/serverless";

type CloverState = {
  books: unknown[];
  sessions: unknown[];
  quickReadDates: string[];
};

const blankState: CloverState = {
  books: [],
  sessions: [],
  quickReadDates: []
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return neon(databaseUrl);
}

async function ensureTable() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS clover_states (
      user_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  return sql;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sql = await ensureTable();
  const rows = await sql`
    SELECT data
    FROM clover_states
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  return Response.json({ state: rows[0]?.data ?? blankState });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const nextState = body?.state;
  if (!nextState || !Array.isArray(nextState.books) || !Array.isArray(nextState.sessions)) {
    return Response.json({ error: "Invalid Clover state." }, { status: 400 });
  }

  const sql = await ensureTable();
  await sql`
    INSERT INTO clover_states (user_id, data, updated_at)
    VALUES (${userId}, ${JSON.stringify(nextState)}::jsonb, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;

  return Response.json({ ok: true });
}
