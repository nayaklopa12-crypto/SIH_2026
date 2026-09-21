"use client"

// 3.6 — Horizontal logo/client ticker, seamless CSS loop.
//
// Content is duplicated exactly once and the track animates translateX(0 → -50%)
// linear/infinite, so the repeat is seamless. Gradient edge fade via mask-image,
// hover/focus pause so a person can stop the strip and read an item, fixed row
// height + object-contain so nothing shifts layout on a narrow viewport.
//
// Items may be images or plain wordmarks. This project ships wordmarks by default:
// the strip carries the real upstream data providers, which doubles as the
// attribution the spec asks for and needs no binary assets to run offline.

import { cn } from "@/lib/utils"

export interface LogoTickerItem {
  label: string
  /** Optional logo image. Omit for a mono wordmark. */
  src?: string
  href?: string
}

export interface LogoTickerProps {
  items: LogoTickerItem[]
  /** One full loop, seconds. Longer = slower. */
  durationSeconds?: number
  className?: string
  /** Row height in px — fixed, so the strip never reflows. */
  rowHeight?: number
}

export function LogoTicker({
  items,
  durationSeconds = 40,
  className,
  rowHeight = 28,
}: LogoTickerProps) {
  if (!items.length) return null

  const renderItem = (item: LogoTickerItem, key: string, duplicate = false) => {
    const body = item.src ? (
      // eslint-disable-next-line @next/next/no-img-element -- plain <img> keeps the
      // strip dependency-free and object-contain already handles the sizing.
      <img
        src={item.src}
        alt={item.label}
        style={{ height: rowHeight, width: "auto", objectFit: "contain" }}
        className="opacity-70 transition-opacity duration-300 ease-out hover:opacity-100"
      />
    ) : (
      <span className="ed-mono-label ed-mono-label--tight whitespace-nowrap transition-colors duration-300 ease-out hover:text-[var(--ink)]">
        {item.label}
      </span>
    )

    return (
      <li
        key={key}
        // The duplicate half is decoration for the loop, so it is hidden from the
        // a11y tree — otherwise every provider is announced twice.
        aria-hidden={duplicate || undefined}
        className="flex shrink-0 items-center px-8 sm:px-12"
        style={{ height: rowHeight }}
      >
        {item.href ? (
          <a href={item.href} target="_blank" rel="noopener noreferrer">
            {body}
          </a>
        ) : (
          body
        )}
      </li>
    )
  }

  return (
    <div
      className={cn("ed-marquee-viewport relative w-full overflow-hidden", className)}
      style={{ ["--ed-marquee-duration" as string]: `${durationSeconds}s` }}
    >
      <ul className="ed-marquee-track m-0 list-none p-0">
        {items.map((item, i) => renderItem(item, `a${i}`))}
        {/* Exact duplicate — this is what makes translateX(-50%) seamless. */}
        {items.map((item, i) => renderItem(item, `b${i}`, true))}
      </ul>
    </div>
  )
}

export default LogoTicker
