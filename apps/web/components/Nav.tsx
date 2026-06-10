import Link from "next/link";

const links = [
  { href: "/", label: "Overview" },
  { href: "/bills", label: "Bills" },
  { href: "/automations", label: "Automations" },
];

export function Nav() {
  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          Enjab Automations
        </span>
        <div className="flex gap-4 text-sm text-slate-600">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded px-2 py-1 hover:bg-slate-100 hover:text-slate-900"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
