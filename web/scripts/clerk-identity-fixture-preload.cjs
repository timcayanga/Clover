const Module = require('module');
const original = Module._load;
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_qa')) throw Error('Isolated QA database required');
globalThis.__identityUsers = new Map();
globalThis.__identityActor = 'user_qaIdentityOwner';
globalThis.__identityFiles = [];
globalThis.__identityStorageFails = false;
globalThis.__identityCreateCount = 0;
const missing = () => Object.assign(new Error('Not found'), {status:404});
Module._load = function(id) {
 const value = original.apply(this, arguments);
 if (id === '@clerk/nextjs/server') return { ...value, auth: async () => ({ userId: globalThis.__identityActor }), clerkClient: async () => ({ users: {
  getUser: async id => { const u=globalThis.__identityUsers.get(id); if(!u) throw missing(); return u; },
  getUserList: async args => { let data=[...globalThis.__identityUsers.values()]; if(args.externalId) data=data.filter(u=>args.externalId.includes(u.externalId)); return {data:data.slice(args.offset||0,(args.offset||0)+args.limit),totalCount:data.length}; },
  createUser: async args => { globalThis.__identityCreateCount++; const id='user_qaIdentityCreated'; const user={id,firstName:args.firstName,lastName:args.lastName,externalId:args.externalId,primaryEmailAddressId:'em_primary',emailAddresses:[{id:'em_primary',emailAddress:args.emailAddress[0],verification:{status:'verified'}}]}; globalThis.__identityUsers.set(id,user);return user; },
  deleteUser: async id => { if(!globalThis.__identityUsers.delete(id)) throw missing(); return {id,deleted:true}; }
 } }) };
 if (id === 'next/headers') return { ...value, headers: async () => new Headers({host:'staging.clover.ph'}), cookies: async () => ({get:()=>undefined}) };
 if (id === 'next/cache') return { ...value, unstable_cache: fn=>fn, revalidateTag:()=>{}, revalidatePath:()=>{} };
 if (id.endsWith('/s3-delete') || id === './s3-delete') return { deleteImportObject: async key=>{if(globalThis.__identityStorageFails && globalThis.__identityFiles.length >= 1)throw Error('Fixture storage offline');globalThis.__identityFiles.push(key);} };
 return value;
};
