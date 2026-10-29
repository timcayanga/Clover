import { useEffect, useState } from "react";
import { useSession } from "./session";
export function useCircleDateFormat() {
  const session = useSession(),
    [format, setFormat] = useState("MM/DD/YYYY");
  useEffect(() => {
    let live = true;
    if (!session.demo)
      void session
        .request<{ regionalPreferences: { dateFormat?: string } | null }>(
          "settings/regional",
        )
        .then((r) => {
          if (live && r.regionalPreferences?.dateFormat)
            setFormat(r.regionalPreferences.dateFormat);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [session.demo, session.request]);
  return format;
}
