import os
import json
import struct
import math

def create_box_mesh(w, h, d, offset=(0, 0, 0)):
    """Generates box vertices, normals, and indices."""
    ox, oy, oz = offset
    hw, hh, hd = w / 2.0, h / 2.0, d / 2.0
    
    # 6 faces: +Y, -Y, +Z, -Z, +X, -X
    # 4 vertices per face to have sharp normals
    faces = [
        # +Y (Top)
        ([(ox - hw, oy + hh, oz - hd), (ox + hw, oy + hh, oz - hd), (ox + hw, oy + hh, oz + hd), (ox - hw, oy + hh, oz + hd)], (0, 1, 0)),
        # -Y (Bottom)
        ([(ox - hw, oy - hh, oz + hd), (ox + hw, oy - hh, oz + hd), (ox + hw, oy - hh, oz - hd), (ox - hw, oy - hh, oz - hd)], (0, -1, 0)),
        # +Z (Front)
        ([(ox - hw, oy - hh, oz + hd), (ox + hw, oy - hh, oz + hd), (ox + hw, oy + hh, oz + hd), (ox - hw, oy + hh, oz + hd)], (0, 0, 1)),
        # -Z (Back)
        ([(ox + hw, oy - hh, oz - hd), (ox - hw, oy - hh, oz - hd), (ox - hw, oy + hh, oz - hd), (ox + hw, oy + hh, oz - hd)], (0, 0, -1)),
        # +X (Right)
        ([(ox + hw, oy - hh, oz + hd), (ox + hw, oy - hh, oz - hd), (ox + hw, oy + hh, oz - hd), (ox + hw, oy + hh, oz + hd)], (1, 0, 0)),
        # -X (Left)
        ([(ox - hw, oy - hh, oz - hd), (ox - hw, oy - hh, oz + hd), (ox - hw, oy + hh, oz + hd), (ox - hw, oy + hh, oz - hd)], (-1, 0, 0)),
    ]
    
    vertices = []
    normals = []
    indices = []
    base_idx = 0
    
    for quad, norm in faces:
        for v in quad:
            vertices.append(v)
            normals.append(norm)
        indices.extend([base_idx, base_idx + 1, base_idx + 2, base_idx, base_idx + 2, base_idx + 3])
        base_idx += 4
        
    return vertices, normals, indices

def create_cylinder_mesh(radius, height, segments=12, offset=(0, 0, 0)):
    ox, oy, oz = offset
    hh = height / 2.0
    vertices = []
    normals = []
    indices = []
    
    # Side wall
    side_base = 0
    for i in range(segments):
        theta = 2.0 * math.pi * i / segments
        theta_next = 2.0 * math.pi * (i + 1) / segments
        x1, z1 = radius * math.cos(theta), radius * math.sin(theta)
        x2, z2 = radius * math.cos(theta_next), radius * math.sin(theta_next)
        n1 = (math.cos(theta), 0, math.sin(theta))
        n2 = (math.cos(theta_next), 0, math.sin(theta_next))
        
        idx = len(vertices)
        vertices.extend([
            (ox + x1, oy - hh, oz + z1),
            (ox + x2, oy - hh, oz + z2),
            (ox + x2, oy + hh, oz + z2),
            (ox + x1, oy + hh, oz + z1)
        ])
        normals.extend([n1, n2, n2, n1])
        indices.extend([idx, idx + 1, idx + 2, idx, idx + 2, idx + 3])
        
    # Top & bottom caps
    for is_top in [True, False]:
        cap_y = oy + hh if is_top else oy - hh
        norm = (0, 1 if is_top else -1, 0)
        center_idx = len(vertices)
        vertices.append((ox, cap_y, oz))
        normals.append(norm)
        
        ring_start = len(vertices)
        for i in range(segments):
            theta = 2.0 * math.pi * i / segments
            vertices.append((ox + radius * math.cos(theta), cap_y, oz + radius * math.sin(theta)))
            normals.append(norm)
            
        for i in range(segments):
            next_i = (i + 1) % segments
            if is_top:
                indices.extend([center_idx, ring_start + i, ring_start + next_i])
            else:
                indices.extend([center_idx, ring_start + next_i, ring_start + i])
                
    return vertices, normals, indices

