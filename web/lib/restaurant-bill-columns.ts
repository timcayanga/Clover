/** Rejoin a narrowly proven restaurant BILL layout. This changes reading order,
 * never digits, currency tokens, dates or raw receipt evidence. */
export function joinRestaurantBillColumns(source: string): string {
  const lines = source.split(/\r?\n/);
  const cells = lines.map((text,index)=>({text:text.trim(),index})).filter(x=>x.text);
  if (!cells.some(x=>/^(?:temporary\s+)?bill$/i.test(x.text)) || !/\b(?:table|dine\s*in|order)\b/i.test(source)) return source;
  const subtotal = cells.flatMap((x,i)=>/^sub\s*total\s*:?$/i.test(x.text)?[i]:[]);
  if (subtotal.length!==1) return source;
  const start = subtotal[0];
  const charge = cells[start+1]?.text.match(/^service\s+charge\s*[,,:]?\s*(\d{1,2}(?:\.\d+)?)%$/i);
  if (!charge || !/^amount\s+due\s*:?$/i.test(cells[start+2]?.text??"")) return source;
  const amount = /^(?:PHP|P|₱)?\s*(\d{1,3}(?:,\d{3})*|\d+)\.([0-9]{2})$/i;
  const cents = (text:string) => {const m=text.match(amount);return m?Number(m[1].replaceAll(",","") + m[2]):null;};
  let cursor=start+3;
  // Exactly one printed purchase date may precede the separate amount column.
  if (/^\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)?$/i.test(cells[cursor]?.text??"")) cursor++;
  const printed = cells.slice(cursor);
  if (printed.length<4 || printed.length>53 || printed.some(x=>cents(x.text)===null)) return source;
  const nums=printed.map(x=>cents(x.text)!);
  const [sub,fee,total]=nums.slice(-3);
  const items=nums.slice(0,-3);
  const quantityAmounts = cells.slice(0,start).flatMap(x=>{
    const m=x.text.match(/^(\d{1,2})\s*[x×@]\s*((?:PHP|P|₱)?\s*\d[\d,]*\.\d{2})$/i);
    return m ? [Number(m[1])*Number(cents(m[2]))] : [];
  });
  if (!nums.every(Number.isSafeInteger) || items.some(x=>x<=0) || total<=0 ||
      quantityAmounts.length!==items.length || quantityAmounts.some((x,i)=>x!==items[i]) ||
      items.reduce((a,b)=>a+b,0)!==sub || sub+fee!==total || Math.round(sub*Number(charge[1])/100)!==fee) return source;
  const result=[...lines];
  for(let i=0;i<3;i++) result[cells[start+i].index]=`${cells[start+i].text} ${printed[printed.length-3+i].text}`;
  return result.join("\n");
}
