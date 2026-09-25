import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin";
import { getFinverseInstitutionCatalog } from "@/lib/finverse";
import { ISO_COUNTRY_NAMES } from "../../../../../../shared/iso-country-names";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireAdminAuth(); }
  catch (error) { return NextResponse.json({error:"Admin access required"}, {status: error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401}); }
  try {
    const result = await getFinverseInstitutionCatalog();
    const institutions = result.institutions.map(bank => ({...bank, countryNames: bank.countries.map(code =>
      ISO_COUNTRY_NAMES.find(([alpha3,alpha2]) => alpha3 === code || alpha2 === code)?.[2] ?? code)}));
    const headers = {"Cache-Control":"private, no-store"};
    if (new URL(request.url).searchParams.get("format") === "csv") {
      const cell = (value: unknown) => {const raw=Array.isArray(value)?value.join("; "):String(value);return `"${(/^[=+@-]/.test(raw)?"'":"")+raw.replace(/"/g,'""')}"`;};
      const rows = [["Institution ID","Bank","Countries","Status","Products","Tags","Shown in Clover","Exclusion reasons"],
        ...institutions.map(b=>[b.id,b.name,b.countryNames,b.status,b.products,b.tags,b.shownInClover,b.excludedReasons])];
      return new Response(rows.map(row=>row.map(cell).join(",")).join("\r\n"),{headers:{...headers,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=finverse-institutions.csv"}});
    }
    return NextResponse.json({fetchedAt:new Date().toISOString(),mode:result.mode,total:institutions.length,institutions},{headers});
  } catch { return NextResponse.json({error:"Unable to retrieve the Finverse catalogue. Check the server's Finverse configuration or try again."},{status:503}); }
}