def build_glb(primitives, materials_def, out_filepath):
    """
    primitives: list of dicts:
       { 'vertices': [...], 'normals': [...], 'indices': [...], 'material_idx': int }
    materials_def: list of dicts:
       { 'name': '...', 'color': [r, g, b, a], 'roughness': float, 'metalness': float }
    """
    bin_buffer = bytearray()
    buffer_views = []
    accessors = []
    meshes_prims = []
    
    for prim in primitives:
        verts = prim['vertices']
        norms = prim['normals']
        inds = prim['indices']
        mat_idx = prim.get('material_idx', 0)
        
        # 1. Indices (uint16)
        ind_bytes = bytearray()
        for idx in inds:
            ind_bytes += struct.pack('<H', idx)
        while len(ind_bytes) % 4 != 0:
            ind_bytes += b'\x00'
            
        ind_offset = len(bin_buffer)
        bin_buffer.extend(ind_bytes)
        ind_bv_idx = len(buffer_views)
        buffer_views.append({
            "buffer": 0,
            "byteOffset": ind_offset,
            "byteLength": len(ind_bytes),
            "target": 34963 # ELEMENT_ARRAY_BUFFER
        })
        ind_acc_idx = len(accessors)
        accessors.append({
            "bufferView": ind_bv_idx,
            "byteOffset": 0,
            "componentType": 5123, # UNSIGNED_SHORT
            "count": len(inds),
            "type": "SCALAR",
            "max": [max(inds)] if inds else [0],
            "min": [min(inds)] if inds else [0]
        })
        
        # 2. Vertices (float32)
        pos_bytes = bytearray()
        min_p = [float('inf'), float('inf'), float('inf')]
        max_p = [float('-inf'), float('-inf'), float('-inf')]
        for vx, vy, vz in verts:
            pos_bytes += struct.pack('<fff', vx, vy, vz)
            min_p[0] = min(min_p[0], vx)
            min_p[1] = min(min_p[1], vy)
            min_p[2] = min(min_p[2], vz)
            max_p[0] = max(max_p[0], vx)
            max_p[1] = max(max_p[1], vy)
            max_p[2] = max(max_p[2], vz)
        while len(pos_bytes) % 4 != 0:
            pos_bytes += b'\x00'
            
        pos_offset = len(bin_buffer)
        bin_buffer.extend(pos_bytes)
        pos_bv_idx = len(buffer_views)
        buffer_views.append({
            "buffer": 0,
            "byteOffset": pos_offset,
            "byteLength": len(pos_bytes),
            "target": 34962 # ARRAY_BUFFER
        })
        pos_acc_idx = len(accessors)
        accessors.append({
            "bufferView": pos_bv_idx,
            "byteOffset": 0,
            "componentType": 5126, # FLOAT
            "count": len(verts),
            "type": "VEC3",
            "max": max_p,
            "min": min_p
        })
        
        # 3. Normals (float32)
        norm_bytes = bytearray()
        for nx, ny, nz in norms:
            norm_bytes += struct.pack('<fff', nx, ny, nz)
        while len(norm_bytes) % 4 != 0:
            norm_bytes += b'\x00'
            
        norm_offset = len(bin_buffer)
        bin_buffer.extend(norm_bytes)
        norm_bv_idx = len(buffer_views)
        buffer_views.append({
            "buffer": 0,
            "byteOffset": norm_offset,
            "byteLength": len(norm_bytes),
            "target": 34962
        })
        norm_acc_idx = len(accessors)
        accessors.append({
            "bufferView": norm_bv_idx,
            "byteOffset": 0,
            "componentType": 5126,
            "count": len(norms),
            "type": "VEC3"
        })
        
        meshes_prims.append({
            "attributes": {
                "POSITION": pos_acc_idx,
                "NORMAL": norm_acc_idx
            },
            "indices": ind_acc_idx,
            "material": mat_idx
        })

    # Prepare GLTF JSON
    gltf_materials = []
    for m in materials_def:
        gltf_materials.append({
            "name": m.get("name", "material"),
            "pbrMetallicRoughness": {
                "baseColorFactor": m.get("color", [0.8, 0.8, 0.8, 1.0]),
                "metallicFactor": m.get("metalness", 0.0),
                "roughnessFactor": m.get("roughness", 0.5)
            }
        })
        
    gltf_dict = {
        "asset": {"version": "2.0", "generator": "AIHouse-PBR-GLTF-Engine"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "RootNode"}],
        "meshes": [{"name": "FurnitureMesh", "primitives": meshes_prims}],
        "materials": gltf_materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": len(bin_buffer)}]
    }
    
    json_bytes = json.dumps(gltf_dict, separators=(',', ':')).encode('utf-8')
    while len(json_bytes) % 4 != 0:
        json_bytes += b' ' # JSON chunk padded with spaces
        
    json_chunk_len = len(json_bytes)
    bin_chunk_len = len(bin_buffer)
    total_len = 12 + (8 + json_chunk_len) + (8 + bin_chunk_len)
    
    header = struct.pack('<4sII', b'glTF', 2, total_len)
    json_chunk_hdr = struct.pack('<I4s', json_chunk_len, b'JSON')
    bin_chunk_hdr = struct.pack('<I4s', bin_chunk_len, b'BIN\x00')
    
    os.makedirs(os.path.dirname(out_filepath), exist_ok=True)
    with open(out_filepath, 'wb') as f:
        f.write(header)
        f.write(json_chunk_hdr)
        f.write(json_bytes)
        f.write(bin_chunk_hdr)
        f.write(bin_buffer)
    print(f"Created: {out_filepath} ({total_len} bytes)")

