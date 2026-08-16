import { RiskLevel, VehicleType, Vehicle, BiometricData, BiometricDetail, BiometricResult, ScannerStatus, Declaration, SelectivityChannel, DeclarationStatus, Lane, BCP } from "./types";
import { TRADERS, HS_RISK, ORIGIN_RISK, PLATES_PREFIXES, GOODS_TYPES, TRUCK_SUBTYPES, CAR_SUBTYPES, BUS_SUBTYPES, ROUTING_COUNTRIES } from "./constants";

export const randomItem = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ── Plate-format helpers ────────────────────────────────────────────────────
const _L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const _rl = (n: number): string =>
  Array.from({ length: n }, () => _L[Math.floor(Math.random() * 26)]).join('');
const _rd = (n: number): string =>
  Array.from({ length: n }, () => String(Math.floor(Math.random() * 10))).join('');
const _ri = (a: string[]): string => a[Math.floor(Math.random() * a.length)];
const _rn = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// ── Per-country realistic plate generators ──────────────────────────────────
const PLATE_GEN: Record<string, () => string> = {
  // Moldova: XX NNN YY  (district code · 3 digits · 2 letters)
  // e.g. CH 457 AB, UN 023 KP
  MD: () => `${_ri(['AB','BA','BT','CA','CH','CM','CR','CS','DB','DR','ED','FL','FR','HN','IA','LE','OR','RE','SG','SR','ST','TE','UN'])} ${_rd(3)} ${_rl(2)}`,

  // Romania: B NN AAA (București) or XX NN AAA (county)
  // e.g. IS 34 BCD, B 12 XYZ, TM 07 AKP
  RO: () => {
    const c = _ri(['B','CJ','IS','TM','CT','BV','PH','GL','BH','SB','MS','NT','SV','DJ','VL','BC','AG','IF','IL','GR','TR','OT','MH']);
    const digits = String(_rn(1, 99)).padStart(2, '0');
    return `${c} ${digits} ${_rl(3)}`;
  },

  // Ukraine: AA NNNN BB  (oblast code · 4 digits · 2 letters)
  // e.g. AA 1234 BB, CA 5678 KP
  UA: () => `${_ri(['AA','AB','AC','AE','AI','AK','AM','AO','AX','BA','BC','BE','BH','BI','BK','BM','BN','BO','BP','CA','CB'])} ${_rd(4)} ${_rl(2)}`,

  // Germany: CCC-AB NNNN  (city/district · 1-2 letters · 1-4 digits)
  // e.g. B-XY 1234, M-AB 567, HH-KL 89
  DE: () => {
    const city = _ri(['B','M','HH','K','F','S','D','L','N','DO','DD','FR','KA','MA','BO','BS','KS','HD','KN','OB','MS','GÖ','DU','WI']);
    return `${city}-${_rl(2)} ${_rd(String(_rn(100,9999)).length <= 3 ? 3 : 4)}`;
  },

  // Poland: WW NNNNA  (2-3 letter district · 4 digits + 1 letter)
  // e.g. WA 1234B, GD 5678A, KR 1234C
  PL: () => `${_ri(['WA','GD','KR','WR','PO','LU','KA','BY','RZ','OP','LD','SZ','GK','ZG','KI','OL','RA','KL'])} ${_rd(4)}${_rl(1)}`,

  // Italy: AA NNN BB  (2 letters · 3 digits · 2 letters)
  // e.g. AB 123 CD, YZ 456 MN
  IT: () => `${_rl(2)} ${_rd(3)} ${_rl(2)}`,

  // Turkey: NN AA NNNN  (province number · 1-3 letters · digits)
  // e.g. 34 AB 1234 (Istanbul), 06 CK 456 (Ankara)
  TR: () => `${String(_rn(1, 81)).padStart(2, '0')} ${_rl(_rn(1,2))} ${_rd(_rn(3,4))}`,

  // Hungary: AAA-NNN  (3 letters · 3 digits)
  // e.g. ABC-123, XYZ-456
  HU: () => `${_rl(3)}-${_rd(3)}`,

  // Bulgaria: CC NNNN BB  (region letters · 4 digits · 2 letters)
  // e.g. A 1234 BC, CB 5678 XY
  BG: () => `${_ri(['A','B','BT','C','CB','CT','E','H','K','OB','P','PA','PB','PK','PP','PZ','RA','RH','T','TE','V','VB','VL','VN','VT','X'])} ${_rd(4)} ${_rl(2)}`,

  // Austria: CC NNNNN  (district · up to 5 digits+letters)
  // e.g. W 12345, GD 1234A, KR 56789
  AT: () => `${_ri(['W','GD','KR','LF','WR','ST','LZ','VK','WB','SB','BM','GR','KF','SZ','FK','AM','TK','EF','VL','KO','JE','PB','RL','SW'])} ${_rd(3)}${_rl(1)}${_rd(1)}`,

  // France: AA-NNN-BB  (national format since 2009)
  // e.g. AB-123-CD, YZ-456-MN
  FR: () => `${_rl(2)}-${_rd(3)}-${_rl(2)}`,

  // Czech Republic: NAA NNNN  (1 digit · 2 letters · 4 digits)
  // e.g. 1AB 2345, 3CZ 6789
  CZ: () => `${_rd(1)}${_rl(2)} ${_rd(4)}`,

  // Slovakia: AA NNN BB  (region · 3 digits · 2 letters)
  // e.g. BA 123 AB, KE 456 CD
  SK: () => `${_ri(['BA','BB','KE','NR','PO','SC','TN','TT','ZA'])} ${_rd(3)} ${_rl(2)}`,

  // Netherlands: NN-AA-NN  (2 digits · 2 letters · 2 digits)
  // e.g. 12-AB-34, 56-XY-78
  NL: () => `${_rd(2)}-${_rl(2)}-${_rd(2)}`,

  // Belgium: 1-AAA-NNN  (1 digit · 3 letters · 3 digits)
  // e.g. 1-ABC-234, 3-XYZ-567
  BE: () => `${_rn(1, 9)}-${_rl(3)}-${_rd(3)}`,

  // Serbia: CC NNN-AA  (city code · 3 digits · 2 letters)
  // e.g. BG 123-AB, NS 456-KP
  RS: () => `${_ri(['BG','NS','NI','KG','KV','SM','ZR','UB','TO','VA','ZA','RU','SR','SO','PK','LJ'])} ${_rd(3)}-${_rl(2)}`,

  // Switzerland: CC-NNNNN  (canton · up to 6 digits, no letters)
  // e.g. BE-12345, ZH-6789, GE-12345
  CH: () => `${_ri(['BE','ZH','GE','BS','LU','TI','SG','AG','SO','TG','VS','FR','GR','AR','NE','BL','ZG','VD'])}-${_rd(5)}`,

  // United Kingdom: AA NN AAA  (2 letters · 2 digits · 3 letters)
  // e.g. AB 12 CDE, SG 67 XYZ
  GB: () => `${_rl(2)}${_rd(2)} ${_rl(3)}`,

  // Belarus: NNNN AA-N  (4 digits · 2 letters · region digit)
  // e.g. 1234 AB-1, 5678 KP-3
  BY: () => `${_rd(4)} ${_rl(2)}-${_rn(1, 7)}`,

  // Russia: A NNN BB NN  (1 letter · 3 digits · 2 letters · 2-digit region)
  // e.g. A 123 BC 77 (Moscow), K 456 XP 78 (St. Petersburg)
  RU: () => `${_rl(1)} ${_rd(3)} ${_rl(2)} ${_ri(['77','78','50','99','23','66','74','16','54','18','25','61','72','71','31','52','63','76','55','22'])}`,
};

