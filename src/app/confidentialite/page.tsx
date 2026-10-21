import Footer from "@/components/Footer";
export const metadata = { title: "Confidentialité — préparation" };
export default function Privacy() {
  return (
    <>
      <main id="main" className="page-shell prose">
        <h1>Vos données, avec attention.</h1>
        <p className="legal-placeholder">
          Politique de préparation : le responsable de traitement, les contacts,
          les durées de conservation et les modalités applicables seront validés
          avant ouverture publique.
        </p>
        <h2>Données utilisées par le service</h2>
        <p>
          Le compte contient votre nom, votre email et les informations
          nécessaires à la connexion. Les annonces, photos, conversations et
          demandes de visite sont enregistrées pour fournir les fonctions
          demandées.
        </p>
        <h2>Ce qui apparaît publiquement</h2>
        <p>
          Seules les annonces approuvées et leurs médias autorisés sont publics.
          L’email de connexion, les conversations et les fichiers sources
          restent privés. Le choix d’une localisation approximative masque
          l’adresse précise et désactive le plan intérieur public.
        </p>
        <h2>Cookies et stockage local</h2>
        <p>
          Un cookie de session sert à vous connecter. Les favoris d’un visiteur
          sans compte peuvent être conservés sur son appareil. Aucun outil
          publicitaire ou de mesure d’audience n’est activé dans cette version.
        </p>
        <h2>Services externes</h2>
        <p>
          La carte charge les ressources d’OpenFreeMap. Lorsque le mode connecté
          est configuré, les comptes, les annonces et les fichiers utilisent le
          projet Supabase de l’exploitant.
        </p>
        <h2>Gérer vos données</h2>
        <p>
          L’espace compte permet de modifier votre nom et d’exporter vos
          données. La fermeture du compte révoque l’accès et retire les
          annonces. Les règles de conservation des échanges et des éléments
          nécessaires à la modération doivent être arrêtées avant lancement.
        </p>
      </main>
      <Footer />
    </>
  );
}
