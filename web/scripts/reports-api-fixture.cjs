const Module=require('node:module');
const original=Module._load;
const state={user:'owner-a',paid:true,rows:[],next:0,locks:0};
let queue=Promise.resolve();
const match=(r,w)=>Object.entries(w).every(([k,v])=>r[k]===v);
const db={workspace:{findFirst:async({where})=>where.id===`profile-${where.user.clerkUserId.at(-1)}`?{id:where.id}:null},savedReport:{
 findMany:async({where})=>state.rows.filter(r=>match(r,where)).map(r=>({...r})),
 count:async({where})=>state.rows.filter(r=>match(r,where)).length,
 create:async({data})=>{const r={...data,id:`saved-${++state.next}`,revision:1};state.rows.push(r);return r;},
 updateMany:async({where,data})=>{const rows=state.rows.filter(r=>match(r,where));rows.forEach(r=>Object.assign(r,{...data,revision:r.revision+1}));return{count:rows.length};},
 deleteMany:async({where})=>{const removed=state.rows.filter(r=>match(r,where));state.rows=state.rows.filter(r=>!removed.includes(r));return{count:removed.length};}
},$queryRaw:async(parts,id)=>{if(!parts.join('').includes('FOR UPDATE')||!id.startsWith('profile-'))throw Error('Expected scoped lock');state.locks++;return[];}};
db.$transaction=fn=>{const next=queue.then(()=>fn(db));queue=next.catch(()=>{});return next;};
globalThis.__reportFixture=state;
Module._load=function(id,parent,main){
 if(id.endsWith('/prisma')||id==='./prisma')return{prisma:db};
 if(id.endsWith('/pro-access')||id==='./pro-access')return{getProAccess:async()=>({planTier:state.paid?'pro':'free'})};
 if(id==='./user-context'&&parent?.filename.endsWith('reports-authorization.ts'))return{getOrCreateCurrentUser:async id=>({id,clerkUserId:id})};
 if(id==='./auth'&&parent?.filename.endsWith('reports-authorization.ts'))return{getSessionContext:async()=>{if(!state.user)throw Error('Unauthorized');return{userId:state.user,isGuest:false};}};
 return original.apply(this,arguments);
};
