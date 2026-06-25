import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const TRANSIENT_DATABASE_MESSAGE_PATTERNS = [
  "can't reach database server",
  "database server",
  "connection terminated unexpectedly",
  "connection closed",
  "timed out fetching a new connection",
];

export const isTransientDataError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P1001" || error.code === "P2024";
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return TRANSIENT_DATABASE_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
  }

  return false;
};

export const isUnauthorizedDataError = (error: unknown) => error instanceof Error && error.message === "UNAUTHORIZED";

export const createTransientDataUnavailableResponse = (message = "Temporarily unavailable") =>
  NextResponse.json(
    {
      error: "temporarily_unavailable",
      message,
      retryable: true,
    },
    { status: 503 }
  );