export const randomPlate = (): string => {
  const country = randomItem(PLATES_PREFIXES);
  const gen = PLATE_GEN[country];
  return gen ? gen() : `${country} ${_rd(3)} ${_rl(2)}`;
};

// --- Border Risk Engine ---
export const calculateBorderRisk = (features: {
    watchlistHit: boolean;
    docAnomaly: boolean;
    bioMismatch: boolean;
    routeRisk: number;
    goodsFlag: boolean;
}): { score: number, band: RiskLevel } => {
    const w = {
        watchlist: 40,
        doc_anomaly: 20,
        bio_mismatch: 15,
        route_risk: 10,
        goods_flag: 10,
        random: 5,
    };

    const score = (
        w.watchlist * (features.watchlistHit ? 1 : 0) +
        w.doc_anomaly * (features.docAnomaly ? 1 : 0) +
        w.bio_mismatch * (features.bioMismatch ? 1 : 0) +
        w.route_risk * features.routeRisk +
        w.goods_flag * (features.goodsFlag ? 1 : 0) +
        w.random * Math.random()
    );
    
    const clamped = Math.max(0, Math.min(100, score));
    
    let band: RiskLevel = "Low";
    if (clamped >= 70) band = "High";
    else if (clamped >= 30) band = "Medium";
    
    return { score: clamped, band };
};

