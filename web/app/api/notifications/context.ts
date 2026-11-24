import { NextResponse } from "next/server";
import { resolveBudgetingWorkspace } from "@/lib/budgeting-context";
import { isAdminOnlyDataError, isUnauthorizedDataError } from "@/lib/transient-data";

export const resolveContext = async () => {
  try {
    return await resolveBudgetingWorkspace();
  } catch (error) {
    if (isUnauthorizedDataError(error)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (isAdminOnlyDataError(error)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    throw error;
  }
};
