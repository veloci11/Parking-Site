"""Contrôles des livrables de conception, sans prétendre tester le futur site."""
from pathlib import Path
from html.parser import HTMLParser
import csv, json, re, copy, hashlib
from jsonschema import Draft202012Validator, FormatChecker
from PIL import Image

base = Path(__file__).resolve().parents[1]
results = []
def check(label, condition, detail=''):
    results.append((label, bool(condition), detail))
    if not condition:
        raise AssertionError(label + ': ' + detail)

tokens = json.loads((base/'specs/design-tokens.json').read_text())
check('Une police principale', tokens['font']['family'] == 'Inter')
check('Sept tailles autorisées', tokens['font']['allowedSizesPx'] == [12,14,16,20,24,32,48])
sizes = {t[k] for t in tokens['typography'].values() for k in ('desktopPx','mobilePx')}
check('Tailles des tokens cohérentes', sizes == set(tokens['font']['allowedSizesPx']))
check('Palette de sélection courante', tokens['selection']['filterBackground'] == 'accentSoft' and tokens['colors']['accentSoft'] == '#F3ECD9')

def luminance(h):
    parts = [int(h[i:i+2],16)/255 for i in (1,3,5)]
    p = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in parts]
    return sum(v*w for v,w in zip(p,[.2126,.7152,.0722]))
def contrast(a,b):
    x,y = sorted([luminance(a),luminance(b)])
    return (y+.05)/(x+.05)
colors=tokens['colors']
for a,b in [('textPrimary','canvas'),('textSecondary','canvas'),('textMuted','canvas'),('onBrand','brand'),('onAccent','accentSoft'),('onAccent','accent')]:
    ratio=contrast(colors[a],colors[b])
    check('Contraste texte '+a+'/'+b, ratio >= 4.5, f'{ratio:.2f}:1')
ratio=contrast(colors['controlBorder'],colors['canvas'])
check('Contraste limite de contrôle',ratio>=3,f'{ratio:.2f}:1')

checker=FormatChecker()
for name in ['parking-level.schema.json','listing-submission.schema.json']:
    schema=json.loads((base/'specs'/name).read_text())
    Draft202012Validator.check_schema(schema)
    check('JSON Schema '+name,True)
scene=json.loads((base/'specs/parking-level.schema.json').read_text())
validator=Draft202012Validator(scene,format_checker=checker)
fixture=json.loads((base/'specs/parking-level.example.json').read_text())
errors=list(validator.iter_errors(fixture))
check('Fixture schématique valide',not errors,str([e.message for e in errors]))
bad=copy.deepcopy(fixture);bad['fidelity']='measured'
check('Refus mesuré sans calibrage',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['assets']['modelKey']='https://example.com/external.glb'
check('Refus ressource externe',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['assets']['modelKey']='published-scenes/../../private-uploads/document.glb'
check('Refus traversée de chemins',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['assets']['modelKey']='published-scenes/demo/image.png'
check('Refus image comme modèle',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['assets']['previewKey']='published-scenes/demo/model.glb'
check('Refus modèle comme aperçu',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['publicLocationContext']='area'
check('Refus manifest public pour annonce area',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['privateAddress']='adresse privée'
check('Refus champ privé dans manifest',bool(list(validator.iter_errors(bad))))
bad=copy.deepcopy(fixture);bad['spaces'][0]['spaceId']='mauvais-id'
check('Refus identifiant non UUID',bool(list(validator.iter_errors(bad))))

with (base/'specs/backlog.csv').open(encoding='utf-8-sig',newline='') as f:
    tasks=list(csv.DictReader(f))
ids={r['id'] for r in tasks}
check('35 tâches uniques',len(tasks)==35 and len(ids)==35)
deps={r['id']:[] if r['dependances']=='-' else r['dependances'].split(';') for r in tasks}
check('Dépendances existantes',all(d in ids for ds in deps.values() for d in ds))
done=set()
def visit(k,trail):
    check('Backlog sans cycle '+k,k not in trail)
    if k in done:return
    for d in deps[k]:visit(d,trail|{k})
    done.add(k)
for k in deps:visit(k,set())

for file in base.rglob('*.md'):
    text=file.read_text()
    for target in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',text):
        if target.startswith(('https://','http://','#','mailto:')):continue
        target=target.split('#',1)[0]
        check('Lien local '+file.name+' → '+target,(file.parent/target).exists())

class Page(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.refs=[];self.images=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='a' and 'href' in a:self.refs.append(a['href'])
        if tag=='img' and 'src' in a:self.images.append(a['src'])
for name in ['Dossier-complet.html','Charte-visuelle.html']:
    p=Page();p.feed((base/name).read_text())
    check('HTML IDs uniques '+name,len(p.ids)==len(set(p.ids)))
    for target in p.refs+p.images:
        if target.startswith(('http://','https://','mailto:')):continue
        if target.startswith('#'):
            check('Ancre '+name+' '+target,target[1:] in p.ids)
        else:
            check('Asset/lien HTML '+name+' '+target,(base/target.split('#',1)[0]).exists())

for path in (base/'assets').rglob('*.png'):
    im=Image.open(path);im.verify()
    check('PNG lisible '+path.name,True)
im=Image.open(base/'assets/logo-gp-proposition.png')
check('Logo avec transparence réelle','A' in im.getbands() and im.getchannel('A').getextrema()[0]==0)
brand=json.loads((base/'assets/BRAND_REFERENCE.json').read_text())
check('Logo approuvé conservé à l’identique',hashlib.sha256((base/'assets'/brand['file']).read_bytes()).hexdigest()==brand['sha256'])
briefs=sorted((base/'agents').glob('A[0-9][0-9]_*.md'))
check('18 rôles spécialisés préparés',len(briefs)==18)
check('Rôles A00 à A17',sorted(int(f.name[1:3]) for f in briefs)==list(range(18)))
for f in briefs:
    body=f.read_text()
    check('Brief complet '+f.name,all(section in body for section in ['## Objectif','## Cadre imposé','## Périmètre du futur code','## Dépendances de départ','## Livrables attendus','## Format du rapport de sortie']))
check('Fonte WOFF2 valide',(base/'assets/InterVariable.woff2').read_bytes()[:4] == b'wOF2')
check('Licence Inter présente','SIL OPEN FONT LICENSE' in (base/'assets/Inter-LICENSE.txt').read_text())

summary=[r for r in results if not r[0].startswith(('Backlog sans cycle','Lien local','Ancre ','Asset/lien HTML'))]
text='# Vérification du dossier\n\nCes contrôles concernent les fichiers de conception. Aucun test de l’application, de production, de paiement ou d’un parking réel n’est revendiqué.\n\n'
text+='| Contrôle | Résultat | Détail |\n|---|---|---|\n'
for label,ok,detail in summary:
    text+=f'| {label} | {"OK" if ok else "ÉCHEC"} | {detail} |\n'
text+=f'\n{len(results)} assertions documentaires exécutées : JSON Schema et fixture, contre-exemples, tokens, contrastes des paires prévues, dépendances, liens locaux, ancres HTML, actifs image et fonte.\n'
text+='\nLes contrastes calculés ne remplacent pas la recette accessibilité du site. La conformité du modèle aux dimensions réelles, les policies RLS, les emails et les abonnements seront testés après développement.\n'
(base/'VERIFICATION.md').write_text(text)
print(json.dumps({'assertions':len(results),'status':'passed','tasks':len(tasks),'report':'VERIFICATION.md'},ensure_ascii=False))
