import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFullAdmin } from "@/lib/accessControl";
import { hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function withTournamentNames(user, tournaments) {
  const tournamentNameById = new Map(tournaments.map((t) => [t.id, t.name]));
  return {
    ...user,
    assignments: (user.assignments || []).map((row) => ({
      ...row,
      tournament: {
        id: row.tournamentId,
        name: tournamentNameById.get(row.tournamentId) || "Tournament",
      },
    })),
  };
}

async function loadTournamentNames(tournamentIds) {
  if (!tournamentIds.length) return [];
  return prisma.tournament.findMany({
    where: { id: { in: tournamentIds } },
    select: { id: true, name: true },
  });
}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  createdAt: true,
  assignments: {
    select: {
      id: true,
      tournamentId: true,
    },
  },
};

export async function GET(request) {
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: userSelect,
    });

    const tournamentIds = [
      ...new Set(
        users.flatMap((user) => user.assignments.map((row) => row.tournamentId))
      ),
    ];
    const tournaments = await loadTournamentNames(tournamentIds);
    const payload = users.map((user) => withTournamentNames(user, tournaments));

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to list users:", error);
    return NextResponse.json(
      {
        error: "Failed to list users",
        detail:
          process.env.NODE_ENV === "production"
            ? undefined
            : error?.message || String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const name = String(body.name || "").trim();
    const password = body.password;
    const role = String(body.role || "MANAGER").toUpperCase();
    const tournamentIds = Array.isArray(body.tournamentIds)
      ? [...new Set(body.tournamentIds.filter(Boolean))]
      : [];

    if (!email || !name || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      );
    }

    if (!["ADMIN", "MANAGER"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role,
        assignments:
          role === "MANAGER" && tournamentIds.length
            ? {
                create: tournamentIds.map((tournamentId) => ({ tournamentId })),
              }
            : undefined,
      },
      select: userSelect,
    });

    const tournaments = await loadTournamentNames(
      user.assignments.map((row) => row.tournamentId)
    );

    return NextResponse.json(withTournamentNames(user, tournaments), {
      status: 201,
    });
  } catch (error) {
    console.error("Failed to create user:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