// --- Customs Risk Engine ---
export const calculateCustomsRisk = (features: {
    aeo: number; // 0=NONE, 1=AEO-S, 2=AEO-F
    hsRisk: number;
    originRisk: number;
    undervalPct: number;
    pnrHit: boolean;
    docMismatch: boolean;
    watchlist: boolean;
    history: number;
}): { score: number, band: RiskLevel, channel: SelectivityChannel, reasons: string[] } => {
    const w = { pnr: 35, watch: 25, doc: 15, hs: 10, origin: 5, underval: 5, history: 5, aeo: -10 };
    
    const score = (
        w.pnr * (features.pnrHit ? 1 : 0) +
        w.watch * (features.watchlist ? 1 : 0) +
        w.doc * (features.docMismatch ? 1 : 0) +
        w.hs * features.hsRisk +
        w.origin * features.originRisk +
        w.underval * Math.min(1, Math.max(0, features.undervalPct / 30)) +
        w.history * features.history +
        w.aeo * features.aeo
    );

    const reasons: string[] = [];
    if (features.pnrHit) reasons.push("PNR Intelligence Hit");
    if (features.watchlist) reasons.push("Trader Watchlist");
    if (features.docMismatch) reasons.push("Doc Discrepancy");
    if (features.hsRisk > 0.5) reasons.push("High Risk Commodity");
    if (features.originRisk > 0.5) reasons.push("High Risk Origin");
    if (features.undervalPct > 30) reasons.push("Potential Undervaluation");

    const clamped = Math.max(0, Math.min(100, score));
    let band: RiskLevel = "Low";
    if (clamped >= 70) band = "High";
    else if (clamped >= 30) band = "Medium";

    let channel: SelectivityChannel = "GREEN";
    if (band === "High" || features.pnrHit || features.watchlist) {
        channel = "RED";
    } else if (band === "Medium" || features.docMismatch || features.hsRisk > 0.5) {
        channel = "YELLOW";
    }

    return { score: clamped, band, channel, reasons };
};

// --- Generators ---

export const BIO_FAILURE_REASONS: Record<string, { reason: string, code: string }[]> = {
    FACE: [
        { reason: "Liveness check failed: Spoofing detected", code: "BIO-F-401" },
        { reason: "Insufficient feature points: Heavy occlusion", code: "BIO-F-402" },
        { reason: "Template mismatch: Similarity below threshold", code: "BIO-F-403" },
        { reason: "Poor sensor input: Overexposure", code: "BIO-F-404" }
    ],
    IRIS: [
        { reason: "Pupil dilation out of bounds", code: "BIO-I-501" },
        { reason: "Iris pattern mismatch: Database conflict", code: "BIO-I-502" },
        { reason: "Reflection interference: Signal noise", code: "BIO-I-503" },
        { reason: "Motion blur: Incomplete acquisition", code: "BIO-I-504" }
    ],
    PRINT: [
        { reason: "Ridge detail mismatch: Low minutiae count", code: "BIO-P-601" },
        { reason: "Surface contamination: Sensor artifact", code: "BIO-P-602" },
        { reason: "Silicon replica detected: Counterfeit", code: "BIO-P-603" },
        { reason: "Inconsistent overlap with gallery template", code: "BIO-P-604" }
    ]
};

