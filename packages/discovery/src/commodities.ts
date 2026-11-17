const commodityNames: Record<string, string> = {
  AG: "Silver", AL: "Aluminum", AS: "Arsenic", AU: "Gold", BA: "Barium", BE: "Beryllium", BI: "Bismuth", C: "Carbon", CA: "Calcium", CD: "Cadmium", CLY: "Clay", CO: "Cobalt", CR: "Chromium", CU: "Copper", FE: "Iron", FL: "Fluorine", GRT: "Garnet", HG: "Mercury", K: "Potassium", LI: "Lithium", LST: "Limestone", MG: "Magnesium", MN: "Manganese", MO: "Molybdenum", NA: "Sodium", NB: "Niobium", NI: "Nickel", P: "Phosphate", PB: "Lead", REE: "Rare earth elements", SB: "Antimony", SDG: "Sand and gravel", SE: "Selenium", SI: "Silica", SN: "Tin", STN_C: "Crushed stone", TA: "Tantalum", TH: "Thorium", TI: "Titanium", TI_M: "Titanium minerals", U: "Uranium", V: "Vanadium", W: "Tungsten", ZN: "Zinc", ZR: "Zirconium"
};

export function commodityLabel(code: string): string { const key = code.trim().toUpperCase(); return commodityNames[key] ? `${commodityNames[key]} (${key})` : key; }
