"use client";
import { useEffect, useRef } from "react";
export const pullRefreshEvent = "clover:pull-to-refresh";
export type PullRefreshDetail = { pathname: string; workspaceId: string | null; waitUntil: (task: Promise<unknown>) => void };
export function registerPullRefresh(load: () => Promise<unknown>) {
  const listener = (event: Event) => { const detail = (event as CustomEvent<PullRefreshDetail>).detail; detail.waitUntil(Promise.resolve().then(load)); };
  window.addEventListener(pullRefreshEvent, listener);
  return () => window.removeEventListener(pullRefreshEvent, listener);
}
export function usePullRefresh(load: () => Promise<unknown>) {
  const latest = useRef(load); latest.current = load;
  useEffect(() => registerPullRefresh(() => latest.current()), []);
}
