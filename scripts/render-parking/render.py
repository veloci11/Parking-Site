"""Deterministic, offline Cycles plates and matching normalized projection polygons.
Run with Blender --background --python render.py -- --manifest demo-minus-1.json.
Decorations and cars are forbidden unless the input explicitly has isDemo: true.
"""
import argparse, hashlib, json, math, os, sys
from pathlib import Path
import bpy, bmesh
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path(__file__).resolve().parent / 'assets'


def material(name, color, rough=.6, metal=0, emission=0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Metallic'].default_value=metal
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1)
        p.inputs['Emission Strength'].default_value=emission
    return m


def concrete(name, wall=False):
    m=material(name,(.4,.39,.37),.73 if wall else .49)
    ns=m.node_tree.nodes; ls=m.node_tree.links; p=ns.get('Principled BSDF')
    tex=ns.new('ShaderNodeTexCoord')
    coarse=ns.new('ShaderNodeTexNoise'); coarse.inputs['Scale'].default_value=1.2; coarse.inputs['Detail'].default_value=5; coarse.inputs['Roughness'].default_value=.76
    ls.new(tex.outputs['Object'],coarse.inputs['Vector'])
    ramp=ns.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position=.1; ramp.color_ramp.elements[1].position=.9
    ramp.color_ramp.elements[0].color=(*((.29,.28,.26) if wall else (.125,.123,.116)),1)
    ramp.color_ramp.elements[1].color=(*((.53,.51,.48) if wall else (.265,.258,.244)),1)
    ls.new(coarse.outputs['Fac'],ramp.inputs[0]); ls.new(ramp.outputs['Color'],p.inputs['Base Color'])
    fine=ns.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value=125; fine.inputs['Detail'].default_value=3
    ls.new(tex.outputs['Object'],fine.inputs['Vector'])
    bump=ns.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.2 if wall else .14; bump.inputs['Distance'].default_value=.018 if wall else .009
    ls.new(fine.outputs['Fac'],bump.inputs['Height']); ls.new(bump.outputs['Normal'],p.inputs['Normal'])
    rough=ns.new('ShaderNodeMapRange'); rough.inputs['From Min'].default_value=0; rough.inputs['From Max'].default_value=1; rough.inputs['To Min'].default_value=.52 if wall else .4; rough.inputs['To Max'].default_value=.83 if wall else .65
    ls.new(coarse.outputs['Fac'],rough.inputs['Value']);ls.new(rough.outputs['Result'],p.inputs['Roughness'])
    return m


def demo_photographic_floor(m):
    """CC0 photographed cement, decorative only in a fictional demonstration."""
    ns=m.node_tree.nodes;ls=m.node_tree.links;p=ns.get('Principled BSDF')
    previous_color=p.inputs['Base Color'].links[0].from_socket
    previous_normal=p.inputs['Normal'].links[0].from_socket
    tex=ns.new('ShaderNodeTexCoord');mapping=ns.new('ShaderNodeVectorMath');mapping.operation='SCALE';mapping.inputs['Scale'].default_value=.22;ls.new(tex.outputs['Object'],mapping.inputs[0])
    image=ns.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(ASSETS/'garage-floor-diffuse.jpg'));image.image.pack();ls.new(mapping.outputs[0],image.inputs['Vector'])
    hue=ns.new('ShaderNodeHueSaturation');hue.inputs['Saturation'].default_value=.12;ls.new(image.outputs['Color'],hue.inputs['Color'])
    mix=ns.new('ShaderNodeMixRGB');mix.inputs[0].default_value=.6;ls.new(previous_color,mix.inputs[1]);ls.new(hue.outputs[0],mix.inputs[2]);ls.new(mix.outputs[0],p.inputs['Base Color'])
    rough=ns.new('ShaderNodeTexImage');rough.image=bpy.data.images.load(str(ASSETS/'garage-floor-roughness.jpg'));rough.image.colorspace_settings.name='Non-Color';rough.image.pack();ls.new(mapping.outputs[0],rough.inputs['Vector'])
    r=ns.new('ShaderNodeMapRange');r.inputs['To Min'].default_value=.42;r.inputs['To Max'].default_value=.75;ls.new(rough.outputs['Color'],r.inputs['Value']);ls.new(r.outputs[0],p.inputs['Roughness'])
    bump=ns.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.14;bump.inputs['Distance'].default_value=.015;ls.new(image.outputs['Color'],bump.inputs['Height']);ls.new(previous_normal,bump.inputs['Normal']);ls.new(bump.outputs[0],p.inputs['Normal'])


