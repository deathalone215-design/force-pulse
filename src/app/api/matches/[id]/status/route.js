import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { findResolvedMatch } from "@/lib/tournamentData";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const validStatuses = ["SCHEDULED", "LIVE", "COMPLETED"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid or missing status" }, { status: 400 });
    }

    const updatedMatch = await prisma.match.update({
      where: { id },
      data: { status },
      include: {
        round: true,
      },
    });

    const resolvedMatch = await findResolvedMatch(id);
    return NextResponse.json(resolvedMatch || updatedMatch);
  } catch (error) {
    console.error("Failed to update match status:", error);
    return NextResponse.json({ error: "Failed to update match status" }, { status: 500 });
  }
}
