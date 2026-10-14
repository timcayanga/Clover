if(process.env.CLOVER_MODEL_MIGRATION_EVAL!=='1')throw Error('Explicit synthetic benchmark opt-in required');
const Module=require('node:module'),load=Module._load;
Module._load=function(id,parent,main){let path='';try{path=Module._resolveFilename(id,parent)}catch{}
if(/[/\\]lib[/\\]prisma\.(ts|js)$/.test(path))return{prisma:new Proxy({},{get(){throw Error('Database access forbidden in synthetic benchmark')}})};
if(/[/\\]lib[/\\]ai-consent\.(ts|js)$/.test(path))return{maySendToCloudAi:async id=>id==='synthetic-model-eval'};
const value=load.apply(this,arguments);
return /[/\\]lib[/\\]clover-token-usage\.(ts|js)$/.test(path)?{...value,mayUseImportCloudAi:async id=>id==='synthetic-model-eval'}:value;};
