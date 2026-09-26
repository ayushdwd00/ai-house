"""
AI House - Photorealistic Architectural Blender / Cycles Renderer
------------------------------------------------------------------
Generates a complete 3D architectural scene from the canonical HouseLayout
and renders high-fidelity photos using Blender Cycles.

Can be run headless via:
  blender --background --python backend/render/blender_render.py -- --layout <path_to_json> --output <path_to_png> [--cutaway] [--resolution 1920x1080] [--samples 64]
"""

import sys
import os
import json
import math
import argparse

try:
    import bpy
    import mathutils
except ImportError:
    print("[ERROR] bpy module not found. This script must be executed inside Blender via:")
    print("        blender --background --python backend/render/blender_render.py -- <args>")
    sys.exit(1)

def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
        
    parser = argparse.ArgumentParser(description="Render HouseLayout with Blender Cycles")
    parser.add_argument("--layout", type=str, required=True, help="Path to HouseLayout JSON")
    parser.add_argument("--output", type=str, required=True, help="Path to output rendered image (.png)")
    parser.add_argument("--cutaway", action="store_true", help="Enable architectural dollhouse cutaway mode")
    parser.add_argument("--resolution", type=str, default="1920x1080", help="Resolution WxH (default: 1920x1080)")
    parser.add_argument("--samples", type=int, default=64, help="Cycles render samples (default: 64)")
    parser.add_argument("--lighting", type=str, default="day", choices=["day", "sunset", "night"], help="Lighting preset")
    return parser.parse_args(argv)

