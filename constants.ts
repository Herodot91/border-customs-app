
import { BCP, Lane, VehicleType, Direction } from "./types";

export const BCPS: BCP[] = [
  // ── Frontiera cu România (vest) ──────────────────────────────────
  { id: 'BCP_LEUSENI',       name: 'Leușeni',        countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_SCULENI',       name: 'Sculeni',         countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_COSTESTI',      name: 'Costești',        countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_CAHUL',         name: 'Cahul',           countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_GIURGIULESTI1', name: 'Giurgiulești 1',  countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_GIURGIULESTI2', name: 'Giurgiulești 2',  countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_LIPCANI',       name: 'Lipcani',         countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_UNGURI',        name: 'Unguri',          countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_GRIMANCAUTI',   name: 'Grimăncăuți',     countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_CRIVA',         name: 'Criva',           countryA: 'Republica Moldova', countryB: 'România'  },
  { id: 'BCP_LEOVA',         name: 'Leova',           countryA: 'Republica Moldova', countryB: 'România'  },
  // ── Frontiera cu Ucraina (nord / est / sud) ──────────────────────
  { id: 'BCP_PALANCA',       name: 'Palanca',         countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_OTACI',         name: 'Otaci',           countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_BRICENI',       name: 'Briceni',         countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_BASARABEASCA',  name: 'Basarabeasca',    countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_TUDORA',        name: 'Tudora',          countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_SAITI',         name: 'Saiți',           countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_CEADARLUGA1',   name: 'Ceadîr-Lunga 1',  countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_CEADARLUGA2',   name: 'Ceadîr-Lunga 2',  countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_MIRNOE',        name: 'Mirnoe',          countryA: 'Republica Moldova', countryB: 'Ucraina'  },
  { id: 'BCP_CISMICHIOI',    name: 'Cișmicioi',       countryA: 'Republica Moldova', countryB: 'Ucraina'  },
];

export const GOODS_TYPES = [
  "General cargo",
  "Agricultural products",
  "Wine & spirits",
  "Textiles & clothing",
  "Pharmaceuticals",
  "Fuel products",
  "Food & beverages",
  "Machinery & equipment",
  "Construction materials",
  "Chemical products",
  "Automotive parts",
  "Electronics & IT",
  "Steel & metals",
  "Humanitarian aid",
];

export const TRUCK_SUBTYPES = [
  "Tautliner",
  "Refrigerated (Reefer)",
  "Oil Tanker",
  "Livestock Carrier",
  "Flatbed",
  "Container Carrier",
  "Box Truck",
  "Dump Truck",
  "Mega Trailer",
];

export const CAR_SUBTYPES = [
  "Sedan",
  "SUV",
  "Estate",
  "Hatchback",
  "Minivan",
  "Luxury Saloon",
];

export const BUS_SUBTYPES = [
  "Tour Coach",
  "Intercity Bus",
  "Minibus",
  "Shuttle",
];

// Weighted by realistic Moldova border traffic volume
// (repeated entries increase probability for that country)
export const PLATES_PREFIXES = [
  // Moldova — domestic, highest volume
  "MD", "MD", "MD", "MD", "MD",
  // Romania — main EU neighbour, very high volume
  "RO", "RO", "RO", "RO",
  // Ukraine — main eastern neighbour
  "UA", "UA", "UA",
  // Major EU transit/destination countries
  "DE", "DE", "PL", "PL", "IT", "IT",
  // Other regular EU traffic
  "HU", "BG", "AT", "FR", "CZ", "SK", "NL", "BE",
  // Non-EU European (still regular traffic)
  "TR", "TR", "RS", "CH", "GB",
  // Eastern neighbours (lower but real)
  "BY", "RU",
];

// Additional countries for routing simulation
export const ROUTING_COUNTRIES = [
  "Romania", "Ukraine", "Germany", "Turkey", "Poland",
  "Italy", "Bulgaria", "Hungary", "Austria", "France",
  "Czech Republic", "Slovakia", "Netherlands", "Belgium",
  "Serbia", "Switzerland", "United Kingdom",
  "Russia", "Belarus", "Greece",
];

// Synthetic Data for Customs Simulation — Moldovan & regional traders
export const TRADERS = [
  { eori: 'MD0001', name: 'Efes Moldova SRL',         aeo: 'F',    history: 0.00 },
  { eori: 'MD0002', name: 'Prime Cargo Logistics MD',  aeo: 'S',    history: 0.08 },
  { eori: 'MD0003', name: 'Nistru Trans SRL',          aeo: 'NONE', history: 0.35 },
  { eori: 'MD0004', name: 'AgroMold Export SA',        aeo: 'S',    history: 0.15 },
  { eori: 'MD0005', name: 'Cahul Gate Impex SRL',      aeo: 'NONE', history: 0.12 },
  { eori: 'MD0006', name: 'Leuseni Trans Freight',     aeo: 'F',    history: 0.04 },
  { eori: 'UA0007', name: 'Odesa Cargo UA',            aeo: 'NONE', history: 0.42 },
  { eori: 'RO0008', name: 'Iasi Logistica SRL',        aeo: 'S',    history: 0.06 },
  { eori: 'MD0009', name: 'Palanca Port Services',     aeo: 'NONE', history: 0.28 },
  { eori: 'MD0010', name: 'Vinuri Cricova SA',         aeo: 'F',    history: 0.02 },
  { eori: 'MD0011', name: 'Nistru Est Comtrans SRL',    aeo: 'NONE', history: 0.55 },
  { eori: 'MD0012', name: 'Gagauz Trans SRL',          aeo: 'NONE', history: 0.38 },
  { eori: 'TR0013', name: 'Ankara Fast Freight',       aeo: 'S',    history: 0.09 },
  { eori: 'MD0014', name: 'Moldova Agro Export SA',    aeo: 'F',    history: 0.03 },
  { eori: 'PL0015', name: 'Warszawa Cargo SP',         aeo: 'S',    history: 0.07 },
];

export const HS_RISK: Record<string, number> = {
  "2203": 0.2,  // beer
  "2402": 0.75, // tobacco/cigarettes
  "2710": 0.65, // fuel/oil
  "2204": 0.35, // wine
  "3004": 0.4,  // pharmaceuticals
  "6403": 0.3,  // footwear
  "8517": 0.5,  // phones/devices
  "8703": 0.25, // passenger cars
  "0102": 0.1,  // live animals
  "8471": 0.55, // computers (dual-use risk)
  "9306": 0.85, // ammunition/weapons components
  "2811": 0.6,  // chemical precursors
};

export const ORIGIN_RISK: Record<string, number> = {
  // ── Full country-name keys (used when origin is set from BCP country names) ──
  "Republica Moldova": 0.20,
  "Romania":           0.10,
  "Ukraine":           0.45,
  "Germany":           0.10,
  "Turkey":            0.35,
  "Poland":            0.15,
  "Italy":             0.10,
  "Bulgaria":          0.20,
  "Hungary":           0.15,
  "Austria":           0.10,
  "France":            0.10,
  "Czech Republic":    0.12,
  "Slovakia":          0.12,
  "Netherlands":       0.10,
  "Belgium":           0.10,
  "Serbia":            0.25,
  "Switzerland":       0.10,
  "United Kingdom":    0.10,
  "Greece":            0.20,
  "Russia":            0.75,
  "Belarus":           0.70,
  // ── ISO-2 code keys (fallback used by plate-prefix–based logic) ────────────
  "MD": 0.20, "RO": 0.10, "UA": 0.45, "TR": 0.35,
  "PL": 0.15, "DE": 0.10, "IT": 0.10, "HU": 0.15,
  "BG": 0.20, "AT": 0.10, "FR": 0.10, "CZ": 0.12,
  "SK": 0.12, "NL": 0.10, "BE": 0.10, "RS": 0.25,
  "CH": 0.10, "GB": 0.10, "RU": 0.75, "BY": 0.70,
};

export const createLanes = (): Lane[] => {
  const lanes: Lane[] = [];

  const addLanes = (
    bcpId: string,
    entryCount: number,
    exitCount: number,
    namePrefix: string
  ) => {
    const makeLane = (i: number, direction: Direction) => {
      let vType: VehicleType = "car";
      if (i % 4 === 1) vType = "truck";
      if (i % 4 === 3) vType = "bus";

      const borderTime  = vType === "car" ? 15 : vType === "bus" ? 40 : 25;
      const customsTime = vType === "car" ? 10 : vType === "bus" ? 30 : 60;

      return {
        id: `${bcpId}_${direction}_${i}`,
        bcpId,
        name: `${namePrefix}-${direction === "entry" ? "EN" : "EX"}${i + 1}`,
        direction,
        vehicleType: vType,
        isOpen: true,
        borderServiceTime: borderTime,
        customsServiceTime: customsTime,
      } as Lane;
    };

    for (let i = 0; i < entryCount; i++) lanes.push(makeLane(i, "entry"));
    for (let i = 0; i < exitCount; i++) lanes.push(makeLane(i, "exit"));
  };

  // ── România border (busiest → smallest) ───────────────────────────
  addLanes('BCP_LEUSENI',       6, 6, 'LEU'); // principal coridor UE – E581
  addLanes('BCP_SCULENI',       5, 5, 'SCL'); // aproape Iași, trafic intens
  addLanes('BCP_COSTESTI',      3, 3, 'CST');
  addLanes('BCP_CAHUL',         4, 4, 'CAH');
  addLanes('BCP_GIURGIULESTI1', 4, 4, 'GG1'); // rutier, zona Dunăre
  addLanes('BCP_GIURGIULESTI2', 3, 3, 'GG2'); // feroviar / fluvial
  addLanes('BCP_LIPCANI',       3, 3, 'LIP');
  addLanes('BCP_UNGURI',        2, 2, 'UNG');
  addLanes('BCP_GRIMANCAUTI',   2, 2, 'GRM');
  addLanes('BCP_CRIVA',         2, 2, 'CRV');
  addLanes('BCP_LEOVA',         2, 2, 'LEO');
  // ── Ucraina border ────────────────────────────────────────────────
  addLanes('BCP_PALANCA',       5, 5, 'PAL'); // principal coridor Ucraina
  addLanes('BCP_OTACI',         3, 3, 'OTC'); // nord, feribot Nistru
  addLanes('BCP_BRICENI',       3, 3, 'BRC');
  addLanes('BCP_BASARABEASCA',  3, 3, 'BSB'); // feroviar – sud
  addLanes('BCP_TUDORA',        2, 2, 'TUD');
  addLanes('BCP_SAITI',         2, 2, 'SAI');
  addLanes('BCP_CEADARLUGA1',   3, 3, 'CL1'); // Găgăuzia
  addLanes('BCP_CEADARLUGA2',   2, 2, 'CL2');
  addLanes('BCP_MIRNOE',        2, 2, 'MIR');
  addLanes('BCP_CISMICHIOI',    2, 2, 'CIS');

  return lanes;
};

export const LANES: Lane[] = createLanes();
