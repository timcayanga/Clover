import {askPageContext, type AskPageContext} from '../../shared/ask-clover-page';

/** Web route names differ from native routes; keep that translation at the web boundary. */
export function askWebPageContext(path:string, params:Record<string,unknown>={}, title?:string):AskPageContext {
 const segments=path.split('/').filter(Boolean);
 const [section,id]=segments;
 const recordId=typeof id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : undefined;
 if(section==='dashboard') return askPageContext('/home',params,title);
 if(section==='transactions' && recordId && !['new','categories','tags'].includes(recordId)) return askPageContext(`/transaction/${recordId}`,params,title);
 if(section==='accounts' && ['new','institutions'].includes(id)) return askPageContext('/accounts',params,title);
 if(section==='split-bill') {
  const billId=recordId && !['new','request','groups','group-invite'].includes(recordId) ? recordId : undefined;
  return askPageContext('/split-bills',{...params,...(billId && !params.billId ? {billId} : {})},title);
 }
 return askPageContext(path,params,title);
}
