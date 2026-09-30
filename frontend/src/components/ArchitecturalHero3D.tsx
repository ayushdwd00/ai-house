"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";

// ============================================================
// CINEMATIC 3D ARCHITECTURAL HERO SCENE
// Minimalist, high-performance architectural studio model
// with smooth scroll-driven camera & lighting progression.
// ============================================================
export const ArchitecturalHero3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let animationFrameId: number;
    let isVisible = true;

    // Dimensions
    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x030303, 0.022);

    // Camera
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 150);
    // Initial isometric vantage
    const initialCamPos = new THREE.Vector3(18, 14, 22);
    const targetCamPos = initialCamPos.clone();
    const currentCamPos = initialCamPos.clone();
    const lookAtTarget = new THREE.Vector3(0, 2.5, 0);

    camera.position.copy(currentCamPos);
    camera.lookAt(lookAtTarget);

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // Architectural Group
    const houseGroup = new THREE.Group();
    scene.add(houseGroup);

    // ── MATERIALS ──
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x16181F,
      roughness: 0.85,
      metalness: 0.1,
    });
    const woodDeckMat = new THREE.MeshStandardMaterial({
      color: 0x2A201A,
      roughness: 0.7,
      metalness: 0.05,
    });
    const columnMat = new THREE.MeshStandardMaterial({
      color: 0x2C3345,
      roughness: 0.3,
      metalness: 0.8,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x93C5FD,
      transmission: 0.75,
      opacity: 0.45,
      transparent: true,
      roughness: 0.1,
      ior: 1.5,
    });
    const warmInteriorMat = new THREE.MeshBasicMaterial({
      color: 0xFDE68A,
      wireframe: false,
    });
    const cyanAccentMat = new THREE.MeshBasicMaterial({
      color: 0x06B6D4,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });

    // ── ARCHITECTURAL GEOMETRY ──

    // 1. Foundation Podium Slab
    const podiumGeo = new THREE.BoxGeometry(22, 0.8, 16);
    const podium = new THREE.Mesh(podiumGeo, concreteMat);
    podium.position.set(0, -0.4, 0);
    houseGroup.add(podium);

    // 2. Cantilevered Timber Terrace
    const deckGeo = new THREE.BoxGeometry(10, 0.2, 8);
    const deck = new THREE.Mesh(deckGeo, woodDeckMat);
    deck.position.set(6, 0.1, 4);
    houseGroup.add(deck);

    // 3. Reflecting Water Feature
    const poolGeo = new THREE.PlaneGeometry(8, 5);
    const poolMat = new THREE.MeshStandardMaterial({
      color: 0x0C1929,
      roughness: 0.1,
      metalness: 0.9,
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(-6, 0.05, 4.5);
    houseGroup.add(pool);

    // 4. Ground Floor Pavilion Living Pavilion (Glass Box)
    const glassGeo = new THREE.BoxGeometry(14, 3.6, 10);
    const glassPavilion = new THREE.Mesh(glassGeo, glassMat);
    glassPavilion.position.set(-1, 1.8, 0);
    houseGroup.add(glassPavilion);

    // 5. Interior Warm Core Box
    const coreGeo = new THREE.BoxGeometry(6, 3.4, 5);
    const core = new THREE.Mesh(coreGeo, concreteMat);
    core.position.set(-3, 1.7, -1);
    houseGroup.add(core);

    // 6. Floating Upper Bedroom Cantilever (Shifted Volume)
    const upperGeo = new THREE.BoxGeometry(12, 3.4, 8);
    const upperVolume = new THREE.Mesh(upperGeo, concreteMat);
    upperVolume.position.set(2, 5.3, 1);
    houseGroup.add(upperVolume);

    // Upper Glass Ribbon
    const upperGlassGeo = new THREE.BoxGeometry(11.8, 1.6, 7.8);
    const upperGlass = new THREE.Mesh(upperGlassGeo, glassMat);
    upperGlass.position.set(2.1, 5.5, 1.1);
    houseGroup.add(upperGlass);

    // 7. Roof Overhang Cantilever
    const roofGeo = new THREE.BoxGeometry(16, 0.4, 11);
    const roof = new THREE.Mesh(roofGeo, concreteMat);
    roof.position.set(1.5, 7.2, 0.8);
    houseGroup.add(roof);

    // 8. Slender Architectural Steel Columns
    const colGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.6, 16);
    const colPositions: [number, number, number][] = [
      [5.5, 1.8, 4.5],
      [5.5, 1.8, -4.5],
      [-7.5, 1.8, 4.5],
      [-7.5, 1.8, -4.5],
      [7.5, 5.3, 4.8],
      [-3.8, 5.3, 4.8],
    ];
    colPositions.forEach(([x, y, z]) => {
      const col = new THREE.Mesh(colGeo, columnMat);
      col.position.set(x, y, z);
      houseGroup.add(col);
    });

    // 9. Delicate Architectural Grid / Blueprint Axis
    const grid = new THREE.GridHelper(48, 48, 0x1E293B, 0x0F172A);
    grid.position.y = -0.42;
    houseGroup.add(grid);

    // 10. Blueprint Wireframe Envelope (Computational Datum)
    const wireframeGeo = new THREE.BoxGeometry(22.4, 8, 16.4);
    const wireframeBox = new THREE.Mesh(wireframeGeo, cyanAccentMat);
    wireframeBox.position.set(0.2, 3.6, 0.2);
    houseGroup.add(wireframeBox);

    // ── LIGHTING ──
    const ambientLight = new THREE.AmbientLight(0x0B132B, 1.2);
    scene.add(ambientLight);

    // Key architectural sunlight (Cyan/Blue tint)
    const keyLight = new THREE.DirectionalLight(0x60A5FA, 2.4);
    keyLight.position.set(25, 30, 20);
    scene.add(keyLight);

    // Atmospheric warm fill from interior
    const interiorLight = new THREE.PointLight(0xF59E0B, 3.5, 18, 1.4);
    interiorLight.position.set(-2, 2.5, 0);
    scene.add(interiorLight);

    const interiorUpperLight = new THREE.PointLight(0x38BDF8, 2.5, 14, 1.2);
    interiorUpperLight.position.set(2, 5.5, 1);
    scene.add(interiorUpperLight);

    // Subtle blue rim light
    const rimLight = new THREE.DirectionalLight(0x3B82F6, 1.5);
    rimLight.position.set(-20, 10, -15);
    scene.add(rimLight);

    // ── SCROLL INTERPOLATION ──
    let scrollY = 0;
    const onScroll = () => {
      scrollY = window.scrollY || document.documentElement.scrollTop;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // ── RESIZE ──
    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── INTERSECTION OBSERVER ──
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry?.isIntersecting ?? true;
    });
    observer.observe(mount);

    // ── RENDER LOOP ──
    let time = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (!isVisible) return;

      const delta = clock.getDelta();
      time += delta * 0.4;

      // Scroll progress mapping (0 to 1 over first 2000px)
      const scrollProgress = Math.min(scrollY / 1800, 1);

      // Camera position interpolation based on scroll
      // Hero (0) -> Orbit around to front facade & cutaway view
      const camRadius = 24 - scrollProgress * 5;
      const camAngle = 0.85 + scrollProgress * 1.2 + Math.sin(time * 0.3) * 0.05;
      const camY = 13 - scrollProgress * 4 + Math.cos(time * 0.25) * 0.3;

      targetCamPos.x = Math.cos(camAngle) * camRadius;
      targetCamPos.z = Math.sin(camAngle) * camRadius;
      targetCamPos.y = camY;

      // Smooth camera lerp
      currentCamPos.lerp(targetCamPos, 0.04);
      camera.position.copy(currentCamPos);
      camera.lookAt(lookAtTarget);

      // Subtle rotation & breathing
      houseGroup.rotation.y = Math.sin(time * 0.2) * 0.03;
      wireframeBox.rotation.y = -Math.sin(time * 0.15) * 0.02;

      // Pulse blueprint wireframe
      const pulse = 0.25 + Math.sin(time * 1.5) * 0.12;
      cyanAccentMat.opacity = pulse;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      podiumGeo.dispose();
      glassGeo.dispose();
      upperGeo.dispose();
      roofGeo.dispose();
      colGeo.dispose();
      wireframeGeo.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-none w-full h-full overflow-hidden"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
};
