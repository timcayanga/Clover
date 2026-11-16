import {brotliCompressSync, constants} from 'node:zlib';
import {NextResponse} from 'next/server';

/** Transport only: preserve the complete diagnostic JSON, including evidence. */
export function learningVerificationResponse(result: unknown, acceptEncoding: string | null) {
  const headers={'Cache-Control':'no-store','Vary':'Accept-Encoding'};
  const acceptsBrotli=(acceptEncoding??'').split(',').some(entry=>{
    const [coding,...parameters]=entry.trim().split(';');
    return coding.toLowerCase()==='br' && parameters.every(parameter=>{
      const [name,value]=parameter.trim().split('=');
      return name.toLowerCase()!=='q' || (Number(value)>0 && Number(value)<=1);
    });
  });
  if(acceptsBrotli){
    const json=JSON.stringify(result);
    if(Buffer.byteLength(json)>1024*1024){
      const encoded=brotliCompressSync(json,{params:{[constants.BROTLI_PARAM_QUALITY]:4}});
      return new NextResponse(new Uint8Array(encoded),{headers:{...headers,'Content-Type':'application/json','Content-Encoding':'br'}});
    }
  }
  return NextResponse.json(result,{headers});
}