def hazard():
    m=material('Yellow and black safety sleeves',(.9,.64,.08),.6)
    ns=m.node_tree.nodes; ls=m.node_tree.links; p=ns.get('Principled BSDF')
    tex=ns.new('ShaderNodeTexCoord'); sep=ns.new('ShaderNodeSeparateXYZ');ls.new(tex.outputs['Generated'],sep.inputs[0])
    mul=ns.new('ShaderNodeMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=2.3;ls.new(sep.outputs['Z'],mul.inputs[0])
    add=ns.new('ShaderNodeMath');add.operation='ADD';ls.new(mul.outputs[0],add.inputs[0]);ls.new(sep.outputs['X'],add.inputs[1])
    wave=ns.new('ShaderNodeMath');wave.operation='MULTIPLY';wave.inputs[1].default_value=math.pi*4;ls.new(add.outputs[0],wave.inputs[0])
    sine=ns.new('ShaderNodeMath');sine.operation='SINE';ls.new(wave.outputs[0],sine.inputs[0])
    threshold=ns.new('ShaderNodeMath');threshold.operation='GREATER_THAN';threshold.inputs[1].default_value=0;ls.new(sine.outputs[0],threshold.inputs[0])
    mix=ns.new('ShaderNodeMixRGB');mix.inputs[1].default_value=(.025,.028,.032,1);mix.inputs[2].default_value=(.98,.7,.06,1);ls.new(threshold.outputs[0],mix.inputs[0]);ls.new(mix.outputs[0],p.inputs['Base Color'])
    return m


def cube(name, loc, dims, mat, bevel=.018):
    bpy.ops.mesh.primitive_cube_add(size=1,location=(loc[0],-loc[1],loc[2]));o=bpy.context.object;o.name=name;o.dimensions=dims
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if mat:o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Small physical edge radius','BEVEL');mod.width=bevel;mod.segments=3
        mod=o.modifiers.new('Weighted face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return o


def line(name, pts, width, mat, cyclic=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=1;curve.bevel_depth=width;curve.bevel_resolution=2
    spl=curve.splines.new('POLY');spl.points.add(len(pts)-1)
    for p,co in zip(spl.points,pts):p.co=(co[0],-co[1],co[2],1)
    spl.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,curve);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return o


def text_obj(name, text, loc, size, mat, rot=0):
    c=bpy.data.curves.new(name,'FONT');c.body=str(text);c.align_x='CENTER';c.align_y='CENTER';c.size=size;c.extrude=.001;c.bevel_depth=.0006;c.resolution_u=12
    # Font plane is XY: it lies directly on the ground without a billboard.
    font=Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
    if font.exists():c.font=bpy.data.fonts.load(str(font))
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.location=(loc[0],-loc[1],loc[2]);o.rotation_euler.z=math.pi-rot;o.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH');o.select_set(False)
    return o


def polygon(name, points, base, height, mat, end_height=None):
    n=len(points);verts=[(x,-y,base) for x,y in points]
    ymin=min(p[1] for p in points);dy=max(p[1] for p in points)-ymin or 1
    verts += [(x,-y,base+height+(end_height-height)*(y-ymin)/dy if end_height is not None else base+height) for x,y in points]
    faces=[tuple(reversed(range(n))),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    faces=[tuple(reversed(f)) for f in faces]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
    b=o.modifiers.new('Physical corner radius','BEVEL');b.width=.008;b.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o


def area(name, loc, energy, size, target, color=(1,1,1), size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='RECTANGLE' if size_y else 'DISK';d.size=size
    if size_y:d.size_y=size_y
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=(loc[0],-loc[1],loc[2]);o.rotation_euler=(Vector((target[0],-target[1],target[2]))-o.location).to_track_quat('-Z','Y').to_euler();return o


def railing(name, x, y0, y1, height_at, steel):
    length=abs(y1-y0);n=math.ceil(length/1.5)
    for i in range(n+1):
        y=y0+(y1-y0)*i/n;z=height_at(y)
        cube(f'{name} post {i}',(x,y,z+.5),(.045,.045,1),steel,.008)
        cube(f'{name} foot {i}',(x,y,z+.018),(.13,.12,.036),steel,.009)
    for h in [.48,.98]:line(f'{name} rail {h}',[(x,y0,height_at(y0)+h),(x,y1,height_at(y1)+h)],.024,steel)


def import_cars(placements, silver):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ASSETS/'ferrari-original.glb'))
    imported=[o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes=[o for o in imported if o.type=='MESH']
    points=[o.matrix_world@Vector(v) for o in meshes for v in o.bound_box]
    mins=Vector([min(v[a] for v in points) for a in range(3)]);maxs=Vector([max(v[a] for v in points) for a in range(3)])
    dims=maxs-mins;long=max(range(3),key=lambda a:dims[a]);up=min(range(3),key=lambda a:dims[a]);side=next(a for a in range(3) if a not in [long,up]);s=4.48/dims[long]
    print('CAR_WORLD_BOUNDS',list(dims),'long',long,'up',up)
    # Bake import hierarchy into consistent x=width, y=length, z=height coordinates.
    center=(mins+maxs)*.5
    car_collection=bpy.data.collections.new('Detailed context car / CC-BY-4.0 / vicent091036')
    for old in meshes:
        data=old.data.copy();data.transform(old.matrix_world)
        for v in data.vertices:
            co=v.co.copy();v.co=((co[side]-center[side])*s,(co[long]-center[long])*s,(co[up]-mins[up])*s)
        o=bpy.data.objects.new('Car '+old.name,data);car_collection.objects.link(o)
        for poly in data.polygons:poly.use_smooth=True
        for idx,mat in enumerate(data.materials):
            if not mat:continue
            p=mat.node_tree.nodes.get('Principled BSDF') if mat.use_nodes else None
            if not p:continue
            name=mat.name.lower()
            if 'body_color' in name:data.materials[idx]=silver
            elif 'glass' in name:
                p.inputs['Base Color'].default_value=(.055,.075,.085,1);p.inputs['Roughness'].default_value=.1;p.inputs['Metallic'].default_value=.2;p.inputs['Transmission Weight'].default_value=.65;p.inputs['IOR'].default_value=1.48;p.inputs['Alpha'].default_value=1
            elif 'chrome' in name or 'metal' in name:
                p.inputs['Metallic'].default_value=.8;p.inputs['Roughness'].default_value=.25
            elif 'tire' in name:
                p.inputs['Base Color'].default_value=(.012,.014,.016,1);p.inputs['Metallic'].default_value=0;p.inputs['Roughness'].default_value=.87
    for old in imported:bpy.data.objects.remove(old,do_unlink=True)
    white_paint=material('Pearlescent white context car',(.72,.73,.71),.28,.4)
    white_collection=bpy.data.collections.new('Detailed white context car / CC-BY-4.0 / vicent091036')
    for original in car_collection.objects:
        copy=original.copy()
        if any(mat==silver for mat in original.data.materials):
            copy.data=original.data.copy()
            for idx,mat in enumerate(copy.data.materials):
                if mat==silver:copy.data.materials[idx]=white_paint
        white_collection.objects.link(copy)
    for i,(x,y,rotation) in enumerate(placements):
        o=bpy.data.objects.new(f'Context silver car {i+1}',None);o.instance_type='COLLECTION';o.instance_collection=car_collection if i==0 else white_collection;o.location=(x,-y,.025);o.rotation_euler.z=math.pi-rotation;bpy.context.collection.objects.link(o)


def build_demo(manifest,mats):
    wall=mats['wall'];floor=mats['floor'];paint=mats['paint'];steel=mats['steel'];black=mats['black'];haz=mats['hazard']
    polygon('Concrete foundation / visible cut slab',manifest['floor']['footprintXZ'],-.32,.32,wall)
    polygon('Polished concrete floor',manifest['floor']['footprintXZ'],.0,.015,floor)
    cube('Rear concrete wall',(0,-9.35,1.55),(23,.3,3.1),wall,.022)
    cube('Left concrete wall',(-11.35,0,1.55),(.3,18.4,3.1),wall,.022)
    cube('Front cutaway wall',(0,9.35,.38),(23,.3,.76),wall,.018)
    cube('Right cutaway wall',(11.35,0,.38),(.3,18.4,.76),wall,.018)
    cube('Rear wall plinth',(0,-9.175,.13),(22.7,.045,.26),black,.006)
    cube('Left wall plinth',(-11.175,0,.13),(.045,18.5,.26),black,.006)
    # Delicate formwork seams, tie holes and floor pour joints, not invented damage.
    joint=mats['joint']
    for x in [-10.2,-6.8,-3.4,0,3.4,6.8,10.2]:
        line('Rear shutter seam',[(x,-9.191,.28),(x,-9.191,3.05)],.0035,joint)
        for h in [.74,2.17]:
            bpy.ops.mesh.primitive_uv_sphere_add(segments=8,ring_count=4,radius=.019,location=(x+.7,9.184,h));bpy.context.object.name='Concrete tie recess';bpy.context.object.scale.y=.12;bpy.context.object.data.materials.append(joint)
    for h in [1.55]:
        line('Rear formwork horizontal',[(-11.2,-9.188,h),(11.2,-9.188,h)],.003,joint)
        line('Side formwork horizontal',[(-11.188,-9.2,h),(-11.188,9.2,h)],.003,joint)
    for y in [-6,-2.4,1.2,4.8,8.4]:
        line('Left shutter seam',[(-11.187,y,.28),(-11.187,y,3.05)],.0035,joint)
    for x in [-7.1,-.05,6.6]:line('Floor expansion joint',[(x,-9.15,.009),(x,9.12,.009)],.004,joint)
    for y in [-2.85,2.85]:line('Floor pour joint',[(-11.12,y,.009),(7.05,y,.009)],.0035,joint)
    for x in [-10.1,-4.45,1.55,5.65]:
        for y in [-2.15,2.15]:
            cube('Concrete loadbearing pillar',(x,y,1.55),(.56,.58,3.1),wall,.027)
            cube('Column head',(x,y,3.03),(.78,.8,.18),wall,.02)
            # Three sided safety protector, diagonal stripes are a procedural PBR material.
            cube('Safety sleeve front',(x,y+.301,.64),(.51,.024,1.08),haz,.006)
            cube('Safety sleeve right',(x+.291,y,.64),(.024,.53,1.08),haz,.006)
            cube('Safety sleeve rear',(x,y-.301,.64),(.51,.024,1.08),haz,.006)
    for space in manifest['allSpaces']:
        points=space['footprintXZ'];line('Painted stall border '+space['number'],[(x,y,.018) for x,y in points],.035,paint,True)
        x=sum(p[0] for p in points)/len(points);y=max(p[1] for p in points)-.76
        text_obj('Painted floor number '+space['number'],space['number'],(x,y,.022),.7,paint,math.pi)
        # Low concrete wheel stop along the back, weathered by neutral material only.
        if min(p[1] for p in points)<0:
            cube('Wheel stop',(x,min(p[1] for p in points)+.4,.065),(1.5,.13,.13),wall,.025)
    # Ramp and pedestrian stair are declared fictional demo geometry.
    y0,y1=-9.05,7.5
    h=lambda y:.12+2.1*(y1-y)/(y1-y0)
    pts=[(7.2,y0),(10.75,y0),(10.75,y1),(7.2,y1)]
    polygon('Ramp concrete slab',pts,-.08,2.3,floor,.2)
    for x in [7.16,10.8]:
        line('Ramp curb',[(x,y0,h(y0)+.11),(x,y1,h(y1)+.11)],.09,wall)
        railing('Ramp balustrade',x,y0,y1,h,steel)
    # Dashed ramp centre line and a direction arrow actually lying on the incline.
    for y in [-7.5,-5.5,-3.5,-1.5,.5,2.5,4.5,6.5]:line('Ramp centre paint',[(8.97,y,h(y)+.026),(8.97,y+.7,h(y+.7)+.026)],.025,paint)
    for i in range(12):cube('Concrete stair tread',(6.35,-5.15-i*.29,.105*(i+1)),(1.12,.3,.21*(i+1)),wall,.012)
    railing('Stair handrail',6.98,-8.45,-4.95,lambda y:.12+.72*(-y-4.95),steel)
    cube('Service fire door',(4.4,-9.17,1.14),(1.04,.055,2.28),mats['door'],.01)
    cube('Service door jamb',(4.4,-9.205,2.32),(1.12,.09,.08),steel,.006)
    cube('Door lever',(4.77,-9.115,1.1),(.16,.03,.025),steel,.006)
    cube('Emergency exit sign',(4.4,-9.095,2.62),(.75,.06,.27),mats['exit'],.014)
    # Luminaires with real bounce, conduit and a ceiling service pipe at the cut line.
    for x in [-8.2,-2.7,2.8,8.2]:
        cube('Luminaire metal housing',(x,-9.125,2.31),(1.83,.14,.14),steel,.012)
        cube('Warm linear diffuser',(x,-9.035,2.29),(1.72,.05,.072),mats['lamp'],.018)
        area('Wall light bounce',(x,-8.95,2.22),46,1.7,(x,-6.9,.6),(1,.87,.68),.11)
    line('Fire service pipe',[(-10.9,-8.95,2.87),(10.9,-8.95,2.87)],.035,mats['pipe'])
    for x in [-9,-5,0,5,9]:cube('Pipe bracket',(x,-9.065,2.87),(.045,.24,.12),steel,.004)
    line('Electrical conduit',[(-10.95,-9.055,.3),(-10.95,-9.055,2.8),(-5,-9.055,2.8)],.013,steel)
    # Painted aisle arrow.
    arrow=[(-1.8,-.35),(-1.8,.35),(.0,.35),(.0,.75),(.9,0),(.0,-.75),(.0,-.35)]
    polygon('Direction arrow',arrow,.018,.003,paint)
    import_cars([(-5.35,-5.75,0),(-1.8,5.7,math.pi)],mats['silver'])


def build_measured(manifest,mats):
    # No inferred columns, walls, cars, lights or access geometry in a real manifest.
    polygon('Measured floor',manifest['floor']['footprintXZ'],-manifest['floor']['thicknessM'],manifest['floor']['thicknessM'],mats['floor'])
    for i,o in enumerate(manifest.get('obstacles',[])):
        polygon('Documented '+o['kind']+' '+str(i),o['footprintXZ'],o['baseM'],o['heightM'],mats['wall'],o.get('endHeightM') if o['kind']=='ramp' else None)
    for s in manifest.get('spaces',[]):
        line('Documented stall marking',[(x,y,.016) for x,y in s['footprintXZ']],.025,mats['paint'],True)


def run():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--output',default=str(ROOT/'public/parking-renders'));parser.add_argument('--width',type=int,default=2048);parser.add_argument('--height',type=int,default=1536);parser.add_argument('--samples',type=int,default=128);parser.add_argument('--preview',action='store_true');parser.add_argument('--cpu',action='store_true')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);manifest_path=Path(args.manifest).resolve();manifest=json.loads(manifest_path.read_text())
    is_demo=manifest.get('isDemo') is True
    if not is_demo and manifest.get('provenance',{}).get('calibrated') is not True:raise ValueError('A real render requires an explicitly calibrated manifest.')
    if is_demo and not manifest.get('allSpaces'):raise ValueError('Demo geometry must be explicitly declared in the source fixture.')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene=bpy.context.scene;bpy.context.preferences.filepaths.save_version=0;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True;scene.cycles.adaptive_threshold=.025 if args.preview else .012;scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=4;scene.cycles.transparent_max_bounces=8;scene.cycles.seed=417+abs(manifest['level'])
    try:
        pref=bpy.context.preferences.addons['cycles'].preferences;pref.compute_device_type='METAL';pref.get_devices()
        for dev in pref.devices:dev.use=dev.type=='METAL'
        scene.cycles.device='CPU' if args.cpu else 'GPU'
    except Exception:scene.cycles.device='CPU'
    scene.render.resolution_x=args.width;scene.render.resolution_y=args.height;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.image_settings.color_depth='8';scene.render.film_transparent=True
    scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast';scene.view_settings.exposure=.4
    world=bpy.data.worlds.new('Neutral studio daylight');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.8,.84,.9,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45;scene.world=world
    mats={'wall':concrete('Formed architectural concrete',True),'floor':concrete('Satin concrete floor'),'paint':material('Off white road paint',(.87,.88,.83),.64),'steel':material('Brushed galvanized steel',(.23,.27,.29),.28,.8),'black':material('Dark base protection',(.10,.105,.10),.8),'joint':material('Subtle recessed joints',(.20,.19,.175),.85),'hazard':hazard(),'door':material('Grey powder coated door',(.29,.31,.30),.58,.25),'exit':material('Green exit sign',(.05,.25,.14),.4,0,.3),'lamp':material('Warm fluorescent diffuser',(1,.9,.72),.22,0,9),'pipe':material('Muted red service pipe',(.19,.035,.023),.4,.45),'silver':material('Pearlescent silver car paint',(.46,.49,.52),.28,.5)}
    p=mats['silver'].node_tree.nodes.get('Principled BSDF');p.inputs['Coat Weight'].default_value=.85;p.inputs['Coat Roughness'].default_value=.15
    if is_demo:
        demo_photographic_floor(mats['floor']);build_demo(manifest,mats)
    else:build_measured(manifest,mats)
    white=material('White studio ground',(.92,.92,.92),.85);cube('Studio ground',(0,0,-.43),(200,200,.12),white,.0).is_shadow_catcher=True
    area('Large daylight softbox',(-8,-3,16),2600,10,(0,0,0),(1,.96,.9))
    area('Front fill softbox',(5,13,11),1700,11,(0,0,.6),(.88,.92,1))
    area('Rear grazing softbox',(7,-12,9),1800,8,(0,0,0),(1,.92,.81))
    bpy.ops.object.camera_add(location=(18,-26,24.5));cam=bpy.context.object;cam.name='Fixed architectural camera';cam.rotation_euler=(Vector((-.4,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=32.0;cam.data.lens=70;scene.camera=cam
    if not is_demo:
        floor=manifest['floor']['footprintXZ'];xs=[p[0] for p in floor];ys=[p[1] for p in floor];cx=(min(xs)+max(xs))/2;cy=(min(ys)+max(ys))/2;extent=max(max(xs)-min(xs),max(ys)-min(ys),1);scale=extent/23
        cam.location=(cx+18*scale,-cy-26*scale,24.5*scale);cam.rotation_euler=(Vector((cx,-cy,.7*scale))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=extent*1.6
    bpy.context.view_layer.update()
    output=Path(args.output).resolve();output.mkdir(parents=True,exist_ok=True);stem=f'demo-level-minus-{abs(manifest["level"])}' if is_demo else f'measured-level-{manifest["level"]}'
    if args.preview:stem+='-preview'
    work=ROOT/'.data/render-parking';work.mkdir(parents=True,exist_ok=True);metadata_output=work if args.preview else output
    image_path=work/(stem+'.png');blend_path=work/(stem+'.blend');scene.render.filepath=str(image_path)
    source_hash=hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    def project(x,y,z=0):
        p=world_to_camera_view(scene,cam,Vector((x,-y,z)));return [round(p.x,7),round(1-p.y,7)]
    spaces=[]
    for s in manifest['spaces']:
        pts=s['footprintXZ'];cx=sum(p[0] for p in pts)/len(pts);cy=sum(p[1] for p in pts)/len(pts)
        spaces.append({'number':str(s.get('number',s.get('displayNumber',''))),'polygon':[project(x,y,.023) for x,y in pts],'anchor':project(cx,cy,.025),'label':project(cx,cy,1.6),'footprintXZ':pts})
    payload={'schemaVersion':'gp-parking-render/1','level':manifest['level'],'isDemo':is_demo,'width':args.width,'height':args.height,'image':'/parking-renders/'+stem+'.webp','spaces':spaces,'sourceManifestHash':source_hash,'camera':{'type':'orthographic','position':list(cam.location),'quaternion':list(cam.rotation_quaternion) if cam.rotation_mode=='QUATERNION' else list(cam.rotation_euler.to_quaternion()),'orthoScale':cam.data.ortho_scale,'worldToCamera':[[round(v,10) for v in row] for row in cam.matrix_world.inverted()],'coordinateSystem':'Blender Z-up; source XZ maps to Blender (X,-Y); normalized image origin top-left'},'renderRevision':'cycles-parking-v1','scriptHash':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'renderer':{'engine':'Blender Cycles','version':bpy.app.version_string,'samples':args.samples,'denoised':True,'device':scene.cycles.device},'attribution':[{'title':'Ferrari 458 Italia','author':'vicent091036','source':'https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6','license':'CC BY 4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/','changes':'Neutral silver and white paint; context placement and offline architectural render'},{'title':'Garage Floor photographed PBR texture','author':'Jenelle van Heerden / Poly Haven','source':'https://polyhaven.com/a/garage_floor','license':'CC0 1.0','licenseUrl':'https://creativecommons.org/publicdomain/zero/1.0/','changes':'Desaturated diffuse mixed with neutral concrete; roughness applied to fictional demo floor only'}] if is_demo else []}
    for space in spaces:
        for point in space['polygon']+[space['anchor'],space['label']]:
            if len(point)!=2 or any(not math.isfinite(v) or v<0 or v>1 for v in point):raise ValueError('Projection outside image; fit camera before publication.')
    (metadata_output/(stem+'.json')).write_text(json.dumps(payload,indent=2)+'\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path),check_existing=False)
    print('RENDER_START',str(image_path),flush=True);bpy.ops.render.render(write_still=True);print('RENDER_DONE',str(image_path),flush=True)

if __name__=='__main__':run()