export const generateBioDetail = (type: 'FACE' | 'IRIS' | 'PRINT', failProb: number, pendingProb: number = 0.05): BiometricDetail => {
    const r = Math.random();
    if (r < failProb) {
        // Failed match
        const failure = randomItem(BIO_FAILURE_REASONS[type]);
        return { 
            status: "Failed", 
            confidence: Math.floor(Math.random() * 30) + 10,
            reason: failure.reason,
            errorCode: failure.code
        };
    }
    if (r < failProb + pendingProb) {
        // Pending / Error
        return { status: "Pending", confidence: 0 };
    }
    // Verified
    return { status: "Verified", confidence: Math.floor(Math.random() * 15) + 85 }; // 85-99%
};

export const generateVehicle = (lane: Lane, bcp: BCP, forceBioIssues?: boolean): Vehicle => {
    const now = Date.now();
    
    // Calculate route risk first
    const routeRisk = Number((Math.random() * 0.7).toFixed(2));

    // Increase probability of hits/mismatches if route risk is high (> 0.5)
    const watchlistHit = Math.random() < (routeRisk > 0.5 ? 0.10 : 0.03);
    const docAnomaly = Math.random() < 0.08;
    const goodsFlag = lane.vehicleType === "truck" && Math.random() < 0.15;

    // Biometrics Generation Logic
    let bioRiskFactor = routeRisk > 0.5 ? 0.15 : 0.02;
    let pendingProb = 0.05;
    if (forceBioIssues) {
        bioRiskFactor = 0.45;
        pendingProb = 0.20;
    }

    const bio: BiometricData = {
        face: generateBioDetail('FACE', bioRiskFactor, pendingProb),
        iris: generateBioDetail('IRIS', bioRiskFactor, pendingProb),
        fingerprints: generateBioDetail('PRINT', bioRiskFactor, pendingProb)
    };

    // Calculated actual mismatch based on the data generated
    const bioMismatch = bio.face.status === 'Failed' || bio.iris.status === 'Failed' || bio.fingerprints.status === 'Failed';

    const { score, band } = calculateBorderRisk({ watchlistHit, docAnomaly, bioMismatch, routeRisk, goodsFlag });

    let subType = "Car";
    let companyName = "Private";
    let goodsType = "Personal Effects";
    
    if (lane.vehicleType === 'truck') {
        subType = randomItem(TRUCK_SUBTYPES);
        companyName = randomItem(TRADERS).name;
        goodsType = randomItem(GOODS_TYPES);
    } else if (lane.vehicleType === 'bus') {
        subType = randomItem(BUS_SUBTYPES);
        companyName = "Private"; // Bus Operator often private but not "Logistics"
        goodsType = "Passengers & Luggage";
    } else {
        subType = randomItem(CAR_SUBTYPES);
    }

    // Routing Logic
    // If entry: Coming from Neighbor (B) or Transit to Home (A)
    // If exit: Leaving Home (A) to Neighbor (B) or Transit
    const isEntry = lane.direction === 'entry';
    const neighbor = bcp.countryB;
    const home = bcp.countryA;
    const farAway = randomItem(ROUTING_COUNTRIES);

    let origin = isEntry ? neighbor : home;
    let destination = isEntry ? home : neighbor;

    // Add some transit randomness
    if (Math.random() < 0.3) {
        if (isEntry) origin = farAway; 
        else destination = farAway;
    }

    return {
        id: `V_${now.toString(36)}_${Math.random().toString(36).substring(2,6)}`,
        bcpId: bcp.id,
        laneId: lane.id,
        plate: randomPlate(),
        vehicleType: lane.vehicleType,
        subType,
        goodsType,
        companyName,
        origin,
        destination,
        
        watchlistHit,
        docAnomaly,
        bioMismatch,
        routeRisk,
        
        risk: band,
        riskScore: score,
        
        status: "waiting_border", 
        arrivalTime: now,
        
        docStatus: (Math.random() < 0.2 ? randomItem<ScannerStatus>(["Ready", "Scanning", "Error"]) : "Ready"),
        biometrics: bio
    };
};