def combine_primitives(parts):
    all_verts = []
    all_norms = []
    all_inds = []
    base = 0
    for v, n, ind in parts:
        all_verts.extend(v)
        all_norms.extend(n)
        for i in ind:
            all_inds.append(base + i)
        base += len(v)
    return all_verts, all_norms, all_inds

def generate_all():
    target_dir = r"c:\Users\ASUS\OneDrive\Desktop\pro1234\frontend\public\models\furniture"
    
    # Palette
    mat_wood = {"name": "OakWood", "color": [0.65, 0.48, 0.32, 1.0], "roughness": 0.5, "metalness": 0.05}
    mat_dark_wood = {"name": "Walnut", "color": [0.22, 0.16, 0.12, 1.0], "roughness": 0.6, "metalness": 0.05}
    mat_fabric = {"name": "LinenFabric", "color": [0.82, 0.80, 0.76, 1.0], "roughness": 0.85, "metalness": 0.0}
    mat_fabric_blue = {"name": "BlueFabric", "color": [0.20, 0.30, 0.45, 1.0], "roughness": 0.82, "metalness": 0.0}
    mat_cushion_amber = {"name": "AmberPillow", "color": [0.85, 0.48, 0.15, 1.0], "roughness": 0.8, "metalness": 0.0}
    mat_metal = {"name": "BlackSteel", "color": [0.12, 0.14, 0.16, 1.0], "roughness": 0.35, "metalness": 0.85}
    mat_chrome = {"name": "Chrome", "color": [0.88, 0.90, 0.92, 1.0], "roughness": 0.15, "metalness": 0.95}
    mat_white_ceramic = {"name": "Ceramic", "color": [0.96, 0.96, 0.96, 1.0], "roughness": 0.15, "metalness": 0.05}
    mat_quartz = {"name": "StoneQuartz", "color": [0.92, 0.90, 0.88, 1.0], "roughness": 0.25, "metalness": 0.08}
    mat_green = {"name": "PlantFoliage", "color": [0.22, 0.55, 0.28, 1.0], "roughness": 0.7, "metalness": 0.0}
    mat_glass = {"name": "Glass", "color": [0.6, 0.8, 0.9, 0.6], "roughness": 0.1, "metalness": 0.1}

    # 1. SOFA
    sofa_mats = [mat_dark_wood, mat_fabric, mat_cushion_amber]
    base_parts = [create_box_mesh(6.0, 0.35, 2.8, (0, 0.18, 0))]
    seat_parts = [
        create_box_mesh(5.2, 0.5, 2.3, (0, 0.6, 0.1)),
        create_box_mesh(6.0, 1.3, 0.5, (0, 1.25, -1.15)), # backrest
        create_box_mesh(0.4, 0.95, 2.8, (-2.8, 0.75, 0)), # left arm
        create_box_mesh(0.4, 0.95, 2.8, (2.8, 0.75, 0))   # right arm
    ]
    pillow_parts = [
        create_box_mesh(0.8, 0.8, 0.3, (-1.8, 1.1, -0.6)),
        create_box_mesh(0.8, 0.8, 0.3, (1.8, 1.1, -0.6))
    ]
    v_base, n_base, i_base = combine_primitives(base_parts)
    v_seat, n_seat, i_seat = combine_primitives(seat_parts)
    v_pil, n_pil, i_pil = combine_primitives(pillow_parts)
    build_glb([
        {"vertices": v_base, "normals": n_base, "indices": i_base, "material_idx": 0},
        {"vertices": v_seat, "normals": n_seat, "indices": i_seat, "material_idx": 1},
        {"vertices": v_pil, "normals": n_pil, "indices": i_pil, "material_idx": 2},
    ], sofa_mats, os.path.join(target_dir, "sofa.glb"))

    # 2. COFFEE TABLE
    ct_mats = [mat_wood, mat_metal]
    top_parts = [create_box_mesh(3.6, 0.12, 2.0, (0, 1.2, 0))]
    leg_parts = [
        create_cylinder_mesh(0.04, 1.15, 8, (-1.5, 0.58, -0.75)),
        create_cylinder_mesh(0.04, 1.15, 8, (1.5, 0.58, -0.75)),
        create_cylinder_mesh(0.04, 1.15, 8, (-1.5, 0.58, 0.75)),
        create_cylinder_mesh(0.04, 1.15, 8, (1.5, 0.58, 0.75))
    ]
    v_top, n_top, i_top = combine_primitives(top_parts)
    v_leg, n_leg, i_leg = combine_primitives(leg_parts)
    build_glb([
        {"vertices": v_top, "normals": n_top, "indices": i_top, "material_idx": 0},
        {"vertices": v_leg, "normals": n_leg, "indices": i_leg, "material_idx": 1},
    ], ct_mats, os.path.join(target_dir, "coffee_table.glb"))

    # 3. TV UNIT
    tv_mats = [mat_dark_wood, mat_metal]
    credenza_parts = [
        create_box_mesh(6.0, 1.6, 1.4, (0, 0.8, 0)),
        create_box_mesh(4.8, 2.8, 0.15, (0, 3.2, 0)) # Screen
    ]
    stand_parts = [
        create_box_mesh(1.6, 0.15, 0.8, (0, 1.68, 0)),
        create_box_mesh(0.3, 0.6, 0.15, (0, 1.95, 0))
    ]
    v_c, n_c, i_c = combine_primitives(credenza_parts)
    v_s, n_s, i_s = combine_primitives(stand_parts)
    build_glb([
        {"vertices": v_c, "normals": n_c, "indices": i_c, "material_idx": 0},
        {"vertices": v_s, "normals": n_s, "indices": i_s, "material_idx": 1},
    ], tv_mats, os.path.join(target_dir, "tv_unit.glb"))

    # 4. BED
    bed_mats = [mat_wood, mat_fabric, mat_fabric_blue, mat_white_ceramic]
    bed_frame = [
        create_box_mesh(6.2, 0.45, 6.8, (0, 0.22, 0)), # base
        create_box_mesh(6.6, 3.0, 0.35, (0, 1.5, -3.3)) # headboard
    ]
    bed_mattress = [
        create_box_mesh(5.8, 0.8, 6.4, (0, 0.82, 0.1))
    ]
    bed_duvet = [
        create_box_mesh(5.85, 0.25, 4.0, (0, 1.25, 1.2)) # throw duvet
    ]
    bed_pillows = [
        create_box_mesh(2.4, 0.3, 1.4, (-1.5, 1.35, -2.1)),
        create_box_mesh(2.4, 0.3, 1.4, (1.5, 1.35, -2.1))
    ]
    v_bf, n_bf, i_bf = combine_primitives(bed_frame)
    v_bm, n_bm, i_bm = combine_primitives(bed_mattress)
    v_bd, n_bd, i_bd = combine_primitives(bed_duvet)
    v_bp, n_bp, i_bp = combine_primitives(bed_pillows)
    build_glb([
        {"vertices": v_bf, "normals": n_bf, "indices": i_bf, "material_idx": 0},
        {"vertices": v_bm, "normals": n_bm, "indices": i_bm, "material_idx": 1},
        {"vertices": v_bd, "normals": n_bd, "indices": i_bd, "material_idx": 2},
        {"vertices": v_bp, "normals": n_bp, "indices": i_bp, "material_idx": 3},
    ], bed_mats, os.path.join(target_dir, "bed.glb"))

    # 5. NIGHTSTAND
    ns_mats = [mat_wood, mat_chrome]
    ns_body = [create_box_mesh(1.8, 1.8, 1.5, (0, 0.9, 0))]
    ns_knob = [create_cylinder_mesh(0.05, 0.08, 8, (0, 1.1, 0.78))]
    v_nsb, n_nsb, i_nsb = combine_primitives(ns_body)
    v_nsk, n_nsk, i_nsk = combine_primitives(ns_knob)
    build_glb([
        {"vertices": v_nsb, "normals": n_nsb, "indices": i_nsb, "material_idx": 0},
        {"vertices": v_nsk, "normals": n_nsk, "indices": i_nsk, "material_idx": 1},
    ], ns_mats, os.path.join(target_dir, "nightstand.glb"))

    # 6. WARDROBE
    wardrobe_mats = [mat_dark_wood, mat_chrome]
    wd_body = [create_box_mesh(6.0, 7.0, 2.0, (0, 3.5, 0))]
    wd_handles = [
        create_box_mesh(0.06, 2.0, 0.08, (-0.25, 3.5, 1.05)),
        create_box_mesh(0.06, 2.0, 0.08, (0.25, 3.5, 1.05))
    ]
    v_wdb, n_wdb, i_wdb = combine_primitives(wd_body)
    v_wdh, n_wdh, i_wdh = combine_primitives(wd_handles)
    build_glb([
        {"vertices": v_wdb, "normals": n_wdb, "indices": i_wdb, "material_idx": 0},
        {"vertices": v_wdh, "normals": n_wdh, "indices": i_wdh, "material_idx": 1},
    ], wardrobe_mats, os.path.join(target_dir, "wardrobe.glb"))

    # 7. DINING TABLE
    dt_mats = [mat_wood]
    dt_parts = [
        create_box_mesh(6.0, 0.18, 3.4, (0, 2.4, 0)),
        create_box_mesh(0.2, 2.4, 0.2, (-2.7, 1.2, -1.4)),
        create_box_mesh(0.2, 2.4, 0.2, (2.7, 1.2, -1.4)),
        create_box_mesh(0.2, 2.4, 0.2, (-2.7, 1.2, 1.4)),
        create_box_mesh(0.2, 2.4, 0.2, (2.7, 1.2, 1.4))
    ]
    v_dt, n_dt, i_dt = combine_primitives(dt_parts)
    build_glb([{"vertices": v_dt, "normals": n_dt, "indices": i_dt, "material_idx": 0}], dt_mats, os.path.join(target_dir, "dining_table.glb"))

    # 8. DINING CHAIR
    dc_mats = [mat_wood, mat_fabric]
    dc_frame = [
        create_box_mesh(0.08, 1.5, 0.08, (-0.6, 0.75, -0.6)),
        create_box_mesh(0.08, 1.5, 0.08, (0.6, 0.75, -0.6)),
        create_box_mesh(0.08, 1.5, 0.08, (-0.6, 0.75, 0.6)),
        create_box_mesh(0.08, 1.5, 0.08, (0.6, 0.75, 0.6)),
        create_box_mesh(1.3, 1.4, 0.1, (0, 2.2, -0.65)) # Backrest
    ]
    dc_cushion = [
        create_box_mesh(1.4, 0.16, 1.4, (0, 1.5, 0)) # Seat
    ]
    v_dcf, n_dcf, i_dcf = combine_primitives(dc_frame)
    v_dcc, n_dcc, i_dcc = combine_primitives(dc_cushion)
    build_glb([
        {"vertices": v_dcf, "normals": n_dcf, "indices": i_dcf, "material_idx": 0},
        {"vertices": v_dcc, "normals": n_dcc, "indices": i_dcc, "material_idx": 1},
    ], dc_mats, os.path.join(target_dir, "dining_chair.glb"))

    # 9. KITCHEN COUNTER
    kc_mats = [mat_dark_wood, mat_quartz, mat_chrome]
    kc_base = [create_box_mesh(5.0, 2.6, 2.2, (0, 1.3, 0))]
    kc_top = [create_box_mesh(5.1, 0.16, 2.3, (0, 2.68, 0))]
    kc_faucet = [
        create_box_mesh(1.4, 0.04, 1.0, (0.8, 2.78, 0)), # Sink basin rim
        create_cylinder_mesh(0.04, 0.8, 8, (0.8, 3.2, -0.5)) # Faucet
    ]
    v_kcb, n_kcb, i_kcb = combine_primitives(kc_base)
    v_kct, n_kct, i_kct = combine_primitives(kc_top)
    v_kcf, n_kcf, i_kcf = combine_primitives(kc_faucet)
    build_glb([
        {"vertices": v_kcb, "normals": n_kcb, "indices": i_kcb, "material_idx": 0},
        {"vertices": v_kct, "normals": n_kct, "indices": i_kct, "material_idx": 1},
        {"vertices": v_kcf, "normals": n_kcf, "indices": i_kcf, "material_idx": 2},
    ], kc_mats, os.path.join(target_dir, "kitchen_counter.glb"))

    # 10. REFRIGERATOR
    ref_mats = [mat_chrome, mat_metal]
    ref_body = [create_box_mesh(3.0, 6.2, 2.6, (0, 3.1, 0))]
    ref_handles = [
        create_box_mesh(0.06, 1.8, 0.08, (-0.2, 4.2, 1.35)),
        create_box_mesh(0.06, 1.4, 0.08, (-0.2, 1.8, 1.35))
    ]
    v_rfb, n_rfb, i_rfb = combine_primitives(ref_body)
    v_rfh, n_rfh, i_rfh = combine_primitives(ref_handles)
    build_glb([
        {"vertices": v_rfb, "normals": n_rfb, "indices": i_rfb, "material_idx": 0},
        {"vertices": v_rfh, "normals": n_rfh, "indices": i_rfh, "material_idx": 1},
    ], ref_mats, os.path.join(target_dir, "refrigerator.glb"))

    # 11. TOILET
    toi_mats = [mat_white_ceramic, mat_chrome]
    toi_body = [
        create_box_mesh(1.4, 1.8, 0.8, (0, 1.3, -0.45)), # Tank
        create_box_mesh(1.1, 1.2, 1.6, (0, 0.6, 0.35))   # Bowl
    ]
    toi_flush = [create_cylinder_mesh(0.04, 0.06, 8, (0.45, 2.22, -0.45))]
    v_tb, n_tb, i_tb = combine_primitives(toi_body)
    v_tf, n_tf, i_tf = combine_primitives(toi_flush)
    build_glb([
        {"vertices": v_tb, "normals": n_tb, "indices": i_tb, "material_idx": 0},
        {"vertices": v_tf, "normals": n_tf, "indices": i_tf, "material_idx": 1},
    ], toi_mats, os.path.join(target_dir, "toilet.glb"))

    # 12. BASIN
    bas_mats = [mat_dark_wood, mat_white_ceramic, mat_chrome]
    bas_cabinet = [create_box_mesh(2.4, 2.2, 1.8, (0, 1.1, 0))]
    bas_bowl = [create_box_mesh(1.6, 0.45, 1.3, (0, 2.4, 0))]
    bas_tap = [create_cylinder_mesh(0.03, 0.5, 8, (0, 2.8, -0.45))]
    v_bc, n_bc, i_bc = combine_primitives(bas_cabinet)
    v_bb, n_bb, i_bb = combine_primitives(bas_bowl)
    v_bt, n_bt, i_bt = combine_primitives(bas_tap)
    build_glb([
        {"vertices": v_bc, "normals": n_bc, "indices": i_bc, "material_idx": 0},
        {"vertices": v_bb, "normals": n_bb, "indices": i_bb, "material_idx": 1},
        {"vertices": v_bt, "normals": n_bt, "indices": i_bt, "material_idx": 2},
    ], bas_mats, os.path.join(target_dir, "basin.glb"))

    # 13. SHOWER
    shw_mats = [mat_white_ceramic, mat_chrome]
    shw_tray = [create_box_mesh(3.0, 0.15, 3.0, (0, 0.08, 0))]
    shw_column = [
        create_cylinder_mesh(0.04, 6.2, 8, (-1.2, 3.1, -1.2)),
        create_cylinder_mesh(0.35, 0.05, 12, (-1.0, 6.2, -1.0)) # shower head
    ]
    v_st, n_st, i_st = combine_primitives(shw_tray)
    v_sc, n_sc, i_sc = combine_primitives(shw_column)
    build_glb([
        {"vertices": v_st, "normals": n_st, "indices": i_st, "material_idx": 0},
        {"vertices": v_sc, "normals": n_sc, "indices": i_sc, "material_idx": 1},
    ], shw_mats, os.path.join(target_dir, "shower.glb"))

    # 14. OUTDOOR CHAIR
    oc_mats = [mat_wood, mat_metal]
    oc_frame = [
        create_box_mesh(1.8, 0.12, 1.8, (0, 1.4, 0)),
        create_box_mesh(1.8, 1.4, 0.1, (0, 2.1, -0.85)),
        create_box_mesh(0.08, 1.4, 0.08, (-0.8, 0.7, -0.8)),
        create_box_mesh(0.08, 1.4, 0.08, (0.8, 0.7, -0.8)),
        create_box_mesh(0.08, 1.4, 0.08, (-0.8, 0.7, 0.8)),
        create_box_mesh(0.08, 1.4, 0.08, (0.8, 0.7, 0.8)),
    ]
    v_oc, n_oc, i_oc = combine_primitives(oc_frame)
    build_glb([{"vertices": v_oc, "normals": n_oc, "indices": i_oc, "material_idx": 0}], oc_mats, os.path.join(target_dir, "outdoor_chair.glb"))

    # 15. OUTDOOR TABLE
    ot_mats = [mat_wood, mat_metal]
    ot_top = [create_cylinder_mesh(1.5, 0.12, 16, (0, 2.2, 0))]
    ot_base = [
        create_cylinder_mesh(0.08, 2.1, 8, (0, 1.05, 0)),
        create_cylinder_mesh(0.8, 0.08, 16, (0, 0.04, 0))
    ]
    v_ott, n_ott, i_ott = combine_primitives(ot_top)
    v_otb, n_otb, i_otb = combine_primitives(ot_base)
    build_glb([
        {"vertices": v_ott, "normals": n_ott, "indices": i_ott, "material_idx": 0},
        {"vertices": v_otb, "normals": n_otb, "indices": i_otb, "material_idx": 1},
    ], ot_mats, os.path.join(target_dir, "outdoor_table.glb"))

    # 16. PLANTER
    pla_mats = [mat_white_ceramic, mat_green]
    pla_pot = [create_cylinder_mesh(0.6, 1.2, 12, (0, 0.6, 0))]
    pla_leaf = [
        create_cylinder_mesh(0.9, 1.5, 8, (0, 1.9, 0)),
        create_box_mesh(1.2, 0.8, 1.2, (0, 2.1, 0))
    ]
    v_pp, n_pp, i_pp = combine_primitives(pla_pot)
    v_pl, n_pl, i_pl = combine_primitives(pla_leaf)
    build_glb([
        {"vertices": v_pp, "normals": n_pp, "indices": i_pp, "material_idx": 0},
        {"vertices": v_pl, "normals": n_pl, "indices": i_pl, "material_idx": 1},
    ], pla_mats, os.path.join(target_dir, "planter.glb"))

    print("All 16 GLB furniture models generated successfully!")

if __name__ == '__main__':
    generate_all()
