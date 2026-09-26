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
    # Everything after '--' is for this script
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
    # Ensure a collection exists
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
    
    # Transmission for glass (Blender 4.0+ uses 'Transmission Weight')
    if transmission > 0:
        if 'Transmission Weight' in bsdf.inputs:
            bsdf.inputs['Transmission Weight'].default_value = transmission
        elif 'Transmission' in bsdf.inputs:
            bsdf.inputs['Transmission'].default_value = transmission
        if 'IOR' in bsdf.inputs:
            bsdf.inputs['IOR'].default_value = ior
            
    # Emission
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
    """Creates a box mesh with given dimensions centered at location."""
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

def build_scene_from_layout(layout, is_cutaway=False, lighting="day"):
    """Constructs the complete 3D architectural building from canonical HouseLayout."""
    
    # 1. Materials setup
    mat_plaster_ext = create_pbr_material("ExtPlaster", base_color=(0.93, 0.91, 0.88, 1.0), roughness=0.85)
    mat_plaster_int = create_pbr_material("IntPlaster", base_color=(0.95, 0.94, 0.92, 1.0), roughness=0.88)
    mat_stone_accent = create_pbr_material("StoneAccent", base_color=(0.25, 0.27, 0.30, 1.0), roughness=0.6)
    mat_plinth = create_pbr_material("PlinthConcrete", base_color=(0.60, 0.62, 0.64, 1.0), roughness=0.75)
    mat_slab = create_pbr_material("SlabConcrete", base_color=(0.88, 0.87, 0.85, 1.0), roughness=0.7)
    
    mat_wood_floor = create_pbr_material("HardwoodFloor", base_color=(0.65, 0.46, 0.28, 1.0), roughness=0.35, metallic=0.03)
    mat_marble_floor = create_pbr_material("MarbleFloor", base_color=(0.94, 0.95, 0.96, 1.0), roughness=0.15, metallic=0.05)
    mat_tile_floor = create_pbr_material("TileFloor", base_color=(0.88, 0.85, 0.80, 1.0), roughness=0.28, metallic=0.04)
    
    mat_glass = create_pbr_material("ArchGlass", base_color=(0.9, 0.95, 1.0, 0.1), roughness=0.03, transmission=0.98, ior=1.52)
    mat_frame = create_pbr_material("AlumFrame", base_color=(0.12, 0.14, 0.16, 1.0), roughness=0.35, metallic=0.85)
    mat_door_wood = create_pbr_material("DoorWood", base_color=(0.35, 0.24, 0.16, 1.0), roughness=0.45)
    mat_metal = create_pbr_material("MetalHardware", base_color=(0.75, 0.77, 0.80, 1.0), roughness=0.2, metallic=0.9)
    mat_furniture_fabric = create_pbr_material("FurnitureFabric", base_color=(0.78, 0.76, 0.72, 1.0), roughness=0.85)
    mat_furniture_wood = create_pbr_material("FurnitureWood", base_color=(0.45, 0.32, 0.22, 1.0), roughness=0.5)
    
    # 2. Elevation geometry tokens
    plinth_height = 0.8
    floor_height = 10.0
    wall_height = 9.5
    slab_thick = 0.6
    
    pw = layout.get("plot_width", 40)
    pl = layout.get("plot_length", 50)
    
    # Calculate footprint
    rooms = layout.get("rooms", [])
    min_x, max_x = float('inf'), float('-inf')
    min_y, max_y = float('inf'), float('-inf')
    for r in rooms:
        rect = r.get("rect", {})
        if rect:
            min_x = min(min_x, rect.get("x", 0))
            max_x = max(max_x, rect.get("x", 0) + rect.get("width", 0))
            min_y = min(min_y, rect.get("y", 0))
            max_y = max(max_y, rect.get("y", 0) + rect.get("length", 0))
            
    if not math.isfinite(min_x) or min_x >= max_x:
        min_x, max_x = 0, pw * 0.7
        min_y, max_y = 0, pl * 0.7
        
    house_w = max_x - min_x + 1.2
    house_l = max_y - min_y + 1.2
    house_cx = (min_x + max_x) / 2.0
    house_cy = (min_y + max_y) / 2.0
    
    # Facing / road direction
    facing = (layout.get("facing") or layout.get("orientation") or "south").lower()
    
    # Plinth base foundation
    add_box("PlinthFoundation", (house_w, house_l, plinth_height), (house_cx, house_cy, plinth_height / 2.0), mat_plinth)
    
    floors = layout.get("floors", [])
    if not floors:
        floors = [{
            "floor_number": 1,
            "rooms": rooms,
            "exterior_walls": layout.get("exterior_walls", []),
            "interior_walls": layout.get("interior_walls", []),
            "doors": layout.get("doors", []),
            "windows": layout.get("windows", [])
        }]
        
    num_floors = len(floors)
    
    for f_idx, fl in enumerate(floors):
        floor_base_z = plinth_height + f_idx * floor_height
        
        # Intermediate slab
        if f_idx > 0:
            add_box(f"IntermediateSlab_F{f_idx}", (house_w, house_l, slab_thick), (house_cx, house_cy, floor_base_z - slab_thick / 2.0), mat_slab)
            
        fl_rooms = fl.get("rooms", [])
        # 1. Room Floor Finishes
        for r_idx, rm in enumerate(fl_rooms):
            rect = rm.get("rect", {})
            if not rect:
                continue
            rw = max(1.0, rect.get("width", 10))
            rl = max(1.0, rect.get("length", 10))
            rx = rect.get("x", 0) + rw / 2.0
            ry = rect.get("y", 0) + rl / 2.0
            
            rm_type = (rm.get("type", "") + " " + rm.get("name", "")).lower()
            if "master" in rm_type or "bed" in rm_type or "guest" in rm_type:
                f_mat = mat_wood_floor
            elif "bath" in rm_type or "toilet" in rm_type or "powder" in rm_type:
                f_mat = mat_marble_floor
            elif "kitchen" in rm_type or "dining" in rm_type:
                f_mat = mat_tile_floor
            else:
                f_mat = mat_marble_floor
                
            add_box(f"RoomFloor_{f_idx}_{r_idx}", (rw - 0.05, rl - 0.05, 0.05), (rx, ry, floor_base_z + 0.025), f_mat)
            
            # Interior point lights in each room for realistic warm GI
            room_light_data = bpy.data.lights.new(name=f"Light_F{f_idx}_{r_idx}", type='POINT')
            room_light_data.energy = 85.0 if lighting == "night" else 45.0
            room_light_data.color = (1.0, 0.92, 0.80) # Warm 3000K
            room_light_data.shadow_soft_size = 0.5
            light_obj = bpy.data.objects.new(name=f"RoomLightObj_{f_idx}_{r_idx}", object_data=room_light_data)
            bpy.context.scene.collection.objects.link(light_obj)
            light_obj.location = (rx, ry, floor_base_z + 8.2)
            
            # Furniture
            for f_item in rm.get("furniture", []):
                fw = max(1.0, float(f_item.get("width") or 2.5))
                flen = max(1.0, float(f_item.get("length") or 2.5))
                fx = float(f_item.get("x") or rx)
                fy = float(f_item.get("y") or ry)
                ftype = (f_item.get("type") or "").lower()
                rot = math.radians(float(f_item.get("rotation") or 0))
                
                if "bed" in ftype:
                    add_box(f"BedBase_{f_idx}", (fw, flen, 0.6), (fx, fy, floor_base_z + 0.3), mat_furniture_wood, (0, 0, rot))
                    add_box(f"BedMattress_{f_idx}", (fw - 0.2, flen - 0.2, 0.7), (fx, fy, floor_base_z + 0.95), mat_furniture_fabric, (0, 0, rot))
                    add_box(f"BedHeadboard_{f_idx}", (fw + 0.2, 0.35, 2.5), (fx, fy - flen/2.0 + 0.15, floor_base_z + 1.25), mat_furniture_wood, (0, 0, rot))
                elif "sofa" in ftype:
                    add_box(f"SofaSeat_{f_idx}", (fw, flen, 0.65), (fx, fy, floor_base_z + 0.5), mat_furniture_fabric, (0, 0, rot))
                    add_box(f"SofaBack_{f_idx}", (fw, 0.45, 1.4), (fx, fy - flen/2.0 + 0.2, floor_base_z + 1.1), mat_furniture_fabric, (0, 0, rot))
                elif "table" in ftype or "dining" in ftype:
                    add_box(f"Table_{f_idx}", (fw, flen, 0.15), (fx, fy, floor_base_z + 2.4), mat_furniture_wood, (0, 0, rot))
                    add_box(f"TableLeg1_{f_idx}", (0.2, 0.2, 2.3), (fx - fw/2 + 0.3, fy - flen/2 + 0.3, floor_base_z + 1.15), mat_furniture_wood, (0, 0, rot))
                    add_box(f"TableLeg2_{f_idx}", (0.2, 0.2, 2.3), (fx + fw/2 - 0.3, fy + flen/2 - 0.3, floor_base_z + 1.15), mat_furniture_wood, (0, 0, rot))
                elif "wardrobe" in ftype or "closet" in ftype:
                    add_box(f"Wardrobe_{f_idx}", (fw, flen, 6.8), (fx, fy, floor_base_z + 3.4), mat_furniture_wood, (0, 0, rot))
                elif "toilet" in ftype:
                    add_box(f"Toilet_{f_idx}", (1.3, 1.8, 1.4), (fx, fy, floor_base_z + 0.7), mat_marble_floor, (0, 0, rot))
                elif "counter" in ftype or "kitchen" in ftype:
                    add_box(f"Counter_{f_idx}", (fw, flen, 2.7), (fx, fy, floor_base_z + 1.35), mat_stone_accent, (0, 0, rot))
                else:
                    add_box(f"Item_{f_idx}", (fw, flen, 1.2), (fx, fy, floor_base_z + 0.6), mat_furniture_fabric, (0, 0, rot))
                    
        # 2. Canonical Walls
        ext_walls = fl.get("exterior_walls", [])
        int_walls = fl.get("interior_walls", [])
        all_walls = [(w, True) for w in ext_walls] + [(w, False) for w in int_walls]
        
        for w_idx, (w, is_ext) in enumerate(all_walls):
            x1, y1 = float(w.get("x1", 0)), float(w.get("y1", 0))
            x2, y2 = float(w.get("x2", 0)), float(w.get("y2", 0))
            dx, dy = x2 - x1, y2 - y1
            w_len = math.hypot(dx, dy)
            if w_len < 0.2:
                continue
            angle = math.atan2(dy, dx)
            thick = float(w.get("thickness") or (0.75 if is_ext else 0.38))
            
            # Selective architectural cutaway handling
            # In cutaway mode: front-facing exterior walls are lowered to sill height to expose the interior
            is_front_facing = False
            if is_ext:
                mid_x = (x1 + x2) / 2.0
                mid_y = (y1 + y2) / 2.0
                if facing == "south" and mid_y > house_cy:
                    is_front_facing = True
                elif facing == "north" and mid_y < house_cy:
                    is_front_facing = True
                elif facing == "east" and mid_x > house_cx:
                    is_front_facing = True
                elif facing == "west" and mid_x < house_cx:
                    is_front_facing = True
                    
            if is_cutaway and is_front_facing:
                cur_wall_h = 3.2 # Cutaway sill height
            else:
                cur_wall_h = wall_height
                
            w_mat = mat_stone_accent if (is_ext and w_idx % 3 == 0) else (mat_plaster_ext if is_ext else mat_plaster_int)
            add_box(
                f"Wall_{f_idx}_{w_idx}",
                (w_len, thick, cur_wall_h),
                ((x1 + x2) / 2.0, (y1 + y2) / 2.0, floor_base_z + cur_wall_h / 2.0),
                w_mat,
                (0, 0, angle)
            )
            
        # 3. Doors & Windows Joinery
        for d_idx, d in enumerate(fl.get("doors", [])):
            dx1, dy1 = float(d.get("x1", 0)), float(d.get("y1", 0))
            dx2, dy2 = float(d.get("x2", 0)), float(d.get("y2", 0))
            dmx, dmy = (dx1 + dx2) / 2.0, (dy1 + dy2) / 2.0
            dw = max(2.5, float(d.get("width") or 3.0))
            d_angle = math.atan2(dy2 - dy1, dx2 - dx1)
            add_box(f"DoorLeaf_{f_idx}_{d_idx}", (dw - 0.2, 0.15, 6.8), (dmx, dmy, floor_base_z + 3.4), mat_door_wood, (0, 0, d_angle))
            add_box(f"DoorFrame_{f_idx}_{d_idx}", (dw, 0.35, 7.0), (dmx, dmy, floor_base_z + 3.5), mat_frame, (0, 0, d_angle))
            
        for win_idx, win in enumerate(fl.get("windows", [])):
            wx1, wy1 = float(win.get("x1", 0)), float(win.get("y1", 0))
            wx2, wy2 = float(win.get("x2", 0)), float(win.get("y2", 0))
            wmx, wmy = (wx1 + wx2) / 2.0, (wy1 + wy2) / 2.0
            ww = max(2.5, float(win.get("width") or 4.0))
            win_angle = math.atan2(wy2 - wy1, wx2 - wx1)
            # Glass pane + frame
            add_box(f"WinGlass_{f_idx}_{win_idx}", (ww - 0.2, 0.08, 4.2), (wmx, wmy, floor_base_z + 2.8 + 2.1), mat_glass, (0, 0, win_angle))
            add_box(f"WinFrame_{f_idx}_{win_idx}", (ww, 0.25, 4.4), (wmx, wmy, floor_base_z + 2.8 + 2.2), mat_frame, (0, 0, win_angle))
            
        # 4. Staircase
        stair_rooms = [r for r in fl_rooms if "stair" in (r.get("type", "") + " " + r.get("name", "")).lower()]
        for st_idx, sr in enumerate(stair_rooms):
            s_rect = sr.get("rect", {})
            if s_rect:
                sw = max(3.0, s_rect.get("width", 6.0))
                sl = max(6.0, s_rect.get("length", 10.0))
                sx = s_rect.get("x", 0) + sw / 2.0
                sy = s_rect.get("y", 0) + sl / 2.0
                num_steps = 14
                step_h = floor_height / num_steps
                step_d = sl / num_steps
                for step_i in range(num_steps):
                    step_z = floor_base_z + (step_i + 0.5) * step_h
                    step_y = sy - sl / 2.0 + (step_i + 0.5) * step_d
                    add_box(f"StairStep_{f_idx}_{st_idx}_{step_i}", (sw, step_d, step_h), (sx, step_y, step_z), mat_wood_floor)

    # 3. RCC Roof Slab & Parapet Wall
    top_floor_base_z = plinth_height + (num_floors - 1) * floor_height
    roof_z = top_floor_base_z + wall_height
    
    if not is_cutaway:
        # Full roof slab
        add_box("RoofSlab", (house_w + 1.2, house_l + 1.2, slab_thick), (house_cx, house_cy, roof_z + slab_thick / 2.0), mat_slab)
        # Parapet wall
        parapet_h = 2.5
        parapet_thick = 0.5
        # Front, rear, left, right parapets
        add_box("ParapetFront", (house_w + 1.2, parapet_thick, parapet_h), (house_cx, house_cy + house_l/2.0, roof_z + slab_thick + parapet_h/2.0), mat_plaster_ext)
        add_box("ParapetRear", (house_w + 1.2, parapet_thick, parapet_h), (house_cx, house_cy - house_l/2.0, roof_z + slab_thick + parapet_h/2.0), mat_plaster_ext)
        add_box("ParapetLeft", (parapet_thick, house_l + 1.2, parapet_h), (house_cx - house_w/2.0, house_cy, roof_z + slab_thick + parapet_h/2.0), mat_plaster_ext)
        add_box("ParapetRight", (parapet_thick, house_l + 1.2, parapet_h), (house_cx + house_w/2.0, house_cy, roof_z + slab_thick + parapet_h/2.0), mat_plaster_ext)
    else:
        # Cutaway roof: Retain rear half of roof to demonstrate building massing and cutaway cross-section
        add_box("RoofSlabCutaway", (house_w + 1.2, house_l * 0.5, slab_thick), (house_cx, house_cy - house_l * 0.25, roof_z + slab_thick / 2.0), mat_slab)
        add_box("ParapetRear", (house_w + 1.2, 0.5, 2.5), (house_cx, house_cy - house_l/2.0, roof_z + slab_thick + 1.25), mat_plaster_ext)

    # 4. Architectural Camera (Dollhouse 3/4 Elevated Perspective framing the house)
    cam_data = bpy.data.cameras.new("DollhouseCamera")
    cam_data.lens = 45 # mm focal length
    cam_data.sensor_width = 36 # full frame 35mm
    cam_obj = bpy.data.objects.new("DollhouseCameraObj", cam_data)
    bpy.context.scene.collection.objects.link(cam_obj)
    bpy.context.scene.camera = cam_obj
    
    # Calculate distance to fit house bounds
    house_diag = math.hypot(house_w, house_l)
    cam_dist = house_diag * 1.55
    cam_elev = house_diag * 0.95
    
    # Place camera facing the entrance / orientation
    if facing == "west":
        cam_x = house_cx - cam_dist
        cam_y = house_cy + cam_dist * 0.4
    elif facing == "east":
        cam_x = house_cx + cam_dist
        cam_y = house_cy - cam_dist * 0.4
    elif facing == "north":
        cam_x = house_cx + cam_dist * 0.6
        cam_y = house_cy - cam_dist
    else: # south
        cam_x = house_cx + cam_dist * 0.75
        cam_y = house_cy + cam_dist
        
    cam_z = top_floor_base_z + cam_elev
    cam_obj.location = (cam_x, cam_y, cam_z)
    
    # Point camera at house center
    target = mathutils.Vector((house_cx, house_cy, (top_floor_base_z + wall_height) * 0.45))
    direction = target - cam_obj.location
    rot_quat = direction.to_track_quat('-Z', 'Y')
    cam_obj.rotation_euler = rot_quat.to_euler()

    # 5. Sun and Environment Lighting
    sun_data = bpy.data.lights.new(name="ArchitecturalSun", type='SUN')
    sun_data.energy = 5.5 if lighting == "day" else (3.2 if lighting == "sunset" else 0.4)
    sun_data.angle = math.radians(1.2) # Soft architectural shadows
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
    
    # Sky Background in World
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
    
    # Try CYCLES first
    scene.render.engine = 'CYCLES'
    try:
        scene.cycles.device = 'CPU' # Headless compatibility
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
    except Exception as e:
        print(f"[NOTICE] Cycles configuration warning: {e}. Falling back to default settings.")
        
    # Resolution
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
    
    # Color management: Filmic or AgX tone mapping
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
