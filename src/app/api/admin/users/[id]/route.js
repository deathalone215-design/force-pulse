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

export async function PATCH(request, { params }) {
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data = {};

    if (body.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
      }
      data.name = name;
    }

    if (body.email !== undefined) {
      const email = normalizeEmail(body.email);
      if (!email) {
        return NextResponse.json({ error: "Email is required" }, { status: 400 });
      }
      if (email !== existing.email) {
        const taken = await prisma.user.findUnique({ where: { email } });
        if (taken) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
      }
      data.email = email;
    }

    if (body.role !== undefined) {
      const role = String(body.role).toUpperCase();
      if (!["ADMIN", "MANAGER"].includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
      data.role = role;
    }

    if (body.active !== undefined) {
      data.active = !!body.active;
    }

    if (body.password) {
      if (String(body.password).length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 }
        );
      }
      data.passwordHash = await hashPassword(body.password);
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
      });

      if (Array.isArray(body.tournamentIds)) {
        const tournamentIds = [...new Set(body.tournamentIds.filter(Boolean))];
        await tx.tournamentAssignment.deleteMany({ where: { userId: id } });
        if (updated.role === "MANAGER" && tournamentIds.length) {
          await tx.tournamentAssignment.createMany({
            data: tournamentIds.map((tournamentId) => ({
              userId: id,
              tournamentId,
            })),
          });
        }
      }

      return tx.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          active: true,
          assignments: {
            select: {
              id: true,
              tournamentId: true,
            },
          },
        },
      });
    });

    const tournaments = user.assignments.length
      ? await prisma.tournament.findMany({
          where: { id: { in: user.assignments.map((row) => row.tournamentId) } },
          select: { id: true, name: true },
        })
      : [];
    const tournamentNameById = new Map(tournaments.map((t) => [t.id, t.name]));

    return NextResponse.json({
      ...user,
      assignments: user.assignments.map((row) => ({
        ...row,
        tournament: {
          id: row.tournamentId,
          name: tournamentNameById.get(row.tournamentId) || "Tournament",
        },
      })),
    });
  } catch (error) {
    console.error("Failed to update user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const gate = await requireFullAdmin(request);
  if (gate.error) return gate.error;

  try {
    const { id } = await params;
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Failed to delete user:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
