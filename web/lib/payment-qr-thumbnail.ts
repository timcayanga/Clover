import {createHash} from "node:crypto";
import sharp from "sharp";
import jsQR from "jsqr";

const cache = new Map<string, Promise<string | null>>();

// Only the card receives this crop. The editable payment method retains its original.
export function paymentQrThumbnail(image: string | null): Promise<string | null> {
  if (!image || !/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(image)) return Promise.resolve(null);
  const key = createHash("sha256").update(image).digest("hex");
  const cached = cache.get(key);
  if (cached) return cached;
  const result = (async () => {
    const input = Buffer.from(image.slice(image.indexOf(",") + 1), "base64");
    const {data,info} = await sharp(input,{limitInputPixels:25000000}).rotate().resize({width:640,height:640,fit:"inside",withoutEnlargement:true}).ensureAlpha().toColourspace("srgb").raw().toBuffer({resolveWithObject:true});
    const qr = jsQR(new Uint8ClampedArray(data),info.width,info.height);
    if (!qr) return null;
    const points = [qr.location.topLeftCorner,qr.location.topRightCorner,qr.location.bottomLeftCorner,qr.location.bottomRightCorner];
    const xs = points.map(p=>p.x), ys=points.map(p=>p.y);
    const margin = Math.ceil((Math.max(...xs)-Math.min(...xs))*4/(17+4*qr.version));
    const left = Math.max(0,Math.floor(Math.min(...xs))-margin), top=Math.max(0,Math.floor(Math.min(...ys))-margin);
    const width = Math.min(info.width,Math.ceil(Math.max(...xs))+margin)-left, height=Math.min(info.height,Math.ceil(Math.max(...ys))+margin)-top;
    const crop = await sharp(data,{raw:info}).extract({left,top,width,height}).png().toBuffer();
    return "data:image/png;base64,"+crop.toString("base64");
  })().catch(()=>null);
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key,result);
  return result;
}
