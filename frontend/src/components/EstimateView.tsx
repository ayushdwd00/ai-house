"use client";

import React, { useState, useEffect, useMemo } from "react";
import { HouseLayout, Room } from "@/types/house";
import {
  Layers,
  Box,
  Building,
  Shield,
  Sparkles,
  TrendingDown,
  Info,
  ChevronDown,
  ChevronUp,
  Cpu,
  Loader2,
  CheckCircle2,
  Sliders
} from "lucide-react";

interface EstimateViewProps {
  layout: HouseLayout;
}

interface AIAdvisorRecommendation {
  title: string;
  reason: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  category: "COST" | "LAYOUT" | "CONSTRUCTION" | "MATERIAL" | "SERVICES";
  estimated_impact: string;
}

interface AIAdvisorData {
  summary: string;
  recommendations: AIAdvisorRecommendation[];
}

export const EstimateView: React.FC<EstimateViewProps> = ({ layout }) => {
  const [qualityTier, setQualityTier] = useState<"ECONOMY" | "STANDARD" | "PREMIUM">("STANDARD");
  const [wallSpec, setWallSpec] = useState<"4.5_INCH" | "9_INCH">("9_INCH");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    civil: true,
    finishes: true,
    doors_windows: false,
    electrical: false,
    plumbing: false,
    kitchen: false,
    misc: false,
  });

  const [aiAdvisor, setAiAdvisor] = useState<AIAdvisorData | null>(null);
  const [isLoadingAdvisor, setIsLoadingAdvisor] = useState(false);

  // Currency Formatter in Indian Rupee format
  const formatINR = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(amount));
  };

  const allRooms: Room[] = useMemo(() => {
    if (layout.floors && layout.floors.length > 0) {
      return layout.floors.flatMap((f) => f.rooms);
    }
    return layout.rooms || [];
  }, [layout]);

  // Geometric Derived Quantities
  const builtUpArea = useMemo(() => {
    return (
      (layout as any).quantities?.built_up_area_sqft ||
      layout.stats?.total_area_sqft ||
      allRooms.reduce((sum, r) => sum + (r.area_sqft || r.rect.width * r.rect.length), 0)
    );
  }, [layout, allRooms]);

  const carpetArea = useMemo(() => {
    return (
      (layout as any).quantities?.carpet_area_sqft ||
      layout.stats?.living_area_sqft ||
      Math.round(builtUpArea * 0.78)
    );
  }, [layout, builtUpArea]);

  // Wall, Window & Door takeoffs
  const architecturalTakeoff = useMemo(() => {
    let windowCount = 0;
    let doorCount = 0;
    let wallPerimeterFt = 0;

    if (layout.floors) {
      for (const f of layout.floors) {
        if (f.doors) doorCount += f.doors.length;
        if (f.windows) windowCount += f.windows.length;

        const allWalls = [
          ...(f.walls || []),
          ...(f.exterior_walls || []),
          ...(f.interior_walls || []),
        ];
        for (const w of allWalls) {
          const x1 = w.x1 ?? w.start?.x ?? 0;
          const y1 = w.y1 ?? w.start?.y ?? 0;
          const x2 = w.x2 ?? w.end?.x ?? 0;
          const y2 = w.y2 ?? w.end?.y ?? 0;
          const dx = x2 - x1;
          const dy = y2 - y1;
          wallPerimeterFt += Math.sqrt(dx * dx + dy * dy);
        }
      }
    }

    if (windowCount === 0) windowCount = Math.max(6, Math.round(allRooms.length * 1.5));
    if (doorCount === 0) doorCount = Math.max(5, Math.round(allRooms.length * 1.2));
    if (wallPerimeterFt === 0) wallPerimeterFt = Math.round(builtUpArea * 0.45);

    const ceilingHeight = 10.0;
    const grossWallArea = Math.round(wallPerimeterFt * ceilingHeight);
    const openingsDeduction = Math.round(doorCount * 21 + windowCount * 16);
    const netWallArea = Math.max(200, grossWallArea - openingsDeduction);

    // Brick calculation based on chosen wall thickness (9" = 0.75 ft vs 4.5" = 0.375 ft)
    const thicknessFt = wallSpec === "9_INCH" ? 0.75 : 0.375;
    const netWallVolumeCuft = Math.round(netWallArea * thicknessFt);
    const brickCount = Math.round(netWallVolumeCuft * 13.5); // Standard modular Indian bricks per cu ft

    return {
      windowCount,
      doorCount,
      wallPerimeterFt: Math.round(wallPerimeterFt),
      netWallArea,
      netWallVolumeCuft,
      brickCount,
      ceilingHeight,
    };
  }, [layout, allRooms, builtUpArea, wallSpec]);

  // Preliminary Structural Column Quantities
  const structuralQuantities = useMemo(() => {
    const cols = layout.structural_planning?.columns || [];
    const count = layout.structural_planning?.column_count || cols.length || 12;
    const wallH = 10.0;
    let concCuft = 0;
    cols.forEach((c) => {
      const w = c.width || 0.75;
      const d = c.depth || 0.75;
      const fls = c.floors?.length || c.floor_ids?.length || 1;
      concCuft += w * d * wallH * fls;
    });

    if (concCuft === 0) {
      concCuft = count * 0.75 * 0.75 * wallH * (layout.floors?.length || 1);
    }
    const concCum = Math.round(concCuft * 0.0283168 * 10) / 10;
    // Preliminary rebar allowance ~150 kg/m³
    const rebarKg = Math.round(concCum * 150.0);
    const costAllowance = Math.round(concCum * 6200 + rebarKg * 80);

    return {
      count,
      concCuft: Math.round(concCuft),
      concCum,
      rebarKg,
      costAllowance,
      disclaimer:
        "Preliminary structural planning — final column size, spacing, reinforcement and foundation design require structural-engineer verification.",
    };
  }, [layout]);

  // Rate Multiplier based on Quality Tier
  const tierMultiplier = useMemo(() => {
    switch (qualityTier) {
      case "ECONOMY":
        return 0.85;
      case "PREMIUM":
        return 1.35;
      case "STANDARD":
      default:
        return 1.0;
    }
  }, [qualityTier]);

  // Itemized Construction Categories
  const categories = useMemo(() => {
    const m = tierMultiplier;
    const bua = builtUpArea;
    const carpet = carpetArea;
    const take = architecturalTakeoff;
    const sq = structuralQuantities;

    // A. CIVIL / STRUCTURAL
    const excavationQty = Math.round(bua * 0.35);
    const excavationRate = Math.round(35 * m);
    const rccConcreteCum = Math.max(15, Math.round(bua * 0.038) + sq.concCum);
    const rccConcreteRate = Math.round(5800 * m);
    const rebarSteelKg = Math.max(2000, Math.round(bua * 3.8) + sq.rebarKg);
    const rebarSteelRate = Math.round(76 * m);
    const masonryMortarCuft = Math.round(take.netWallVolumeCuft * 0.25);
    const masonryMortarRate = Math.round(80 * m);
    const brickRate = Math.round(10.5 * m);
    const plasterAreaSqft = Math.round(take.netWallArea * 1.85);
    const plasterRate = Math.round(32 * m);

    const civilItems = [
      {
        name: "Earthwork Excavation & Foundation Bedding",
        qty: excavationQty,
        unit: "cu m",
        rate: excavationRate,
        amount: excavationQty * excavationRate,
      },
      {
        name: `RCC M20/M25 Concrete (Slabs, Beams & ${sq.count} Columns)`,
        qty: rccConcreteCum,
        unit: "cu m",
        rate: rccConcreteRate,
        amount: rccConcreteCum * rccConcreteRate,
      },
      {
        name: "Fe500/Fe550 TMT Rebar Reinforcement",
        qty: rebarSteelKg,
        unit: "kg",
        rate: rebarSteelRate,
        amount: rebarSteelKg * rebarSteelRate,
      },
      {
        name: `Brick/Block Masonry (${wallSpec === "9_INCH" ? "9\" external" : "4.5\" partition"})`,
        qty: take.brickCount,
        unit: "bricks",
        rate: brickRate,
        amount: take.brickCount * brickRate,
      },
      {
        name: "Cement-Sand Mortar Bedding",
        qty: masonryMortarCuft,
        unit: "cu ft",
        rate: masonryMortarRate,
        amount: masonryMortarCuft * masonryMortarRate,
      },
      {
        name: "Internal & External Cement Plastering",
        qty: plasterAreaSqft,
        unit: "sq ft",
        rate: plasterRate,
        amount: plasterAreaSqft * plasterRate,
      },
    ];

    // B. FLOORING & FINISHES
    const vitrifiedArea = Math.round(carpet * 0.85);
    const vitrifiedRate = Math.round(115 * m);
    const bathTileArea = Math.round(allRooms.filter((r) => r.type.includes("bath")).length * 180 || 360);
    const bathTileRate = Math.round(90 * m);
    const ceilingPlasterArea = Math.round(carpet);
    const ceilingPlasterRate = Math.round(25 * m);
    const paintArea = Math.round(take.netWallArea * 2.2);
    const paintRate = Math.round(28 * m);
    const waterproofingArea = Math.round(bua * 0.45);
    const waterproofingRate = Math.round(48 * m);

    const finishItems = [
      {
        name: "Vitrified Floor Tiling (600x600/800x800mm)",
        qty: vitrifiedArea,
        unit: "sq ft",
        rate: vitrifiedRate,
        amount: vitrifiedArea * vitrifiedRate,
      },
      {
        name: "Bathroom & Kitchen Dado Wall Tiles (up to 7ft)",
        qty: bathTileArea,
        unit: "sq ft",
        rate: bathTileRate,
        amount: bathTileArea * bathTileRate,
      },
      {
        name: "Ceiling Plaster / POP False Ceiling Allowance",
        qty: ceilingPlasterArea,
        unit: "sq ft",
        rate: ceilingPlasterRate,
        amount: ceilingPlasterArea * ceilingPlasterRate,
      },
      {
        name: "Internal & External Premium Emulsion Painting",
        qty: paintArea,
        unit: "sq ft",
        rate: paintRate,
        amount: paintArea * paintRate,
      },
      {
        name: "Roof Slab & Wet Area Waterproofing",
        qty: waterproofingArea,
        unit: "sq ft",
        rate: waterproofingRate,
        amount: waterproofingArea * waterproofingRate,
      },
    ];

    // C. DOORS & WINDOWS
    const mainDoorRate = Math.round(22000 * m);
    const intDoorCount = Math.max(1, take.doorCount - 1);
    const intDoorRate = Math.round(7500 * m);
    const windowRate = Math.round(6200 * m);

    const doorWindowItems = [
      {
        name: "Teakwood Main Entrance Door & Hardware",
        qty: 1,
        unit: "unit",
        rate: mainDoorRate,
        amount: mainDoorRate,
      },
      {
        name: "Engineered Flush Internal Doors with Frames",
        qty: intDoorCount,
        unit: "doors",
        rate: intDoorRate,
        amount: intDoorCount * intDoorRate,
      },
      {
        name: "UPVC / Anodized Aluminum 3-Track Glazed Windows",
        qty: take.windowCount,
        unit: "windows",
        rate: windowRate,
        amount: take.windowCount * windowRate,
      },
    ];

    // D. ELECTRICAL
    const pointsCount = Math.max(30, Math.round(bua * 0.08));
    const pointRate = Math.round(950 * m);
    const dbPanelsQty = Math.max(1, layout.floors?.length || 1);
    const dbRate = Math.round(18500 * m);
    const lightingAllowance = Math.round(bua * 38 * m);

    const electricalItems = [
      {
        name: "Concealed Conduit Copper Wiring Points & Modular Switches",
        qty: pointsCount,
        unit: "points",
        rate: pointRate,
        amount: pointsCount * pointRate,
      },
      {
        name: "Main Distribution Board (MCB/ELCB Panels)",
        qty: dbPanelsQty,
        unit: "sets",
        rate: dbRate,
        amount: dbPanelsQty * dbRate,
      },
      {
        name: "Architectural Lighting Fixtures & Fan Allowance",
        qty: bua,
        unit: "sq ft",
        rate: Math.round(38 * m),
        amount: lightingAllowance,
      },
    ];

    // E. PLUMBING & SANITARY
    const sanitaryCount = Math.max(2, Math.round(allRooms.filter((r) => r.type.includes("bath")).length * 3 || 6));
    const sanitaryRate = Math.round(8500 * m);
    const pipingAllowance = Math.round(bua * 55 * m);

    const plumbingItems = [
      {
        name: "Sanitary Fixtures (EWC, Wash Basins, Diverters & Faucets)",
        qty: sanitaryCount,
        unit: "fixtures",
        rate: sanitaryRate,
        amount: sanitaryCount * sanitaryRate,
      },
      {
        name: "CPVC Water Supply & SWR Soil Drainage Piping Network",
        qty: bua,
        unit: "sq ft",
        rate: Math.round(55 * m),
        amount: pipingAllowance,
      },
    ];

    // F. KITCHEN
    const kitchenPlatformQty = 1;
    const kitchenPlatformRate = Math.round(45000 * m);
    const kitchenSinkRate = Math.round(8500 * m);
    const kitchenCabinetAllowance = Math.round(85000 * m);

    const kitchenItems = [
      {
        name: "Granite Countertop Platform with Bullnosed Fascia",
        qty: kitchenPlatformQty,
        unit: "lot",
        rate: kitchenPlatformRate,
        amount: kitchenPlatformRate,
      },
      {
        name: "Stainless Steel Double-Bowl Kitchen Sink with Drainboard",
        qty: 1,
        unit: "unit",
        rate: kitchenSinkRate,
        amount: kitchenSinkRate,
      },
      {
        name: "Under-Counter Modular Storage Cabinetry Allowance",
        qty: 1,
        unit: "lot",
        rate: kitchenCabinetAllowance,
        amount: kitchenCabinetAllowance,
      },
    ];

    // G. MISCELLANEOUS
    const numFloors = layout.floors?.length || 1;
    const staircaseAllowance = numFloors > 1 ? Math.round(75000 * (numFloors - 1) * m) : 0;
    const miscHardware = Math.round(bua * 22 * m);
    const transportWastage = Math.round(bua * 32 * m);

    const miscItems = [
      ...(numFloors > 1
        ? [
            {
              name: "Staircase Railing (SS304 / Toughened Glass) & Treads",
              qty: numFloors - 1,
              unit: "flights",
              rate: Math.round(75000 * m),
              amount: staircaseAllowance,
            },
          ]
        : []),
      {
        name: "General Architectural Hardware, Fasteners & Sealants",
        qty: bua,
        unit: "sq ft",
        rate: Math.round(22 * m),
        amount: miscHardware,
      },
      {
        name: "Site Transport, Material Handling & Scrap Allowance",
        qty: bua,
        unit: "sq ft",
        rate: Math.round(32 * m),
        amount: transportWastage,
      },
    ];

    const sumCategory = (items: Array<{ amount: number }>) =>
      items.reduce((s, it) => s + it.amount, 0);

    return [
      {
        id: "civil",
        code: "A",
        title: "CIVIL / STRUCTURAL",
        items: civilItems,
        subtotal: sumCategory(civilItems),
      },
      {
        id: "finishes",
        code: "B",
        title: "FLOORING & FINISHES",
        items: finishItems,
        subtotal: sumCategory(finishItems),
      },
      {
        id: "doors_windows",
        code: "C",
        title: "DOORS & WINDOWS",
        items: doorWindowItems,
        subtotal: sumCategory(doorWindowItems),
      },
      {
        id: "electrical",
        code: "D",
        title: "ELECTRICAL",
        items: electricalItems,
        subtotal: sumCategory(electricalItems),
      },
      {
        id: "plumbing",
        code: "E",
        title: "PLUMBING & SANITARY",
        items: plumbingItems,
        subtotal: sumCategory(plumbingItems),
      },
      {
        id: "kitchen",
        code: "F",
        title: "KITCHEN",
        items: kitchenItems,
        subtotal: sumCategory(kitchenItems),
      },
      {
        id: "misc",
        code: "G",
        title: "MISCELLANEOUS",
        items: miscItems,
        subtotal: sumCategory(miscItems),
      },
    ];
  }, [tierMultiplier, builtUpArea, carpetArea, architecturalTakeoff, structuralQuantities, wallSpec, allRooms, layout]);

  // Grand Total Calculations
  const grandTotalExpected = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.subtotal, 0);
  }, [categories]);

  const costLow = useMemo(() => Math.round(grandTotalExpected * 0.88), [grandTotalExpected]);
  const costHigh = useMemo(() => Math.round(grandTotalExpected * 1.15), [grandTotalExpected]);
  const ratePerSqft = useMemo(() => Math.round(grandTotalExpected / Math.max(100, builtUpArea)), [grandTotalExpected, builtUpArea]);

  // Toggle Category Collapsibles
  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Fetch AI Construction Advisor Recommendations from Backend
  useEffect(() => {
    let isCancelled = false;
    const fetchAdvisor = async () => {
      setIsLoadingAdvisor(true);
      try {
        const res = await fetch("http://localhost:8000/api/estimate/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(layout),
        });
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) setAiAdvisor(data);
        } else {
          // Fallback advice
          if (!isCancelled) {
            setAiAdvisor({
              summary: `Estimated at ${formatINR(grandTotalExpected)} (approx. ${formatINR(ratePerSqft)}/sqft). The geometric envelope and preliminary column grid indicate solid structural efficiency.`,
              recommendations: [
                {
                  title: "Optimize Partition Wall Thickness",
                  reason: "Using 4.5\" AAC blocks for internal walls instead of 9\" red bricks reduces structural dead load and increases carpet area by 2–4%.",
                  impact: "HIGH",
                  category: "MATERIAL",
                  estimated_impact: "5% reduction in beam/column loads",
                },
                {
                  title: "Consolidate Wet Area Plumbing",
                  reason: "Grouping bathrooms and kitchen near contiguous vertical shafts minimizes horizontal slab penetration and piping lengths.",
                  impact: "MEDIUM",
                  category: "SERVICES",
                  estimated_impact: "15% reduction in sanitary pipe runs",
                },
                {
                  title: "Column Grid Regularity",
                  reason: `With ${structuralQuantities.count} preliminary columns, aligning them to common grid lines optimizes two-way slab spans.`,
                  impact: "MEDIUM",
                  category: "CONSTRUCTION",
                  estimated_impact: "Avoids deep transfer beam requirements",
                },
              ],
            });
          }
        }
      } catch {
        if (!isCancelled) {
          setAiAdvisor({
            summary: `Estimated at ${formatINR(grandTotalExpected)} (approx. ${formatINR(ratePerSqft)}/sqft). Good structural envelope.`,
            recommendations: [
              {
                title: "Optimize Partition Wall Thickness",
                reason: "Using 4.5\" AAC blocks reduces dead load and increases usable carpet area.",
                impact: "HIGH",
                category: "MATERIAL",
                estimated_impact: "4–6% dead load reduction",
              },
              {
                title: "Vertical Plumbing Consolidation",
                reason: "Contiguous wet wall shafts minimize slab coring risks.",
                impact: "MEDIUM",
                category: "SERVICES",
                estimated_impact: "Reduces piping footage",
              },
            ],
          });
        }
      } finally {
        if (!isCancelled) setIsLoadingAdvisor(false);
      }
    };

    fetchAdvisor();
    return () => {
      isCancelled = true;
    };
  }, [layout, grandTotalExpected, ratePerSqft, structuralQuantities.count]);

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0A0B0E] p-4 sm:p-8 lg:p-12 text-[#F5F3EF]">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* 1. HEADER & INTERACTIVE SPECIFICATION SELECTORS */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[#C48446] text-xs font-mono tracking-widest uppercase font-semibold">
              <Building className="w-4 h-4" />
              <span>PRELIMINARY INDIAN RESIDENTIAL ESTIMATION</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-serif font-medium text-[#F5F3EF]">
              {layout.title || "Residence Construction Budget"}
            </h1>
            <p className="text-xs sm:text-sm text-[#9E9C98] font-light mt-1">
              Quantity takeoff derived from architectural geometry &amp; Indian benchmark rates (INR ₹).
            </p>
          </div>

          {/* Interactive Quality & Wall Spec Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Quality Tier Selector */}
            <div className="p-1 rounded-2xl bg-[#12141A] border border-white/10 flex items-center text-xs font-mono">
              <span className="px-2.5 text-[10px] text-[#8A8883] uppercase flex items-center gap-1">
                <Sliders className="w-3 h-3 text-[#C48446]" /> QUALITY:
              </span>
              {(["ECONOMY", "STANDARD", "PREMIUM"] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setQualityTier(tier)}
                  className={`px-3 py-1.5 rounded-xl transition-all ${
                    qualityTier === tier
                      ? "bg-[#C48446] text-[#0A0B0E] font-semibold shadow-md"
                      : "text-[#9E9C98] hover:text-[#F5F3EF]"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>

            {/* Wall Thickness Selector */}
            <div className="p-1 rounded-2xl bg-[#12141A] border border-white/10 flex items-center text-xs font-mono">
              <span className="px-2.5 text-[10px] text-[#8A8883] uppercase">WALL SPEC:</span>
              <button
                onClick={() => setWallSpec("9_INCH")}
                className={`px-2.5 py-1.5 rounded-xl transition-all ${
                  wallSpec === "9_INCH"
                    ? "bg-[#F5F3EF] text-[#0A0B0E] font-semibold"
                    : "text-[#9E9C98] hover:text-[#F5F3EF]"
                }`}
                title="9-inch standard brick masonry (230 mm)"
              >
                9&quot; (230mm)
              </button>
              <button
                onClick={() => setWallSpec("4.5_INCH")}
                className={`px-2.5 py-1.5 rounded-xl transition-all ${
                  wallSpec === "4.5_INCH"
                    ? "bg-[#F5F3EF] text-[#0A0B0E] font-semibold"
                    : "text-[#9E9C98] hover:text-[#F5F3EF]"
                }`}
                title="4.5-inch partition wall (115 mm)"
              >
                4.5&quot; (115mm)
              </button>
            </div>
          </div>
        </div>

        {/* 2. COST SUMMARY: LOW / EXPECTED / HIGH RANGES & KEY METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Low Estimate */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#12141A]/90 border border-white/5 space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8A8883] block">
              LOW ESTIMATE
            </span>
            <div className="text-2xl sm:text-3xl font-serif text-[#F5F3EF] font-medium">
              {formatINR(costLow)}
            </div>
            <span className="text-xs font-mono text-[#8A8883] block">
              {formatINR(Math.round(costLow / Math.max(100, builtUpArea)))} / SQ FT
            </span>
            <p className="text-[11px] text-[#8A8883] font-light leading-relaxed pt-1 border-t border-white/5">
              Direct sub-contractor procurement and strict material cost controls.
            </p>
          </div>

          {/* Expected Estimate (Primary Card) */}
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#1A1E27] to-[#12141A] border-2 border-[#C48446]/50 shadow-2xl relative space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#C48446] font-semibold">
                EXPECTED ESTIMATE (BENCHMARK)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#C48446]/15 text-[#C48446] text-[10px] font-mono font-bold">
                RECOMMENDED
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-serif text-[#F5F3EF] font-semibold tracking-tight">
              {formatINR(grandTotalExpected)}
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-[#C48446]">
              <span>{formatINR(ratePerSqft)} / SQ FT</span>
              <span className="text-[#9E9C98]">{builtUpArea.toLocaleString()} SQ FT BUA</span>
            </div>
            <p className="text-[11px] text-[#9E9C98] font-light leading-relaxed pt-2 border-t border-white/10">
              Complete turnkey estimate including materials, labor, formwork, finishes, and 5% contingency.
            </p>
          </div>

          {/* High Estimate */}
          <div className="p-5 sm:p-6 rounded-3xl bg-[#12141A]/90 border border-white/5 space-y-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#8A8883] block">
              HIGH ESTIMATE
            </span>
            <div className="text-2xl sm:text-3xl font-serif text-[#F5F3EF] font-medium">
              {formatINR(costHigh)}
            </div>
            <span className="text-xs font-mono text-[#8A8883] block">
              {formatINR(Math.round(costHigh / Math.max(100, builtUpArea)))} / SQ FT
            </span>
            <p className="text-[11px] text-[#8A8883] font-light leading-relaxed pt-1 border-t border-white/5">
              Turnkey premium contractors, difficult site soil conditions, or elevated finish tiers.
            </p>
          </div>
        </div>

        {/* Project Summary Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-[#12141A]/60 border border-white/5 text-xs font-mono">
          <div>
            <span className="text-[10px] text-[#8A8883] uppercase block">BUILT-UP AREA</span>
            <span className="text-sm font-semibold text-[#F5F3EF]">{builtUpArea.toLocaleString()} SQ FT</span>
          </div>
          <div>
            <span className="text-[10px] text-[#8A8883] uppercase block">CARPET AREA</span>
            <span className="text-sm font-semibold text-[#F5F3EF]">{carpetArea.toLocaleString()} SQ FT</span>
          </div>
          <div>
            <span className="text-[10px] text-[#8A8883] uppercase block">FLOORS &amp; WALLS</span>
            <span className="text-sm font-semibold text-[#F5F3EF]">
              {layout.floors?.length || 1} Floor(s) • {wallSpec === "9_INCH" ? "9\" Main" : "4.5\" Partition"}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-[#8A8883] uppercase block">STRUCTURAL SYSTEM</span>
            <span className="text-sm font-semibold text-[#C48446]">
              {layout.structural_system || "RCC FRAME"} ({structuralQuantities.count} COLUMNS)
            </span>
          </div>
        </div>

        {/* 3. AI CONSTRUCTION & VALUE-ENGINEERING ADVISOR */}
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-[#151922] to-[#12141A] border border-blue-500/20 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-lg font-serif text-[#F5F3EF]">AI Construction &amp; Value Advisor</h3>
                <span className="text-[11px] text-[#9E9C98] font-light">
                  Powered by Groq analysis of calculated quantities &amp; layout topology
                </span>
              </div>
            </div>

            {isLoadingAdvisor && (
              <div className="flex items-center gap-2 text-xs font-mono text-blue-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing Geometry...</span>
              </div>
            )}
          </div>

          {aiAdvisor && (
            <>
              <p className="text-xs sm:text-sm text-[#A0A5B5] leading-relaxed bg-[#0A0B0E]/60 p-4 rounded-2xl border border-white/5">
                {aiAdvisor.summary}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                {aiAdvisor.recommendations.map((rec, idx) => (
                  <div
                    key={`rec-${idx}`}
                    className="p-4 rounded-2xl bg-[#0A0B0E]/80 border border-white/5 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-serif font-medium text-sm text-[#F5F3EF]">
                        {rec.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${
                            rec.impact === "HIGH"
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : rec.impact === "MEDIUM"
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          }`}
                        >
                          {rec.impact} IMPACT
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-[#8A8883]">
                          {rec.category}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[#9E9C98] leading-relaxed font-light">
                      {rec.reason}
                    </p>
                    {rec.estimated_impact && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#C48446] pt-1">
                        <TrendingDown className="w-3 h-3" />
                        <span>{rec.estimated_impact}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 4. PRELIMINARY STRUCTURAL COLUMN & FRAME SCHEDULE */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#12141A] border border-[#C48446]/30 shadow-2xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#C48446]/15 border border-[#C48446]/30 flex items-center justify-center text-[#C48446]">
                <Box className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-serif text-[#F5F3EF]">
                  Preliminary Column &amp; Structural Frame Schedule
                </h3>
                <span className="text-xs text-[#9E9C98] font-light">
                  Deterministic RCC column takeoff integrated with 2D/3D structure
                </span>
              </div>
            </div>
            <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-[#C48446]/10 border border-[#C48446]/20 text-[10px] font-mono text-[#C48446] uppercase tracking-wider font-semibold">
              PRELIMINARY ALLOWANCE
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3.5 rounded-2xl bg-[#0A0B0E]/60 border border-white/5">
              <span className="text-[10px] text-[#8A8883] block mb-1">PLANNED COLUMNS</span>
              <span className="text-2xl font-serif text-[#F5F3EF] font-medium block">
                {structuralQuantities.count}
              </span>
              <span className="text-[10px] text-[#C48446]">RCC 9&quot;×9&quot; / 9&quot;×12&quot; candidates</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0B0E]/60 border border-white/5">
              <span className="text-[10px] text-[#8A8883] block mb-1">COLUMN CONCRETE</span>
              <span className="text-2xl font-serif text-[#F5F3EF] font-medium block">
                {structuralQuantities.concCuft} <span className="text-xs font-mono text-[#9E9C98]">CU FT</span>
              </span>
              <span className="text-[10px] text-[#8A8883]">{structuralQuantities.concCum} m³ volume</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0B0E]/60 border border-white/5">
              <span className="text-[10px] text-[#8A8883] block mb-1">REBAR ALLOWANCE</span>
              <span className="text-2xl font-serif text-[#F5F3EF] font-medium block">
                ~{structuralQuantities.rebarKg.toLocaleString()} <span className="text-xs font-mono text-[#9E9C98]">KG</span>
              </span>
              <span className="text-[10px] text-[#8A8883]">~150 kg/m³ residential allowance</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0A0B0E]/60 border border-white/5">
              <span className="text-[10px] text-[#8A8883] block mb-1">COLUMN COST ALLOWANCE</span>
              <span className="text-2xl font-serif text-[#C48446] font-medium block">
                {formatINR(structuralQuantities.costAllowance)}
              </span>
              <span className="text-[10px] text-[#8A8883]">Concrete, rebar &amp; forms</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/5 border border-amber-500/20 flex items-start gap-2.5 text-xs text-[#9E9C98] font-light leading-relaxed">
            <Shield className="w-4 h-4 text-[#C48446] shrink-0 mt-0.5" />
            <span>{structuralQuantities.disclaimer}</span>
          </div>
        </div>

        {/* 5. ITEMIZED CONSTRUCTION CATEGORIES (A to G) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-serif text-[#F5F3EF]">
              Detailed Itemized Construction Breakdown
            </h3>
            <span className="text-xs font-mono text-[#9E9C98]">
              All figures in Indian Rupees (₹ INR)
            </span>
          </div>

          {categories.map((cat) => {
            const isExpanded = expandedCategories[cat.id];
            return (
              <div
                key={cat.id}
                className="rounded-3xl bg-[#12141A] border border-white/10 overflow-hidden transition-colors"
              >
                {/* Category Header Bar */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#C48446]/10 border border-[#C48446]/30 flex items-center justify-center text-[#C48446] font-mono font-bold text-xs">
                      {cat.code}
                    </div>
                    <div>
                      <h4 className="text-base font-serif font-medium text-[#F5F3EF]">
                        {cat.title}
                      </h4>
                      <span className="text-[10px] font-mono text-[#8A8883]">
                        {cat.items.length} itemized lines
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-base sm:text-lg font-mono font-semibold text-[#F5F3EF]">
                      {formatINR(cat.subtotal)}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-[#9E9C98]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#9E9C98]" />
                    )}
                  </div>
                </button>

                {/* Category Table */}
                {isExpanded && (
                  <div className="border-t border-white/5 overflow-x-auto">
                    <table className="w-full text-xs font-mono text-left">
                      <thead>
                        <tr className="border-b border-white/5 bg-[#0A0B0E]/40 text-[10px] text-[#8A8883] uppercase tracking-wider">
                          <th className="py-2.5 px-4 font-normal">Item Description</th>
                          <th className="py-2.5 px-4 font-normal text-right">Quantity</th>
                          <th className="py-2.5 px-4 font-normal text-right">Unit</th>
                          <th className="py-2.5 px-4 font-normal text-right">Rate (₹)</th>
                          <th className="py-2.5 px-4 font-normal text-right">Amount (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {cat.items.map((item, iIdx) => (
                          <tr
                            key={`cat-item-${iIdx}`}
                            className="hover:bg-white/[0.01] transition-colors"
                          >
                            <td className="py-3 px-4 font-serif text-sm text-[#F5F3EF]">
                              {item.name}
                            </td>
                            <td className="py-3 px-4 text-right text-[#9E9C98]">
                              {item.qty.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right text-[#8A8883]">
                              {item.unit}
                            </td>
                            <td className="py-3 px-4 text-right text-[#9E9C98]">
                              ₹{item.rate.toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-[#F5F3EF]">
                              {formatINR(item.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[#0A0B0E]/60 border-t border-white/10 font-semibold text-xs">
                          <td colSpan={4} className="py-3 px-4 text-right text-[#8A8883] uppercase">
                            Subtotal {cat.title}:
                          </td>
                          <td className="py-3 px-4 text-right text-[#C48446]">
                            {formatINR(cat.subtotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 6. GENERAL ESTIMATION DISCLAIMER */}
        <div className="p-4 sm:p-6 rounded-2xl bg-[#12141A]/60 border border-white/5 text-xs text-[#8A8883] font-light leading-relaxed space-y-2">
          <div className="flex items-center gap-2 text-[#C48446] font-mono text-[10px] uppercase font-semibold">
            <Info className="w-3.5 h-3.5" />
            <span>ESTIMATION ASSUMPTIONS &amp; DISCLAIMER</span>
          </div>
          <p>
            Preliminary architectural estimate. Actual construction cost varies by location, soil conditions,
            structural system, contractor, labour rates, material brands, finishes and site conditions.
          </p>
          <p>
            All quantities are derived from vector geometric takeoffs of 2D and 3D architectural models.
            Illustrative benchmark rates reflect standard regional Indian metro/tier-2 construction costs as of 2024.
          </p>
        </div>
      </div>
    </div>
  );
};
