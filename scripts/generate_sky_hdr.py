import os
import math

def generate_architectural_hdr(out_filepath, width=256, height=128):
    """
    Generates a 32-bit Radiance RGBE (.hdr) equirectangular sky environment map.
    Top (zenith): crisp soft sky blue.
    Horizon: warm white / golden architectural bounce.
    Bottom (nadir): warm neutral ground bounce.
    Sun spot: realistic soft high-dynamic-range luminaire.
    """
    os.makedirs(os.path.dirname(out_filepath), exist_ok=True)
    
    # We will write uncompressed RGBE scanlines
    header = (
        b"#?RADIANCE\n"
        b"FORMAT=32-bit_rle_rgbe\n"
        b"\n"
        + f"-Y {height} +X {width}\n".encode('ascii')
    )
    
    # Sun direction in equirectangular coordinates
    # let sun be at az = 45 deg, el = 50 deg
    sun_az = math.radians(45.0)
    sun_el = math.radians(50.0)
    sun_dir = (
        math.cos(sun_el) * math.sin(sun_az),
        math.sin(sun_el),
        math.cos(sun_el) * math.cos(sun_az)
    )
    
    data = bytearray()
    
    for y in range(height):
        # elevation angle theta from +pi/2 (zenith) to -pi/2 (nadir)
        theta = (0.5 - (y + 0.5) / height) * math.pi
        sin_theta = math.sin(theta)
        cos_theta = math.cos(theta)
        
        for x in range(width):
            # azimuth angle phi from -pi to +pi
            phi = ((x + 0.5) / width * 2.0 - 1.0) * math.pi
            dx = cos_theta * math.sin(phi)
            dy = sin_theta
            dz = cos_theta * math.cos(phi)
            
            # Base sky color
            if dy >= 0:
                # Sky gradient
                zenith_weight = dy ** 0.6
                horizon_weight = 1.0 - zenith_weight
                # Zenith: [0.35, 0.55, 0.85], Horizon: [0.85, 0.88, 0.92]
                r = 0.35 * zenith_weight + 0.85 * horizon_weight
                g = 0.55 * zenith_weight + 0.88 * horizon_weight
                b = 0.85 * zenith_weight + 0.92 * horizon_weight
            else:
                # Ground bounce: warm concrete/grass mix [0.25, 0.28, 0.24]
                ground_weight = (-dy) ** 0.5
                r = 0.85 * (1.0 - ground_weight) + 0.25 * ground_weight
                g = 0.88 * (1.0 - ground_weight) + 0.28 * ground_weight
                b = 0.92 * (1.0 - ground_weight) + 0.24 * ground_weight
                
            # Sun contribution
            cos_sun = dx * sun_dir[0] + dy * sun_dir[1] + dz * sun_dir[2]
            if cos_sun > 0.96:
                sun_power = ((cos_sun - 0.96) / 0.04) ** 2 * 25.0
                r += 1.2 * sun_power
                g += 1.1 * sun_power
                b += 0.9 * sun_power
            elif cos_sun > 0.85:
                corona = ((cos_sun - 0.85) / 0.11) * 2.5
                r += 0.8 * corona
                g += 0.7 * corona
                b += 0.5 * corona
                
            # Convert linear float RGB to RGBE
            max_c = max(r, g, b)
            if max_c < 1e-32:
                data.extend([0, 0, 0, 0])
            else:
                # frexp: max_c = mantissa * 2^exp, mantissa in [0.5, 1.0)
                mantissa, exp = math.frexp(max_c)
                scaled = mantissa * 256.0 / max_c
                rgbe_e = exp + 128
                rgbe_r = min(255, int(r * scaled))
                rgbe_g = min(255, int(g * scaled))
                rgbe_b = min(255, int(b * scaled))
                data.extend([rgbe_r, rgbe_g, rgbe_b, rgbe_e])
                
    with open(out_filepath, 'wb') as f:
        f.write(header)
        f.write(data)
    print(f"Generated HDR Environment: {out_filepath} ({len(header) + len(data)} bytes)")

if __name__ == '__main__':
    generate_architectural_hdr(r"c:\Users\ASUS\OneDrive\Desktop\pro1234\frontend\public\environments\sky_architectural.hdr")
