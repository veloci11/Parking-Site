import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { Listing, User } from "@/lib/types";
let singleton: DatabaseSync | undefined;
export function db() {
  if (singleton) return singleton;
  const path = process.env.GP_DATABASE_PATH || resolve(".data/gp-demo.sqlite");
  mkdirSync(dirname(path), { recursive: true });
  const sql = new DatabaseSync(path);
  sql.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password TEXT,role TEXT NOT NULL DEFAULT 'member',verified INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),type TEXT NOT NULL,token TEXT NOT NULL,receipt_hash TEXT,expires_at TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY,seller_id TEXT NOT NULL REFERENCES users(id),draft_json TEXT NOT NULL,public_json TEXT,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS revisions(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,decision TEXT,reason TEXT,actor_id TEXT,created_at TEXT NOT NULL,UNIQUE(listing_id,version));
 CREATE TABLE IF NOT EXISTS favorites(user_id TEXT REFERENCES users(id),listing_id TEXT REFERENCES listings(id),PRIMARY KEY(user_id,listing_id));
 CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id),buyer_id TEXT NOT NULL REFERENCES users(id),seller_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(listing_id,buyer_id,seller_id));
 CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id),sender_id TEXT REFERENCES users(id),body TEXT NOT NULL,request_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(sender_id,request_id));
 CREATE TABLE IF NOT EXISTS visits(id TEXT PRIMARY KEY,conversation_id TEXT REFERENCES conversations(id),status TEXT NOT NULL,proposed_at TEXT,confirmed_at TEXT,version INTEGER NOT NULL DEFAULT 1,request_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),listing_id TEXT NOT NULL REFERENCES listings(id),path TEXT NOT NULL,mime TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),listing_id TEXT REFERENCES listings(id),reason TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,target_id TEXT,detail TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,type TEXT NOT NULL,target_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL,UNIQUE(user_id,type,target_id));
 CREATE TABLE IF NOT EXISTS rate_limits(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS claims(space_id TEXT PRIMARY KEY,listing_id TEXT NOT NULL REFERENCES listings(id));`);
  if (
    !sql
      .prepare("PRAGMA table_info(listings)")
      .all()
      .some((row) => row.name === "published_at")
  )
    sql.exec("ALTER TABLE listings ADD COLUMN published_at TEXT");
  sql.exec(
    "UPDATE listings SET published_at=json_extract(public_json,'$.updatedAt') WHERE public_json IS NOT NULL AND published_at IS NULL",
  );
  singleton = sql;
  seed(sql);
  sql.exec(
    "UPDATE listings SET published_at=json_extract(public_json,'$.updatedAt') WHERE public_json IS NOT NULL AND published_at IS NULL",
  );
  return sql;
}
export function resetDbForTests() {
  singleton?.close();
  singleton = undefined;
}
export function transact<T>(fn: () => T): T {
  const sql = db();
  sql.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    sql.exec("COMMIT");
    return result;
  } catch (e) {
    sql.exec("ROLLBACK");
    throw e;
  }
}
export const personas = {
  buyer: "00000000-0000-4000-8000-000000000001",
  seller: "00000000-0000-4000-8000-000000000002",
  moderator: "00000000-0000-4000-8000-000000000003",
};
export function userDTO(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: row.role as User["role"],
    emailVerified: !!row.verified,
  };
}
function seed(sql: DatabaseSync) {
  if (sql.prepare("SELECT id FROM users LIMIT 1").get()) return;
  const now = new Date().toISOString();
  for (const [name, id, role] of [
    ["Camille Martin", personas.buyer, "member"],
    ["Alexandre Laurent", personas.seller, "member"],
    ["Équipe modération", personas.moderator, "moderator"],
  ])
    sql
      .prepare(
        "INSERT INTO users(id,name,email,role,verified,created_at) VALUES(?,?,?,?,1,?)",
      )
      .run(
        id,
        name,
        `${role === "moderator" ? "moderation" : id === personas.buyer ? "acheteur" : "vendeur"}@demo.invalid`,
        role,
        now,
      );
  const data = [
    ["Part-Dieu", 1850000, "covered", 12, 4.859, 45.76],
    ["Montchat", 2400000, "box", 14, 4.887, 45.749],
    ["Sans-Souci", 1600000, "outdoor", 11, 4.868, 45.743],
    ["Confluence", 3100000, "covered", 12, 4.818, 45.742],
    ["Croix-Rousse", 2200000, "covered", null, 4.832, 45.779],
    ["Brotteaux", 2850000, "box", 16, 4.858, 45.77],
  ] as const;
  data.forEach(([district, price, type, area, lng, lat], i) => {
    const id = `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
    const listing: Listing = {
      id,
      slug: `lyon-${district
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")}`,
      title:
        i === 3
          ? "Deux places côte à côte"
          : type === "box"
            ? "Un box, l’esprit tranquille"
            : type === "outdoor"
              ? "Votre place au grand air"
              : "Une place au cœur du quartier",
      description:
        i === 0
          ? "À quelques minutes de la gare, une place couverte dans une résidence calme. Accès par rampe et portail. Les dimensions et l’état présentés sont des données fictives de démonstration."
          : `Découvrez ce ${type === "box" ? "box fermé" : "parking"} dans le quartier ${district}. Ce bien est un exemple fictif pour explorer la plateforme. Les photos sont des illustrations et ne représentent pas un bien à vendre.`,
      city: "Lyon",
      district,
      priceCents: price,
      type,
      spaces: Array.from({ length: i === 3 ? 2 : 1 }, (_, j) => ({
        id: randomUUID(),
        number: String(i === 0 ? 12 : i === 3 ? 14 + j : 27 + i),
        level: type === "outdoor" ? 0 : -1,
        areaM2: area,
        lengthM: area ? 5 : null,
        widthM: area ? area / 5 : null,
        clearanceM: type === "outdoor" ? null : 2.1,
      })),
      photos: [`/demo/${type}.png`],
      quality: {
        floor: i === 0 ? "Bon état · traces d’usage" : "État déclaré",
        lighting:
          type === "outdoor" ? "Lumière naturelle" : "Éclairage collectif",
        humidity: i === 0 ? "À vérifier sur place" : "Non renseignée",
        access: type === "outdoor" ? "Accès extérieur" : "Portail sécurisé",
        maneuver: i === 0 ? "Poteau côté gauche" : "À vérifier sur place",
        observations:
          i === 0
            ? "Poteau latéral à prendre en compte. Illustration fictive ; aucune expertise du bien."
            : "Données et photos de démonstration. État réel à documenter.",
      },
      locationPrecision: i === 0 ? "exact_opt_in" : "area",
      coordinates: [lng, lat],
      sceneAvailable: i === 0,
      isDemo: true,
      status: "published",
      version: 1,
      sellerName: "Alexandre Laurent",
      createdAt: now,
      updatedAt: now,
    };
    sql
      .prepare(
        "INSERT INTO listings(id,seller_id,draft_json,public_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        id,
        personas.seller,
        JSON.stringify(listing),
        JSON.stringify(listing),
        "published",
        now,
        now,
      );
  });
}
