"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

interface HeroHouse3DProps {
  className?: string;
  onClickHouse?: () => void;
}

export const HeroHouse3D: React.FC<HeroHouse3DProps> = ({
  className = "",
  onClickHouse,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const scrollRef = useRef(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    // 1. Scene & Architectural Atmosphere
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0C0E12");
    scene.fog = new THREE.FogExp2("#0C0E12", 0.011);

    // 2. Cinematic Perspective Camera
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 1000);
    camera.position.set(28, 14, 32);

    // 3. High-Performance WebGL Renderer with optimized DPR & shadow settings
    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.0 : 1.5));
    renderer.shadowMap.enabled = !isMobile;
    if (!isMobile) {
      renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;

    mount.appendChild(renderer.domElement);

    // 4. Architectural Lighting: Hemisphere Sky + Warm Directional Sun
    const skyLight = new THREE.HemisphereLight(0xfff5ea, 0x141822, 0.95);
    scene.add(skyLight);

    const sunLight = new THREE.DirectionalLight(0xffb86c, 2.3);
    sunLight.position.set(36, 26, -20);
    if (!isMobile) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      sunLight.shadow.camera.near = 5;
      sunLight.shadow.camera.far = 130;
      const d = 36;
      sunLight.shadow.camera.left = -d;
      sunLight.shadow.camera.right = d;
      sunLight.shadow.camera.top = d;
      sunLight.shadow.camera.bottom = -d;
      sunLight.shadow.bias = -0.0003;
    }
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x60a5fa, 0.35);
    fillLight.position.set(-22, 16, 26);
    scene.add(fillLight);

    // 5. Materials
    const concreteMat = new THREE.MeshStandardMaterial({
      color: "#2C3038",
      roughness: 0.85,
      metalness: 0.05,
    });
    const whitePlasterMat = new THREE.MeshStandardMaterial({
      color: "#E8E5DF",
      roughness: 0.9,
      metalness: 0.02,
    });
    const cedarWoodMat = new THREE.MeshStandardMaterial({
      color: "#9A5B32",
      roughness: 0.55,
      metalness: 0.05,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: "#16181D",
      roughness: 0.35,
      metalness: 0.85,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: "#D0E7FA",
      transparent: true,
      opacity: 0.35,
      roughness: 0.05,
      transmission: 0.86,
      ior: 1.52,
    });
    const warmGlowMat = new THREE.MeshBasicMaterial({
      color: "#FFDF9E",
    });
    const grassMat = new THREE.MeshStandardMaterial({
      color: "#182017",
      roughness: 0.95,
    });
    const paverMat = new THREE.MeshStandardMaterial({
      color: "#383C45",
      roughness: 0.75,
    });

    // 6. House Architecture Group
    const houseGroup = new THREE.Group();
    scene.add(houseGroup);

    // Ground Landscape Slab
    const groundGeo = new THREE.PlaneGeometry(160, 160);
    const groundMesh = new THREE.Mesh(groundGeo, grassMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.05;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Driveway & Stone Pavers
    const driveGeo = new THREE.BoxGeometry(10, 0.06, 26);
    const driveway = new THREE.Mesh(driveGeo, paverMat);
    driveway.position.set(12, 0.02, 10);
    driveway.receiveShadow = true;
    houseGroup.add(driveway);

    // Stepping Stone Walkway
    for (let i = 0; i < 7; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 1.8), paverMat);
      step.position.set(1.5, 0.04, 6 + i * 2.6);
      step.receiveShadow = true;
      houseGroup.add(step);
    }

    // --- GROUND FLOOR PODIUM (Concrete & Glass Curtain Wall) ---
    const gfPodium = new THREE.Mesh(new THREE.BoxGeometry(20, 0.5, 16), concreteMat);
    gfPodium.position.set(0, 0.25, 0);
    gfPodium.receiveShadow = true;
    houseGroup.add(gfPodium);

    // Ground Floor Concrete Pillars & Rear Wall
    const rearWall = new THREE.Mesh(new THREE.BoxGeometry(20, 4.8, 0.6), concreteMat);
    rearWall.position.set(0, 2.9, -7.7);
    rearWall.castShadow = true;
    rearWall.receiveShadow = true;
    houseGroup.add(rearWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4.8, 16), concreteMat);
    leftWall.position.set(-9.7, 2.9, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    houseGroup.add(leftWall);

    // Ground Floor Floor-to-Ceiling Glass Curtain Walls
    const gfGlassFront = new THREE.Mesh(new THREE.BoxGeometry(14, 4.6, 0.1), glassMat);
    gfGlassFront.position.set(-2.5, 2.8, 7.5);
    houseGroup.add(gfGlassFront);

    const gfGlassRight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.6, 12), glassMat);
    gfGlassRight.position.set(4.5, 2.8, 1.5);
    houseGroup.add(gfGlassRight);

    // Steel Mullions
    for (let x = -9; x <= 4; x += 3.5) {
      const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.8, 0.2), darkSteelMat);
      mullion.position.set(x, 2.9, 7.5);
      houseGroup.add(mullion);
    }

    // Interior Warm Illumination
    const intPointLight1 = new THREE.PointLight(0xffcb78, 2.2, 16);
    intPointLight1.position.set(-2, 3.5, 0);
    houseGroup.add(intPointLight1);

    const interiorGlowMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.1, 8), warmGlowMat);
    interiorGlowMesh.position.set(-2, 4.8, 0);
    houseGroup.add(interiorGlowMesh);

    // Interior Furniture Silhouettes
    const sofa = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.1, 2.6), darkSteelMat);
    sofa.position.set(-3, 1.05, 1.5);
    houseGroup.add(sofa);

    const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.5, 1.8), cedarWoodMat);
    coffeeTable.position.set(-3, 0.75, 4.2);
    houseGroup.add(coffeeTable);

    // --- FIRST FLOOR CANTILEVER (Cedar Wood Slat Box & Master Balcony) ---
    const midSlab = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 18), darkSteelMat);
    midSlab.position.set(1.5, 5.3, 0.5);
    midSlab.castShadow = true;
    midSlab.receiveShadow = true;
    houseGroup.add(midSlab);

    // Cantilevered Upper Wooden Volume
    const upperWoodVolume = new THREE.Mesh(new THREE.BoxGeometry(15, 4.6, 13), cedarWoodMat);
    upperWoodVolume.position.set(-1.5, 7.8, 2.5);
    upperWoodVolume.castShadow = true;
    upperWoodVolume.receiveShadow = true;
    houseGroup.add(upperWoodVolume);

    // Upper Master Bedroom Ribbon Window
    const upperGlass = new THREE.Mesh(new THREE.BoxGeometry(11, 2.6, 0.1), glassMat);
    upperGlass.position.set(-1.5, 8.2, 9.05);
    houseGroup.add(upperGlass);

    // Balcony Glass Railing
    const balconyGlass = new THREE.Mesh(new THREE.BoxGeometry(7, 1.3, 0.08), glassMat);
    balconyGlass.position.set(8.5, 6.25, 9.2);
    houseGroup.add(balconyGlass);

    const balconyRail = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.08, 0.15), darkSteelMat);
    balconyRail.position.set(8.5, 6.9, 9.2);
    houseGroup.add(balconyRail);

    // Floating Roof Structure
    const roofSlab = new THREE.Mesh(new THREE.BoxGeometry(24, 0.5, 20), whitePlasterMat);
    roofSlab.position.set(1.5, 10.3, 1.0);
    roofSlab.castShadow = true;
    houseGroup.add(roofSlab);

    // Interior Warm Light Upper Floor
    const intPointLight2 = new THREE.PointLight(0xffb86c, 1.8, 14);
    intPointLight2.position.set(-1.5, 8.0, 3);
    houseGroup.add(intPointLight2);

    // --- LANDSCAPING: TREES & FOLIAGE ---
    const createTree = (x: number, z: number, scale: number) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.scale.set(scale, scale, scale);

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.28, 8, 8),
        new THREE.MeshStandardMaterial({ color: "#D4CEBA", roughness: 0.8 })
      );
      trunk.position.y = 4;
      trunk.castShadow = true;
      tree.add(trunk);

      const foliageMat = new THREE.MeshStandardMaterial({
        color: "#283C25",
        roughness: 0.9,
      });

      const foliage1 = new THREE.Mesh(new THREE.DodecahedronGeometry(2.4, 1), foliageMat);
      foliage1.position.set(0, 7.5, 0);
      foliage1.castShadow = true;
      tree.add(foliage1);

      const foliage2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.9, 1), foliageMat);
      foliage2.position.set(1.1, 6.2, 0.8);
      foliage2.castShadow = true;
      tree.add(foliage2);

      return tree;
    };

    houseGroup.add(createTree(-14, 8, 1.15));
    houseGroup.add(createTree(-16, -2, 0.95));
    houseGroup.add(createTree(17, -4, 1.05));
    houseGroup.add(createTree(18, 12, 0.85));

    // Modern Luxury Vehicle in Driveway
    const carGroup = new THREE.Group();
    carGroup.position.set(12, 0.05, 11);
    carGroup.rotation.y = Math.PI * 0.05;

    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 1.0, 7.2),
      new THREE.MeshStandardMaterial({ color: "#181A20", roughness: 0.25, metalness: 0.85 })
    );
    carBody.position.y = 0.55;
    carBody.castShadow = true;
    carGroup.add(carBody);

    const carCabin = new THREE.Mesh(
      new THREE.BoxGeometry(3.1, 0.85, 4.0),
      new THREE.MeshStandardMaterial({ color: "#060709", roughness: 0.1, metalness: 0.95 })
    );
    carCabin.position.set(0, 1.45, -0.4);
    carCabin.castShadow = true;
    carGroup.add(carCabin);

    const headlightR = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.1, 0.1),
      new THREE.MeshBasicMaterial({ color: "#FFF8E7" })
    );
    headlightR.position.set(1.2, 0.55, 3.61);
    const headlightL = headlightR.clone();
    headlightL.position.x = -1.2;
    carGroup.add(headlightR, headlightL);

    houseGroup.add(carGroup);

    // 7. Mouse Parallax & Scroll Listeners
    let mouseMovePending = false;
    const handleMouseMove = (e: MouseEvent) => {
      if (mouseMovePending) return;
      mouseMovePending = true;
      requestAnimationFrame(() => {
        const nx = (e.clientX / window.innerWidth) * 2 - 1;
        const ny = -(e.clientY / window.innerHeight) * 2 + 1;
        mouseRef.current.targetX = nx * 3.5;
        mouseRef.current.targetY = ny * 2.0;
        mouseMovePending = false;
      });
    };

    const handleScroll = () => {
      const scrollEl = mount.closest(".overflow-y-auto") || document.documentElement;
      const scrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY;
      scrollRef.current = scrollTop / Math.max(1, window.innerHeight);
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    const scrollParent = mount.closest(".overflow-y-auto");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    }

    // 8. Animation Loop with IntersectionObserver
    let animId: number = 0;
    let isVisible = true;
    const startTime = performance.now();

    const animate = () => {
      if (!isVisible) return;
      animId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) * 0.001;

      // Smooth mouse interpolation (Lerp)
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.04;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.04;

      // Scroll-driven camera orbital drift
      const scrollFactor = scrollRef.current;
      const orbitRadius = 40 - Math.min(10, scrollFactor * 12);
      const baseAngle = 0.85 + Math.sin(elapsed * 0.04) * 0.15 + scrollFactor * 0.65;
      const camX = Math.cos(baseAngle) * orbitRadius + mouseRef.current.x;
      const camZ = Math.sin(baseAngle) * orbitRadius;
      const camY = 15 + Math.sin(elapsed * 0.05) * 1.2 + mouseRef.current.y - scrollFactor * 4;

      camera.position.set(camX, Math.max(5, camY), camZ);
      camera.lookAt(0, 4.2, 0);

      // Subtle warm interior light breathing
      intPointLight1.intensity = 2.1 + Math.sin(elapsed * 1.4) * 0.2;
      intPointLight2.intensity = 1.7 + Math.cos(elapsed * 1.1) * 0.15;

      renderer.render(scene, camera);
    };

    // Pause WebGL rendering loop when off-screen to save 100% GPU/CPU
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          if (!isVisible) {
            isVisible = true;
            animId = requestAnimationFrame(animate);
          }
        } else {
          isVisible = false;
          cancelAnimationFrame(animId);
        }
      },
      { threshold: 0.05 }
    );
    observer.observe(mount);
    animId = requestAnimationFrame(animate);

    const handleResize = () => {
      if (!mount || !renderer || !camera) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("resize", handleResize);

      // Comprehensive scene & memory disposal
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });

      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      onClick={onClickHouse}
      className={`w-full h-full overflow-hidden ${
        onClickHouse ? "cursor-pointer" : "pointer-events-none"
      } select-none ${className}`}
      title={onClickHouse ? "Click to enter 3D Architectural Model" : undefined}
    />
  );
};