export const generateDeclaration = (linkedVehicle?: Vehicle): Declaration => {
    const tr = linkedVehicle && linkedVehicle.vehicleType === 'truck' 
        ? TRADERS.find(t => t.name === linkedVehicle.companyName) || randomItem(TRADERS) 
        : randomItem(TRADERS);

    const hsCode = randomItem(Object.keys(HS_RISK));
    const val = Number((Math.random() * (80000 - 2000) + 2000).toFixed(2));
    const origin = linkedVehicle ? linkedVehicle.origin : randomItem(Object.keys(ORIGIN_RISK));
    const destination = linkedVehicle ? linkedVehicle.destination : randomItem(ROUTING_COUNTRIES);

    const weight = Math.floor(Math.random() * (24000 - 1000) + 1000); 
    
    const aeoMap = { "NONE": 0, "S": 1, "F": 2 };
    // @ts-ignore
    const aeoCode = aeoMap[tr.aeo];

    const hsRiskVal = HS_RISK[hsCode];
    const originRiskVal = ORIGIN_RISK[origin] || 0.3;

    const features = {
        aeo: aeoCode,
        hsRisk: hsRiskVal,
        originRisk: originRiskVal,
        undervalPct: Math.random() * 60,
        pnrHit: ["2402", "2710"].includes(hsCode) && Math.random() < 0.2,
        docMismatch: Math.random() < 0.1,
        watchlist: Math.random() < 0.05,
        history: tr.history
    };

    const { score, band, channel, reasons } = calculateCustomsRisk(features);

    // Tax Calc
    const duties = Number((val * (0.03 + 0.07 * hsRiskVal)).toFixed(2));
    const vat = Number(((val + duties) * 0.19).toFixed(2));
    const excise = ["2402", "2710"].includes(hsCode) ? Number((val * 0.12).toFixed(2)) : 0;
    
    // If linked to a specific vehicle (even car/bus), use its type
    const vType = linkedVehicle?.vehicleType || randomItem<VehicleType>(["truck", "truck", "truck", "car", "bus"]);
    const traderName = linkedVehicle?.vehicleType === 'car' || linkedVehicle?.vehicleType === 'bus' ? 'Individual / Private' : tr.name;

    const flow = randomItem(["IMPORT", "EXPORT", "TRANSIT"] as ('IMPORT'|'EXPORT'|'TRANSIT')[]);

    // ── NCTS (New Computerised Transit System) — for TRANSIT flow ─────────────
    const nctsOffices = ['MDCHI01','MDBAL01','ROCTG01','ROBV01','ROGL01','ROIS01','UAODX01','DEHAM01','DEFRA01'];
    const nctsRef              = flow === 'TRANSIT' ? `21MD${String(Math.floor(Math.random() * 9000000000) + 1000000000)}` : undefined;
    const nctsOperation        = flow === 'TRANSIT' ? randomItem(['T1','T1','T2','T2','T2F'] as ('T1'|'T2'|'T2F')[]) : undefined;
    const nctsOfficeDestination= flow === 'TRANSIT' ? randomItem(nctsOffices) : undefined;
    const nctsStatus           = flow === 'TRANSIT' ? randomItem(['OPEN','OPEN','IN_TRANSIT','IN_TRANSIT','ARRIVED','DISCHARGED','NOT_RELEASED'] as ('OPEN'|'IN_TRANSIT'|'ARRIVED'|'DISCHARGED'|'NOT_RELEASED')[]) : undefined;
    const nctsGuaranteeType    = flow === 'TRANSIT' ? randomItem(['0','1','1','2','4','9'] as ('0'|'1'|'2'|'4'|'9')[]) : undefined;

    // ── ICS2 (Import Control System 2) — for IMPORT flow ──────────────────────
    const ics2Offices = ['ROCTG01','ROBV01','ROGL01','ROBC01','ROIS01','ROIFN01'];
    const ics2Ref        = flow === 'IMPORT' ? `21MD${String(Math.floor(Math.random() * 9000000000) + 1000000000)}` : undefined;
    const ics2Status     = flow === 'IMPORT' ? randomItem(['FILED','FILED','RISK_ASSESSED','RISK_ASSESSED','ACCEPTED','ACCEPTED','ACCEPTED','AMENDMENT_REQUESTED','DO_NOT_LOAD'] as ('FILED'|'RISK_ASSESSED'|'DO_NOT_LOAD'|'AMENDMENT_REQUESTED'|'ACCEPTED')[]) : undefined;
    const ics2EntryOffice= flow === 'IMPORT' ? randomItem(ics2Offices) : undefined;
    const ics2UCR        = flow === 'IMPORT' ? `MD${new Date().getFullYear()}/${String(Math.floor(Math.random() * 9000000000) + 1000000000)}` : undefined;

    return {
        id: `D_${Math.random().toString(36).substring(2,8).toUpperCase()}`,
        mrn: `MD${Math.floor(Math.random() * 899999 + 100000)}`,
        traderName,
        // @ts-ignore
        aeo: tr.aeo,
        flow,
        hsCode,
        goodsDesc: linkedVehicle?.goodsType || `${randomItem(GOODS_TYPES)} (HS ${hsCode})`,
        originCountry: origin,
        destinationCountry: destination,
        value: val,
        weight,
        duties,
        vat,
        excise,
        riskScore: score,
        riskBand: band,
        riskReasons: reasons,
        channel,
        status: "SUBMITTED",
        linkedVehicleId: linkedVehicle?.id,
        vehiclePlate: linkedVehicle?.plate,
        vehicleType: vType,
        arrivalTime: Date.now(),
        // NCTS
        nctsRef, nctsOperation, nctsOfficeDestination, nctsStatus, nctsGuaranteeType,
        // ICS2
        ics2Ref, ics2Status, ics2EntryOffice, ics2UCR,
    };
};

