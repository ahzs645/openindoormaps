import bpy
import json
import sys
from mathutils import Vector
from pathlib import Path

p = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(p / 'current-native-scene.glb'))
if sum(obj.type == 'MESH' for obj in bpy.context.scene.objects) < 10:
    raise RuntimeError('Incomplete source import; refuse empty-scene captures')
metadata = json.loads((p / 'scene-export.json').read_text())
origin = metadata['originFeet']
def point(x, y, z):
    return Vector((x-origin['x'], y-origin['y'], z-origin['z']))

scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.render.resolution_x = 1100
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('Inspection world')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.75, .8, .86, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .65
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'

z = 24.278215223097114
y = 528.5495338272797
for x in (15, 27, 36, 46, 60):
    light = bpy.data.lights.new('Inspection light '+str(x), 'AREA')
    light.energy = 1800
    light.shape = 'DISK'
    light.size = 8
    obj = bpy.data.objects.new(light.name, light)
    scene.collection.objects.link(obj)
    obj.location = point(x, y, z+8)

camera_data = bpy.data.cameras.new('Eye-level inspection camera')
camera = bpy.data.objects.new('Eye-level inspection camera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.lens = 23
camera_data.clip_start = .015
camera_data.clip_end = 5000
views = [
    ('01-link-toward-building08', (17, y, z+5.5), (35, y, z+3)),
    ('02-building08-toward-link', (44, y, z+5.5), (28, y, z+3)),
    ('03-threshold-close-up', (25.5, y, z+1.25), (31.8, y, z+.3)),
    ('04-inside-building08', (34, y, z+5.5), (49, y, z+3)),
]
results = []
for name, eye, target in views:
    camera.location = point(*eye)
    direction = point(*target)-camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(p / (name+'.png'))
    bpy.ops.render.render(write_still=True)
    results.append({'image':name+'.png','eyeModelFeet':eye,'targetModelFeet':target,
                    'eyeHeightAboveFloorFeet':eye[2]-z})

receipt = {'scope':'First-person perspective renders of the complete current recovered source scene, not browser screenshots or route certification.',
           'source':metadata,'renderer':'Blender '+bpy.app.version_string+' Cycles CPU',
           'originalSourceMeshesKept':True,'sourceGeometryOrMaterialsModified':False,
           'addedInspectionLights':True,'cameraClipEndFeet':camera_data.clip_end,
           'meshObjects':sum(obj.type=='MESH' for obj in scene.objects),
           'views':results}
(p/'first-person-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(p/'first-person-inspection.blend'))
