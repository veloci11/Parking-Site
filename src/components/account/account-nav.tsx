"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Box,
  Flag,
  Heart,
  LayoutDashboard,
  ListChecks,
  Mail,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { User } from "@/lib/types";
import { requestJson } from "@/lib/request-json";

export function AccountNav({ user }: { user: User }) {
  const path = usePathname();
  const administrative = path.startsWith("/admin") && user.role !== "member";
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const open = openPath === path;
  useEffect(() => {
    if (administrative) return;
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const result = await requestJson<{ unread: number }>(
          "/api/notifications",
          { cache: "no-store" },
        );
        if (active) setUnread(result.unread || 0);
      } catch {
        /* Navigation stays usable when notifications are unavailable. */
      } finally {
        pending = false;
      }
    };
    void load();
    window.addEventListener("gp:notifications", load);
    const timer = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("gp:notifications", load);
    };
  }, [administrative, user.id]);
  const personal = [
    {
      href: "/compte",
      label: "Vue d’ensemble",
      Icon: LayoutDashboard,
      active: path === "/compte",
    },
    {
      href: "/compte/annonces",
      label: "Mes annonces",
      Icon: ListChecks,
      active:
        path.startsWith("/compte/annonces") ||
        ["/compte/scenes", "/compte/parkings", "/compte/abonnement"].includes(
          path,
        ),
    },
    {
      href: "/compte/messages",
      label: "Messages",
      Icon: Mail,
      active:
        path.startsWith("/compte/messages") || path === "/compte/signalements",
    },
    {
      href: "/compte/notifications",
      label: "Notifications",
      Icon: Bell,
      active: path === "/compte/notifications",
    },
    {
      href: "/favoris",
      label: "Mes favoris",
      Icon: Heart,
      active: path === "/favoris",
    },
    {
      href: "/compte/parametres",
      label: "Paramètres",
      Icon: Settings,
      active: [
        "/compte/parametres",
        "/compte/securite",
        "/compte/suppression",
      ].includes(path),
    },
  ];
  const administrativeLinks = [
    { href: "/admin", label: "Annonces à relire", Icon: ShieldCheck },
    { href: "/admin/signalements", label: "Signalements", Icon: Flag },
    { href: "/admin/scenes", label: "Plans 3D", Icon: Box },
    ...(user.role === "admin"
      ? [
          { href: "/admin/parkings", label: "Parkings et places", Icon: Box },
          { href: "/admin/comptes", label: "Comptes et accès", Icon: Users },
          {
            href: "/admin/limites",
            label: "Limites des comptes",
            Icon: ListChecks,
          },
          {
            href: "/admin/journal",
            label: "Journal des actions",
            Icon: ListChecks,
          },
        ]
      : []),
  ].map((item) => ({ ...item, active: item.href === path }));
  const links = administrative ? administrativeLinks : personal;
  const activeLabel = links.find((item) => item.active)?.label || "Mon espace";
  return (
    <aside
      className={`account-sidebar account-navigation${open ? " is-open" : ""}`}
    >
      <div className="account-person">
        <div className="account-avatar">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <strong>{user.name}</strong>
          <span className="muted">
            {administrative
              ? user.role === "admin"
                ? "Administration"
                : "Modération"
              : "Mon compte"}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="account-navigation-toggle"
        aria-expanded={open}
        aria-controls="account-navigation-links"
        onClick={() => setOpenPath(open ? null : path)}
      >
        <span>
          <small>{administrative ? "Administration" : "Mon compte"}</small>
          <strong>{activeLabel}</strong>
        </span>
        <span>
          {open ? "Fermer" : "Menu"}
          {open ? (
            <X size={18} aria-hidden="true" />
          ) : (
            <Menu size={18} aria-hidden="true" />
          )}
        </span>
      </button>
      <nav
        id="account-navigation-links"
        aria-label={administrative ? "Administration" : "Mon espace"}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            setOpenPath(null);
            event.currentTarget.parentElement
              ?.querySelector<HTMLButtonElement>(".account-navigation-toggle")
              ?.focus();
          }
        }}
      >
        {links.map(({ href, label, Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpenPath(null)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
            {href === "/compte/notifications" && unread ? (
              <span
                className="account-nav-count"
                aria-label={`${unread} notifications non lues`}
              >
                {unread}
              </span>
            ) : null}
          </Link>
        ))}
        {administrative ? (
          <Link
            href="/compte"
            className="account-navigation-switch"
            onClick={() => setOpenPath(null)}
          >
            <LayoutDashboard size={18} aria-hidden="true" />
            Mon espace personnel
          </Link>
        ) : user.role !== "member" ? (
          <Link
            href="/admin"
            className="account-navigation-switch"
            onClick={() => setOpenPath(null)}
          >
            <ShieldCheck size={18} aria-hidden="true" />
            Administration
          </Link>
        ) : null}
      </nav>
    </aside>
  );
}