export const riskBadgeColor = (risk: RiskLevel) => {
    switch (risk) {
      case "Low":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "Medium":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "High":
        return "bg-red-500/10 text-red-500 border-red-500/20";
    }
};

export interface ValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
}

export const validateDeclaration = (data: Partial<Declaration>): ValidationResult => {
    const errors: Record<string, string> = {};

    if (!data.mrn) errors.mrn = "MRN is required";
    else if (!/^MD\d{6}$/.test(data.mrn)) errors.mrn = "Format: MD + 6 digits";

    if (!data.traderName || data.traderName.trim().length < 2) errors.traderName = "Name too short (min 2)";
    
    if (!data.hsCode) errors.hsCode = "Required";
    else if (!/^\d{4,10}$/.test(data.hsCode)) errors.hsCode = "4-10 digits required";

    if (!data.originCountry) errors.originCountry = "Required";
    if (!data.destinationCountry) errors.destinationCountry = "Required";
    if (!data.goodsDesc || data.goodsDesc.length < 3) errors.goodsDesc = "Description required";

    if (data.value === undefined || data.value === null) errors.value = "Required";
    else if (data.value <= 0) errors.value = "Must be > 0";
    else if (data.value > 100000000) errors.value = "Max limit 100M";

    if (data.weight === undefined || data.weight === null) errors.weight = "Required";
    else if (data.weight <= 0) errors.weight = "Must be > 0";
    else if (data.weight > 100000) errors.weight = "Max limit 100T";
    
    const validFlows = ['IMPORT', 'EXPORT', 'TRANSIT'];
    if (data.flow && !validFlows.includes(data.flow)) errors.flow = "Invalid Selection";

    const validAeo = ['NONE', 'S', 'F'];
    if (data.aeo && !validAeo.includes(data.aeo)) errors.aeo = "Invalid Selection";

    return { isValid: Object.keys(errors).length === 0, errors };
};