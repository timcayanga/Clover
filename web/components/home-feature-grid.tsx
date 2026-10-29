"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { productPages } from "../../shared/circle-experience";
import { getNavigationIconSrc } from "@/lib/navigation-icons";
export function HomeFeatureGrid() {
  const track = useRef<HTMLDivElement>(null),
    [page, setPage] = useState(0);
  return (
    <section className="home-product-access">
      <nav aria-label="Quick Access">
        <div
          ref={track}
          className="home-product-access__track"
          onScroll={(e) => {
            const n = e.currentTarget;
            setPage(Math.round(n.scrollLeft / n.clientWidth));
          }}
        >
          {productPages.map((items, index) => (
            <div
              key={index}
              className="home-product-access__page"
              aria-label={`Quick Access ${index + 1} of 3`}
            >
              {items.map((item) => (
                <Link href={item.href} key={item.key} prefetch={false}>
                  <img
                    src={getNavigationIconSrc(item.key)}
                    width={40}
                    height={40}
                    alt=""
                  />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="home-product-access__dots">
          {productPages.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Quick Access page ${index + 1}`}
              aria-current={page === index ? "page" : undefined}
              onClick={() =>
                track.current?.scrollTo({
                  left: track.current.clientWidth * index,
                  behavior: "smooth",
                })
              }
            />
          ))}
        </div>
      </nav>
      <div className="home-quick-add">
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("clover:open-quick-transaction", {
                detail: { type: "expense" },
              }),
            )
          }
          className="button home-quick-add__expense"
        >
          − Add Expense
        </button>
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("clover:open-quick-transaction", {
                detail: { type: "income" },
              }),
            )
          }
          className="button home-quick-add__income"
        >
          + Add Income
        </button>
      </div>
    </section>
  );
}
