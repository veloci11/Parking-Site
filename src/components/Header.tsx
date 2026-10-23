"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Plus, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/client";
export default function Header() {
  const path = usePathname();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  return (
    <>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <header
        className={`site-header${["/", "/explorer", "/favoris"].includes(path) ? " site-header-explorer" : ""}`}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
            menuButton.current?.focus();
          }
        }}
      >
        <Link href="/" className="brand" aria-label="GP park — accueil">
          <img src="/brand/gp-logo.png" alt="GP" width="68" height="48" />
          <span>park.</span>
        </Link>
        <nav
          id="primary-navigation"
          className={open ? "primary-nav is-open" : "primary-nav"}
          aria-label="Navigation principale"
        >
          <Link
            onClick={() => setOpen(false)}
            className={path === "/" || path === "/explorer" ? "active" : ""}
            href="/"
          >
            Explorer
          </Link>
          <Link
            onClick={() => setOpen(false)}
            className={path === "/favoris" ? "active" : ""}
            href="/favoris"
          >
            Mes favoris
          </Link>
        </nav>
        <div className="header-actions">
          <Link
            className="button button-deposit"
            href="/deposer"
            aria-label="Déposer une annonce"
          >
            <Plus size={18} />
            <span>Déposer une annonce</span>
          </Link>
          <Link
            className="account-link"
            href={user ? "/compte" : "/connexion"}
            aria-label={user ? "Mon compte" : "Se connecter"}
          >
            <UserRound size={20} />
            <span>{user ? user.name.split(" ")[0] : "Connexion"}</span>
          </Link>
          <button
            ref={menuButton}
            type="button"
            className="icon-button mobile-nav"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="primary-navigation"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>
    </>
  );
}
