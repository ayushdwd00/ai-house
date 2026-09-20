"use client";

import React, { useMemo } from "react";
import { HouseLayout, Room } from "@/types/house";
import { Calculator, Layers, Box, Check, DollarSign, Sparkles, Building, Palette, Shield } from "lucide-react";

interface EstimateViewProps {
  layout: HouseLayout;
}

export const EstimateView: React.FC<EstimateViewProps> = ({ layout }) => {
  const allRooms: Room[] = useMemo(() => {
    if (layout.floors && layout.floors.length > 0) {
      return layout.floors.flatMap((f) => f.rooms);
    }
    return layout.rooms || [];
  }, [layout]);

  const totalArea = useMemo(() => {
    return (
      layout.stats?.total_area_sqft ||
      allRooms.reduce((sum, r) => sum + (r.area_sqft || r.rect.width * r.rect.length), 0)
    );
  }, [layout, allRooms]);

  // Material quantifications derived from actual rooms
  const flooringQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of allRooms) {
      const mat = r.floor_material || (r.type.includes("bath") ? "ceramic_tile" : "hardwood_oak");
      const area = r.area_sqft || r.rect.width * r.rect.length;
      map[mat] = (map[mat] || 0) + area;
    }
    return Object.entries(map).map(([material, sqft]) => {
      const formattedName = material
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const rate = material.includes("marble") ? 24 : material.includes("tile") ? 14 : 18;
      return {
        material: formattedName,
        sqft: Math.round(sqft),
        unitRate: rate,
        totalCost: Math.round(sqft * rate),
      };
    });
  }, [allRooms]);

  // Wall, Window & Door quantities
  const architecturalSchedule = useMemo(() => {
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

    if (windowCount === 0) windowCount = Math.max(8, Math.round(allRooms.length * 1.8));
    if (doorCount === 0) doorCount = Math.max(6, Math.round(allRooms.length * 1.2));
    if (wallPerimeterFt === 0) wallPerimeterFt = Math.round(totalArea * 0.42);

    const wallSurfaceAreaSqft = Math.round(wallPerimeterFt * 10); // 10ft ceiling
    return {
      windowCount,
      doorCount,
      wallPerimeterFt: Math.round(wallPerimeterFt),
      wallSurfaceAreaSqft,
    };
  }, [layout, allRooms, totalArea]);

  // Cost estimates by tier
  const tiers = useMemo(() => {
    const baseStandardSqft = 220; // $220/sq ft
    const basePremiumSqft = 340;  // $340/sq ft
    const baseLuxurySqft = 480;   // $480/sq ft

    return [
      {
        name: "Standard Architectural",
        subtitle: "Engineered timber, quartz surfaces & high-efficiency insulation",
        rateSqft: baseStandardSqft,
        total: Math.round(totalArea * baseStandardSqft),
        badge: "ESSENTIAL",
        features: [
          "Double-glazed low-E thermal fenestration",
          "Engineered oak & porcelain tile flooring",
          "Standard setback and grade foundation",
          "Energy Star HVAC heat pump system",
        ],
      },
      {
        name: "Premium Bespoke",
        subtitle: "Curated architectural millwork, floor-to-ceiling glazing & acoustic buffers",
        rateSqft: basePremiumSqft,
        total: Math.round(totalArea * basePremiumSqft),
        badge: "RECOMMENDED",
        popular: true,
        features: [
          "Triple-pane architectural glass curtain walls",
          "Solid European oak & Italian terrazzo surfaces",
          "Reinforced structural cantilever spans",
          "Zoned VRF climate systems & ERV fresh air",
          "Integrated architectural linear LED illumination",
        ],
      },
      {
        name: "Atelier Haute Living",
        subtitle: "Monolithic concrete podium, custom bronze fenestration & museum-grade finishes",
        rateSqft: baseLuxurySqft,
        total: Math.round(totalArea * baseLuxurySqft),
        badge: "EXCELLENCE",
        features: [
          "Thermally broken bronze & anodized steel curtain assemblies",
          "Monolithic board-formed architectural concrete",
          "Custom book-matched stone slabs & custom millwork",
          "Geothermal radiant heated/cooled slab flooring",
          "Smart building management system with sensor automation",
        ],
      },
    ];
  }, [totalArea]);

  return (
    <div className="w-full h-full overflow-y-auto bg-[#0A0B0E] text-[#F5F3EF] px-6 sm:px-12 py-10 pb-32">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div className="border-b border-white/10 pb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#C48446]/10 border border-[#C48446]/20 text-[10px] font-mono tracking-widest text-[#C48446] uppercase mb-4">
            <Calculator className="w-3.5 h-3.5" />
            MATERIAL QUANTIFICATION & CONSTRUCTION ESTIMATE
          </div>
          <h1 className="text-3xl sm:text-5xl font-serif font-light tracking-tight text-[#F5F3EF]">
            {layout.title || "Architectural Cost Analysis"}
          </h1>
          <p className="text-sm sm:text-base text-[#9E9C98] font-light mt-3 max-w-2xl leading-relaxed">
            Derived directly from the canonical spatial geometry, wall network, and room specifications of your residence.
          </p>
        </div>

        {/* Key Metrics Quick Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-[#12141A] border border-white/10">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E9C98] block mb-1">
              Total Built Area
            </span>
            <span className="text-2xl sm:text-3xl font-serif text-[#F5F3EF]">
              {Math.round(totalArea).toLocaleString()}
            </span>
            <span className="text-xs font-mono text-[#C48446] ml-1.5">SQ FT</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#12141A] border border-white/10">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E9C98] block mb-1">
              Rooms Programmed
            </span>
            <span className="text-2xl sm:text-3xl font-serif text-[#F5F3EF]">
              {allRooms.length}
            </span>
            <span className="text-xs font-mono text-[#9E9C98] ml-1.5">ROOMS</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#12141A] border border-white/10">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E9C98] block mb-1">
              Fenestration Openings
            </span>
            <span className="text-2xl sm:text-3xl font-serif text-[#F5F3EF]">
              {architecturalSchedule.windowCount + architecturalSchedule.doorCount}
            </span>
            <span className="text-xs font-mono text-[#9E9C98] ml-1.5">UNITS</span>
          </div>

          <div className="p-5 rounded-2xl bg-[#12141A] border border-white/10">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#9E9C98] block mb-1">
              Levels & Floors
            </span>
            <span className="text-2xl sm:text-3xl font-serif text-[#F5F3EF]">
              {layout.num_floors || 1}
            </span>
            <span className="text-xs font-mono text-[#9E9C98] ml-1.5">
              {(layout.num_floors || 1) === 1 ? "STORY" : "STORIES"}
            </span>
          </div>
        </div>

        {/* Cost Tiers */}
        <div>
          <div className="mb-6">
            <span className="text-xs font-mono tracking-widest text-[#C48446] uppercase block mb-1">
              BUDGET ESTIMATION TIERS
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif font-light text-[#F5F3EF]">
              Projected Construction Budget
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-3xl p-7 border flex flex-col justify-between transition-all duration-300 ${
                  tier.popular
                    ? "bg-[#141822] border-[#C48446]/50 shadow-2xl shadow-[#C48446]/10"
                    : "bg-[#12141A] border-white/10 hover:border-white/20"
                }`}
              >
                {tier.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#C48446] text-[#0A0B0E] text-[10px] font-mono font-bold tracking-widest uppercase shadow-md">
                    ARCHITECT'S CHOICE
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono tracking-wider uppercase text-[#C48446]">
                      {tier.badge}
                    </span>
                    <span className="text-xs font-mono text-[#9E9C98]">${tier.rateSqft} / sq ft</span>
                  </div>

                  <h3 className="text-xl font-serif font-medium text-[#F5F3EF] mb-2">{tier.name}</h3>
                  <p className="text-xs text-[#9E9C98] font-light mb-6 leading-relaxed">
                    {tier.subtitle}
                  </p>

                  <div className="mb-8 p-4 rounded-2xl bg-[#0A0B0E]/70 border border-white/5">
                    <span className="text-[10px] font-mono text-[#6B6964] block mb-1">ESTIMATED TOTAL</span>
                    <span className="text-3xl font-serif text-[#F5F3EF]">
                      ${tier.total.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-mono text-[#9E9C98] ml-2">USD</span>
                  </div>

                  <div className="space-y-2.5 mb-6 text-xs text-[#DCD8D0] font-light">
                    {tier.features.map((feat, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Check className="w-3.5 h-3.5 text-[#C48446] shrink-0 mt-0.5" />
                        <span className="leading-snug">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-white/10 text-[10px] font-mono text-[#6B6964] text-center">
                  Includes structure, envelope, finishes & mechanicals
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Material Quantification Schedule */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-white/10">
          {/* Flooring schedule */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#12141A] border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <Layers className="w-5 h-5 text-[#C48446]" />
              <h3 className="text-xl font-serif text-[#F5F3EF]">Flooring Material Schedule</h3>
            </div>

            <div className="space-y-3">
              {flooringQuantities.map((item) => (
                <div
                  key={item.material}
                  className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0B0E]/60 border border-white/5 text-xs font-mono"
                >
                  <div>
                    <span className="text-sm font-serif font-medium text-[#F5F3EF] block">
                      {item.material}
                    </span>
                    <span className="text-[10px] text-[#8A8883]">
                      ${item.unitRate}/sq ft installed
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[#F5F3EF] font-medium block">
                      {item.sqft.toLocaleString()} SQ FT
                    </span>
                    <span className="text-[10px] text-[#C48446]">
                      ${item.totalCost.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Architectural Wall & Opening Schedule */}
          <div className="p-6 sm:p-8 rounded-3xl bg-[#12141A] border border-white/10">
            <div className="flex items-center gap-3 mb-6">
              <Building className="w-5 h-5 text-[#C48446]" />
              <h3 className="text-xl font-serif text-[#F5F3EF]">Structural & Opening Schedule</h3>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0B0E]/60 border border-white/5">
                <div>
                  <span className="text-sm font-serif font-medium text-[#F5F3EF] block">
                    Architectural Wall Linear Run
                  </span>
                  <span className="text-[10px] text-[#8A8883]">Combined internal & external partitions</span>
                </div>
                <div className="text-right text-[#F5F3EF] font-medium">
                  {architecturalSchedule.wallPerimeterFt.toLocaleString()} FT
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0B0E]/60 border border-white/5">
                <div>
                  <span className="text-sm font-serif font-medium text-[#F5F3EF] block">
                    Vertical Wall Surface Area
                  </span>
                  <span className="text-[10px] text-[#8A8883]">Drywall, plaster & primer paint area</span>
                </div>
                <div className="text-right text-[#F5F3EF] font-medium">
                  {architecturalSchedule.wallSurfaceAreaSqft.toLocaleString()} SQ FT
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0B0E]/60 border border-white/5">
                <div>
                  <span className="text-sm font-serif font-medium text-[#F5F3EF] block">
                    Architectural Window Units
                  </span>
                  <span className="text-[10px] text-[#8A8883]">Floor-to-ceiling & ribbon glazing</span>
                </div>
                <div className="text-right text-[#F5F3EF] font-medium">
                  {architecturalSchedule.windowCount} UNITS
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0B0E]/60 border border-white/5">
                <div>
                  <span className="text-sm font-serif font-medium text-[#F5F3EF] block">
                    Interior & Entry Doors
                  </span>
                  <span className="text-[10px] text-[#8A8883]">Flush solid core & pocket doors</span>
                </div>
                <div className="text-right text-[#F5F3EF] font-medium">
                  {architecturalSchedule.doorCount} DOORS
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
