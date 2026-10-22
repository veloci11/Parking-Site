"""An occlusion pass from the unchanged final .blend cameras and scene geometry.
Never saves over the .blend. The floor patches use the exact source footprints.
"""
import bpy, json, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.data/render-parking'

def emission(name,color):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs['Color'].default_value=(*color,1);e.inputs['Strength'].default_value=1;o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],o.inputs['Surface']);return m

for level in [1,2]:
    bpy.ops.wm.open_mainfile(filepath=str(WORK/f'demo-level-minus-{level}.blend'))
    scene=bpy.context.scene;scene.cycles.samples=8;scene.cycles.use_denoising=False;scene.cycles.adaptive_threshold=0;scene.cycles.max_bounces=0;scene.cycles.use_light_tree=False
    scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0;scene.view_settings.gamma=1;scene.render.film_transparent=False
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(0,0,0,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=0
    black=emission('Opaque geometry occluder',(0,0,0));white=emission('Visible floor selection region',(1,1,1))
    for o in bpy.data.objects:
        if o.type in {'MESH','CURVE','FONT','SURFACE'}:
            o.is_shadow_catcher=False
            o.data.materials.clear();o.data.materials.append(white if o.name.startswith('Painted') else black)
        if o.type=='LIGHT':o.hide_render=True
    data=json.loads((ROOT/f'public/parking-renders/demo-level-minus-{level}.json').read_text())
    previous=None
    for space in data['spaces']:
        if previous:previous.hide_render=True
        points=space['footprintXZ'];mesh=bpy.data.meshes.new('Exact source footprint '+space['number']);mesh.from_pydata([(x,-y,.017) for x,y in points],[],[tuple(range(len(points)))]);mesh.update();o=bpy.data.objects.new('Mask region '+space['number'],mesh);scene.collection.objects.link(o);mesh.materials.append(white);previous=o
        scene.render.filepath=str(WORK/f'demo-level-minus-{level}-space-{space["number"]}-mask-raw.png')
        print('MASK_START',scene.render.filepath,flush=True);bpy.ops.render.render(write_still=True);print('MASK_DONE',scene.render.filepath,flush=True)