def clear_scene():
    """Removes default cube, light, camera and meshes."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if not bpy.data.collections:
        col = bpy.data.collections.new("ArchitecturalScene")
        bpy.context.scene.collection.children.link(col)

def create_pbr_material(name, base_color=(0.8, 0.8, 0.8, 1.0), roughness=0.5, metallic=0.0, transmission=0.0, ior=1.45, emission_color=(0,0,0,1), emission_strength=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    
    bsdf = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    
    if transmission > 0:
        if 'Transmission Weight' in bsdf.inputs:
            bsdf.inputs['Transmission Weight'].default_value = transmission
        elif 'Transmission' in bsdf.inputs:
            bsdf.inputs['Transmission'].default_value = transmission
        if 'IOR' in bsdf.inputs:
            bsdf.inputs['IOR'].default_value = ior
            
    if emission_strength > 0:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = emission_color
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emission_strength
            
    output = nodes.new(type="ShaderNodeOutputMaterial")
    output.location = (300, 0)
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    return mat

def add_box(name, size, location, material=None, rotation=(0, 0, 0)):
    sx, sy, sz = size
    lx, ly, lz = location
    
    mesh = bpy.data.meshes.new(name + "_mesh")
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    
    hw, hd, hh = sx / 2.0, sy / 2.0, sz / 2.0
    verts = [
        (-hw, -hd, -hh), (hw, -hd, -hh), (hw, hd, -hh), (-hw, hd, -hh),
        (-hw, -hd, hh), (hw, -hd, hh), (hw, hd, hh), (-hw, hd, hh)
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2),
        (2, 6, 7, 3), (3, 7, 4, 0)
    ]
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    
    obj.location = (lx, ly, lz)
    obj.rotation_euler = rotation
    
    if material:
        obj.data.materials.append(material)
    return obj

def build_scene_from_layout(layout_data, is_cutaway=True, lighting="day"):
    plot_w = float(layout_data.get("plot_width", 40.0))
    plot_l = float(layout_data.get("plot_length", 60.0))
    facing = layout_data.get("facing", "south").lower()
    
    # 1. PBR Materials
    mat_white_wall = create_pbr_material("WhitePlaster", base_color=(0.92, 0.90, 0.88, 1.0), roughness=0.88)
    mat_wood_floor = create_pbr_material("WoodFloor", base_color=(0.65, 0.45, 0.28, 1.0), roughness=0.45)
    mat_tile_floor = create_pbr_material("TileFloor", base_color=(0.88, 0.86, 0.82, 1.0), roughness=0.25)
    mat_slab = create_pbr_material("SlabConcrete", base_color=(0.78, 0.76, 0.74, 1.0), roughness=0.8)
    mat_glass = create_pbr_material("WindowGlass", base_color=(0.95, 0.98, 1.0, 1.0), roughness=0.05, transmission=0.92)
    mat_frame = create_pbr_material("DarkFrame", base_color=(0.15, 0.16, 0.18, 1.0), roughness=0.4, metallic=0.7)
    mat_grass = create_pbr_material("GrassSite", base_color=(0.28, 0.48, 0.18, 1.0), roughness=0.9)
    mat_paver = create_pbr_material("PaverDriveway", base_color=(0.75, 0.72, 0.68, 1.0), roughness=0.75)
    
    # 2. Site Ground Plane
    add_box("SiteGrass", (plot_w * 2.5, plot_l * 2.5, 0.4), (plot_w / 2, plot_l / 2, -0.2), material=mat_grass)
    
    # Calculate house bounds
    rooms = layout_data.get("rooms", [])
    if not rooms and layout_data.get("floors"):
        for fl in layout_data["floors"]:
            rooms.extend(fl.get("rooms", []))
            
    min_x = min([r.get("rect", {}).get("x", 0) for r in rooms], default=5.0)
    max_x = max([r.get("rect", {}).get("x", 0) + r.get("rect", {}).get("width", 10) for r in rooms], default=35.0)
    min_y = min([r.get("rect", {}).get("y", 0) for r in rooms], default=5.0)
    max_y = max([r.get("rect", {}).get("y", 0) + r.get("rect", {}).get("length", 10) for r in rooms], default=55.0)
    
    plinth_x = (min_x + max_x) / 2.0
    plinth_y = (min_y + max_y) / 2.0
    plinth_w = (max_x - min_x) + 2.0
    plinth_l = (max_y - min_y) + 2.0
    plinth_h = 1.5
    
    # Plinth / Foundation Slab
    add_box("PlinthSlab", (plinth_w, plinth_l, plinth_h), (plinth_x, plinth_y, plinth_h / 2.0), material=mat_slab)
    
    # 3. Floors & Rooms Construction
    floors = layout_data.get("floors", [])
    if not floors:
        floors = [{"floor_number": 1, "rooms": rooms, "exterior_walls": layout_data.get("exterior_walls", []), "interior_walls": layout_data.get("interior_walls", [])}]
        
    floor_height = 10.0
    full_wall_height = 9.5
    cutaway_wall_height = 4.2 if is_cutaway else full_wall_height
    
    for f_idx, fl in enumerate(floors):
        fl_base_z = plinth_h + (f_idx * floor_height)
        fl_rooms = fl.get("rooms", [])
        
        # Room floors & furniture
        for r_idx, r in enumerate(fl_rooms):
            rect = r.get("rect", {})
            rw = float(rect.get("width", 12.0))
            rl = float(rect.get("length", 12.0))
            rx = float(rect.get("x", 0.0)) + rw / 2.0
            ry = float(rect.get("y", 0.0)) + rl / 2.0
            rtype = (r.get("type") or "").lower()
            
            is_wet = "bath" in rtype or "toilet" in rtype or "kitchen" in rtype
            fl_mat = mat_tile_floor if is_wet else mat_wood_floor
            
            add_box(f"Floor_{f_idx}_Room_{r_idx}", (rw - 0.2, rl - 0.2, 0.15), (rx, ry, fl_base_z + 0.075), material=fl_mat)
            
            # Simple decorative furniture proxy
            for f_item in r.get("furniture", []):
                fw = float(f_item.get("width", 3.0))
                flen = float(f_item.get("length", 3.0))
                fx = float(f_item.get("x", rx))
                fy = float(f_item.get("y", ry))
                fh = 2.5
                add_box(f"Furn_{f_idx}_{f_item.get('id', 'item')}", (fw, flen, fh), (fx, fy, fl_base_z + fh / 2.0), material=mat_frame)
                
        # Walls
        ext_walls = fl.get("exterior_walls", [])
        int_walls = fl.get("interior_walls", [])
        
        all_walls = [(w, True) for w in ext_walls] + [(w, False) for w in int_walls]
        for w_idx, (w, is_ext) in enumerate(all_walls):
            start = w.get("start", {})
            end = w.get("end", {})
            sx, sy = float(start.get("x", 0)), float(start.get("y", 0))
            ex, ey = float(end.get("x", 0)), float(end.get("y", 0))
            
            dx, dy = ex - sx, ey - sy
            length = math.hypot(dx, dy)
            if length < 0.2:
                continue
                
            angle = math.atan2(dy, dx)
            mx, my = (sx + ex) / 2.0, (sy + ey) / 2.0
            
            thick = 0.75 if is_ext else 0.45
            
            # Cutaway wall elevation
            wh = cutaway_wall_height if is_cutaway and (f_idx == len(floors) - 1) else full_wall_height
            
            add_box(
                f"Wall_{f_idx}_{w_idx}",
                (length, thick, wh),
                (mx, my, fl_base_z + wh / 2.0),
                material=mat_white_wall,
                rotation=(0, 0, angle)
            )

    # 4. Camera Setup: Reference 3/4 Dollhouse
    cam_data = bpy.data.cameras.new(name="ArchitecturalCamera")
    cam_data.lens = 45 # Moderate focal length
    cam_obj = bpy.data.objects.new(name="CameraObj", object_data=cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    
    diag = math.hypot(plinth_w, plinth_l)
    cam_dist = diag * 1.55
    cam_height = diag * 1.25
    
    house_cx = plinth_x
    house_cy = plinth_y
    top_floor_base_z = plinth_h + ((len(floors) - 1) * floor_height)
    
    cam_obj.location = (house_cx + cam_dist * 0.75, house_cy - cam_dist * 0.75, cam_height)
    
    target = mathutils.Vector((house_cx, house_cy, (top_floor_base_z + full_wall_height) * 0.45))
    direction = target - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    # 5. Sun and Environment Lighting
    sun_data = bpy.data.lights.new(name="ArchitecturalSun", type='SUN')
    sun_data.energy = 5.5 if lighting == "day" else (3.2 if lighting == "sunset" else 0.4)
    sun_data.angle = math.radians(1.2)
    if lighting == "sunset":
        sun_data.color = (1.0, 0.72, 0.45)
    elif lighting == "night":
        sun_data.color = (0.55, 0.68, 0.95)
    else:
        sun_data.color = (1.0, 0.98, 0.92)
        
    sun_obj = bpy.data.objects.new(name="SunObj", object_data=sun_data)
    bpy.context.scene.collection.objects.link(sun_obj)
    sun_pitch = math.radians(48 if lighting == "day" else 18)
    sun_yaw = math.radians(55)
    sun_obj.rotation_euler = (sun_pitch, 0, sun_yaw)
    
    world = bpy.data.worlds.new("ArchitecturalWorld")
    world.use_nodes = True
    bpy.context.scene.world = world
    w_nodes = world.node_tree.nodes
    w_nodes.clear()
    
    bg_node = w_nodes.new(type="ShaderNodeBackground")
    if lighting == "night":
        bg_node.inputs['Color'].default_value = (0.02, 0.03, 0.06, 1.0)
        bg_node.inputs['Strength'].default_value = 0.4
    elif lighting == "sunset":
        bg_node.inputs['Color'].default_value = (0.35, 0.22, 0.18, 1.0)
        bg_node.inputs['Strength'].default_value = 1.0
    else:
        bg_node.inputs['Color'].default_value = (0.68, 0.76, 0.85, 1.0)
        bg_node.inputs['Strength'].default_value = 1.2
        
    w_out = w_nodes.new(type="ShaderNodeOutputWorld")
    world.node_tree.links.new(bg_node.outputs['Background'], w_out.inputs['Surface'])

def setup_render_settings(output_path, resolution="1920x1080", samples=64):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    try:
        scene.cycles.device = 'CPU'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    except Exception as e:
        print(f"[NOTICE] Cycles configuration warning: {e}")
        
    try:
        rw, rh = resolution.lower().split("x")
        scene.render.resolution_x = int(rw)
        scene.render.resolution_y = int(rh)
    except Exception:
        scene.render.resolution_x = 1920
        scene.render.resolution_y = 1080
        
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = output_path
    scene.view_settings.view_transform = 'Filmic'
    scene.view_settings.look = 'Medium High Contrast'

def main():
    args = parse_args()
    print("=" * 60)
    print("AI House - Blender Realistic Architectural Photo Pipeline")
    print(f"Layout File: {args.layout}")
    print(f"Output File: {args.output}")
    print(f"Cutaway: {args.cutaway}")
    print(f"Resolution: {args.resolution}, Samples: {args.samples}, Lighting: {args.lighting}")
    print("=" * 60)
    
    if not os.path.exists(args.layout):
        print(f"[ERROR] Layout JSON not found: {args.layout}")
        sys.exit(1)
        
    with open(args.layout, 'r', encoding='utf-8') as f:
        layout_data = json.load(f)
        
    clear_scene()
    build_scene_from_layout(layout_data, is_cutaway=args.cutaway, lighting=args.lighting)
    setup_render_settings(args.output, resolution=args.resolution, samples=args.samples)
    
    print("[INFO] Starting Blender Cycles rendering...")
    bpy.ops.render.render(write_still=True)
    print(f"[SUCCESS] Photorealistic image saved to: {args.output}")

if __name__ == '__main__':
    main()
