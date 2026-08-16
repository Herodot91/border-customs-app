
export type VehicleType = "car" | "bus" | "truck";
export type ControlType = "border" | "customs";
export type Direction = "entry" | "exit";
export type RiskLevel = "Low" | "Medium" | "High";
export type VehicleStatus = "waiting_border" | "in_border" | "waiting_customs" | "in_customs" | "cleared";
export type BiometricResult = "Verified" | "Pending" | "Failed";
export type ScannerStatus = "Ready" | "Scanning" | "Error";

export type DeclarationStatus = 'SUBMITTED' | 'RELEASED' | 'INSPECTION' | 'HELD' | 'SEIZED';
export type SelectivityChannel = 'GREEN' | 'YELLOW' | 'RED';

export interface BCP {
  id: string;
  name: string;
  countryA: string;
  countryB: string;
}

export interface Lane {
  id: string;
  bcpId: string;
  name: string;
  direction: Direction;
  vehicleType: VehicleType;
  isOpen: boolean;
  // Service times for each stage
  borderServiceTime: number;
  customsServiceTime: number;
}

export interface BiometricDetail {
    status: BiometricResult;
    confidence: number; // 0-100 score
    reason?: string;
    errorCode?: string;
}

export interface BiometricData {
    face: BiometricDetail;
    iris: BiometricDetail;
    fingerprints: BiometricDetail;
}

export interface Vehicle {
  id: string;
  bcpId: string;
  laneId: string;
  plate: string;
  vehicleType: VehicleType;
  subType: string; // e.g. Oil Tanker, Sedan
  goodsType: string;
  companyName: string; // Logistics for trucks, Private for others
  
  origin: string;
  destination: string;
  
  // Risk Features
  watchlistHit: boolean;
  docAnomaly: boolean;
  bioMismatch: boolean;
  routeRisk: number;
  
  risk: RiskLevel;
  riskScore: number;
  
  status: VehicleStatus;
  arrivalTime: number;
  
  // Timers for each stage
  startBorderTime?: number;
  startCustomsTime?: number;
  
  // Dynamic assigned durations based on risk/queue
  assignedBorderDuration?: number;
  assignedCustomsDuration?: number;
  
  // Statuses
  docStatus: ScannerStatus;
  biometrics: BiometricData;
}

export interface Declaration {
  id: string;
  mrn: string;
  traderName: string;
  aeo: 'NONE' | 'S' | 'F';
  flow: 'IMPORT' | 'EXPORT' | 'TRANSIT';
  hsCode: string;
  goodsDesc: string;
  originCountry: string;
  destinationCountry: string;
  value: number;
  declaredValue?: number;
  weight: number; // kg
  duties: number;
  vat: number;
  excise: number;
  
  riskScore: number;
  riskBand: RiskLevel;
  riskReasons: string[];
  channel: SelectivityChannel;
  
  status: DeclarationStatus;
  linkedVehicleId?: string;
  vehiclePlate?: string;
  vehicleType?: VehicleType;
  arrivalTime: number;

  // ── NCTS (New Computerised Transit System) — Transit operations ────────────
  nctsRef?: string;                     // Movement reference: "21MD0012345678"
  nctsOperation?: 'T1' | 'T2' | 'T2F'; // T1=non-EU transit, T2=EU goods, T2F=EU special territories
  nctsOfficeDestination?: string;       // Customs office code, e.g. "ROCTG01"
  nctsStatus?: 'OPEN' | 'IN_TRANSIT' | 'ARRIVED' | 'DISCHARGED' | 'NOT_RELEASED';
  nctsGuaranteeType?: '0' | '1' | '2' | '4' | '9'; // 0=exempt, 1=comprehensive, 2=individual, 4=flat-rate, 9=specific use

  // ── ICS2 (Import Control System 2) — Entry Summary Declarations ───────────
  ics2Ref?: string;                     // ENS MRN: "21MD0098765432"
  ics2Status?: 'FILED' | 'RISK_ASSESSED' | 'DO_NOT_LOAD' | 'AMENDMENT_REQUESTED' | 'ACCEPTED';
  ics2EntryOffice?: string;             // Customs office of first EU entry, e.g. "ROCTG01"
  ics2UCR?: string;                     // Unique Consignment Reference
}

export interface SimulationStats {
    waiting: Vehicle[];
    inControl: Vehicle[];
    cleared: Vehicle[];
    avgWaitSec: number;
    riskCounts: Record<RiskLevel, number>;
    revenue: {
        duties: number;
        vat: number;
        excise: number;
    }
}

export interface Alert {
  id: string;
  timestamp: number;
  bcpId?: string;             // originating BCP — undefined = network-wide / system
  type: 'SECURITY' | 'CUSTOMS' | 'SYSTEM';
  title: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}
