"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter } from "next/navigation";
import { MOBILE_LAYOUT_MEDIA_QUERY } from "./responsive-layout";

/** Keep the existing validated form, but give mobile creation its own URL and history entry. */
export function useMobileCreationRoute(open: boolean, setOpen: Dispatch<SetStateAction<boolean>>, base: string) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const previousOpen = useRef(false);
  const closing = useRef(false);
  const newPath = `${base}/new`;

  useEffect(() => {
    const media = matchMedia(MOBILE_LAYOUT_MEDIA_QUERY);
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (pathname !== newPath) closing.current = false;
    if (pathname === newPath && !open && !previousOpen.current && !closing.current) { setOpen(true); return; }
    if (mobile && open && !previousOpen.current && pathname !== newPath) {
      // Next copies its private history fields itself. Passing __NA back in
      // would bypass its pathname update and leave the header on the old route.
      window.history.pushState({ cloverCreation: newPath }, "", newPath);
    } else if (!open && previousOpen.current && pathname === newPath) {
      closing.current = true;
      if (window.history.state?.cloverCreation === newPath) window.history.back();
      else router.replace(base);
    }
    previousOpen.current = open;
  }, [base, mobile, newPath, open, pathname, router, setOpen]);

  useEffect(() => {
    const sync = () => setOpen(location.pathname === newPath);
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, [newPath, setOpen]);

  useEffect(() => {
    if (!mobile || !open) return;
    document.body.classList.add("mobile-creation-page");
    return () => document.body.classList.remove("mobile-creation-page");
  }, [mobile, open]);

  return mobile && open;
}
