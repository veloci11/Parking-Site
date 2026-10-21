// Rendu documentaire uniquement : ne construit ni ne lance l'application.
// Dépendance : marked ; GP_MARKED_MODULE peut désigner le module du runtime local.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {marked} = await import(process.env.GP_MARKED_MODULE || 'marked');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['README.md', ...fs.readdirSync(root).filter(f => /^\d{2}_.*\.md$/.test(f)).sort()];
const ids = new Map(files.map((f, i) => [f, `chapitre-${i}`]));
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const tokens = JSON.parse(fs.readFileSync(path.join(root,'specs/design-tokens.json'),'utf8'));
const vars = Object.entries(tokens.colors).map(([k,v]) => `--${k}:${v}`).join(';');
const css = `
@font-face{font-family:Inter;src:url('assets/InterVariable.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}
:root{${vars};--line:var(--border)}*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}
body{margin:0;background:var(--canvas);color:var(--textPrimary);font:400 16px/1.6 Inter,system-ui,sans-serif}
a{color:var(--brand);text-underline-offset:3px}a:focus-visible,button:focus-visible{outline:2px solid var(--brand);outline-offset:4px}
header{border-bottom:1px solid var(--line);padding:32px max(24px,calc((100vw - 1280px)/2));background:var(--surface)}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
.hero{font-size:48px;line-height:1.08;letter-spacing:-.035em;font-weight:800;margin:12px 0 16px}
.sub{color:var(--textSecondary);max-width:72ch}.pill{display:inline-block;padding:8px 16px;border-radius:999px;background:var(--accentSoft);border:1px solid var(--accentBorder);font-size:14px;font-weight:600;color:var(--textPrimary)}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr);max-width:1344px;margin:auto;gap:40px;padding:32px}
aside{position:sticky;top:24px;align-self:start;max-height:calc(100vh - 48px);overflow:auto;border-right:1px solid var(--line);padding-right:20px}
aside a{display:block;font-size:14px;color:var(--textSecondary);text-decoration:none;padding:8px 4px}aside a:hover{color:var(--brand)}
main{min-width:0}article{padding-bottom:48px;margin-bottom:48px;border-bottom:1px solid var(--line)}
h1{font-size:32px;line-height:1.2;letter-spacing:-.025em;margin:0 0 24px;font-weight:700}h2{font-size:24px;line-height:1.25;letter-spacing:-.015em;margin:40px 0 16px}h3{font-size:20px;line-height:1.3;margin:28px 0 12px}
p,li{max-width:82ch}li+li{margin-top:8px}ul,ol{padding-left:24px}p{margin:12px 0 16px}strong{font-weight:700}
table{border-collapse:collapse;width:100%;font-size:14px;margin:20px 0 28px;display:block;overflow:auto}th,td{text-align:left;vertical-align:top;padding:12px 16px;border-bottom:1px solid var(--line);min-width:120px}th{font-weight:700;background:var(--surfaceSubtle)}td:last-child{min-width:240px}
pre{padding:20px;background:var(--surfaceSubtle);border:1px solid var(--line);border-radius:12px;overflow:auto;font-size:14px;line-height:1.5}code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.92em}p code,li code,td code{background:var(--surfaceSubtle);border-radius:4px;padding:2px 4px}
img{max-width:100%;height:auto;border-radius:12px}img[src*="logo-gp"]{display:block;max-height:260px;object-fit:contain;margin:auto}
.toolbar{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}.toolbar a{padding:10px 16px;border:1px solid var(--line);border-radius:8px;text-decoration:none;font-size:14px}
.charter{max-width:1280px;margin:0 auto;padding:40px 24px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}.block{padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}
.swatch{height:96px;border-radius:8px;margin-bottom:12px}.sample{padding:24px 0;border-bottom:1px solid var(--line)}.sample p{margin:8px 0}.meta{font-size:14px;color:var(--textSecondary)}
.demo-button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 20px;border-radius:8px;background:var(--brand);color:var(--onBrand);font-size:16px;font-weight:600;text-decoration:none}
.demo-chip{display:inline-flex;align-items:center;min-height:44px;padding:8px 20px;border-radius:999px;background:var(--accentSoft);border:1px solid var(--accentBorder);font-size:16px;font-weight:500;color:var(--textPrimary)}
.logo-preview{display:flex;align-items:center;justify-content:center;min-height:180px;border:1px solid var(--line);border-radius:16px;background:var(--surfaceSubtle)}.logo-preview img{max-height:180px}
footer{padding:24px;text-align:center;font-size:12px;color:var(--textMuted);border-top:1px solid var(--line)}
@media(max-width:900px){.layout{display:block;padding:24px}aside{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--line);padding-bottom:16px;margin-bottom:32px}.hero{font-size:32px}.grid{grid-template-columns:1fr}h1{font-size:24px}h2{font-size:20px}table{font-size:14px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{aside,.toolbar{display:none}.layout{display:block;padding:0}header{padding:20px 0}.hero{font-size:32px}body{font-size:12px}h1{font-size:24px}h2{font-size:20px}h3{font-size:16px}article{break-before:page;padding-bottom:12px;margin-bottom:16px}table{display:table;font-size:12px}th,td{min-width:0!important;padding:6px}img{max-height:190mm;object-fit:contain}pre{white-space:pre-wrap;overflow:visible}a{color:inherit}tr,img,pre{break-inside:avoid}}
`;
const titleOf = f => fs.readFileSync(path.join(root,f),'utf8').split('\n').find(l=>l.startsWith('# ')).slice(2);
const render = (f) => {
  let html = marked.parse(fs.readFileSync(path.join(root,f),'utf8'));
  let n = 0;
  html = html.replace(/<h([1-6])>/g,(_,level)=>`<h${level} id="${ids.get(f)}-titre-${++n}">`);
  html = html.replace(/href="([^"#]+\.md)(#[^"]*)?"/g,(all,target)=>ids.has(target)?`href="#${ids.get(target)}"`:all);
  return `<article id="${ids.get(f)}">${html}</article>`;
};
const nav = files.map(f=>`<a href="#${ids.get(f)}">${esc(titleOf(f))}</a>`).join('');
const shell = (title,body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
const headline = `<header><div class="eyebrow">Dossier de conception · version ${tokens.version}</div><div class="hero">Construire la plateforme GP.</div><p class="sub">Le plan complet : produit, charte, annonces, qualité réelle, ville et parking en 3D, comptes, architecture, modération et futurs forfaits mensuels.</p><span class="pill">V1 gratuite · Abonnements mensuels en V2</span><div class="toolbar"><a href="Charte-visuelle.html">Voir la charte visuelle</a><a href="README.md">Lire les sources Markdown</a><a href="specs/backlog.csv">Télécharger le backlog</a><a href="VERIFICATION.md">Contrôles du dossier</a></div></header>`;
fs.writeFileSync(path.join(root,'Dossier-complet.html'),shell('GP — dossier complet de construction',`${headline}<div class="layout"><aside aria-label="Sommaire">${nav}</aside><main>${files.map(render).join('')}</main></div><footer>Dossier local de spécification. Aucun site fonctionnel ni abonnement n’est déployé par ces pages.</footer>`));
const swatches=['brand','accent','accentSoft','accentBorder','canvas','surfaceSubtle','textPrimary','textSecondary','textMuted'].map(k=>`<div class="block"><div class="swatch" style="background:${tokens.colors[k]};border:1px solid var(--line)"></div><strong>${esc(k)}</strong><div class="meta">${tokens.colors[k]}</div></div>`).join('');
const samples=Object.entries(tokens.typography).map(([name,t])=>`<div class="sample"><div class="meta">${name} · ${t.desktopPx}px ordinateur / ${t.mobilePx}px mobile · ${t.weight} · interligne ${t.lineHeight}</div><p style="font-size:${t.desktopPx}px;font-weight:${t.weight};line-height:${t.lineHeight};letter-spacing:${t.letterSpacingEm}em">Votre prochaine place est ici.</p></div>`).join('');
const charter=`<header><div class="eyebrow">Charte de réalisation · GP</div><div class="hero">Une police. Sept tailles.</div><p class="sub">Inter pour toute l’interface ; violet pour les actions, or discret pour la sélection et champagne très pâle pour les filtres actifs.</p><div class="toolbar"><a href="Dossier-complet.html">Revenir au dossier complet</a><a href="02_CHARTE_VISUELLE.md">Lire toutes les règles</a><a href="specs/design-tokens.json">Ouvrir les tokens</a></div></header><main class="charter"><h1>Le système visuel</h1><h2>Logo de travail</h2><p class="meta">Couleur du premier G doré conservée. Référence validée visuellement par Mathis ; disponibilité du signe à vérifier et SVG final à produire. Le rendu trop métallique et l’or trop désaturé ont été écartés.</p><div class="logo-preview"><img src="assets/logo-gp-reference-validee.png" alt="Proposition de monogramme GP, G doré et P violet"></div><h2>Palette</h2><div class="grid">${swatches}</div><h2>Hiérarchie typographique</h2><p>Tailles autorisées : ${tokens.font.allowedSizesPx.join(', ')} px. Famille : Inter. Les chiffres des prix restent lisibles, sans créer une police supplémentaire.</p>${samples}<h2>Composants de référence</h2><p class="meta">Exemples graphiques sans fonction de navigation ni paiement.</p><div class="grid"><div class="block"><span class="demo-button">Demander une visite ↗</span><p class="meta">CTA primaire violet · 48px · Inter 16/600</p></div><div class="block"><span class="demo-chip">À vendre</span><p class="meta">Sélection champagne pâle · texte foncé · pas d’or saturé</p></div><div class="block"><strong style="font-size:32px;line-height:1.2">18 500 €</strong><p class="meta">Prix de démonstration · token pageTitle · chiffres tabulaires à l’intégration</p></div></div><h2>Espacements et composants</h2><p>${tokens.spacingPx.join(' · ')} px. Rayons 8/12/16/24px, capsule uniquement lorsque prévue. Cibles tactiles 44px minimum. Animations 120/200/320ms, réduction des mouvements respectée.</p><h2>Référence de la vue parking</h2><img src="assets/reference-parking.png" alt="Maquette de référence claire avec logo GP, filtre champagne pâle et place sélectionnée dorée"><h2>Règle de construction</h2><p>Les nouveaux écrans utilisent les mêmes tokens et composants. Une couleur ou une taille libre nécessite une exception documentée. Les essais graphiques ne prouvent ni l’accessibilité ni le fonctionnement du futur site.</p></main><footer>Charte locale de spécification · Pas une application de vente active.</footer>`;
fs.writeFileSync(path.join(root,'Charte-visuelle.html'),shell('GP — charte visuelle',charter));
console.log(JSON.stringify({chapters:files.length,html:['Dossier-complet.html','Charte-visuelle.html']}));
