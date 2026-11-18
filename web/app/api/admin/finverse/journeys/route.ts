import { requireAdminAuth } from '@/lib/admin';
import { getBankJourneyReport,bankMonitorRange } from '@/lib/bank-journey-report';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{await requireAdminAuth();}catch{return Response.json({error:'Admin access required'},{status:403});}try{const q=new URL(request.url).searchParams;const report=await getBankJourneyReport({...bankMonitorRange(q.get('from')??undefined,q.get('to')??undefined),includeStaff:q.get('audience')==='all'});return Response.json(report,{headers:{'Cache-Control':'private, no-store'}});}catch{return Response.json({error:'Unable to load bank monitoring. Check the date range or try again.'},{status:400,headers:{'Cache-Control':'private, no-store'}});}}
