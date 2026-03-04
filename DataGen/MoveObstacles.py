import bpy
import random
import time
import sys

# --- CONFIG ---
# Change these to match your object names
object_names = ["OBST_1", "OBST_2"]

# Set the random range for each axis
min_range = -2
max_range = 2

args = sys.argv[sys.argv.index("--") + 1 :]  # Get all args after "--"

x1 = float(args[0])
y1 = float(args[1])
x2 = float(args[2])
y2 = float(args[3])


obj = bpy.data.objects.get(object_names[0])  # Change index for different objects
if obj:
    obj.location.x = x1
    obj.location.y = y1
else:
    print(f"Object '{object_names[0]}' not found!")

obj = bpy.data.objects.get(object_names[1])  # Change index for different objects
if obj:
    obj.location.x = x2
    obj.location.y = y2
else:
    print(f"Object '{object_names[1]}' not found!")

for scene in bpy.data.scenes:
    for object in scene.objects:
        for modifier in object.modifiers:
            if modifier.type == "FLUID":
                if modifier.fluid_type == "DOMAIN":
                    bpy.ops.object.select_all(action="DESELECT")
                    object.select_set(True)
                    bpy.context.view_layer.objects.active = object
                    bpy.ops.fluid.free_all()
                    break
time.sleep(5)

for scene in bpy.data.scenes:
    for object in scene.objects:
        for modifier in object.modifiers:
            if modifier.type == "FLUID":
                if modifier.fluid_type == "DOMAIN":
                    bpy.ops.object.select_all(action="DESELECT")
                    object.select_set(True)
                    bpy.context.view_layer.objects.active = object
                    bpy.ops.fluid.bake_all()
                    time.sleep(5)
                    break

bpy.ops.wm.save_mainfile()
