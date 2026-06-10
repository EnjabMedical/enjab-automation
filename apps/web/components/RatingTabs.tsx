import Link from "next/link";

export type RatingTab = "settings" | "upcoming" | "decisions" | "tickets";

export interface RatingTabsProps {
  active: RatingTab;
  /** Open-ticket badge count shown on the "Tickets" tab. Hidden when 0. */
  openTicketCount?: number;
}

export function RatingTabs({ active, openTicketCount }: RatingTabsProps) {
  const items: { key: RatingTab; href: string; label: string }[] = [
    { key: "settings", href: "/automations/rating", label: "Settings" },
    { key: "upcoming", href: "/automations/rating/upcoming", label: "Upcoming" },
    { key: "decisions", href: "/automations/rating/decisions", label: "Decisions" },
    { key: "tickets", href: "/automations/rating/tickets", label: "Tickets" },
  ];
  return (
    <nav className="flex gap-2 border-b border-slate-200 text-sm">
      {items.map((i) => {
        const showBadge =
          i.key === "tickets" && openTicketCount !== undefined && openTicketCount > 0;
        const label = (
          <span className="inline-flex items-center gap-1.5">
            {i.label}
            {showBadge && (
              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                {openTicketCount}
              </span>
            )}
          </span>
        );
        return i.key === active ? (
          <span
            key={i.key}
            className="border-b-2 border-slate-900 px-3 py-2 font-medium text-slate-900"
          >
            {label}
          </span>
        ) : (
          <Link
            key={i.key}
            href={i.href}
            className="px-3 py-2 text-slate-600 hover:text-slate-900"
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
