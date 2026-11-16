/** This route deliberately bypasses the app shell, analytics, service worker and Clerk UI. */
export const switchReviewPageScript = String.raw`
(()=>{
 const params=new URLSearchParams(location.hash.slice(1));
 const token=params.get('token')||'';
 const initial=params.get('decision');
 history.replaceState(null,'',location.pathname);
 const status=document.getElementById('status');
 const content=document.getElementById('content');
 const form=document.getElementById('decision-form');
 const choice=document.getElementById('decision');
 const message=document.getElementById('message');
 const confirm=document.getElementById('confirm');
 const submit=document.getElementById('submit');
 let busy=false;
 if(['approved','rejected','needs_information'].includes(initial))choice.value=initial;
 function updateMessage(){message.value=choice.value==='approved'?'Your purchase evidence has been approved. Activate your 30 days of Clover Plus in the app.':'';confirm.checked=false;}
 choice.addEventListener('change',updateMessage);updateMessage();
 async function request(action,extra={}){
   const response=await fetch('/api/campaign-review',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action,...extra})});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Unable to complete this request. Please retry.');}
   return response;
 }
 async function load(){
  status.textContent='Checking your private review link…';
  try{
   const data=await(await request('inspect')).json();
   document.getElementById('applicant').textContent=data.email;
   document.getElementById('note').textContent=data.note;
   document.getElementById('duplicate').hidden=!data.duplicateEvidence;
   document.getElementById('submitted').textContent='Submitted '+new Date(data.createdAt).toLocaleString();
   const receipts=document.getElementById('receipts');receipts.replaceChildren();
   for(const file of data.evidence){
    const block=document.createElement('div');block.className='receipt';
    const button=document.createElement('button');button.type='button';button.className='text-link';button.textContent='View '+file.fileName;
    button.addEventListener('click',async()=>{button.disabled=true;
     try{const response=await request('evidence',{evidenceId:file.id});const blob=await response.blob();const url=URL.createObjectURL(blob);
      if(file.mime==='application/pdf'){const link=document.createElement('a');link.href=url;link.download='purchase-evidence.pdf';link.textContent='Download receipt PDF';block.append(link);}
      else{const image=document.createElement('img');image.src=url;image.alt='Submitted purchase receipt';block.append(image);}
      button.remove();
     }catch(error){status.textContent=error.message;button.disabled=false;}
    });block.append(button);receipts.append(block);
   }
   content.hidden=false;status.textContent='Review the evidence, choose a decision and confirm below.';document.getElementById('retry').hidden=true;
  }catch(error){status.textContent=error.message;document.getElementById('retry').hidden=false;}
 }
 document.getElementById('retry').addEventListener('click',load);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!confirm.checked||!message.value.trim())return;
  busy=true;submit.disabled=true;choice.disabled=true;message.disabled=true;confirm.disabled=true;status.textContent='Saving your decision…';
  try{const result=await(await request('decide',{decision:choice.value,message:message.value.trim(),confirm:true})).json();content.hidden=true;status.textContent=result.message;document.getElementById('retry').hidden=true;}
  catch(error){status.textContent=error.message;submit.disabled=false;choice.disabled=false;message.disabled=false;confirm.disabled=false;busy=false;}
 });
 if(/^[a-zA-Z0-9_-]{43}$/.test(token))load();else status.textContent='Open a private review link from your Switch to Clover submission email.';
})();`;
export const switchReviewHtml = (nonce:string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Switch to Clover · Review</title><style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#f5f8f8;color:#202c35;font-family:Arial,sans-serif;line-height:1.6}main{max-width:680px;margin:32px auto;padding:24px}article{background:white;border:1px solid #d4e0e8;border-radius:24px;padding:24px}h1{font-size:28px;line-height:1.25;margin:16px 0}h2{font-size:18px}.brand{font-size:30px;font-weight:bold;color:#00abc0}label{display:block;margin-top:20px}select,textarea,button{font:inherit}select,textarea{width:100%;padding:12px;border:1px solid #9eafb8;border-radius:12px;color:inherit;background:white}textarea{min-height:130px;resize:vertical}button{min-height:44px;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.primary{width:100%;margin-top:20px;border:0;border-radius:24px;padding:12px 20px;color:white;background:#008b9e;font-weight:bold}.text-link{border:0;background:none;color:#007f90;padding:8px 0;text-align:left}.check{display:flex;gap:12px;align-items:start}.check input{width:20px;height:20px;flex-shrink:0;margin-top:5px}img{display:block;max-width:100%;height:auto;max-height:600px;object-fit:contain}.receipt{padding:12px 0;border-bottom:1px solid #d4e0e8}#note{white-space:pre-wrap;overflow-wrap:anywhere}#applicant{overflow-wrap:anywhere}#status{padding:12px 0;font-weight:bold}small{color:#536474}[hidden]{display:none!important}@media(max-width:480px){main{margin:0;padding:16px}article{padding:20px}}
</style></head><body><main><div class="brand">clover</div><article><h1>Switch to Clover</h1><p id="status" role="status" aria-live="polite">Open your private review link.</p><button id="retry" class="text-link" hidden>Retry loading</button><div id="content" hidden><h2>Purchase submission</h2><p id="applicant"></p><small id="submitted"></small><p id="note"></p><p id="duplicate" hidden>Matching evidence was submitted by another account. Check the purchase context; this alone does not prove misuse.</p><div id="receipts"></div><form id="decision-form"><label for="decision">Decision</label><select id="decision"><option value="approved">Approve</option><option value="rejected">Deny</option><option value="needs_information">Request more information</option></select><p><small>Approval lets the applicant activate 30 days of Plus within seven days. It does not start billing.</small></p><label for="message">Message to the applicant</label><textarea id="message" maxlength="2000" required></textarea><label class="check"><input type="checkbox" id="confirm" required><span>I confirm this decision and the message above.</span></label><button class="primary" id="submit" type="submit">Confirm decision</button></form></div></article></main><script nonce="${nonce}">${switchReviewPageScript}</script></body></html>`;
