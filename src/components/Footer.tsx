import Link from "next/link";
export default function Footer() {
  return (
    <footer className="site-footer">
      <span>GP park. · Une place, de nouvelles possibilités.</span>
      <nav aria-label="Informations">
        <Link href="/aide">Aide & contact</Link>
        <Link href="/mentions-legales">Mentions légales</Link>
        <Link href="/confidentialite">Confidentialité</Link>
        <Link href="/conditions-utilisation">Conditions d’utilisation</Link>
      </nav>
    </footer>
  );
}
