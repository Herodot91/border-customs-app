import React, { useEffect, useMemo, useState, useRef } from "react";
import { BCPS, LANES, HS_RISK, ORIGIN_RISK } from "./constants";
import { Vehicle, RiskLevel, Lane, ControlType, Declaration, DeclarationStatus, VehicleStatus, VehicleType, Alert, BiometricDetail } from "./types";
import { randomItem, riskBadgeColor, generateVehicle, generateDeclaration, validateDeclaration, calculateCustomsRisk, generateBioDetail } from "./utils";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult, Auth } from "firebase/auth";

// ── Firebase Phone Auth (configured via VITE_FIREBASE_* env vars) ─────────────
const _fbCfg = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY     as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID  as string | undefined,
};
const _fbReady = Boolean(_fbCfg.apiKey && _fbCfg.authDomain && _fbCfg.projectId);
let _fbApp: FirebaseApp | null = null;
let _fbAuth: Auth | null = null;
if (_fbReady) {
  _fbApp  = getApps().length ? getApps()[0] : initializeApp(_fbCfg as any);
  _fbAuth = getAuth(_fbApp);
}

// ─── Layer Architecture ───────────────────────────────────────────────────────
type LayerType = 'governance' | 'workflow' | 'kpi' | 'interop' | 'ai-risk' | 'decision' | 'ops-info' | 'mission' | 'cooperation';

// ─── Incident Simulation ──────────────────────────────────────────────────────
type IncidentType = 'suspiciousCargo' | 'bioSlowdown' | 'customsBacklog' | 'laneClosure' | 'migrationSurge' | 'scannerMalfunction';
interface ActiveIncident { startTime: number; duration: number; }
const INCIDENT_DEFS: { id: IncidentType; label: string; color: string; duration: number; desc: string }[] = [
  { id: 'suspiciousCargo',    label: 'Suspicious Vehicle',        color: 'red',    duration: 90,  desc: 'Intelligence report: suspicious vehicle in convoy. Enhanced inspection at all lanes.' },
  { id: 'bioSlowdown',        label: 'Identity Scanner Failure',   color: 'amber',  duration: 120, desc: 'Biometric readers reporting errors. Switch to manual identity checks.' },
  { id: 'customsBacklog',     label: 'Customs Processing Delay',   color: 'orange', duration: 120, desc: 'Too many declarations pending. Clearance times running well above normal.' },
  { id: 'laneClosure',        label: 'Lane Out of Service',        color: 'rose',   duration: 180, desc: 'One checkpoint lane closed. Redirect all traffic to remaining lanes immediately.' },
  { id: 'migrationSurge',     label: 'High Traffic Volume',        color: 'violet', duration: 90,  desc: 'Unusually high number of vehicles and persons arriving. Request backup.' },
  { id: 'scannerMalfunction', label: 'Document Reader Offline',    color: 'amber',  duration: 120, desc: 'Document scanner out of service. Manual document checks required at all booths.' },
];

// ─── Coordination / Demo System ──────────────────────────────────────────────
type OperationalStatus = 'STABLE' | 'CONGESTED' | 'CRITICAL' | 'ESCALATION';
interface ConsequenceEvent { id: string; msg: string; ts: number; type: 'ACTION' | 'EVENT' | 'ALERT' | 'ESCALATION'; }

// ─── Language System ──────────────────────────────────────────────────────────
type Language = 'EN' | 'RO' | 'FR' | 'RU';
const LANG_NAMES: Record<Language, string> = { EN: 'English', RO: 'Română', FR: 'Français', RU: 'Русский' };

const NAV_T: Record<Language, { label: string; sub: string }[]> = {
  EN: [
    { label: 'Gest. Operational Info',  sub: 'National Situational Awareness — Core'          },
    { label: 'Mission Planning',        sub: 'Joint Multi-Agency Operations — Core'           },
    { label: "Int'l Cooperation",       sub: 'International Agency Network — Core'            },
    { label: 'ML Risk Engine',          sub: 'Risk Assessment — Analytical Support'           },
    { label: 'DSS',                     sub: 'Decision Recommendations — Support Layer'       },
    { label: 'Regression Forecasting',  sub: 'Predictive Analytics — Support Layer'           },
    { label: 'Rule-Based Governance',   sub: 'Policy & Compliance Framework — Support'        },
    { label: 'KPI Dashboard',           sub: 'Performance Monitoring — Support Layer'         },
    { label: 'ANPR',                    sub: 'Vehicle Surveillance — Technical Support'       },
  ],
  RO: [
    { label: 'Gestiune Info Operațională', sub: 'Conștientizare Situațională — Nucleu'              },
    { label: 'Planif. Misiuni',            sub: 'Operațiuni Multi-Agenție — Nucleu'                 },
    { label: 'Cooperare Operațională',     sub: 'Rețea Internațională — Nucleu'                     },
    { label: 'Motor Risc ML',              sub: 'Evaluare Amenințări — Suport Analitic'             },
    { label: 'DSS',                        sub: 'Recomandări Decizionale — Strat Suport'            },
    { label: 'Forecast prin Regresie',     sub: 'Analiză Predictivă — Strat Suport'                },
    { label: 'Guvernanță pe Reguli',       sub: 'Cadru Normativ & Conformitate — Suport'           },
    { label: 'Tablou de Bord KPI',         sub: 'Monitorizare Performanță — Strat Suport'          },
    { label: 'ANPR',                       sub: 'Supraveghere Vehicule — Suport Tehnic'            },
  ],
  FR: [
    { label: 'Gestion Info Opérat.',     sub: 'Conscience Situationnelle — Cœur'                 },
    { label: 'Planif. Missions',         sub: 'Opérations Multi-Agences — Cœur'                  },
    { label: 'Coopération Opérat.',      sub: "Réseau International d'Agences — Cœur"            },
    { label: 'Moteur Risque ML',         sub: 'Évaluation Menaces — Support Analytique'          },
    { label: 'DSS',                      sub: 'Recommandations Décision — Couche Support'        },
    { label: 'Prévision par Régression', sub: 'Analytique Prédictive — Couche Support'           },
    { label: 'Gouvernance par Règles',   sub: 'Cadre Normatif & Conformité — Support'            },
    { label: 'Tableau de Bord KPI',      sub: 'Monitoring Performance — Couche Support'          },
    { label: 'ANPR',                     sub: 'Surveillance Véhicules — Support Technique'       },
  ],
  RU: [
    { label: 'Управление Опер. Инфо',   sub: 'Ситуационная Осведомлённость — Ядро'            },
    { label: 'Планиф. Миссий',          sub: 'Операции Мульти-Агентств — Ядро'               },
    { label: 'Операт. Сотрудничество',  sub: 'Международная Сеть Агентств — Ядро'            },
    { label: 'ML Движок Рисков',        sub: 'Оценка Угроз — Аналитическая Поддержка'        },
    { label: 'DSS',                     sub: 'Рекомендации Решений — Слой Поддержки'         },
    { label: 'Регрессионный Прогноз',   sub: 'Предиктивная Аналитика — Слой Поддержки'      },
    { label: 'Управление по Правилам',  sub: 'Нормативная База & Соответствие — Поддержка'   },
    { label: 'Панель KPI',              sub: 'Мониторинг Производительности — Поддержка'     },
    { label: 'ANPR',                    sub: 'Наблюдение за Транспортом — Техн. Поддержка'   },
  ],
};

const STATUS_T: Record<Language, Record<OperationalStatus, string>> = {
  EN: { STABLE: 'STABLE',    CONGESTED: 'CONGESTED',    CRITICAL: 'CRITICAL',  ESCALATION: 'ESCALATION'  },
  RO: { STABLE: 'STABIL',    CONGESTED: 'CONGESTIONAT', CRITICAL: 'CRITIC',    ESCALATION: 'ESCALADARE'  },
  FR: { STABLE: 'STABLE',    CONGESTED: 'CONGESTIONNÉ', CRITICAL: 'CRITIQUE',  ESCALATION: 'ESCALADE'    },
  RU: { STABLE: 'СТАБИЛЬНО', CONGESTED: 'ПЕРЕГРУЖЕНО',  CRITICAL: 'КРИТИЧНО',  ESCALATION: 'ЭСКАЛАЦИЯ'   },
};

const SUBTITLE_T: Record<Language, string> = {
  EN: 'National Coordination Environment — Operational Core · Analytical Support Architecture · IGPF · SV · DMO · Republic of Moldova',
  RO: 'Mediu Național de Coordonare — Nucleu Operațional · Strat Analitic de Suport · IGPF · SV · DMO · Republica Moldova',
  FR: 'Environnement National de Coordination — Cœur Opérationnel · Couche Analytique de Support · IGPF · SV · DMO',
  RU: 'Национальная Среда Координации — Операционное Ядро · Аналитический Слой Поддержки · ИГПФ · СВ · ДМО',
};

// ─── Login / Credentials ──────────────────────────────────────────────────────
const BP_RANKS = [
  // ── Corpul de subofițeri ──
  'Agent',
  'Agent superior',
  'Agent principal',
  'Agent șef-adjunct',
  'Agent șef',
  'Agent șef principal',
  // ── Corpul de ofițeri ──
  'Inspector',
  'Inspector superior',
  'Inspector principal',
  'Comisar',
  'Comisar superior',
  'Comisar principal',
  'Comisar șef',
  'Chestor',
  'Chestor principal',
  'Chestor șef',
];
const CS_RANKS = [
  'Sergent inferior',
  'Sergent',
  'Sergent major',
  'Plutonier',
  'Plutonier major',
  'Plutonier adjutant',
  'Locotenent',
  'Locotenent major',
  'Căpitan',
  'Maior',
  'Locotenent-colonel',
  'Colonel',
  'General maior',
];
const SYSTEM_PASSWORD = 'JOC2025';

interface LoggedOfficer {
  name: string; surname: string; badge: string;
  institution: 'BORDER_POLICE' | 'CUSTOMS_SERVICE'; rank: string;
}

const LOGIN_L: Record<Language, {
  title: string; subtitle: string; name: string; surname: string; badge: string;
  institution: string; rank: string; password: string; submit: string;
  error: string; errorFields: string; errorPwd: string;
  bp: string; cs: string; selectRank: string; classif: string;
  // Auth method selector
  methodPhone: string; methodPassword: string;
  // OTP step
  phone: string; sendCode: string; sending: string;
  otpTitle: string; otpSentTo: string; otpCode: string; otpVerify: string;
  otpResend: string; otpResendIn: string; otpBack: string; otpExpires: string;
}> = {
  EN: { title: 'National Coordination Environment', subtitle: 'Restricted Access — Authorised Personnel Only',
        name: 'First Name', surname: 'Surname', badge: 'Badge / ID Code',
        institution: 'Institution', rank: 'Rank / Grade',
        password: 'System Password', submit: 'Access System',
        error: 'Access denied. Verify credentials.',
        errorFields: 'All fields are required. Please complete the form.',
        errorPwd: 'Incorrect password. Access denied.',
        bp: 'Border Police (IGPF)', cs: 'Customs Service (SV)',
        selectRank: 'Select rank…', classif: 'RESTRICTED ACCESS',
        methodPhone: '📱 Phone OTP', methodPassword: '🔑 Password',
        phone: 'Mobile Number', sendCode: 'Send Access Code', sending: 'Sending…',
        otpTitle: 'Verify Identity', otpSentTo: 'Code sent to',
        otpCode: '6-Digit Access Code', otpVerify: 'Verify & Enter System',
        otpResend: 'Resend code', otpResendIn: 'Resend in', otpBack: '← Back',
        otpExpires: 'Expires in' },
  RO: { title: 'Mediu Național de Coordonare', subtitle: 'Acces Restricționat — Numai Personal Autorizat',
        name: 'Prenume', surname: 'Nume de Familie', badge: 'Cod Insignă / ID',
        institution: 'Instituție', rank: 'Grad / Funcție',
        password: 'Parola Sistemului', submit: 'Accesare Sistem',
        error: 'Acces respins. Verificați datele de identificare.',
        errorFields: 'Toate câmpurile sunt obligatorii. Completați formularul.',
        errorPwd: 'Parolă incorectă. Acces respins.',
        bp: 'Poliția de Frontieră (IGPF)', cs: 'Serviciul Vamal (SV)',
        selectRank: 'Selectați gradul…', classif: 'ACCES RESTRICȚIONAT',
        methodPhone: '📱 OTP Telefon', methodPassword: '🔑 Parolă',
        phone: 'Număr de Telefon', sendCode: 'Trimite Codul', sending: 'Se trimite…',
        otpTitle: 'Verificare Identitate', otpSentTo: 'Cod trimis la',
        otpCode: 'Cod de Acces (6 cifre)', otpVerify: 'Verificare & Acces Sistem',
        otpResend: 'Retrimite codul', otpResendIn: 'Retrimite în', otpBack: '← Înapoi',
        otpExpires: 'Expiră în' },
  FR: { title: 'Environnement National de Coordination', subtitle: 'Accès Restreint — Personnel Autorisé Uniquement',
        name: 'Prénom', surname: 'Nom de Famille', badge: 'Code Insigne / ID',
        institution: 'Institution', rank: 'Grade / Fonction',
        password: 'Mot de Passe Système', submit: 'Accéder au Système',
        error: 'Accès refusé. Vérifiez vos identifiants.',
        errorFields: 'Tous les champs sont obligatoires. Remplissez le formulaire.',
        errorPwd: 'Mot de passe incorrect. Accès refusé.',
        bp: 'Police des Frontières (IGPF)', cs: 'Service des Douanes (SV)',
        selectRank: 'Sélectionner le grade…', classif: 'ACCÈS RESTREINT',
        methodPhone: '📱 OTP Téléphone', methodPassword: '🔑 Mot de Passe',
        phone: 'Numéro de Téléphone', sendCode: "Envoyer le Code", sending: 'Envoi…',
        otpTitle: 'Vérification Identité', otpSentTo: 'Code envoyé à',
        otpCode: "Code d'Accès (6 chiffres)", otpVerify: 'Vérifier & Accéder',
        otpResend: 'Renvoyer le code', otpResendIn: 'Renvoi dans', otpBack: '← Retour',
        otpExpires: 'Expire dans' },
  RU: { title: 'Национальная Среда Координации', subtitle: 'Ограниченный Доступ — Авторизованный Персонал',
        name: 'Имя', surname: 'Фамилия', badge: 'Код Удостоверения / ID',
        institution: 'Учреждение', rank: 'Звание / Должность',
        password: 'Пароль Системы', submit: 'Войти в Систему',
        error: 'Доступ запрещён. Проверьте учётные данные.',
        errorFields: 'Все поля обязательны. Заполните форму.',
        errorPwd: 'Неверный пароль. Доступ запрещён.',
        bp: 'Пограничная Полиция (ИГПФ)', cs: 'Таможенная Служба (СВ)',
        selectRank: 'Выберите звание…', classif: 'ОГРАНИЧЕННЫЙ ДОСТУП',
        methodPhone: '📱 OTP Телефон', methodPassword: '🔑 Пароль',
        phone: 'Номер Телефона', sendCode: 'Отправить Код', sending: 'Отправка…',
        otpTitle: 'Верификация Личности', otpSentTo: 'Код отправлен на',
        otpCode: 'Код Доступа (6 цифр)', otpVerify: 'Подтвердить & Войти',
        otpResend: 'Повторная отправка', otpResendIn: 'Повторить через', otpBack: '← Назад',
        otpExpires: 'Истекает через' },
};

const LAYER_DEFS: { id: LayerType; label: string; sub: string; activeClass: string; dot: string; group: 'core' | 'support' }[] = [
  // ── Operational Core ──────────────────────────────────────────────────────────
  { id: 'ops-info',    label: 'Gest. Info Operațională', sub: 'National Situational Awareness — Core',          group: 'core',    activeClass: 'bg-red-500/10 border-red-500/40 text-red-300',             dot: 'bg-red-500' },
  { id: 'mission',     label: 'Mission Planning',        sub: 'Joint Multi-Agency Operations — Core',           group: 'core',    activeClass: 'bg-teal-500/10 border-teal-500/40 text-teal-300',          dot: 'bg-teal-500' },
  { id: 'cooperation', label: "Int'l Cooperation",       sub: 'International Agency Network — Core',            group: 'core',    activeClass: 'bg-sky-500/10 border-sky-500/40 text-sky-300',             dot: 'bg-sky-500' },
  // ── Analytical & Technical Support Layer ──────────────────────────────────────
  { id: 'ai-risk',     label: 'ML Risk Engine',          sub: 'Risk Assessment — Analytical Support',           group: 'support', activeClass: 'bg-amber-500/10 border-amber-500/40 text-amber-300',       dot: 'bg-amber-500' },
  { id: 'decision',    label: 'DSS',                     sub: 'Decision Recommendations — Support Layer',       group: 'support', activeClass: 'bg-orange-500/10 border-orange-500/40 text-orange-300',    dot: 'bg-orange-500' },
  { id: 'workflow',    label: 'Regression Forecasting',  sub: 'Predictive Analytics — Support Layer',           group: 'support', activeClass: 'bg-blue-500/10 border-blue-500/40 text-blue-300',          dot: 'bg-blue-500' },
  { id: 'governance',  label: 'Rule-Based Governance',   sub: 'Policy & Compliance Framework — Support',        group: 'support', activeClass: 'bg-violet-500/10 border-violet-500/40 text-violet-300',    dot: 'bg-violet-500' },
  { id: 'kpi',         label: 'KPI Dashboard',           sub: 'Performance Monitoring — Support Layer',         group: 'support', activeClass: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300', dot: 'bg-emerald-500' },
  { id: 'interop',     label: 'ANPR',                    sub: 'Vehicle Surveillance — Technical Support',       group: 'support', activeClass: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300',          dot: 'bg-cyan-500' },
];

// ─── Governance Data ──────────────────────────────────────────────────────────
const POLICIES = [
  { id: 'POL-001', title: 'Mandatory Biometric Verification',       category: 'Security',            priority: 'CRITICAL', ref: 'REG 2019/817',       description: 'All third-country nationals undergo face, iris, and fingerprint verification at entry/exit.', triggers: ['Bio mismatch', 'MRZ checksum failure'] },
  { id: 'POL-002', title: 'High-Risk Origin Enhanced Screening',    category: 'Intelligence',        priority: 'HIGH',     ref: 'INTERPOL GL v4.2',   description: 'Vehicles/persons from flagged regions require secondary inspection per intelligence risk profiles.', triggers: ['Route risk > 0.5', 'Origin country flagged'] },
  { id: 'POL-003', title: 'Excisable Goods Physical Inspection',    category: 'Customs',             priority: 'HIGH',     ref: 'Customs Code Art.182',description: 'HS codes 2402 (tobacco) and 2710 (fuels) require mandatory physical inspection.', triggers: ['HS 2402 declared', 'HS 2710 declared', 'PNR hit'] },
  { id: 'POL-004', title: 'AEO Expedited Clearance',                category: 'Trade Facilitation', priority: 'MEDIUM',   ref: 'CCC Art. 38-39',     description: 'Authorized Economic Operators receive expedited processing and reduced physical checks.', triggers: ['AEO-F confirmed', 'AEO-S confirmed'] },
  { id: 'POL-005', title: 'Cash Declaration Threshold (€10k)',      category: 'Financial',           priority: 'HIGH',     ref: 'EU Reg. 2018/1672',  description: 'Persons entering or leaving must declare cash or equivalent assets ≥ €10,000.', triggers: ['Amount ≥ €10,000', 'Undeclared currency K9 hit'] },
  { id: 'POL-006', title: 'Watchlist Cross-Reference Protocol',     category: 'Security',            priority: 'CRITICAL', ref: 'Schengen SIS II',    description: 'All persons and vehicles cross-referenced against SIS II, INTERPOL, and Europol in real-time.', triggers: ['Plate match SIS II', 'Identity match INTERPOL DB'] },
  { id: 'POL-007', title: 'Lane Queue Management (>6 vehicles)',    category: 'Operations',          priority: 'MEDIUM',   ref: 'BCP-OPS-2024-07',    description: 'Additional lanes must be activated within 5 min when avg queue exceeds 6 vehicles per lane.', triggers: ['Queue > 6 vehicles/lane'] },
  { id: 'POL-008', title: 'Evidence Chain of Custody',              category: 'Legal',               priority: 'CRITICAL', ref: 'Forensics FP-2023',  description: 'All seized goods must be photographed, inventoried, and tamper-sealed before transfer.', triggers: ['Seizure order issued', 'Contraband detected'] },
];

const SOP_PROCEDURES = [
  { id: 'SOP-001', title: 'Vehicle Queue Management',   priority: 'HIGH',     steps: ['Monitor lane queue on console', 'Alert supervisor when queue > 4 vehicles', 'Open secondary lane within 5 min', 'Communicate via radio channel 3'] },
  { id: 'SOP-002', title: 'Biometric Verification',     priority: 'HIGH',     steps: ['Request travel document', 'Initialize scanner (3-point calibration)', 'Capture face, iris, fingerprint', 'Cross-reference database (max 8s)', 'If FAILED: escalate to secondary booth'] },
  { id: 'SOP-003', title: 'High-Risk Cargo Response',   priority: 'CRITICAL', steps: ['Direct vehicle to secondary bay S1-S4', 'Notify Customs Supervisor immediately', 'Do not release without authorization', 'Document findings with photo evidence', 'File incident report within 30 min'] },
  { id: 'SOP-004', title: 'Watchlist Hit Response',     priority: 'CRITICAL', steps: ['Detain vehicle without alerting subject', 'Alert Duty Officer & Intelligence Liaison', 'Secure perimeter — activate standby', 'No action without explicit authorization', 'Contact INTERPOL NCB liaison'] },
  { id: 'SOP-005', title: 'Document Anomaly Protocol',  priority: 'HIGH',     steps: ['Direct to secondary screening area', 'Escalate to document fraud examiner', 'Retain document as evidence', 'Do not return without supervisor clearance', 'Log in Document Anomaly Register'] },
];

// ─── Interoperability Data ────────────────────────────────────────────────────
interface ExternalSystem { id: string; name: string; type: string; country: string; status: 'ONLINE'|'DEGRADED'|'OFFLINE'; latencyMs: number; queriesHour: number; hitRatePct: number; protocol: string; }

const EXTERNAL_SYSTEMS: ExternalSystem[] = [
  { id: 'SIS2',     name: 'Schengen SIS II',          type: 'Border',        country: 'EU',  status: 'ONLINE',    latencyMs: 18,  queriesHour: 1420, hitRatePct: 5.2,  protocol: 'SIS2-NET' },
  { id: 'INTERPOL', name: 'INTERPOL I-24/7',           type: 'Intelligence',  country: 'INT', status: 'ONLINE',    latencyMs: 45,  queriesHour: 234,  hitRatePct: 3.1,  protocol: 'XML/SFTP' },
  { id: 'EUROPOL',  name: 'Europol EIS',               type: 'Intelligence',  country: 'EU',  status: 'ONLINE',    latencyMs: 62,  queriesHour: 189,  hitRatePct: 2.4,  protocol: 'REST/TLS 1.3' },
  { id: 'TARIC',    name: 'TARIC Customs Tariff DB',   type: 'Trade',         country: 'EU',  status: 'ONLINE',    latencyMs: 9,   queriesHour: 892,  hitRatePct: 100,  protocol: 'REST' },
  { id: 'EVISA',    name: 'eVisa / ePassport (ICAO)',  type: 'Identity',      country: 'INT', status: 'ONLINE',    latencyMs: 23,  queriesHour: 1102, hitRatePct: 8.2,  protocol: 'BAC/PACE' },
  { id: 'CITES',    name: 'CITES Species DB',          type: 'Environmental', country: 'INT', status: 'ONLINE',    latencyMs: 78,  queriesHour: 45,   hitRatePct: 1.1,  protocol: 'SOAP/XML' },
  { id: 'FATF',     name: 'FATF Watchlist',            type: 'Financial',     country: 'INT', status: 'DEGRADED',  latencyMs: 340, queriesHour: 67,   hitRatePct: 4.3,  protocol: 'REST' },
  { id: 'NAT_BG',   name: 'National Border Control DB',type: 'National',      country: 'KA',  status: 'ONLINE',    latencyMs: 12,  queriesHour: 3200, hitRatePct: 12.4, protocol: 'PostgreSQL/WS' },
  { id: 'NAT_CS',   name: 'National Customs System',   type: 'Customs',       country: 'KA',  status: 'ONLINE',    latencyMs: 8,   queriesHour: 2800, hitRatePct: 100,  protocol: 'Internal API' },
  { id: 'ASYCUDA',  name: 'ASYCUDA World (SV-MD)',      type: 'Customs',       country: 'MD',  status: 'ONLINE',    latencyMs: 14,  queriesHour: 1840, hitRatePct: 100,  protocol: 'UNCTAD XML/REST' },
  { id: 'EUCARIS',  name: 'EUCARIS Vehicle Registry',   type: 'Vehicle',       country: 'EU',  status: 'ONLINE',    latencyMs: 55,  queriesHour: 320,  hitRatePct: 6.8,  protocol: 'EUCARIS/WebSvc' },
  { id: 'VSCI',     name: 'INTERPOL VSCI (Stolen Veh.)',type: 'Vehicle',       country: 'INT', status: 'ONLINE',    latencyMs: 48,  queriesHour: 285,  hitRatePct: 4.1,  protocol: 'I-24/7 XML' },
];

// ─── Human Layer Data ─────────────────────────────────────────────────────────
interface Officer { id: string; name: string; badge: string; rank: string; role: string; type: 'BORDER_GUARD'|'CUSTOMS'|'MANAGEMENT'|'INTELLIGENCE'; bcpId: string|null; segment: 'ENTRY'|'EXIT'|'COMMAND'|null; laneType?: 'CARS'|'TRUCKS'|null; shift: 'ALPHA'|'BRAVO'|'CHARLIE'; status: 'ON_DUTY'|'BREAK'|'OFF_DUTY'; lang: string[]; }

const OFFICERS_ROSTER: Officer[] = [
  // ── Comandament (DMO) ───────────────────────────────────────────────────────
  { id: 'OFF-001', name: 'Vasile Marinescu',     badge: 'BP-0001', rank: 'Chestor șef',          role: 'Commander on Duty — DMO', type: 'MANAGEMENT',   bcpId: null,               segment: 'COMMAND', shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN','FR'] },
  { id: 'OFF-025', name: 'Ion Botnaru',           badge: 'BP-0003', rank: 'Comisar superior',     role: 'Șef Tură Poliția de Frontieră', type: 'BORDER_GUARD', bcpId: null,          segment: 'COMMAND', shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','EN'] },
  { id: 'OFF-026', name: 'Natalia Cojocaru',      badge: 'CS-0005', rank: 'Maior',                role: 'Șef Tură Serviciul Vamal',  type: 'CUSTOMS',      bcpId: null,               segment: 'COMMAND', shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-008', name: 'Radu Gheorghe',         badge: 'INT-007', rank: 'Inspector superior',   role: 'Ofițer Legătură Intelligence', type: 'INTELLIGENCE', bcpId: null,            segment: 'COMMAND', shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN','FR'] },
  // ── PTF Leușeni ─────────────────────────────────────────────────────────────
  { id: 'OFF-002', name: 'Andrei Ciobanu',        badge: 'BP-1001', rank: 'Inspector principal',  role: 'Ofițer Senior PF',          type: 'BORDER_GUARD', bcpId: 'BCP_LEUSENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','EN'] },
  { id: 'OFF-003', name: 'Elena Rusu',            badge: 'BP-1002', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_LEUSENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-013', name: 'Marian Moraru',         badge: 'BP-1003', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_LEUSENI',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-005', name: 'Mirela Sava',           badge: 'CS-1001', rank: 'Căpitan',              role: 'Inspector Vamal Senior',    type: 'CUSTOMS',      bcpId: 'BCP_LEUSENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN','DE'] },
  { id: 'OFF-014', name: 'Pavel Grama',           badge: 'CS-1002', rank: 'Locotenent major',     role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_LEUSENI',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-027', name: 'Diana Lupescu',         badge: 'CS-1003', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_LEUSENI',      segment: 'ENTRY',   shift: 'BRAVO', status: 'BREAK',    lang: ['RO','FR']      },
  // ── PTF Sculeni ─────────────────────────────────────────────────────────────
  { id: 'OFF-012', name: 'Bogdan Scutari',        badge: 'BP-2001', rank: 'Inspector principal',  role: 'Ofițer Senior PF',          type: 'BORDER_GUARD', bcpId: 'BCP_SCULENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','EN'] },
  { id: 'OFF-004', name: 'Dragos Leahu',          badge: 'BP-2002', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_SCULENI',      segment: 'EXIT',    shift: 'ALPHA', status: 'BREAK',    lang: ['RO','EN']      },
  { id: 'OFF-028', name: 'Alina Postolachi',      badge: 'BP-2003', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_SCULENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','FR']      },
  { id: 'OFF-015', name: 'Livia Chiriac',         badge: 'CS-2001', rank: 'Căpitan',              role: 'Inspector Vamal Senior',    type: 'CUSTOMS',      bcpId: 'BCP_SCULENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-016', name: 'Tudor Danu',            badge: 'CS-2002', rank: 'Locotenent major',     role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_SCULENI',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  // ── PTF Palanca ─────────────────────────────────────────────────────────────
  { id: 'OFF-029', name: 'Serghei Vatamanu',      badge: 'BP-3001', rank: 'Inspector principal',  role: 'Ofițer Senior PF',          type: 'BORDER_GUARD', bcpId: 'BCP_PALANCA',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','EN'] },
  { id: 'OFF-030', name: 'Irina Popa',            badge: 'BP-3002', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_PALANCA',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-031', name: 'Vasile Vrabie',         badge: 'BP-3003', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_PALANCA',      segment: 'ENTRY',   shift: 'BRAVO', status: 'OFF_DUTY', lang: ['RO','UA','EN'] },
  { id: 'OFF-006', name: 'Florin Negru',          badge: 'CS-3001', rank: 'Maior',                role: 'Inspector Vamal Senior',    type: 'CUSTOMS',      bcpId: 'BCP_PALANCA',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-032', name: 'Svetlana Bodea',        badge: 'CS-3002', rank: 'Locotenent major',     role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_PALANCA',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Giurgiulești 1 ──────────────────────────────────────────────────────
  { id: 'OFF-007', name: 'Olga Frunze',           badge: 'BP-4001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_GIURGIULESTI1', segment: 'ENTRY',  shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-017', name: 'Mihai Gherman',         badge: 'BP-4002', rank: 'Agent șef principal',  role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_GIURGIULESTI1', segment: 'EXIT',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-033', name: 'Tatiana Croitor',       badge: 'CS-4001', rank: 'Căpitan',              role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_GIURGIULESTI1', segment: 'ENTRY',  shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-034', name: 'Alexandru Balan',       badge: 'CS-4002', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_GIURGIULESTI1', segment: 'EXIT',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  // ── PTF Cahul ───────────────────────────────────────────────────────────────
  { id: 'OFF-018', name: 'Cristian Pantelei',     badge: 'BP-5001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CAHUL',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-035', name: 'Maria Iordachi',        badge: 'BP-5002', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CAHUL',        segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','FR']      },
  { id: 'OFF-009', name: 'Angela Birsan',         badge: 'CS-5001', rank: 'Locotenent major',     role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_CAHUL',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-036', name: 'Eugen Dumitrasco',      badge: 'CS-5002', rank: 'Căpitan',              role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_CAHUL',        segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Costești ────────────────────────────────────────────────────────────
  { id: 'OFF-010', name: 'Victor Cucu',           badge: 'BP-6001', rank: 'Agent șef principal',  role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_COSTESTI',     segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-037', name: 'Simona Berbec',         badge: 'BP-6002', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_COSTESTI',     segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-038', name: 'George Munteanu',       badge: 'CS-6001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_COSTESTI',     segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  // ── PTF Lipcani ─────────────────────────────────────────────────────────────
  { id: 'OFF-022', name: 'Catalin Tomescu',       badge: 'BP-7001', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_LIPCANI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-039', name: 'Dana Chirila',          badge: 'BP-7002', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_LIPCANI',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-011', name: 'Ana Lazarev',           badge: 'CS-7001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_LIPCANI',      segment: 'ENTRY',   shift: 'BRAVO', status: 'OFF_DUTY', lang: ['RO','RU']      },
  // ── PTF Otaci ───────────────────────────────────────────────────────────────
  { id: 'OFF-040', name: 'Razvan Pascaru',        badge: 'BP-8001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_OTACI',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-041', name: 'Lilia Cojocaru',        badge: 'BP-8002', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_OTACI',        segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-042', name: 'Petru Bandalac',        badge: 'CS-8001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_OTACI',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Briceni ─────────────────────────────────────────────────────────────
  { id: 'OFF-043', name: 'Marius Sandu',          badge: 'BP-9001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_BRICENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-044', name: 'Oxana Manole',          badge: 'BP-9002', rank: 'Agent șef',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_BRICENI',      segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','UA'] },
  { id: 'OFF-045', name: 'Dumitru Bostan',        badge: 'CS-9001', rank: 'Locotenent major',     role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_BRICENI',      segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Basarabeasca ────────────────────────────────────────────────────────
  { id: 'OFF-046', name: 'Nikolai Topor',         badge: 'BP-A001', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_BASARABEASCA', segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-047', name: 'Valentina Cioroi',      badge: 'BP-A002', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_BASARABEASCA', segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-048', name: 'Viorel Taran',          badge: 'CS-A001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_BASARABEASCA', segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Giurgiulești 2 ──────────────────────────────────────────────────────
  { id: 'OFF-049', name: 'Aureliu Cojocar',       badge: 'BP-B001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_GIURGIULESTI2', segment: 'ENTRY',  shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-050', name: 'Liudmila Hadji',        badge: 'BP-B002', rank: 'Agent șef',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_GIURGIULESTI2', segment: 'EXIT',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-051', name: 'Nicolae Bors',          badge: 'CS-B001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_GIURGIULESTI2', segment: 'ENTRY',  shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  // ── PTF Ceadir-Lunga 1 ──────────────────────────────────────────────────────
  { id: 'OFF-052', name: 'Iurie Turcanu',         badge: 'BP-C001', rank: 'Inspector superior',   role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CEADARLUGA1',  segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','TR'] },
  { id: 'OFF-053', name: 'Nadejda Grosu',         badge: 'BP-C002', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CEADARLUGA1',  segment: 'EXIT',    shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-054', name: 'Alexandr Marin',        badge: 'CS-C001', rank: 'Maior',                role: 'Inspector Vamal Senior',    type: 'CUSTOMS',      bcpId: 'BCP_CEADARLUGA1',  segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Leova ───────────────────────────────────────────────────────────────
  { id: 'OFF-019', name: 'Nadia Popovici',        badge: 'BP-D001', rank: 'Agent șef',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_LEOVA',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-055', name: 'Ion Gavriliuc',         badge: 'CS-D001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_LEOVA',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Grimancauti ─────────────────────────────────────────────────────────
  { id: 'OFF-020', name: 'Cristina Chirca',       badge: 'BP-E001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_GRIMANCAUTI',  segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-056', name: 'Vitalie Grecu',         badge: 'CS-E001', rank: 'Plutonier major',      role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_GRIMANCAUTI',  segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO']           },
  // ── PTF Unguri ──────────────────────────────────────────────────────────────
  { id: 'OFF-021', name: 'George Spataru',        badge: 'BP-F001', rank: 'Agent principal',      role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_UNGURI',       segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','EN']      },
  { id: 'OFF-057', name: 'Elena Lungu',           badge: 'CS-F001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_UNGURI',       segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO']           },
  // ── PTF Criva ───────────────────────────────────────────────────────────────
  { id: 'OFF-023', name: 'Dana Bondari',          badge: 'BP-G001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CRIVA',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-058', name: 'Stefan Mihalachi',      badge: 'CS-G001', rank: 'Plutonier major',      role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_CRIVA',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO']           },
  // ── PTF Tudora ──────────────────────────────────────────────────────────────
  { id: 'OFF-059', name: 'Serghei Musteata',      badge: 'BP-H001', rank: 'Agent șef',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_TUDORA',       segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-060', name: 'Tamara Petrovici',      badge: 'CS-H001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_TUDORA',       segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Saiti ───────────────────────────────────────────────────────────────
  { id: 'OFF-061', name: 'Mihail Slivari',        badge: 'BP-I001', rank: 'Agent șef',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_SAITI',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','TR'] },
  { id: 'OFF-062', name: 'Galina Ursachi',        badge: 'CS-I001', rank: 'Plutonier adjutant',   role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_SAITI',        segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Ceadir-Lunga 2 ──────────────────────────────────────────────────────
  { id: 'OFF-063', name: 'Anatolie Cebanu',       badge: 'BP-J001', rank: 'Inspector',            role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CEADARLUGA2',  segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU','TR'] },
  { id: 'OFF-064', name: 'Olga Scutari',          badge: 'CS-J001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_CEADARLUGA2',  segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Mirnoe ──────────────────────────────────────────────────────────────
  { id: 'OFF-065', name: 'Veaceslav Gasca',       badge: 'BP-K001', rank: 'Agent principal',      role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_MIRNOE',       segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-066', name: 'Ecaterina Botnari',     badge: 'CS-K001', rank: 'Plutonier major',      role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_MIRNOE',       segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  // ── PTF Cismichioi ──────────────────────────────────────────────────────────
  { id: 'OFF-067', name: 'Tudor Plamadeala',      badge: 'BP-L001', rank: 'Agent superior',       role: 'Ofițer PF',                 type: 'BORDER_GUARD', bcpId: 'BCP_CISMICHIOI',   segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
  { id: 'OFF-068', name: 'Ivan Tataru',           badge: 'CS-L001', rank: 'Locotenent',           role: 'Inspector Vamal',           type: 'CUSTOMS',      bcpId: 'BCP_CISMICHIOI',   segment: 'ENTRY',   shift: 'ALPHA', status: 'ON_DUTY',  lang: ['RO','RU']      },
];

// ── Per-BCP staffing profile (officers per lane type per shift) ──────────────
type StaffingSlots = { entryCars: number; entryTrucks: number; exitCars: number; exitTrucks: number };
const BCP_STAFFING_PROFILE: Record<string, { bp: StaffingSlots; cs: StaffingSlots }> = {
  BCP_LEUSENI:       { bp: { entryCars: 3, entryTrucks: 3, exitCars: 3, exitTrucks: 3 }, cs: { entryCars: 3, entryTrucks: 3, exitCars: 3, exitTrucks: 3 } },
  BCP_SCULENI:       { bp: { entryCars: 3, entryTrucks: 2, exitCars: 3, exitTrucks: 2 }, cs: { entryCars: 3, entryTrucks: 2, exitCars: 3, exitTrucks: 2 } },
  BCP_GIURGIULESTI1: { bp: { entryCars: 2, entryTrucks: 2, exitCars: 2, exitTrucks: 2 }, cs: { entryCars: 3, entryTrucks: 2, exitCars: 3, exitTrucks: 2 } },
  BCP_PALANCA:       { bp: { entryCars: 2, entryTrucks: 2, exitCars: 2, exitTrucks: 2 }, cs: { entryCars: 2, entryTrucks: 2, exitCars: 2, exitTrucks: 2 } },
  BCP_CAHUL:         { bp: { entryCars: 2, entryTrucks: 1, exitCars: 2, exitTrucks: 1 }, cs: { entryCars: 2, entryTrucks: 1, exitCars: 2, exitTrucks: 1 } },
  BCP_GIURGIULESTI2: { bp: { entryCars: 2, entryTrucks: 1, exitCars: 2, exitTrucks: 1 }, cs: { entryCars: 2, entryTrucks: 1, exitCars: 2, exitTrucks: 1 } },
  BCP_COSTESTI:      { bp: { entryCars: 2, entryTrucks: 1, exitCars: 2, exitTrucks: 1 }, cs: { entryCars: 2, entryTrucks: 1, exitCars: 2, exitTrucks: 1 } },
  BCP_LIPCANI:       { bp: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 }, cs: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 } },
  BCP_OTACI:         { bp: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 }, cs: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 } },
  BCP_BRICENI:       { bp: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 }, cs: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 } },
  BCP_BASARABEASCA:  { bp: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 }, cs: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 } },
  BCP_CEADARLUGA1:   { bp: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 }, cs: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 1 } },
  BCP_LEOVA:         { bp: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 1, exitCars: 1, exitTrucks: 0 } },
  BCP_GRIMANCAUTI:   { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_UNGURI:        { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_CRIVA:         { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_TUDORA:        { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_SAITI:         { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_CEADARLUGA2:   { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_MIRNOE:        { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
  BCP_CISMICHIOI:    { bp: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 }, cs: { entryCars: 1, entryTrucks: 0, exitCars: 1, exitTrucks: 0 } },
};
const DEFAULT_STAFFING: { bp: StaffingSlots; cs: StaffingSlots } = {
  bp: { entryCars: 2, entryTrucks: 2, exitCars: 2, exitTrucks: 2 },
  cs: { entryCars: 2, entryTrucks: 2, exitCars: 2, exitTrucks: 2 },
};

const INSTITUTIONS = [
  { id: 'NP',  name: 'National Police',           acronym: 'NP',  role: 'Law enforcement support, criminal investigation & joint border operations', contact: 'bcu@police.ka',  cls: 'text-indigo-400 border-indigo-500/30 bg-indigo-500/5' },
  { id: 'INT', name: 'Intelligence Directorate',  acronym: 'INT', role: 'Counter-intelligence, threat analysis, risk sharing & operational liaison',  contact: 'liaison@int.ka', cls: 'text-violet-400 border-violet-500/30 bg-violet-500/5' },
];

// --- Helper Components ---

const DashboardWidget = ({ 
    title, 
    children, 
    onClose, 
    isVisible, 
    className = "", 
    contentClassName="",
    headerAction 
}: {
    title: string;
    children?: React.ReactNode;
    onClose: () => void;
    isVisible: boolean;
    className?: string;
    contentClassName?: string;
    headerAction?: React.ReactNode;
}) => {
    if (!isVisible) return null;
    return (
         <div className={`bg-[#111623] border border-slate-800/60 rounded-xl flex flex-col shadow-sm overflow-hidden transition-all duration-300 hover:border-slate-700 ${className}`}>
            <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex justify-between items-center shrink-0 min-h-[48px]">
                <h3 className="text-slate-100 font-medium text-sm tracking-wide flex items-center gap-2 truncate uppercase">
                    {title}
                </h3>
                <div className="flex items-center gap-2">
                    {headerAction}
                    <button 
                        onClick={onClose} 
                        className="text-slate-600 hover:text-slate-400 transition-colors p-1 hover:bg-slate-800 rounded" 
                        title="Hide Widget"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className={`flex-1 min-h-0 ${contentClassName}`}>
                {children}
            </div>
        </div>
    )
}

const TrafficGraph = ({ history }: { history: { time: number, waiting: number, inControl: number }[] }) => {
    if (history.length < 2) return <div className="h-24 flex items-center justify-center text-xs text-slate-600">Initializing Timeline...</div>;

    const height = 80;
    const width = 100; 
    const maxVal = Math.max(...history.map(h => Math.max(h.waiting, h.inControl)), 10);
    
    const getPoints = (key: 'waiting' | 'inControl') => {
        return history.map((h, i) => {
            const x = (i / (history.length - 1)) * width;
            const y = height - (h[key] / maxVal) * height;
            return `${x},${y}`;
        }).join(' ');
    };

    return (
        <div className="h-28 w-full px-2 pt-4 pb-2 relative bg-slate-900/20 rounded border border-slate-800/50">
            <div className="absolute top-2 left-2 flex gap-3 text-[10px] font-bold">
                 <div className="flex items-center gap-1 text-amber-400"><div className="w-2 h-0.5 bg-amber-400"></div> Queue Load</div>
                 <div className="flex items-center gap-1 text-blue-400"><div className="w-2 h-0.5 bg-blue-400"></div> Active Checks</div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                 <line x1="0" y1={height} x2={width} y2={height} stroke="#334155" strokeWidth="0.5" />
                 <line x1="0" y1="0" x2={width} y2="0" stroke="#334155" strokeWidth="0.5" strokeDasharray="2,2" />
                 <polyline fill="none" stroke="#FBBF24" strokeWidth="2" points={getPoints('waiting')} vectorEffect="non-scaling-stroke" className="drop-shadow-md" />
                 <polyline fill="none" stroke="#60A5FA" strokeWidth="2" points={getPoints('inControl')} vectorEffect="non-scaling-stroke" className="drop-shadow-md" />
            </svg>
        </div>
    );
};

const MetricsWidget = ({
    revenueHistory,
    throughputHistory,
    lang
}: {
    revenueHistory: { time: number, amount: number }[],
    throughputHistory: { time: number, entry: number, exit: number }[],
    lang: Language
}) => {
    if (revenueHistory.length < 2) return <div className="h-32 flex items-center justify-center text-xs text-slate-600">Collecting Agency Data...</div>;

    const height = 100;
    const width = 100;

    // Revenue Chart Helpers (Line)
    const maxRev = Math.max(...revenueHistory.map(h => h.amount), 1000);
    const revPoints = revenueHistory.map((h, i) => {
        const x = (i / (revenueHistory.length - 1)) * width;
        const y = height - (h.amount / maxRev) * height;
        return `${x},${y}`;
    }).join(' ');

    // Throughput Chart Helpers (Bar/Line hybrid for simplicity)
    const maxThru = Math.max(...throughputHistory.map(h => Math.max(h.entry, h.exit)), 5);
    const entryPoints = throughputHistory.map((h, i) => {
        const x = (i / (throughputHistory.length - 1)) * width;
        const y = height - (h.entry / maxThru) * height;
        return `${x},${y}`;
    }).join(' ');
    const exitPoints = throughputHistory.map((h, i) => {
        const x = (i / (throughputHistory.length - 1)) * width;
        const y = height - (h.exit / maxThru) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <div>
        <details className="mb-2 px-2 pt-2">
          <summary className="text-[9px] text-slate-600 cursor-pointer hover:text-slate-400 select-none">
            {lang === 'EN' ? '▸ What is this?' : lang === 'RO' ? '▸ Ce este aceasta?' : lang === 'FR' ? "▸ Qu'est-ce que c'est ?" : '▸ Что это?'}
          </summary>
          <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
            {lang === 'EN' ? 'Revenue collected (€) from customs duties, VAT and excise on cleared goods, plotted over the last 10 minutes. Throughput shows vehicles cleared per minute. Click a data point on any chart to see the exact value.' : lang === 'RO' ? 'Venituri colectate (€) din taxe vamale, TVA și accize pe mărfuri eliberate, reprezentate grafic pe ultimele 10 minute. Debitul arată vehicule eliberate pe minut. Click pe un punct de date pentru a vedea valoarea exactă.' : lang === 'FR' ? 'Recettes collectées (€) en droits de douane, TVA et accises sur les marchandises libérées, tracées sur les 10 dernières minutes. Le débit montre les véhicules libérés par minute. Cliquez sur un point pour voir la valeur exacte.' : 'Собранные доходы (€) от таможенных пошлин, НДС и акцизов по выпущенным товарам за последние 10 минут. Пропускная способность — выпущенные ТС в минуту. Нажмите на точку данных для отображения точного значения.'}
          </p>
        </details>
        <div className="grid grid-cols-2 gap-4 h-40">
            {/* Border Control Throughput */}
            <div className="bg-slate-900/20 rounded border border-slate-800/50 p-3 relative flex flex-col">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Border Flux (Veh/min)</span>
                    <div className="flex gap-2 text-[9px]">
                        <span className="text-emerald-400 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>Entry</span>
                        <span className="text-blue-400 flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>Exit</span>
                    </div>
                </div>
                <div className="flex-1 w-full relative">
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <line x1="0" y1={height} x2={width} y2={height} stroke="#334155" strokeWidth="1" />
                         {/* Entry Line */}
                        <polyline fill="none" stroke="#10b981" strokeWidth="2" points={entryPoints} vectorEffect="non-scaling-stroke" className="opacity-80" />
                        <polygon points={`${entryPoints} ${width},${height} 0,${height}`} fill="url(#gradEntry)" className="opacity-20" />
                        {/* Exit Line */}
                        <polyline fill="none" stroke="#3b82f6" strokeWidth="2" points={exitPoints} vectorEffect="non-scaling-stroke" className="opacity-80" />
                        
                        <defs>
                            <linearGradient id="gradEntry" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
            </div>

            {/* Customs Revenue */}
            <div className="bg-slate-900/20 rounded border border-slate-800/50 p-3 relative flex flex-col">
                <div className="flex justify-between items-start mb-2">
                     <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Revenue Velocity (EUR)</span>
                     <span className="text-[9px] font-mono text-indigo-400 font-bold">
                         €{revenueHistory[revenueHistory.length-1]?.amount.toLocaleString() || 0}
                     </span>
                </div>
                <div className="flex-1 w-full relative">
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <line x1="0" y1={height} x2={width} y2={height} stroke="#334155" strokeWidth="1" />
                        <polyline fill="none" stroke="#6366f1" strokeWidth="2" points={revPoints} vectorEffect="non-scaling-stroke" />
                        <polygon points={`${revPoints} ${width},${height} 0,${height}`} fill="url(#gradRev)" className="opacity-20" />
                        <defs>
                            <linearGradient id="gradRev" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.5" />
                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
            </div>
        </div>
        </div>
    );
}

const LaneBox: React.FC<{ lane: Lane, vehicles: Vehicle[] }> = ({ lane, vehicles }) => {
    const laneVehicles = vehicles.filter(v => v.laneId === lane.id && v.status !== 'cleared');
    const waitingCount = laneVehicles.filter(v => v.status.startsWith('waiting')).length;
    const hasHighRisk = laneVehicles.some(v => v.risk === 'High');
    
    let bgClass = 'bg-green-500/10 text-green-400 border-green-500/20';
    if (!lane.isOpen) {
         bgClass = 'bg-slate-800/50 text-slate-600 border-slate-700 border-dashed';
    } else if (waitingCount > 5) {
        bgClass = 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse';
    } else if (waitingCount > 2) {
        bgClass = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    }

    return (
        <div className={`h-8 rounded border flex flex-col items-center justify-center relative ${bgClass} transition-all duration-300`}>
            <div className="text-[8px] font-bold uppercase">{lane.name.split('-')[1]}</div>
            {hasHighRisk && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[#111623] animate-bounce"></div>
            )}
        </div>
    );
};

const LaneMiniMap = ({ lanes, vehicles }: { lanes: Lane[], vehicles: Vehicle[] }) => {
    const entryLanes = lanes.filter(l => l.direction === 'entry');
    const exitLanes = lanes.filter(l => l.direction === 'exit');

    return (
        <div className="space-y-2 select-none">
             <div className="grid grid-cols-4 gap-1">
                 {entryLanes.map(l => <LaneBox key={l.id} lane={l} vehicles={vehicles} />)}
             </div>
             <div className="w-full h-[1px] bg-slate-800/50 my-1"></div>
             <div className="grid grid-cols-4 gap-1">
                 {exitLanes.map(l => <LaneBox key={l.id} lane={l} vehicles={vehicles} />)}
             </div>
        </div>
    );
};

const AlertFeed = ({ alerts, selectedBCP }: { alerts: Alert[]; selectedBCP?: string }) => {
    const [sevFilter, setSevFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
    const [scope, setScope] = useState<'BCP' | 'NET'>('BCP');
    const scopedAlerts = (selectedBCP && scope === 'BCP')
        ? alerts.filter(a => !a.bcpId || a.bcpId === selectedBCP)
        : alerts;
    const filtered = sevFilter === 'ALL' ? scopedAlerts : scopedAlerts.filter(a => a.severity === sevFilter);
    const typeIcon: Record<string, string> = { SECURITY: '🔒', CUSTOMS: '📦', SYSTEM: '⚙️' };
    const bcpShortName = selectedBCP ? (BCPS.find(b => b.id === selectedBCP)?.name.split(' (')[0] ?? selectedBCP.replace('BCP_', '')) : null;
    return (
        <div>
            {/* Header with BCP/NETWORK scope toggle */}
            <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-800/40">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[8px] text-amber-500/80 uppercase font-bold tracking-wider">Enforcement Incident Log</span>
                {selectedBCP ? (
                    <div className="flex gap-0.5 ml-auto">
                        <button onClick={() => setScope('BCP')} className={`text-[7px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                            scope === 'BCP' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-transparent text-slate-600 border-slate-800 hover:text-slate-400'
                        }`}>{bcpShortName ?? 'BCP'}</button>
                        <button onClick={() => setScope('NET')} className={`text-[7px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                            scope === 'NET' ? 'bg-violet-500/20 text-violet-300 border-violet-500/40' : 'bg-transparent text-slate-600 border-slate-800 hover:text-slate-400'
                        }`}>NETWORK</button>
                    </div>
                ) : (
                    <span className="text-[7px] text-slate-700 ml-auto">auto-generated · audit trail</span>
                )}
            </div>
            {/* Severity filter */}
            <div className="flex gap-1 mb-2">
                {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(s => {
                    const cnt = s === 'ALL' ? scopedAlerts.length : scopedAlerts.filter(a => a.severity === s).length;
                    const activeClass = s === 'HIGH'   ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : s === 'MEDIUM' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : s === 'LOW'    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        : 'bg-slate-700/60 text-slate-300 border-slate-600';
                    return (
                        <button key={s} onClick={() => setSevFilter(s)} className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                            sevFilter === s ? activeClass : 'bg-transparent text-slate-600 border-slate-800 hover:text-slate-400'
                        }`}>{s} <span className="opacity-60">{cnt}</span></button>
                    );
                })}
            </div>
            {filtered.length === 0
                ? <div className="text-center py-4 text-slate-600 text-xs">No {sevFilter === 'ALL' ? '' : sevFilter.toLowerCase() + ' '}incidents recorded</div>
                : <div className="space-y-1.5 overflow-y-auto custom-scrollbar pr-1 max-h-[180px]">
                    {filtered.map(alert => (
                        <div key={alert.id} className={`p-2 rounded-lg bg-slate-900/60 border-l-2 border flex flex-col animate-in slide-in-from-right-2 duration-300 ${
                            alert.severity === 'HIGH'   ? 'border-l-red-500 border-y-red-500/10 border-r-red-500/10' :
                            alert.severity === 'MEDIUM' ? 'border-l-amber-500 border-y-amber-500/10 border-r-amber-500/10' :
                            'border-l-blue-500 border-y-blue-500/10 border-r-blue-500/10'
                        }`}>
                            <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[9px]">{typeIcon[alert.type] ?? '⚡'}</span>
                                <span className={`text-[8px] font-bold uppercase tracking-wide ${
                                    alert.severity === 'HIGH'   ? 'text-red-400' :
                                    alert.severity === 'MEDIUM' ? 'text-amber-400' : 'text-blue-400'
                                }`}>{alert.severity}</span>
                                <span className="text-[7px] text-slate-600 bg-slate-800/80 px-1 py-px rounded border border-slate-700/40 uppercase font-mono">{alert.type}</span>
                                {alert.bcpId && <span className="text-[7px] text-slate-600 bg-slate-800/80 px-1 py-px rounded border border-slate-700/40 font-mono">{alert.bcpId.replace('BCP_','')}</span>}
                                <span className="text-[7px] text-slate-700 ml-auto font-mono">{new Date(alert.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
                            </div>
                            <div className="text-[9px] font-semibold text-slate-200 leading-tight">{alert.title}</div>
                            <div className="text-[8px] text-slate-500 leading-tight mt-0.5">{alert.message}</div>
                        </div>
                    ))}
                </div>
            }
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    let color = "text-slate-500 bg-slate-500/10 border-slate-500/20";
    if (status === "Verified") color = "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    if (status === "Failed") color = "text-red-400 bg-red-400/10 border-red-400/20";
    if (status === "Pending") color = "text-amber-400 bg-amber-400/10 border-amber-400/20";

    return (
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${color}`}>
            {status}
        </span>
    );
};

// Helper to calculate dynamic service time
const calculateDynamicServiceTime = (baseTime: number, risk: RiskLevel, queueLength: number) => {
    let multiplier = 1.0;
    if (risk === 'High') multiplier *= 2.5;
    else if (risk === 'Medium') multiplier *= 1.5;
    if (risk !== 'High') {
        if (queueLength > 8) multiplier *= 0.6;      
        else if (queueLength > 4) multiplier *= 0.8; 
    }
    const variance = 0.85 + Math.random() * 0.3;
    return Math.max(2, baseTime * multiplier * variance);
};

interface LaneVisualProps {
  lane: Lane;
  vehicles: Vehicle[];
  onVehicleSelect: (id: string) => void;
  selectedVehicleId: string | null;
}

const LaneVisual: React.FC<LaneVisualProps> = ({ lane, vehicles, onVehicleSelect, selectedVehicleId }) => {
  const isEntry = lane.direction === "entry";
  
  const waitingBorder = vehicles.filter(v => v.status === "waiting_border").slice(0, 5);
  const inBorder = vehicles.find(v => v.status === "in_border");
  
  const waitingCustoms = vehicles.filter(v => v.status === "waiting_customs").slice(0, 4);
  const inCustoms = vehicles.find(v => v.status === "in_customs");

  const getDotColor = (risk: RiskLevel) => {
    switch(risk) {
      case 'Low': return 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] border border-green-400/50';
      case 'Medium': return 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)] border border-yellow-400/50';
      case 'High': return 'bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.6)] border border-red-400/50';
    }
  };
  
  const getProgressColor = (risk: RiskLevel) => {
      switch(risk) {
        case 'Low': return 'bg-green-500';
        case 'Medium': return 'bg-yellow-500';
        case 'High': return 'bg-red-500';
      }
  };

  const getVehicleWidth = (type: string) => {
      switch(type) {
          case 'truck': return 'w-10';
          case 'bus': return 'w-8';
          default: return 'w-5';
      }
  };

  const VehicleDot: React.FC<{ v: Vehicle }> = ({ v }) => {
    const isSelected = selectedVehicleId === v.id;
    // Neutral color for queue to hide risk assessment until control point
    const neutralColor = 'bg-slate-600 border border-slate-500/50 shadow-sm';

    return (
        <div 
            onClick={(e) => { e.stopPropagation(); onVehicleSelect(v.id); }}
            className={`h-5 ${getVehicleWidth(v.vehicleType)} rounded-[2px] ${neutralColor} 
            transition-all duration-300 relative group/veh shrink-0 cursor-pointer 
            ${isSelected 
                ? 'ring-2 ring-white scale-125 z-30 shadow-[0_0_12px_rgba(255,255,255,0.6)] bg-slate-500' 
                : 'hover:scale-110 hover:ring-2 hover:ring-white/60 hover:shadow-[0_0_10px_rgba(255,255,255,0.3)] z-10'
            }`} 
            title={v.plate}
        >
            <div className={`absolute top-0 bottom-0 w-1 bg-black/30 ${isEntry ? 'right-0 rounded-r-[1px]' : 'left-0 rounded-l-[1px]'}`}></div>
        </div>
    );
  };

  const Booth = ({ type, activeVehicle, label }: { type: 'border' | 'customs', activeVehicle?: Vehicle, label: string }) => {
      let progress = 0;
      if (activeVehicle) {
          const start = type === 'border' ? activeVehicle.startBorderTime : activeVehicle.startCustomsTime;
          const duration = type === 'border' ? (activeVehicle.assignedBorderDuration || 10) : (activeVehicle.assignedCustomsDuration || 10);
          if (start) {
              const elapsed = (Date.now() - start) / 1000;
              progress = Math.min(100, (elapsed / duration) * 100);
          }
      }

      return (
          <div 
            className={`relative h-full w-20 flex flex-col items-center justify-center shrink-0 border-x border-slate-700 ${type === 'border' ? 'bg-blue-950/40' : 'bg-indigo-950/40'}`}
            onClick={(e) => { if(activeVehicle) { e.stopPropagation(); onVehicleSelect(activeVehicle.id); } }}
          >
                <div className="absolute top-1 text-[9px] font-bold text-slate-400 uppercase tracking-tight">{label}</div>
                <div className={`absolute ${isEntry ? 'right-0' : 'left-0'} top-4 bottom-4 w-1 ${activeVehicle ? 'bg-red-500' : 'bg-emerald-500/50'} transition-colors shadow-sm`}></div>
                {activeVehicle ? (
                    <div className={`h-6 ${getVehicleWidth(activeVehicle.vehicleType)} rounded-sm ${getDotColor(activeVehicle.risk)} 
                        ${selectedVehicleId === activeVehicle.id ? 'ring-2 ring-white' : 'animate-pulse'} 
                        z-20 flex items-center justify-center relative overflow-hidden cursor-pointer`}
                    >
                        <div className="w-[60%] h-[1px] bg-white/30"></div>
                    </div>
                ) : (
                    <div className="w-2 h-2 bg-slate-700/50 rounded-full border border-slate-600"></div>
                )}
                {activeVehicle && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-800/50 w-full">
                        <div 
                            className={`h-full transition-all duration-500 ease-linear ${getProgressColor(activeVehicle.risk)}`} 
                            style={{ width: `${progress}%` }} 
                        />
                    </div>
                )}
          </div>
      );
  };

  return (
    <div className="flex items-center gap-3 mb-3 w-full select-none">
      <div className="w-10 flex flex-col items-center justify-center shrink-0 bg-slate-800/30 rounded p-1 border border-slate-700/50">
          <div className="text-[10px] font-black text-slate-400 uppercase">{lane.id.split('_')[2]}</div>
          <div className={`text-[8px] font-bold uppercase ${lane.isOpen ? 'text-emerald-500' : 'text-red-500'}`}>{lane.vehicleType.slice(0,3)}</div>
      </div>
      <div className="relative flex-1 h-14 bg-[#0F172A] border border-slate-800 rounded-md overflow-hidden shadow-inner">
        <div className={`w-full h-full flex items-stretch ${isEntry ? 'flex-row' : 'flex-row-reverse'}`}>
            <div className={`flex-1 flex items-center px-3 relative group transition-colors ${isEntry ? 'bg-gradient-to-r from-transparent to-slate-800/40 justify-end' : 'bg-gradient-to-l from-transparent to-slate-800/40 justify-end'}`}>
                <div className={`absolute bottom-1 ${isEntry ? 'right-2' : 'left-2'} text-[9px] font-bold text-slate-600/50 uppercase tracking-widest`}>Immigration Queue</div>
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-slate-800/50"></div>
                <div className="flex items-center gap-1.5 relative z-10">
                   {waitingBorder.map((v, idx) => <VehicleDot key={v.id} v={v} />)}
                </div>
            </div>
            <Booth type="border" activeVehicle={inBorder} label="Passport" />
            <div className={`w-40 flex items-center px-2 relative border-x border-slate-800 ${isEntry ? 'justify-end' : 'justify-end'}`}>
                 <div className="absolute inset-0 bg-indigo-900/5"></div>
                 <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #fff 0, #fff 1px, transparent 0, transparent 10px)' }}></div>
                 <div className={`absolute top-1 ${isEntry ? 'right-2' : 'left-2'} text-[8px] font-bold text-indigo-400/30 uppercase tracking-wider`}>Customs Control</div>
                 <div className="flex items-center gap-1.5 relative z-10">
                     {waitingCustoms.map((v, idx) => <VehicleDot key={v.id} v={v} />)}
                 </div>
            </div>
            <Booth type="customs" activeVehicle={inCustoms} label="Inspection" />
             <div className={`w-12 flex items-center justify-center bg-slate-900/50 ${isEntry ? 'border-l' : 'border-r'} border-slate-800`}>
                 <div className={`p-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-600`}>
                     <svg className={`w-3 h-3 ${isEntry ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                     </svg>
                 </div>
             </div>
        </div>
      </div>
    </div>
  );
};

const NetworkPerformanceWidget = ({
    bcps,
    bcpStats,
    vehicles,
    onSelectBcp,
    selectedBcpId,
    lang
}: {
    bcps: typeof BCPS,
    bcpStats: Record<string, { cleared: number, highRisk: number }>,
    vehicles: Vehicle[],
    onSelectBcp: (id: string) => void,
    selectedBcpId: string,
    lang: Language
}) => {
    return (
        <div className="overflow-x-auto">
        <details className="mb-2 px-2 pt-2">
          <summary className="text-[9px] text-slate-600 cursor-pointer hover:text-slate-400 select-none">
            {lang === 'EN' ? '▸ What is this?' : lang === 'RO' ? '▸ Ce este aceasta?' : lang === 'FR' ? "▸ Qu'est-ce que c'est ?" : '▸ Что это?'}
          </summary>
          <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">
            {lang === 'EN' ? 'Shows live performance metrics for all checkpoints (BCPs) in the network. Each bar represents vehicle throughput (cleared/hour) and high-risk count. Click a BCP to select it as the active checkpoint.' : lang === 'RO' ? 'Afișează metricile de performanță live pentru toate punctele de trecere (BCP) din rețea. Fiecare bară reprezintă debitul vehiculelor (eliberate/oră) și numărul cu risc ridicat. Click pe un BCP pentru a-l selecta ca punct activ.' : lang === 'FR' ? 'Affiche les métriques de performance en direct pour tous les postes de passage (PdP) du réseau. Chaque barre représente le débit de véhicules (libérés/heure) et le nombre à haut risque. Cliquez sur un PdP pour le sélectionner.' : 'Показывает живые показатели производительности для всех КПП в сети. Каждый столбец — пропускная способность ТС (выпущено/час) и количество высокорисковых. Нажмите на КПП для выбора.'}
          </p>
        </details>
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800 bg-slate-900/50">
                        <th className="p-2 font-medium">Checkpoint</th>
                        <th className="p-2 font-medium text-right">Traffic Load</th>
                        <th className="p-2 font-medium text-right">Cleared</th>
                        <th className="p-2 font-medium text-right">Avg Wait</th>
                        <th className="p-2 font-medium text-right">Risks</th>
                        <th className="p-2 font-medium text-center">Status</th>
                    </tr>
                </thead>
                <tbody className="text-xs">
                    {bcps.map(bcp => {
                        const bcpVehicles = vehicles.filter(v => v.bcpId === bcp.id);
                        const waiting = bcpVehicles.filter(v => v.status.includes('waiting')).length;
                        const active = bcpVehicles.filter(v => v.status.includes('in_')).length;
                        const cleared = bcpStats[bcp.id]?.cleared || 0;
                        const risks = bcpStats[bcp.id]?.highRisk || 0;
                        
                        const waitingVehicles = bcpVehicles.filter(v => v.status.includes('waiting'));
                        const avgWait = waitingVehicles.length > 0 
                            ? waitingVehicles.reduce((acc, v) => acc + (Date.now() - v.arrivalTime), 0) / waitingVehicles.length / 1000 
                            : 0;

                        const isSelected = bcp.id === selectedBcpId;
                        
                        return (
                            <tr 
                                key={bcp.id} 
                                onClick={() => onSelectBcp(bcp.id)}
                                className={`border-b border-slate-800/50 transition-colors cursor-pointer group ${isSelected ? 'bg-blue-900/10' : 'hover:bg-slate-800/30'}`}
                            >
                                <td className="p-2">
                                    <div className={`font-medium ${isSelected ? 'text-blue-400' : 'text-slate-300'}`}>{bcp.name}</div>
                                    <div className="text-[9px] text-slate-600">{bcp.countryA} &rarr; {bcp.countryB}</div>
                                </td>
                                <td className="p-2 text-right">
                                    <div className="text-slate-300">{waiting + active} <span className="text-[9px] text-slate-600">actv</span></div>
                                </td>
                                <td className="p-2 text-right font-mono text-slate-400">{cleared}</td>
                                <td className="p-2 text-right">
                                    <span className={`${avgWait > 60 ? 'text-red-400' : avgWait > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        {avgWait.toFixed(0)}s
                                    </span>
                                </td>
                                <td className="p-2 text-right">
                                    {risks > 0 ? (
                                        <span className="bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded text-[10px] font-bold border border-red-500/20">{risks}</span>
                                    ) : <span className="text-slate-600">-</span>}
                                </td>
                                <td className="p-2 text-center">
                                    <div className={`w-2 h-2 rounded-full mx-auto ${waiting > 10 ? 'bg-red-500 animate-pulse' : waiting > 5 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    )
}

const BiometricTypeIcon = ({ type }: { type: 'FACE' | 'IRIS' | 'PRINT' }) => {
    switch (type) {
        case 'FACE':
            return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        case 'IRIS':
            return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
        case 'PRINT':
             return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>;
    }
    return null;
};

const VehicleTypeFilterIcon = ({ type, active }: { type: 'all' | VehicleType, active: boolean }) => {
    const colorClass = active ? 'text-blue-400' : 'text-slate-500';
    switch (type) {
        case 'all':
            return <svg className={`w-3.5 h-3.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>;
        case 'truck':
            return <svg className={`w-3.5 h-3.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
        case 'car':
            return <svg className={`w-3.5 h-3.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 7H4a1 1 0 00-1 1v7a1 1 0 001 1h1a2 2 0 004 0h6a2 2 0 004 0h1a1 1 0 001-1V9a1 1 0 00-1-1h-3M10 7v3m0-3h3m0 0l3.5 3" /></svg>;
        case 'bus':
            return <svg className={`w-3.5 h-3.5 ${colorClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8a2 2 0 012 2v9H6V9a2 2 0 012-2zM8 7V5a2 2 0 012-2h4a2 2 0 012 2v2M9 11h.01M15 11h.01M9 15h.01M15 15h.01" /></svg>;
    }
};

const BiometricRow = ({ 
    label, 
    type, 
    data, 
    startTime,
    onGenerateSample
}: { 
    label: string, 
    type: 'FACE' | 'IRIS' | 'PRINT', 
    data: BiometricDetail, 
    startTime?: number,
    onGenerateSample: () => void
}) => {
    const [expanded, setExpanded] = useState(false);
    const [now, setNow] = useState(Date.now());

    const TIMEOUT_MS = 5000;

    useEffect(() => {
        if (data.status === 'Pending' && startTime) {
            const interval = setInterval(() => setNow(Date.now()), 50);
            return () => clearInterval(interval);
        }
    }, [data.status, startTime]);

    let displayStatus = data.status;
    let displayConfidence = data.confidence;
    let displayErrorCode = data.errorCode;
    let displayReason = data.reason;
    let timeLeft = 0;

    if (data.status === 'Pending' && startTime) {
        const elapsed = now - startTime;
        if (elapsed >= TIMEOUT_MS) {
            displayStatus = 'Failed';
            displayConfidence = 15; // Simulate low confidence on timeout
            displayErrorCode = 'SYS-TO-408';
            displayReason = 'Verification session timeout: Input stale';
        } else {
            displayStatus = 'Pending';
            timeLeft = Math.max(0, TIMEOUT_MS - elapsed);
        }
    }

    const steps = useMemo(() => {
        if (!startTime) return [];
        const baseStatus = displayStatus === 'Verified' ? 'Success' : displayStatus === 'Failed' ? 'Failure' : 'Pending';
        const sysId = Math.floor(startTime / 1000).toString(16).toUpperCase();
        return [
            { label: 'System Initialization', delay: 0, status: 'Completed', color: 'bg-emerald-500', log: `SYS_BOOT_OK | ID: ${sysId} | KERNEL: 4.14-LTS` },
            { label: 'Sensor Acquisition', delay: 800, status: 'Completed', color: 'bg-emerald-500', log: 'SNR_GAIN_ADJ: 14dB | CALIBRATION: PASS | FRAME_READY' },
            { label: 'Feature Extraction', delay: 2100, status: 'Completed', color: 'bg-emerald-500', log: 'VEC_GEN_512BIT | MINUTIAE_NODES: 124 | ENTROPY: 0.94' },
            { label: 'Database Matching (1:N)', delay: 3400, status: 'Completed', color: 'bg-emerald-500', log: 'DB_QUERY: 0.32s | MATCHES: 1 | RANK: 1 | SCORE: 0.89' },
            { label: 'Final Adjudication', delay: 4200, status: baseStatus, color: baseStatus === 'Success' ? 'bg-emerald-500' : baseStatus === 'Failure' ? 'bg-red-500' : 'bg-amber-500', log: baseStatus === 'Failure' ? `ERROR: ${displayReason} (${displayErrorCode})` : `ADJUDICATION_RESULT: ${displayStatus.toUpperCase()} | SIG: ${displayConfidence}%` }
        ];
    }, [startTime, displayStatus, displayReason, displayErrorCode, displayConfidence]);

    return (
        <div className="bg-[#0F1520] p-2.5 rounded border border-slate-800 mb-2 hover:border-slate-700 transition-colors group relative overflow-hidden">
            {displayStatus === 'Failed' && <div className="absolute inset-0 bg-red-500/5 pointer-events-none"></div>}
            
            <div className="flex items-center justify-between mb-2 relative z-10">
                <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded bg-slate-900 border border-slate-800 ${displayStatus === 'Failed' ? 'text-red-400 border-red-500/30' : 'text-slate-400 group-hover:text-blue-400'}`}>
                        <BiometricTypeIcon type={type} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-300 tracking-wider flex items-center gap-1">
                            {label}
                        </span>
                        <span className="text-[9px] text-slate-500">
                            {displayStatus === 'Pending' ? 'Time Remaining' : 'Confidence Score'}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                     <button 
                        onClick={(e) => { e.stopPropagation(); onGenerateSample(); }}
                        className="bg-slate-800 text-slate-500 border border-slate-700 hover:text-blue-400 hover:border-blue-500/50 p-1 rounded transition-colors group/sim"
                        title="Generate Sample Data"
                    >
                         <svg className="w-3.5 h-3.5 group-hover/sim:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                         </svg>
                    </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider transition-colors ${expanded ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300 hover:bg-slate-700'}`}
                        title={expanded ? "Hide Audit Log" : "View Audit Log"}
                    >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                        Audit
                    </button>
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                        displayStatus === 'Verified' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                        displayStatus === 'Failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                        {displayStatus === 'Verified' && (
                             <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                 <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                             </svg>
                        )}
                        {displayStatus === 'Failed' && (
                            <svg className="w-3.5 h-3.5 text-red-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        )}
                        {displayStatus === 'Pending' && (
                            <svg className="w-3.5 h-3.5 text-amber-400 animate-[spin_3s_linear_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        )}
                        {displayStatus.toUpperCase()}
                        {displayStatus === 'Failed' && displayErrorCode && (
                            <span className="ml-1 opacity-80 border-l border-red-400/30 pl-1.5 font-mono">[{displayErrorCode}]</span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3 relative z-10">
                <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                    <div 
                        className={`h-full rounded-full ${
                            displayStatus === 'Verified' ? 'bg-emerald-500' : 
                            displayStatus === 'Failed' ? 'bg-red-500' : 
                            'bg-amber-500'
                        } transition-all duration-200 ease-linear`} 
                        style={{ width: `${displayStatus === 'Pending' ? ((1 - timeLeft/TIMEOUT_MS) * 100) : displayConfidence}%` }}
                    />
                </div>
                <span className={`text-[10px] font-mono font-bold w-9 text-right ${
                    displayStatus === 'Verified' ? 'text-emerald-500' : 
                    displayStatus === 'Failed' ? 'text-red-500' : 
                    'text-amber-500'
                }`}>
                    {displayStatus === 'Pending' ? `${(timeLeft/1000).toFixed(1)}s` : `${displayConfidence}%`}
                </span>
            </div>

            {expanded && startTime && (
                <div className="mt-3 pt-2 border-t border-slate-800/50 animate-in slide-in-from-top-1 duration-200">
                    <div className="bg-slate-950/50 rounded p-2 border border-slate-800/30">
                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-800/30">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Verification Audit Trail</span>
                            <span className="text-[9px] font-mono text-slate-600">ID: {Math.random().toString(36).substring(2, 10).toUpperCase()}</span>
                        </div>
                        <div className="space-y-2 relative">
                            <div className="absolute left-[53px] top-1 bottom-1 w-px bg-slate-800"></div>
                            {steps.map((step, i) => {
                                const stepDone = (now - startTime) > step.delay;
                                const isFuture = !stepDone;
                                let currentStepColor = step.color;
                                if (isFuture) currentStepColor = 'bg-slate-800';

                                return (
                                    <div key={i} className="flex items-center gap-3 text-[9px] relative z-10">
                                        <div className={`w-10 text-right font-mono ${isFuture ? 'text-slate-700' : 'text-slate-500'}`}>
                                            T+{step.delay}ms
                                        </div>
                                        <div className={`w-2 h-2 rounded-full shrink-0 ${currentStepColor} ${!isFuture ? 'shadow-[0_0_5px_rgba(0,0,0,0.5)]' : ''}`}></div>
                                        <div className="flex flex-col">
                                            <div className={`${step.status === 'Failure' && stepDone ? 'text-red-400 font-bold' : step.status === 'Success' && stepDone ? 'text-emerald-400' : isFuture ? 'text-slate-700' : 'text-slate-400'}`}>
                                                {step.label}
                                            </div>
                                            {stepDone && <div className={`text-[8px] font-mono ${step.status === 'Failure' ? 'text-red-500/80' : 'text-slate-600'}`}>{step.log}</div>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const VehicleHistoryPanel: React.FC<{ 
    vehicle: Vehicle | undefined; 
    declaration?: Declaration; 
    alerts: Alert[];
    onUpdateBiometric: (type: 'face' | 'iris' | 'fingerprints', detail: BiometricDetail) => void;
}> = ({ vehicle, declaration, alerts, onUpdateBiometric }) => {
    if (!vehicle) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
                <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <p className="text-sm">Select a vehicle to access Joint Intelligence File.</p>
            </div>
        );
    }
    
    const relatedAlerts = alerts.filter(a => 
        a.message.includes(vehicle.plate) || 
        a.title.includes(vehicle.plate) ||
        (declaration && a.message.includes(declaration.mrn))
    );
    
    const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <h2 className="text-2xl font-mono text-slate-100 tracking-tight">{vehicle.plate}</h2>
                        <div className="text-xs text-blue-400 uppercase font-bold mt-0.5">{vehicle.subType}</div>
                        <div className="text-[10px] text-slate-500 uppercase font-medium mt-1">{vehicle.companyName}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                        <div className={`px-2 py-1 rounded border text-xs font-bold uppercase ${
                            vehicle.risk === 'High' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            vehicle.risk === 'Medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                            'bg-green-500/20 text-green-400 border-green-500/30'
                        }`}>
                            {vehicle.risk} Risk
                        </div>
                        <div className="flex items-center text-[10px] text-slate-400 gap-1 font-mono">
                            <span>{vehicle.origin.substring(0,3).toUpperCase()}</span>
                            <span className="text-slate-600">&rarr;</span>
                            <span>{vehicle.destination.substring(0,3).toUpperCase()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap">
                    {vehicle.watchlistHit && <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/20">WATCHLIST</span>}
                    {vehicle.bioMismatch && <span className="text-[10px] bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded border border-red-500/20">BIO MISMATCH</span>}
                </div>
            </div>

            {relatedAlerts.length > 0 && (
                <div className="px-4 py-3 border-b border-slate-800 bg-red-500/5">
                    <div className="flex items-center gap-2 mb-2 text-[10px] font-bold text-red-400 uppercase tracking-wider">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        Active Enforcement Alerts
                    </div>
                    <div className="space-y-2">
                        {relatedAlerts.map(alert => (
                            <div key={alert.id} className={`p-2 rounded border text-xs ${
                                alert.severity === 'HIGH' ? 'bg-red-950/40 border-red-500/30 text-red-200' :
                                'bg-amber-950/40 border-amber-500/30 text-amber-200'
                            }`}>
                                <div className="flex justify-between items-start">
                                    <span className="font-bold">{alert.title}</span>
                                    <span className="text-[9px] opacity-70">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                </div>
                                <div className="mt-0.5 opacity-90 leading-tight">{alert.message}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="relative pl-4 border-l border-slate-800 space-y-6">
                    <div className="relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-slate-600 ring-4 ring-[#111623]"></div>
                        <div className="text-xs text-slate-500 mb-0.5">{formatTime(vehicle.arrivalTime)}</div>
                        <div className="text-sm text-slate-200">Arrival Detected</div>
                    </div>
                    <div className="relative">
                        <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-[#111623] ${vehicle.startBorderTime ? 'bg-blue-500' : 'bg-slate-800'}`}></div>
                        {vehicle.startBorderTime ? (
                            <>
                                <div className="text-xs text-slate-500 mb-0.5">{formatTime(vehicle.startBorderTime)}</div>
                                <div className="text-sm text-slate-200 font-medium">Border Guard Control</div>
                                <div className="mt-2 bg-slate-800/50 p-2 rounded border border-slate-700/50 space-y-2">
                                    <div className="flex justify-between text-xs items-center">
                                        <span className="text-slate-500">Document Status</span>
                                        <StatusBadge status={vehicle.docStatus === 'Error' ? 'Failed' : vehicle.docStatus === 'Scanning' ? 'Pending' : 'Verified'} />
                                    </div>
                                    <div className="pt-2 border-t border-slate-700/30">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="text-[10px] text-slate-500 uppercase">Biometric Analysis</div>
                                            {vehicle.bioMismatch && <span className="text-[9px] font-bold text-red-400 animate-pulse">ANOMALY DETECTED</span>}
                                        </div>
                                        <div className="space-y-1">
                                            <BiometricRow 
                                                label="FACIAL RECOGNITION" 
                                                type="FACE" 
                                                data={vehicle.biometrics.face} 
                                                startTime={vehicle.startBorderTime} 
                                                onGenerateSample={() => onUpdateBiometric('face', generateBioDetail('FACE', 0.4, 0.1))}
                                            />
                                            <BiometricRow 
                                                label="IRIS SCAN" 
                                                type="IRIS" 
                                                data={vehicle.biometrics.iris} 
                                                startTime={vehicle.startBorderTime} 
                                                onGenerateSample={() => onUpdateBiometric('iris', generateBioDetail('IRIS', 0.4, 0.1))}
                                            />
                                            <BiometricRow 
                                                label="FINGERPRINT MATCH" 
                                                type="PRINT" 
                                                data={vehicle.biometrics.fingerprints} 
                                                startTime={vehicle.startBorderTime} 
                                                onGenerateSample={() => onUpdateBiometric('fingerprints', generateBioDetail('PRINT', 0.4, 0.1))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-slate-500">Waiting for Border Guard...</div>
                        )}
                    </div>
                    <div className="relative">
                        <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ring-4 ring-[#111623] ${vehicle.startCustomsTime ? 'bg-indigo-500' : 'bg-slate-800'}`}></div>
                        {vehicle.startCustomsTime ? (
                            <>
                                <div className="text-xs text-slate-500 mb-0.5">{formatTime(vehicle.startCustomsTime)}</div>
                                <div className="text-sm text-slate-200 font-medium">Customs Inspection</div>
                                {declaration && (
                                    <div className="mt-2 bg-slate-800/50 p-2 rounded border border-slate-700/50 space-y-2">
                                        <div className="text-xs text-slate-200 font-medium truncate" title={declaration.goodsDesc}>{declaration.goodsDesc}</div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">HS Code</span>
                                            <span className="text-blue-300 font-mono">{declaration.hsCode}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">Destination</span>
                                            <span className="text-slate-300">{declaration.destinationCountry}</span>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="text-sm text-slate-500">Pending Customs Handover...</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// NEW: Manual Declaration Form Component with Validation
const DeclarationForm = ({ onClose, onSubmit }: { onClose: () => void, onSubmit: (d: Declaration) => void }) => {
    const [data, setData] = useState<Partial<Declaration>>({
        mrn: `MD${Math.floor(Math.random() * 899999 + 100000)}`,
        traderName: '',
        aeo: 'NONE',
        flow: 'IMPORT',
        hsCode: '',
        goodsDesc: '',
        originCountry: '',
        destinationCountry: '',
        value: 0,
        weight: 0,
        vehiclePlate: ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const result = validateDeclaration(data);
        if (!result.isValid) {
            setErrors(result.errors);
            return;
        }

        // Calculate Risk based on manual input
        const hsRiskVal = HS_RISK[data.hsCode!] || 0.2;
        const originRiskVal = ORIGIN_RISK[data.originCountry!] || 0.2;
        const aeoMap: Record<string, number> = { "NONE": 0, "S": 1, "F": 2 };
        
        const features = {
            aeo: aeoMap[data.aeo as string] || 0,
            hsRisk: hsRiskVal,
            originRisk: originRiskVal,
            undervalPct: 0,
            pnrHit: false,
            docMismatch: false,
            watchlist: false,
            history: 0.1
        };

        const { score, band, channel, reasons } = calculateCustomsRisk(features);

        // Calculate Taxes
        const val = Number(data.value);
        const duties = Number((val * (0.03 + 0.07 * hsRiskVal)).toFixed(2));
        const vat = Number(((val + duties) * 0.19).toFixed(2));
        
        const finalDecl: Declaration = {
            ...data as any,
            id: `D_MANUAL_${Date.now()}`,
            value: val,
            weight: Number(data.weight),
            duties, 
            vat, 
            excise: 0,
            riskScore: score,
            riskBand: band,
            riskReasons: reasons,
            channel,
            status: 'SUBMITTED',
            vehicleType: 'truck', // Default assumption
            arrivalTime: Date.now()
        };
        onSubmit(finalDecl);
    };

    const Input = ({ label, field, type = "text", placeholder }: any) => (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase font-bold text-slate-500">{label}</label>
            <input 
                type={type} 
                value={data[field as keyof Declaration] || ''}
                onChange={e => {
                    const val = type === 'number' ? parseFloat(e.target.value) : e.target.value;
                    setData({...data, [field]: val});
                    // clear error
                    if(errors[field]) {
                        const newErrs = {...errors};
                        delete newErrs[field];
                        setErrors(newErrs);
                    }
                }}
                className={`bg-slate-900 border ${errors[field] ? 'border-red-500' : 'border-slate-700'} rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500`}
                placeholder={placeholder}
            />
            {errors[field] && <span className="text-[9px] text-red-400">{errors[field]}</span>}
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-[#111623] border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <h3 className="font-bold text-slate-100 flex items-center gap-2">
                        <span className="bg-blue-500 w-1 h-4 rounded-full"></span>
                        New Customs Declaration
                    </h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">&times;</button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        <Input label="MRN" field="mrn" />
                        <Input label="Vehicle Plate (Optional)" field="vehiclePlate" />
                    </div>
                    <Input label="Trader Name" field="traderName" />
                    <div className="grid grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">Flow</label>
                            <select value={data.flow} onChange={e => setData({...data, flow: e.target.value as any})} className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                                <option value="IMPORT">IMPORT</option>
                                <option value="EXPORT">EXPORT</option>
                                <option value="TRANSIT">TRANSIT</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500">AEO Status</label>
                            <select value={data.aeo} onChange={e => setData({...data, aeo: e.target.value as any})} className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                                <option value="NONE">None</option>
                                <option value="S">AEO-S</option>
                                <option value="F">AEO-F</option>
                            </select>
                        </div>
                         <Input label="HS Code" field="hsCode" placeholder="e.g. 8517" />
                    </div>
                    <Input label="Goods Description" field="goodsDesc" />
                     <div className="grid grid-cols-2 gap-4">
                        <Input label="Origin Country" field="originCountry" />
                        <Input label="Destination Country" field="destinationCountry" />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <Input label="Value (EUR)" field="value" type="number" />
                        <Input label="Weight (KG)" field="weight" type="number" />
                    </div>

                    {/* NCTS section — shown when flow = TRANSIT */}
                    {data.flow === 'TRANSIT' && (
                        <div className="rounded-lg border border-sky-800/40 bg-sky-950/20 p-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded">NCTS</span>
                                <span className="text-[10px] text-sky-300 font-bold uppercase tracking-wide">Transit Declaration (NCTS)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">Operation Type</label>
                                    <select value={(data as any).nctsOperation || 'T1'} onChange={e => setData({...data, nctsOperation: e.target.value as any} as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                                        <option value="T1">T1 — Non-EU goods</option>
                                        <option value="T2">T2 — EU goods</option>
                                        <option value="T2F">T2F — EU special territories</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">Guarantee Type</label>
                                    <select value={(data as any).nctsGuaranteeType || '1'} onChange={e => setData({...data, nctsGuaranteeType: e.target.value as any} as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200">
                                        <option value="0">0 — Exempt</option>
                                        <option value="1">1 — Comprehensive</option>
                                        <option value="2">2 — Individual</option>
                                        <option value="4">4 — Flat-rate</option>
                                        <option value="9">9 — Specific use</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">NCTS Ref. (auto)</label>
                                    <input readOnly value={`21MD${Math.floor(Math.random()*9000000000)+1000000000}`} className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-500 font-mono" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">Office of Destination</label>
                                    <input value={(data as any).nctsOfficeDestination || ''} onChange={e => setData({...data, nctsOfficeDestination: e.target.value} as any)} placeholder="e.g. ROCTG01" className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ICS2 section — shown when flow = IMPORT */}
                    {data.flow === 'IMPORT' && (
                        <div className="rounded-lg border border-violet-800/40 bg-violet-950/20 p-3 space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="text-[8px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded">ICS2</span>
                                <span className="text-[10px] text-violet-300 font-bold uppercase tracking-wide">Entry Summary Declaration (ICS2)</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">ENS Ref. (auto)</label>
                                    <input readOnly value={`21MD${Math.floor(Math.random()*9000000000)+1000000000}`} className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-500 font-mono" />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-500">Entry Office (EU)</label>
                                    <input value={(data as any).ics2EntryOffice || ''} onChange={e => setData({...data, ics2EntryOffice: e.target.value} as any)} placeholder="e.g. ROCTG01" className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200" />
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] uppercase font-bold text-slate-500">UCR — Unique Consignment Reference</label>
                                <input value={(data as any).ics2UCR || ''} onChange={e => setData({...data, ics2UCR: e.target.value} as any)} placeholder="e.g. MD2024/1234567890" className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200" />
                            </div>
                        </div>
                    )}
                </form>
                <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/30">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-500 shadow-lg shadow-blue-900/20">Submit Declaration</button>
                </div>
            </div>
        </div>
    )
};

// ─── Regression Engine ───────────────────────────────────────────────────────
interface RegResult { slope: number; intercept: number; r2: number; }

const linearRegression = (data: number[]): RegResult => {
  const n = data.length;
  if (n < 3) return { slope: 0, intercept: data[n - 1] ?? 0, r2: 0 };
  const meanX = (n - 1) / 2;
  const meanY = data.reduce((a, b) => a + b, 0) / n;
  let ssXY = 0, ssXX = 0, ssTot = 0;
  data.forEach((y, i) => { ssXY += (i - meanX) * (y - meanY); ssXX += (i - meanX) ** 2; ssTot += (y - meanY) ** 2; });
  const slope = ssXX > 0 ? ssXY / ssXX : 0;
  const intercept = meanY - slope * meanX;
  const ssRes = data.reduce((a, y, i) => a + (y - (intercept + slope * i)) ** 2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { slope, intercept, r2 };
};

const regPredict = (reg: RegResult, atIndex: number) =>
  Math.max(0, reg.intercept + reg.slope * atIndex);

export interface Predictions {
  queueNow: number; queue2m: number; queue5m: number; queue10m: number;
  waitNow: number;  wait2m: number;  wait5m: number;  wait10m: number;
  stressIndex: number;
  saturation: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'CRITICAL';
  r2: number; confidence: number;
  slope: number;
  waitReg: RegResult; queueReg: RegResult;
  queueHistory: number[]; waitHistory: number[];
}

// ─── Predictive Overlay — for Operational Coordination Officers ──────────────
const PredictiveOverlay: React.FC<{ pred: Predictions | null; lang: Language }> = ({ pred, lang }) => {
  if (!pred || pred.queueHistory.length < 5) return (
    <div className="bg-[#0D1219] border border-slate-800 rounded-xl p-3 text-center text-slate-600 text-xs">
      {{ EN: 'Collecting baseline data for predictive model…', RO: 'Colectare date pentru modelul predictiv…', FR: 'Collecte de données pour le modèle prédictif…', RU: 'Сбор базовых данных для прогнозной модели…' }[lang]}
    </div>
  );

  const trendColor = pred.trend === 'CRITICAL' ? 'text-red-400' : pred.trend === 'DETERIORATING' ? 'text-amber-400' : pred.trend === 'STABLE' ? 'text-blue-400' : 'text-emerald-400';
  const trendBg   = pred.trend === 'CRITICAL' ? 'border-red-500/40 bg-red-500/5' : pred.trend === 'DETERIORATING' ? 'border-amber-500/40 bg-amber-500/5' : pred.trend === 'STABLE' ? 'border-blue-500/40 bg-blue-500/5' : 'border-emerald-500/40 bg-emerald-500/5';
  const satColor  = pred.saturation === 'CRITICAL' ? 'bg-red-500' : pred.saturation === 'HIGH' ? 'bg-orange-500' : pred.saturation === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500';
  const satText   = pred.saturation === 'CRITICAL' ? 'text-red-400' : pred.saturation === 'HIGH' ? 'text-orange-400' : pred.saturation === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400';

  const arrow = pred.trend === 'IMPROVING' ? '↓' : pred.trend === 'STABLE' ? '→' : '↑';

  const trendStr: Record<string, string> = {
    IMPROVING:    { EN: 'Improving',     RO: 'Ameliorare',   FR: 'Amélioration',  RU: 'Улучшение'   }[lang],
    DETERIORATING:{ EN: 'Deteriorating', RO: 'Deteriorare',  FR: 'Détérioration', RU: 'Ухудшение'   }[lang],
    CRITICAL:     { EN: 'Critical',      RO: 'Critic',       FR: 'Critique',      RU: 'Критический' }[lang],
    STABLE:       { EN: 'Stable',        RO: 'Stabil',       FR: 'Stable',        RU: 'Стабильно'   }[lang],
  };
  const satStr: Record<string, string> = {
    CRITICAL: { EN: 'Critical', RO: 'Critic',  FR: 'Critique', RU: 'Критический' }[lang],
    HIGH:     { EN: 'High',     RO: 'Ridicat', FR: 'Élevé',    RU: 'Высокий'     }[lang],
    MEDIUM:   { EN: 'Medium',   RO: 'Mediu',   FR: 'Moyen',    RU: 'Средний'     }[lang],
    LOW:      { EN: 'Low',      RO: 'Scăzut',  FR: 'Faible',   RU: 'Низкий'      }[lang],
  };

  const HorizonCell = ({ label, q, w, isFuture }: { label: string; q: number; w: number; isFuture: boolean }) => {
    const qColor = q > 12 ? 'text-red-400' : q > 6 ? 'text-amber-400' : 'text-emerald-400';
    const wColor = w > 120 ? 'text-red-400' : w > 60 ? 'text-amber-400' : 'text-emerald-400';
    return (
      <div className={`flex-1 min-w-[72px] rounded-lg border p-2 text-center ${isFuture ? 'border-slate-700/50 bg-slate-900/40' : 'border-blue-500/30 bg-blue-500/5'}`}>
        <div className="text-[9px] font-bold uppercase text-slate-500 mb-2">{label}</div>
        <div className={`text-lg font-light leading-none ${qColor}`}>{Math.round(q)}</div>
        <div className="text-[9px] text-slate-600 mb-1.5">{{ EN: 'vehicles', RO: 'vehicule', FR: 'véhicules', RU: 'ТС' }[lang]}</div>
        <div className={`text-sm font-light leading-none ${wColor}`}>{Math.round(w)}s</div>
        <div className="text-[9px] text-slate-600">{{ EN: 'avg wait', RO: 'așteptare', FR: 'attente', RU: 'ожидание' }[lang]}</div>
      </div>
    );
  };

  // Auto-generated plain-language action
  const actionMsg = pred.saturation === 'CRITICAL'
    ? { EN: 'Critical saturation in ~2 min — open emergency lanes now and request standby team.', RO: 'Saturație critică în ~2 min — deschideți benzile de urgență acum și solicitați echipa de rezervă.', FR: "Saturation critique dans ~2 min — ouvrez les voies d'urgence et demandez l'équipe de réserve.", RU: 'Критическая нагрузка через ~2 мин — немедленно откройте аварийные полосы и вызовите резервную группу.' }[lang]
    : pred.saturation === 'HIGH'
    ? { EN: 'High saturation forecast — activate secondary lane within 2 minutes.', RO: 'Saturație ridicată prognozată — activați banda secundară în 2 minute.', FR: 'Saturation élevée prévue — activez la voie secondaire dans 2 minutes.', RU: 'Прогнозируется высокая нагрузка — активируйте дополнительную полосу в течение 2 минут.' }[lang]
    : pred.trend === 'DETERIORATING'
    ? { EN: 'Queue trending upward — monitor closely and prepare secondary lane.', RO: 'Coada în creștere — monitorizați atent și pregătiți banda secundară.', FR: 'File en hausse — surveillance accrue et préparation de la voie secondaire.', RU: 'Очередь растёт — ведите усиленный мониторинг и подготовьте дополнительную полосу.' }[lang]
    : pred.trend === 'STABLE'
    ? { EN: 'Traffic stable. No immediate action required.', RO: 'Trafic stabil. Nu se impune nicio acțiune imediată.', FR: 'Trafic stable. Aucune action immédiate requise.', RU: 'Трафик стабилен. Немедленных действий не требуется.' }[lang]
    : { EN: 'Traffic easing. Conditions improving.', RO: 'Trafic în scădere. Condiții în ameliorare.', FR: 'Trafic en baisse. Conditions en amélioration.', RU: 'Трафик снижается. Условия улучшаются.' }[lang];

  return (
    <div className={`rounded-xl border p-3 ${trendBg}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${satColor} ${pred.saturation === 'CRITICAL' ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">{{ EN: 'Operational Forecast', RO: 'Prognoză Operațională', FR: 'Prévision Opérationnelle', RU: 'Операционный Прогноз' }[lang]}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${trendColor}`}>{arrow} {trendStr[pred.trend] ?? pred.trend}</span>
          <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${pred.saturation === 'CRITICAL' ? 'bg-red-900/40 text-red-400' : pred.saturation === 'HIGH' ? 'bg-orange-900/40 text-orange-400' : pred.saturation === 'MEDIUM' ? 'bg-amber-900/40 text-amber-400' : 'bg-emerald-900/40 text-emerald-400'}`}>{satStr[pred.saturation] ?? pred.saturation}</span>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3">
        <HorizonCell label={{ EN: 'NOW', RO: 'ACUM', FR: 'MAINT.', RU: 'СЕЙЧАС' }[lang]} q={pred.queueNow} w={pred.waitNow} isFuture={false} />
        <HorizonCell label="+2 min" q={pred.queue2m}  w={pred.wait2m}  isFuture />
        <HorizonCell label="+5 min" q={pred.queue5m}  w={pred.wait5m}  isFuture />
        <HorizonCell label="+10 min"q={pred.queue10m} w={pred.wait10m} isFuture />
        {/* Stress gauge */}
        <div className="flex-1 min-w-[72px] rounded-lg border border-slate-700/50 bg-slate-900/40 p-2 flex flex-col items-center justify-center gap-2">
          <div className="text-[9px] font-bold uppercase text-slate-500">{{ EN: 'Stress', RO: 'Stres', FR: 'Stress', RU: 'Нагрузка' }[lang]}</div>
          <div className={`text-2xl font-light ${satText}`}>{pred.stressIndex}<span className="text-sm opacity-60">%</span></div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${satColor} transition-all duration-700`} style={{ width: `${pred.stressIndex}%` }} />
          </div>
          <div className={`text-[9px] font-bold uppercase ${satText}`}>{satStr[pred.saturation] ?? pred.saturation}</div>
        </div>
      </div>

      <div className={`flex items-start gap-2 rounded-lg px-3 py-2 border ${pred.saturation === 'CRITICAL' || pred.saturation === 'HIGH' ? 'border-amber-500/20 bg-amber-500/5' : 'border-slate-700/30 bg-slate-900/30'}`}>
        <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span className="text-[10px] text-slate-300 leading-relaxed">{actionMsg}</span>
      </div>
    </div>
  );
};

// ─── Incident Control Panel ───────────────────────────────────────────────────
const IncidentPanel: React.FC<{
  activeIncidents: Partial<Record<IncidentType, ActiveIncident>>;
  onActivate: (type: IncidentType) => void;
  now: number;
  lang: Language;
}> = ({ activeIncidents, onActivate, now, lang }) => {
  const [infoId, setInfoId] = useState<IncidentType | null>(null);

  const incidentT: Record<IncidentType, { label: string; explain: string }> = {
    suspiciousCargo: {
      label:   { EN: 'Suspicious Vehicle',  RO: 'Vehicul Suspect',      FR: 'Véhicule Suspect',        RU: 'Подозрительное ТС'       }[lang],
      explain: { EN: 'An intelligence alert flagged a suspicious vehicle in the convoy. All lanes switch to enhanced inspection — every vehicle is checked more carefully than usual until the alert is cleared.', RO: 'O alertă de informații a semnalat un vehicul suspect în convoi. Toate benzile trec la inspecție sporită — fiecare vehicul este verificat mai atent decât de obicei până la închiderea alertei.', FR: "Une alerte de renseignement a signalé un véhicule suspect dans le convoi. Toutes les voies passent en inspection renforcée — chaque véhicule est contrôlé plus soigneusement qu'à l'ordinaire jusqu'à la levée de l'alerte.", RU: 'Разведывательная тревога зафиксировала подозрительное ТС в колонне. Все полосы переходят в режим усиленного досмотра — каждое ТС проверяется тщательнее обычного до снятия тревоги.' }[lang],
    },
    bioSlowdown: {
      label:   { EN: 'Scanner Failure',     RO: 'Defecțiune Scanner',   FR: 'Panne Scanner',           RU: 'Сбой Сканера'            }[lang],
      explain: { EN: 'The biometric scanners are reporting errors and cannot verify identities automatically. Officers must switch to manual identity checks, which takes longer and creates a queue backlog.', RO: 'Scanerele biometrice raportează erori și nu pot verifica identitățile automat. Ofițerii trebuie să treacă la verificări manuale, care durează mai mult și generează o coadă.', FR: "Les scanners biométriques signalent des erreurs et ne peuvent pas vérifier les identités automatiquement. Les agents passent aux contrôles manuels, ce qui prend plus de temps et génère une file d'attente.", RU: 'Биометрические сканеры сообщают об ошибках и не могут автоматически проверять личности. Сотрудники переходят на ручные проверки, что занимает больше времени и создаёт очередь.' }[lang],
    },
    customsBacklog: {
      label:   { EN: 'Customs Delay',       RO: 'Întârziere Vamală',    FR: 'Retard Douanier',         RU: 'Задержка Таможни'        }[lang],
      explain: { EN: 'Too many customs declarations have piled up and are waiting to be processed. Clearance times are running well above normal, causing vehicles to wait much longer at the customs stage.', RO: 'Prea multe declarații vamale s-au acumulat și așteaptă să fie procesate. Timpii de vămuire depășesc cu mult normalul, cauzând așteptări mai lungi la etapa vamală.', FR: "Trop de déclarations douanières se sont accumulées et attendent d'être traitées. Les délais de dédouanement dépassent largement la normale, allongeant l'attente au stade douanier.", RU: 'Скопилось слишком много таможенных деклараций в ожидании обработки. Время оформления значительно превышает норму, из-за чего ТС дольше ожидают на таможенном этапе.' }[lang],
    },
    laneClosure: {
      label:   { EN: 'Lane Closed',         RO: 'Bandă Închisă',        FR: 'Voie Fermée',             RU: 'Полоса Закрыта'          }[lang],
      explain: { EN: 'One checkpoint lane is taken out of service due to a technical fault or staffing issue. All vehicles must redirect to the remaining open lanes, significantly increasing their queue.', RO: 'O bandă de control este scoasă din serviciu din cauza unui defect tehnic sau a unei probleme de personal. Toate vehiculele sunt redirecționate pe benzile rămase deschise, crescând semnificativ coada.', FR: "Une voie de contrôle est mise hors service suite à une panne technique ou un problème de personnel. Tous les véhicules sont redirigés vers les voies restantes ouvertes, augmentant considérablement leur file.", RU: 'Одна полоса контроля выведена из эксплуатации из-за технической неисправности или нехватки персонала. Все ТС перенаправляются на оставшиеся открытые полосы, что значительно увеличивает очередь.' }[lang],
    },
    migrationSurge: {
      label:   { EN: 'High Traffic Volume', RO: 'Volum Ridicat Trafic', FR: 'Volume Trafic Élevé',     RU: 'Высокий Поток Трафика'   }[lang],
      explain: { EN: 'An unusually high number of vehicles and persons is arriving at the border simultaneously. The checkpoint cannot process them at normal speed — backup staff and additional lanes are required to prevent a major backlog.', RO: 'Un număr neobișnuit de mare de vehicule și persoane sosesc simultan la frontieră. Punctul de trecere nu le poate procesa la viteză normală — sunt necesare personal și benzi suplimentare pentru a preveni o acumulare majoră.', FR: "Un nombre inhabituellement élevé de véhicules et de personnes arrivent simultanément à la frontière. Le poste ne peut pas tous les traiter à vitesse normale — du personnel de renfort et des voies supplémentaires sont nécessaires pour éviter un engorgement majeur.", RU: 'Необычно большое количество ТС и людей прибывает на границу одновременно. КПП не справляется с обычной скоростью обработки — необходимы дополнительные сотрудники и полосы для предотвращения серьёзного затора.' }[lang],
    },
    scannerMalfunction: {
      label:   { EN: 'Doc Reader Offline',  RO: 'Cititor Doc. Oprit',   FR: 'Lecteur Doc. Hors Ligne', RU: 'Считыватель Откл.'       }[lang],
      explain: { EN: 'The automated document scanner is offline and cannot read passports or ID cards electronically. Officers must check travel documents by hand at every booth, which slows processing and noticeably lengthens queues.', RO: 'Scanerul automat de documente este oprit și nu poate citi pașapoarte sau acte de identitate electronic. Ofițerii verifică documentele manual la fiecare cabină, încetinind procesarea și lungind cozile.', FR: "Le scanner automatique de documents est hors ligne et ne peut pas lire les passeports ou cartes d'identité électroniquement. Les agents vérifient les documents manuellement à chaque guichet, ralentissant le traitement et allongeant les files.", RU: 'Автоматический сканер документов отключён и не может считывать паспорта или удостоверения в электронном виде. Сотрудники проверяют документы вручную на каждой стойке, что замедляет обработку и удлиняет очереди.' }[lang],
    },
  };

  const cls = (color: string, on: boolean) => {
    const map: Record<string, { idle: string; on: string; dot: string }> = {
      red:    { idle: 'border-slate-800 text-slate-500 hover:border-red-700/60 hover:text-red-300 hover:bg-red-500/5',         on: 'border-red-500/70 bg-red-500/10 text-red-300',        dot: 'bg-red-500'    },
      amber:  { idle: 'border-slate-800 text-slate-500 hover:border-amber-700/60 hover:text-amber-300 hover:bg-amber-500/5',   on: 'border-amber-500/70 bg-amber-500/10 text-amber-300',   dot: 'bg-amber-400'  },
      orange: { idle: 'border-slate-800 text-slate-500 hover:border-orange-700/60 hover:text-orange-300 hover:bg-orange-500/5',on: 'border-orange-500/70 bg-orange-500/10 text-orange-300',dot: 'bg-orange-400' },
      rose:   { idle: 'border-slate-800 text-slate-500 hover:border-rose-700/60 hover:text-rose-300 hover:bg-rose-500/5',      on: 'border-rose-500/70 bg-rose-500/10 text-rose-300',      dot: 'bg-rose-500'   },
      violet: { idle: 'border-slate-800 text-slate-500 hover:border-violet-700/60 hover:text-violet-300 hover:bg-violet-500/5',on: 'border-violet-500/70 bg-violet-500/10 text-violet-300',dot: 'bg-violet-400' },
    };
    return (map[color] || map.red)[on ? 'on' : 'idle'];
  };

  const anyActive = Object.keys(activeIncidents).length > 0;
  const infoActive = infoId ? activeIncidents[infoId] : null;
  const infoTimeLeft = infoActive ? Math.max(0, Math.round((infoActive.startTime + infoActive.duration * 1000 - now) / 1000)) : 0;

  return (
    <>
    <div className="flex items-center gap-2 mb-5 bg-[#0D1219] border border-slate-800 rounded-xl px-3 py-2 overflow-x-auto shrink-0">
      <div className="flex items-center gap-2 shrink-0 pr-3 border-r border-slate-800 mr-1">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${anyActive ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`} />
        <span className="text-[9px] font-bold uppercase text-slate-600 tracking-widest whitespace-nowrap">{{ EN: 'Operational Scenarios', RO: 'Scenarii Operaționale', FR: 'Scénarios Opérationnels', RU: 'Оперативные Сценарии' }[lang]}</span>
      </div>
      {INCIDENT_DEFS.map(def => {
        const inc = activeIncidents[def.id];
        const timeLeft = inc ? Math.max(0, Math.round((inc.startTime + inc.duration * 1000 - now) / 1000)) : 0;
        const dotCls = def.color === 'red' ? 'bg-red-500' : def.color === 'amber' ? 'bg-amber-400' : def.color === 'orange' ? 'bg-orange-400' : def.color === 'rose' ? 'bg-rose-500' : 'bg-violet-400';
        return (
          <button key={def.id} onClick={() => setInfoId(infoId === def.id ? null : def.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide transition-all duration-200 shrink-0 bg-slate-900/60 ${cls(def.color, !!inc)}`}>
            {inc && <div className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${dotCls}`} />}
            <span>{incidentT[def.id].label}</span>
            {inc && <span className="font-mono text-[9px] opacity-60 ml-0.5">{timeLeft}s</span>}
          </button>
        );
      })}
    </div>

    {/* Scenario explanation modal */}
    {infoId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setInfoId(null)}>
        <div className="bg-[#111623] border border-slate-700 rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <span className="text-[9px] font-bold uppercase text-slate-500 tracking-widest block mb-1">{{ EN: 'Operational Scenario', RO: 'Scenariu Operațional', FR: 'Scénario Opérationnel', RU: 'Оперативный Сценарий' }[lang]}</span>
              <h3 className="text-slate-100 font-bold text-base">{incidentT[infoId].label}</h3>
            </div>
            {infoActive
              ? <span className="text-[9px] font-bold uppercase px-2 py-1 rounded bg-red-500/15 text-red-400 border border-red-500/30 shrink-0 whitespace-nowrap">
                  {{ EN: 'ACTIVE', RO: 'ACTIV', FR: 'ACTIF', RU: 'АКТИВЕН' }[lang]} · {infoTimeLeft}s
                </span>
              : <span className="text-[9px] font-bold uppercase px-2 py-1 rounded bg-slate-800 text-slate-500 border border-slate-700 shrink-0">
                  {{ EN: 'IDLE', RO: 'INACTIV', FR: 'INACTIF', RU: 'НЕАКТИВЕН' }[lang]}
                </span>
            }
          </div>
          <p className="text-sm text-slate-300 leading-relaxed mb-5">{incidentT[infoId].explain}</p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setInfoId(null)} className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              {{ EN: 'Close', RO: 'Închide', FR: 'Fermer', RU: 'Закрыть' }[lang]}
            </button>
            <button
              onClick={() => { onActivate(infoId); setInfoId(null); }}
              disabled={!!infoActive}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors ${infoActive ? 'bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 text-white border border-amber-500'}`}>
              {infoActive
                ? { EN: 'Already Active', RO: 'Deja Activ', FR: 'Déjà Actif', RU: 'Уже Активен' }[lang]
                : { EN: 'Activate Scenario', RO: 'Activează Scenariul', FR: 'Activer le Scénario', RU: 'Активировать Сценарий' }[lang]
              }
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

// ─── Layer Navigation Bar ─────────────────────────────────────────────────────
const LayerNav: React.FC<{ active: LayerType; onChange: (l: LayerType) => void; lang: Language }> = ({ active, onChange, lang }) => (
  <div className="flex gap-1.5 mb-6 bg-[#0D1219] border border-slate-800 rounded-xl p-1.5 overflow-x-auto shrink-0">
    {LAYER_DEFS.map((l, i) => {
      const t = NAV_T[lang][i] ?? { label: l.label, sub: l.sub };
      const showDivider = i > 0 && l.group !== LAYER_DEFS[i - 1].group;
      return (
        <React.Fragment key={l.id}>
          {showDivider && (
            <div className="self-stretch flex flex-col items-center justify-center px-1 shrink-0 gap-0.5">
              <div className="flex-1 w-px bg-slate-700/40" />
              <span className="text-[6px] font-bold uppercase tracking-[0.18em] text-slate-700 select-none"
                    style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
                {{ EN: 'support', RO: 'suport', FR: 'support', RU: 'поддержка' }[lang]}
              </span>
              <div className="flex-1 w-px bg-slate-700/40" />
            </div>
          )}
          <button onClick={() => onChange(l.id)}
            className={`flex-1 min-w-[100px] flex flex-col items-center px-3 py-2.5 rounded-lg border transition-all duration-200 gap-0.5 ${
              active === l.id ? l.activeClass : 'border-transparent text-slate-500 hover:bg-slate-800/50 hover:text-slate-400'
            }`}>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active === l.id ? l.dot : 'bg-slate-700'}`} />
              <span className="text-[11px] font-bold uppercase tracking-wider">{t.label}</span>
            </div>
            <span className={`text-[9px] ${active === l.id ? 'opacity-70' : 'text-slate-600'}`}>{t.sub}</span>
          </button>
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Governance Layer ─────────────────────────────────────────────────────────
const GovernanceLayer: React.FC<{ alerts: Alert[]; vehicles: Vehicle[]; declarations: Declaration[]; lang: Language; selectedBCP: string }> = ({ alerts, vehicles, declarations, lang, selectedBCP }) => {
  const [expandedSop, setExpandedSop] = useState<string | null>(null);

  const triggerCounts = useMemo(() => {
    const bcpV = vehicles.filter(v => v.bcpId === selectedBCP);
    const bcpD = declarations.filter(d => {
      const lv = vehicles.find(vv => vv.id === d.linkedVehicleId || vv.plate === d.vehiclePlate);
      return lv ? lv.bcpId === selectedBCP : false;
    });
    return {
      watchlist:  bcpV.filter(v => v.watchlistHit).length,
      docAnomaly: bcpV.filter(v => v.docAnomaly).length,
      bioMismatch:bcpV.filter(v => v.bioMismatch).length,
      highRisk:   bcpV.filter(v => v.risk === 'High').length,
      redChannel: bcpD.filter(d => d.channel === 'RED').length,
      highAlerts: alerts.filter(a => a.severity === 'HIGH').length,
    };
  }, [vehicles, declarations, alerts, selectedBCP]);

  const catColor: Record<string, string> = {
    Security: 'text-red-400 bg-red-500/10 border-red-500/20',
    Intelligence: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    Customs: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    'Trade Facilitation': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    Financial: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    Operations: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    Legal: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
  };
  const priColor = (p: string) => p === 'CRITICAL' ? 'text-red-400 bg-red-500/10 border-red-500/20' : p === 'HIGH' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20';

  const priLabel: Record<string, string> = {
    CRITICAL: { EN: 'CRITICAL', RO: 'CRITIC',  FR: 'CRITIQUE', RU: 'КРИТИЧЕСКИЙ' }[lang],
    HIGH:     { EN: 'HIGH',     RO: 'RIDICAT', FR: 'ÉLEVÉ',    RU: 'ВЫСОКИЙ'     }[lang],
    MEDIUM:   { EN: 'MEDIUM',   RO: 'MEDIU',   FR: 'MOYEN',    RU: 'СРЕДНИЙ'     }[lang],
  };

  const policyT: Record<string, { title: string; description: string; category: string; triggers: string[] }> = {
    'POL-001': {
      title:       { EN: 'Mandatory Biometric Verification',       RO: 'Verificare Biometrică Obligatorie',              FR: 'Vérification Biométrique Obligatoire',              RU: 'Обязательная Биометрическая Проверка'           }[lang],
      description: { EN: 'All third-country nationals undergo face, iris, and fingerprint verification at entry/exit.', RO: 'Toți cetățenii din țări terțe sunt supuși verificării față, iris și amprentă la intrare/ieșire.', FR: "Tous les ressortissants de pays tiers font l'objet d'une vérification biométrique (visage, iris, empreintes) à l'entrée/sortie.", RU: 'Все граждане третьих стран проходят биометрическую проверку (лицо, радужная оболочка, отпечатки) при въезде/выезде.' }[lang],
      category:    { EN: 'Security',    RO: 'Securitate',       FR: 'Sécurité',      RU: 'Безопасность'    }[lang],
      triggers: [
        { EN: 'Bio mismatch',           RO: 'Discrepanță biometrică',   FR: 'Incohérence biométrique',   RU: 'Несоответствие биометрии'      }[lang],
        { EN: 'MRZ checksum failure',   RO: 'Eroare sumă control MRZ',  FR: 'Échec checksum MRZ',        RU: 'Ошибка контрольной суммы MRZ'  }[lang],
      ],
    },
    'POL-002': {
      title:       { EN: 'High-Risk Origin Enhanced Screening',    RO: 'Screening Sporit Origine cu Risc Ridicat',       FR: 'Criblage Renforcé Origine Haut Risque',             RU: 'Усиленный Досмотр из Зон Высокого Риска'        }[lang],
      description: { EN: 'Vehicles/persons from flagged regions require secondary inspection per intelligence risk profiles.', RO: 'Vehiculele/persoanele din regiunile marcate necesită inspecție secundară conform profilelor de risc.', FR: 'Les véhicules/personnes des régions signalées nécessitent une inspection secondaire selon les profils de risque.', RU: 'Транспорт/лица из маркированных регионов подлежат вторичному досмотру согласно профилям разведывательного риска.' }[lang],
      category:    { EN: 'Intelligence', RO: 'Informații',       FR: 'Renseignement', RU: 'Разведка'        }[lang],
      triggers: [
        { EN: 'Route risk > 0.5',         RO: 'Risc rută > 0,5',           FR: 'Risque itinéraire > 0,5',     RU: 'Риск маршрута > 0,5'              }[lang],
        { EN: 'Origin country flagged',   RO: 'Țara de origine marcată',   FR: "Pays d'origine signalé",      RU: 'Страна происхождения в списке'    }[lang],
      ],
    },
    'POL-003': {
      title:       { EN: 'Excisable Goods Physical Inspection',    RO: 'Inspecție Fizică Mărfuri Accizabile',            FR: 'Inspection Physique Marchandises Accisées',         RU: 'Физический Досмотр Подакцизных Товаров'         }[lang],
      description: { EN: 'HS codes 2402 (tobacco) and 2710 (fuels) require mandatory physical inspection.', RO: 'Codurile HS 2402 (tutun) și 2710 (carburanți) impun inspecție fizică obligatorie.', FR: 'Les codes SH 2402 (tabac) et 2710 (carburants) nécessitent une inspection physique obligatoire.', RU: 'Коды HS 2402 (табак) и 2710 (топливо) требуют обязательного физического досмотра.' }[lang],
      category:    { EN: 'Customs',      RO: 'Vamă',             FR: 'Douane',        RU: 'Таможня'         }[lang],
      triggers: [
        { EN: 'HS 2402 declared', RO: 'Cod HS 2402 declarat', FR: 'SH 2402 déclaré',  RU: 'Задекларирован HS 2402' }[lang],
        { EN: 'HS 2710 declared', RO: 'Cod HS 2710 declarat', FR: 'SH 2710 déclaré',  RU: 'Задекларирован HS 2710' }[lang],
        { EN: 'PNR hit',          RO: 'Corespondență PNR',    FR: 'Correspondance PNR', RU: 'Совпадение PNR'        }[lang],
      ],
    },
    'POL-004': {
      title:       { EN: 'AEO Expedited Clearance',                RO: 'Vămuire Rapidă OEA',                             FR: 'Dédouanement Accéléré OEA',                         RU: 'Ускоренное Оформление УЭО'                      }[lang],
      description: { EN: 'Authorized Economic Operators receive expedited processing and reduced physical checks.', RO: 'Operatorii Economici Autorizați beneficiază de procesare rapidă și verificări fizice reduse.', FR: "Les Opérateurs Économiques Agréés bénéficient d'un traitement accéléré et de contrôles physiques réduits.", RU: 'Уполномоченные экономические операторы проходят ускоренное оформление с сокращённым физическим досмотром.' }[lang],
      category:    { EN: 'Trade Facilitation', RO: 'Facilitare Comerț', FR: 'Facilitation Commerce', RU: 'Облегчение Торговли' }[lang],
      triggers: [
        { EN: 'AEO-F confirmed', RO: 'OEA-F confirmat', FR: 'OEA-F confirmé', RU: 'УЭО-Ф подтверждён' }[lang],
        { EN: 'AEO-S confirmed', RO: 'OEA-S confirmat', FR: 'OEA-S confirmé', RU: 'УЭО-С подтверждён' }[lang],
      ],
    },
    'POL-005': {
      title:       { EN: 'Cash Declaration Threshold (€10k)',      RO: 'Prag Declarare Numerar (10.000 EUR)',             FR: 'Seuil Déclaration Espèces (10 000 €)',              RU: 'Порог Декларирования Наличных (10 000 €)'       }[lang],
      description: { EN: 'Persons entering or leaving must declare cash or equivalent assets ≥ €10,000.', RO: 'Persoanele care intră sau ies trebuie să declare numerar sau echivalent ≥ 10.000 EUR.', FR: 'Les personnes entrant ou sortant doivent déclarer les espèces ou équivalents ≥ 10 000 €.', RU: 'Лица при въезде или выезде обязаны декларировать наличные средства или эквивалент ≥ 10 000 €.' }[lang],
      category:    { EN: 'Financial',    RO: 'Financiar',        FR: 'Financier',     RU: 'Финансовый'      }[lang],
      triggers: [
        { EN: 'Amount ≥ €10,000',           RO: 'Suma ≥ 10.000 EUR',                 FR: 'Montant ≥ 10 000 €',                    RU: 'Сумма ≥ 10 000 €'                              }[lang],
        { EN: 'Undeclared currency K9 hit', RO: 'Detectare K9 valută nedeclarată',   FR: 'Détection K9 devises non déclarées',     RU: 'Обнаружение K9 незадекларированной валюты'     }[lang],
      ],
    },
    'POL-006': {
      title:       { EN: 'Watchlist Cross-Reference Protocol',     RO: 'Protocol Verificare Liste de Urmărire',          FR: 'Protocole Vérification Listes de Surveillance',    RU: 'Протокол Сверки со Списками Наблюдения'         }[lang],
      description: { EN: 'All persons and vehicles cross-referenced against SIS II, INTERPOL, and Europol in real-time.', RO: 'Toate persoanele și vehiculele sunt verificate în timp real față de SIS II, INTERPOL și Europol.', FR: 'Toutes les personnes et véhicules sont vérifiés en temps réel contre SIS II, INTERPOL et Europol.', RU: 'Все лица и ТС в режиме реального времени сверяются с базами SIS II, INTERPOL и Европол.' }[lang],
      category:    { EN: 'Security',    RO: 'Securitate',       FR: 'Sécurité',      RU: 'Безопасность'    }[lang],
      triggers: [
        { EN: 'Plate match SIS II',         RO: 'Corespondență plăcuță SIS II',     FR: 'Correspondance plaque SIS II',          RU: 'Совпадение номера в SIS II'                    }[lang],
        { EN: 'Identity match INTERPOL DB', RO: 'Identitate în baza INTERPOL',      FR: 'Identité dans base INTERPOL',           RU: 'Совпадение личности в базе INTERPOL'           }[lang],
      ],
    },
    'POL-007': {
      title:       { EN: 'Lane Queue Management (>6 vehicles)',    RO: 'Gestionare Coadă Bandă (>6 vehicule)',           FR: 'Gestion File de Voie (>6 véhicules)',               RU: 'Управление Очередью Полосы (>6 ТС)'             }[lang],
      description: { EN: 'Additional lanes must be activated within 5 min when avg queue exceeds 6 vehicles per lane.', RO: 'Benzile suplimentare trebuie activate în 5 min când coada medie depășește 6 vehicule/bandă.', FR: 'Des voies supplémentaires doivent être activées dans les 5 min lorsque la file moyenne dépasse 6 véhicules/voie.', RU: 'Дополнительные полосы должны быть активированы в течение 5 мин, когда средняя очередь превышает 6 ТС/полосу.' }[lang],
      category:    { EN: 'Operations',  RO: 'Operațional',      FR: 'Opérationnel',  RU: 'Операционный'    }[lang],
      triggers: [
        { EN: 'Queue > 6 vehicles/lane', RO: 'Coadă > 6 vehicule/bandă', FR: 'File > 6 véhicules/voie', RU: 'Очередь > 6 ТС/полосу' }[lang],
      ],
    },
    'POL-008': {
      title:       { EN: 'Evidence Chain of Custody',              RO: 'Lanț de Custodie al Probelor',                   FR: 'Chaîne de Garde des Preuves',                       RU: 'Цепочка Хранения Доказательств'                 }[lang],
      description: { EN: 'All seized goods must be photographed, inventoried, and tamper-sealed before transfer.', RO: 'Toate bunurile confiscate trebuie fotografiate, inventariate și sigilate anti-tamper înainte de transfer.', FR: 'Tous les biens saisis doivent être photographiés, inventoriés et scellés anti-altération avant transfert.', RU: 'Все конфискованные товары должны быть сфотографированы, описаны и запечатаны защитой от вскрытия до передачи.' }[lang],
      category:    { EN: 'Legal',       RO: 'Juridic',          FR: 'Juridique',     RU: 'Юридический'     }[lang],
      triggers: [
        { EN: 'Seizure order issued', RO: 'Ordin de confiscare emis', FR: 'Ordre de saisie émis',  RU: 'Выдан ордер на изъятие' }[lang],
        { EN: 'Contraband detected',  RO: 'Contrabandă detectată',    FR: 'Contrebande détectée',  RU: 'Обнаружена контрабанда' }[lang],
      ],
    },
  };

  const sopT: Record<string, { title: string; steps: string[] }> = {
    'SOP-001': {
      title: { EN: 'Vehicle Queue Management',   RO: 'Gestionarea Cozii de Vehicule',        FR: 'Gestion de la File de Véhicules',      RU: 'Управление Очередью ТС'                    }[lang],
      steps: [
        { EN: 'Monitor lane queue on console',                  RO: 'Monitorizați coada benzii pe consolă',                    FR: 'Surveiller la file de voie sur la console',               RU: 'Контролируйте очередь полосы на консоли'                   }[lang],
        { EN: 'Alert supervisor when queue > 4 vehicles',       RO: 'Alertați supervizorul când coada > 4 vehicule',            FR: 'Alerter le superviseur si la file > 4 véhicules',          RU: 'Оповестите руководителя при очереди > 4 ТС'                }[lang],
        { EN: 'Open secondary lane within 5 min',               RO: 'Deschideți banda secundară în 5 min',                     FR: 'Ouvrir la voie secondaire dans les 5 min',                RU: 'Откройте дополнительную полосу в течение 5 мин'            }[lang],
        { EN: 'Communicate via radio channel 3',                RO: 'Comunicați prin canalul radio 3',                         FR: 'Communiquer via le canal radio 3',                        RU: 'Связь по радиоканалу 3'                                    }[lang],
      ],
    },
    'SOP-002': {
      title: { EN: 'Biometric Verification',     RO: 'Verificare Biometrică',                FR: 'Vérification Biométrique',             RU: 'Биометрическая Проверка'                   }[lang],
      steps: [
        { EN: 'Request travel document',                        RO: 'Solicitați documentul de călătorie',                      FR: 'Demander le document de voyage',                          RU: 'Запросите документ для въезда'                             }[lang],
        { EN: 'Initialize scanner (3-point calibration)',       RO: 'Inițializați scanerul (calibrare 3 puncte)',               FR: 'Initialiser le scanner (calibration 3 points)',           RU: 'Инициализируйте сканер (калибровка по 3 точкам)'           }[lang],
        { EN: 'Capture face, iris, fingerprint',                RO: 'Capturați față, iris, amprentă',                          FR: 'Capturer visage, iris, empreinte digitale',               RU: 'Захватите лицо, радужную оболочку, отпечаток пальца'      }[lang],
        { EN: 'Cross-reference database (max 8s)',              RO: 'Verificare încrucișată baze de date (max 8s)',             FR: 'Vérifier dans la base de données (max 8s)',               RU: 'Проверка по базе данных (не более 8 сек)'                  }[lang],
        { EN: 'If FAILED: escalate to secondary booth',        RO: 'Dacă EȘUAT: escaladați la cabina secundară',               FR: "En cas d'ÉCHEC: escalader au guichet secondaire",         RU: 'При НЕУДАЧЕ: направьте на вторичную стойку'                }[lang],
      ],
    },
    'SOP-003': {
      title: { EN: 'High-Risk Cargo Response',   RO: 'Răspuns Marfă Risc Ridicat',           FR: 'Réponse Cargaison Haut Risque',        RU: 'Реагирование на Груз Высокого Риска'       }[lang],
      steps: [
        { EN: 'Direct vehicle to secondary bay S1-S4',         RO: 'Direcționați vehiculul la bay secundar S1-S4',             FR: 'Diriger le véhicule vers la baie secondaire S1-S4',       RU: 'Направьте ТС в зону вторичного досмотра S1-S4'             }[lang],
        { EN: 'Notify Customs Supervisor immediately',          RO: 'Notificați imediat Supervizorul Vamal',                    FR: 'Notifier immédiatement le superviseur douanier',          RU: 'Немедленно уведомите таможенного руководителя'             }[lang],
        { EN: 'Do not release without authorization',          RO: 'Nu eliberați fără autorizare',                             FR: 'Ne pas libérer sans autorisation',                        RU: 'Не отпускайте без разрешения'                              }[lang],
        { EN: 'Document findings with photo evidence',         RO: 'Documentați constatările cu dovezi fotografice',           FR: 'Documenter les résultats avec preuves photographiques',  RU: 'Задокументируйте результаты с фотодоказательствами'        }[lang],
        { EN: 'File incident report within 30 min',            RO: 'Depuneți raportul de incident în 30 min',                  FR: "Déposer le rapport d'incident dans les 30 min",           RU: 'Составьте рапорт об инциденте в течение 30 мин'            }[lang],
      ],
    },
    'SOP-004': {
      title: { EN: 'Watchlist Hit Response',     RO: 'Răspuns la Corespondență Listă',        FR: 'Réponse Correspondance Liste',         RU: 'Реагирование на Совпадение в Списке'       }[lang],
      steps: [
        { EN: 'Detain vehicle without alerting subject',       RO: 'Rețineți vehiculul fără a alerta subiectul',               FR: 'Retenir le véhicule sans alerter le sujet',               RU: 'Задержите ТС, не предупреждая задержанного'                }[lang],
        { EN: 'Alert Duty Officer & Intelligence Liaison',     RO: 'Alertați Ofițerul de Tură & Ofițerul de Legătură INT',     FR: "Alerter l'officier de service & liaison INT",             RU: 'Оповестите дежурного офицера и офицера связи разведки'    }[lang],
        { EN: 'Secure perimeter — activate standby',           RO: 'Securizați perimetrul — activați echipa de rezervă',       FR: 'Sécuriser le périmètre — activer la réserve',             RU: 'Обеспечьте периметр — активируйте резервную группу'       }[lang],
        { EN: 'No action without explicit authorization',      RO: 'Nicio acțiune fără autorizare explicită',                  FR: 'Aucune action sans autorisation explicite',               RU: 'Никаких действий без явного разрешения'                    }[lang],
        { EN: 'Contact INTERPOL NCB liaison',                  RO: 'Contactați ofițerul de legătură NCB INTERPOL',            FR: "Contacter l'agent de liaison NCB INTERPOL",               RU: 'Свяжитесь с офицером связи НЦБ ИНТЕРПОЛ'                  }[lang],
      ],
    },
    'SOP-005': {
      title: { EN: 'Document Anomaly Protocol',  RO: 'Protocol Anomalie Document',           FR: 'Protocole Anomalie Documentaire',      RU: 'Протокол Аномалии Документа'               }[lang],
      steps: [
        { EN: 'Direct to secondary screening area',            RO: 'Direcționați spre zona de screening secundar',             FR: 'Diriger vers la zone de contrôle secondaire',             RU: 'Направьте в зону вторичного досмотра'                      }[lang],
        { EN: 'Escalate to document fraud examiner',           RO: 'Escaladați la expertul în fraude documentare',             FR: "Escalader vers l'expert en fraude documentaire",          RU: 'Передайте эксперту по фальсификации документов'           }[lang],
        { EN: 'Retain document as evidence',                   RO: 'Rețineți documentul ca probă',                             FR: 'Conserver le document comme preuve',                      RU: 'Изымите документ в качестве улики'                         }[lang],
        { EN: 'Do not return without supervisor clearance',    RO: 'Nu returnați fără aprobarea supervizorului',               FR: 'Ne pas restituer sans autorisation du superviseur',       RU: 'Не возвращайте без разрешения руководителя'               }[lang],
        { EN: 'Log in Document Anomaly Register',              RO: 'Înregistrați în Registrul de Anomalii Documentare',       FR: "Enregistrer dans le Registre d'Anomalies Documentaires",  RU: 'Внесите в журнал аномалий документов'                      }[lang],
      ],
    },
  };

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-y-auto custom-scrollbar">
      {/* Active Policy Engine */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Active Policy Engine', RO: 'Motor de Politici Active', FR: 'Moteur de Politiques Actives', RU: 'Механизм Активных Политик' }[lang]}</h3>
            <p className="text-[10px] text-slate-500 mt-0.5">{{ EN: 'Live status of all operational policies and their trigger counts', RO: 'Starea în timp real a politicilor operaționale și numărul de declanșări', FR: 'État en direct de toutes les politiques opérationnelles et leurs déclenchements', RU: 'Актуальное состояние всех оперативных политик и число срабатываний' }[lang]}</p>
          </div>
          <div className="divide-y divide-slate-800/50">
            {POLICIES.map(p => {
              const pt = policyT[p.id] ?? { title: p.title, description: p.description, category: p.category, triggers: p.triggers };
              return (
              <div key={p.id} className="px-4 py-3 hover:bg-slate-800/20 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${catColor[p.category] || 'text-slate-400 bg-slate-800 border-slate-700'}`}>{pt.category}</span>
                    <span className="text-xs font-semibold text-slate-200 truncate">{pt.title}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${priColor(p.priority)}`}>{priLabel[p.priority] ?? p.priority}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" title="ACTIVE" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed mb-1.5">{pt.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] text-slate-600 font-mono">{p.ref}</span>
                  <span className="text-slate-700">·</span>
                  {pt.triggers.map(t => <span key={t} className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">{t}</span>)}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Trigger Counts + SOPs */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
        {/* Live Rule Triggers */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Live Policy Triggers', RO: 'Declanșatori Activi de Politici', FR: 'Déclencheurs de Politiques Actifs', RU: 'Активные Триггеры Политик' }[lang]}</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            {[
              { label: { EN: 'Watchlist Hits',              RO: 'Loviri Listă Urmărire',       FR: 'Correspondances Watchlist',       RU: 'Совпадения в Базах Наблюдения'    }[lang], desc: { EN: 'Plates or persons matched in watchlist databases',                    RO: 'Plăci sau persoane găsite în bazele de urmărire',                    FR: 'Plaques ou personnes trouvées dans les bases de surveillance',    RU: 'Номера или лица, найденные в базах наблюдения'                   }[lang], val: triggerCounts.watchlist,   color: 'text-red-400',    bar: 'bg-red-500' },
              { label: { EN: 'Document Anomalies',          RO: 'Anomalii Documente',          FR: 'Anomalies Documentaires',         RU: 'Аномалии Документов'              }[lang], desc: { EN: 'Documents with inconsistent or altered data',                          RO: 'Documente cu date inconsistente sau modificate',                     FR: 'Documents aux données incohérentes ou modifiées',                 RU: 'Документы с несоответствующими или изменёнными данными'           }[lang], val: triggerCounts.docAnomaly,  color: 'text-amber-400',  bar: 'bg-amber-500' },
              { label: { EN: 'Biometric Failures',          RO: 'Erori Biometrice',            FR: 'Échecs Biométriques',             RU: 'Сбои Биометрии'                   }[lang], desc: { EN: 'Face or fingerprints do not match the presented document',             RO: 'Fața sau amprentele nu corespund cu documentul prezentat',           FR: 'Le visage ou les empreintes ne correspondent pas au document',    RU: 'Лицо или отпечатки не совпадают с документом'                    }[lang], val: triggerCounts.bioMismatch, color: 'text-orange-400', bar: 'bg-orange-500' },
              { label: { EN: 'High-Risk Vehicles',          RO: 'Vehicule Risc Ridicat',       FR: 'Véhicules Haut Risque',           RU: 'Транспорт Высокого Риска'         }[lang], desc: { EN: 'Vehicles with risk score above the alert threshold',                  RO: 'Vehicule cu scor de risc peste pragul de alertă',                    FR: 'Véhicules dont le score de risque dépasse le seuil d\'alerte',   RU: 'Транспорт с показателем риска выше порогового значения'          }[lang], val: triggerCounts.highRisk,    color: 'text-red-400',    bar: 'bg-red-500' },
              { label: { EN: 'RED Channel Declarations',    RO: 'Declarații Canal ROȘU',       FR: 'Déclarations Canal ROUGE',        RU: 'Декларации Красного Канала'       }[lang], desc: { EN: 'Customs declarations directed to physical inspection',                 RO: 'Declarații vamale direcționate spre inspecție fizică',               FR: 'Déclarations douanières orientées vers l\'inspection physique',  RU: 'Таможенные декларации, направленные на физический досмотр'       }[lang], val: triggerCounts.redChannel,  color: 'text-amber-400',  bar: 'bg-amber-500' },
              { label: { EN: 'Critical Alerts',             RO: 'Alerte Critice',              FR: 'Alertes Critiques',               RU: 'Критические Оповещения'           }[lang], desc: { EN: 'Active HIGH-level alerts in the system',                              RO: 'Alerte de nivel HIGH active în sistem',                              FR: 'Alertes de niveau HIGH actives dans le système',                 RU: 'Активные оповещения уровня HIGH в системе'                       }[lang], val: triggerCounts.highAlerts,  color: 'text-violet-400', bar: 'bg-violet-500' },
            ].map(item => (
              <div key={item.label} className="bg-slate-900/40 rounded-lg p-3 border border-slate-800/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{item.label}</div>
                <div className="text-[8px] text-slate-700 leading-snug mb-1.5">{item.desc}</div>
                <div className={`text-2xl font-light ${item.val > 0 ? item.color : 'text-slate-600'}`}>{item.val}</div>
                <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${item.bar} transition-all duration-500`} style={{ width: `${Math.min(100, item.val * 10)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SOP Library */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'SOP Procedures Library', RO: 'Bibliotecă Proceduri SOP', FR: 'Bibliothèque Procédures SOP', RU: 'Библиотека Процедур СОП' }[lang]}</h3>
          </div>
          <div className="divide-y divide-slate-800/50">
            {SOP_PROCEDURES.map(sop => {
              const st = sopT[sop.id] ?? { title: sop.title, steps: sop.steps };
              return (
              <div key={sop.id} className="px-4 py-3">
                <button className="w-full flex items-center justify-between" onClick={() => setExpandedSop(expandedSop === sop.id ? null : sop.id)}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-slate-600">{sop.id}</span>
                    <span className="text-xs font-medium text-slate-300">{st.title}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${priColor(sop.priority)}`}>{priLabel[sop.priority] ?? sop.priority}</span>
                  </div>
                  <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedSop === sop.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                {expandedSop === sop.id && (
                  <ol className="mt-2 space-y-1 pl-2">
                    {st.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-[10px] text-slate-400">
                        <span className="text-slate-600 font-mono shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── KPI Layer ────────────────────────────────────────────────────────────────
const KPILayer: React.FC<{
  stats: { waiting: Vehicle[]; inControl: Vehicle[]; avgWaitSec: number; riskCounts: Record<RiskLevel, number> };
  revenue: { duties: number; vat: number; excise: number };
  bcpPerformance: Record<string, { cleared: number; highRisk: number }>;
  declarations: Declaration[];
  vehicles: Vehicle[];
  throughputHistory: { time: number; entry: number; exit: number; entryByType?: Record<string, number>; exitByType?: Record<string, number> }[];
  revenueHistory: { time: number; amount: number }[];
  bcpThroughputHistory: Record<string, {time: number; entry: number; exit: number; entryByType: Record<string,number>; exitByType: Record<string,number>}[]>;
  bcpRevenueHistory: Record<string, {time: number; amount: number}[]>;
  selectedBCP: string;
  lang: Language;
}> = ({ stats, revenue, bcpPerformance, declarations, vehicles, throughputHistory, revenueHistory, bcpThroughputHistory, bcpRevenueHistory, selectedBCP, lang }) => {
  const [chartClickIdx, setChartClickIdx] = useState<number | null>(null);
  const [revClickIdx,   setRevClickIdx]   = useState<number | null>(null);

  // ── BCP-filtered datasets ──────────────────────────────────────────────────
  const bcpObj       = BCPS.find(b => b.id === selectedBCP);
  const bcpName      = bcpObj?.name ?? selectedBCP;
  const bcpVehicles  = vehicles.filter(v => v.bcpId === selectedBCP);
  const bcpActive    = bcpVehicles.filter(v => v.status !== 'cleared');
  const bcpDecls     = declarations.filter(d => {
    const lv = vehicles.find(v => v.id === d.linkedVehicleId || v.plate === d.vehiclePlate);
    return lv ? lv.bcpId === selectedBCP : false;
  });

  // ── BCP-specific KPI values ────────────────────────────────────────────────
  const bcpPerf      = bcpPerformance[selectedBCP] ?? { cleared: 0, highRisk: 0 };
  const totalCleared = bcpPerf.cleared;
  const totalHighRisk = bcpPerf.highRisk;
  const totalVehicles = bcpActive.length;
  const redDecls     = bcpDecls.filter(d => d.channel === 'RED').length;
  const bioFails     = bcpActive.filter(v => v.bioMismatch).length;
  const bioAccuracy  = totalVehicles > 0 ? ((totalVehicles - bioFails) / totalVehicles * 100) : 100;
  const slaBreaches  = bcpActive.filter(v => v.status.startsWith('waiting') && (Date.now() - v.arrivalTime) / 1000 > 120).length;
  const declaredValue = bcpDecls.reduce((s, d) => s + (d.declaredValue ?? 0), 0);
  // Revenue from cleared trucks at this BCP (from per-BCP revenue history)
  const bcpRevHist   = bcpRevenueHistory[selectedBCP] ?? [];
  const bcpRevTotal  = bcpRevHist.length > 0 ? bcpRevHist[bcpRevHist.length - 1].amount : 0;

  // ── Lane profile at this BCP ───────────────────────────────────────────────
  const bcpLanes     = LANES.filter(l => l.bcpId === selectedBCP);
  const entryLanes   = bcpLanes.filter(l => l.direction === 'entry').length;
  const exitLanes    = bcpLanes.filter(l => l.direction === 'exit').length;
  const truckLanes   = bcpLanes.filter(l => l.vehicleType === 'truck').length;

  // ── Traffic type mix at this BCP ──────────────────────────────────────────
  const typeCount = { car: 0, bus: 0, truck: 0 };
  bcpActive.forEach(v => { typeCount[v.vehicleType] = (typeCount[v.vehicleType] ?? 0) + 1; });
  const typeTotal = Math.max(Object.values(typeCount).reduce((a,b)=>a+b,0), 1);

  // ── BCP avg wait (vehicles at this BCP only) ──────────────────────────────
  const bcpWaiting  = bcpActive.filter(v => v.status.startsWith('waiting'));
  const bcpAvgWait  = bcpWaiting.length > 0
    ? Math.round(bcpWaiting.reduce((s, v) => s + (Date.now() - v.arrivalTime) / 1000, 0) / bcpWaiting.length)
    : 0;

  // ── BCP-specific throughput / revenue charts ──────────────────────────────
  const bcpThruHist  = bcpThroughputHistory[selectedBCP] ?? [];
  // fall back to global if per-BCP not yet populated
  const usedThruHist = bcpThruHist.length >= 2 ? bcpThruHist : throughputHistory;
  const usedRevHist  = bcpRevHist.length   >= 2 ? bcpRevHist  : revenueHistory;

  const kpis = [
    { label: { EN: 'Active Vehicles',    RO: 'Vehicule Active',   FR: 'Véhicules Actifs',   RU: 'Активные ТС'         }[lang], goal: { EN: 'Vehicles in queue or under control at this BCP now',   RO: 'Vehicule în coadă sau control la acest BCP',      FR: 'Véhicules en file ou contrôle ici',                RU: 'ТС в очереди или под контролем на КПП'           }[lang], value: totalVehicles,                        unit: '',  color: 'text-blue-400',    bar: 'bg-blue-500',    pct: Math.min(100, totalVehicles * 4)  },
    { label: { EN: 'Processed Today',    RO: 'Procesate Azi',     FR: "Traités Aujourd'hui", RU: 'Обработано Сегодня'  }[lang], goal: { EN: 'Vehicles that completed BP + Customs clearance here',  RO: 'Vehicule cu control PF + vamal finalizat la BCP', FR: 'Véhicules ayant terminé le contrôle PF + douanier', RU: 'ТС, прошедшие полный контроль ПФ + таможня'      }[lang], value: totalCleared,                         unit: '',  color: 'text-emerald-400', bar: 'bg-emerald-500', pct: Math.min(100, totalCleared * 2)   },
    { label: { EN: 'Avg. Wait Time',     RO: 'Timp Mediu Aștept.',FR: 'Attente Moyenne',    RU: 'Среднее Ожидание'    }[lang], goal: { EN: 'Mean wait for queued vehicles at this BCP. Target < 2 min', RO: 'Timp mediu așteptare la acest BCP. Obiectiv < 2 min', FR: 'Attente moyenne ici. Objectif < 2 min',       RU: 'Среднее ожидание на КПП. Цель < 2 мин'           }[lang], value: bcpAvgWait.toFixed(0),                unit: 's', color: bcpAvgWait > 120 ? 'text-red-400' : bcpAvgWait > 60 ? 'text-amber-400' : 'text-emerald-400', bar: bcpAvgWait > 120 ? 'bg-red-500' : 'bg-amber-500', pct: Math.min(100, bcpAvgWait / 2) },
    { label: { EN: 'SLA Breaches',       RO: 'Depășiri SLA',      FR: 'Dépassements SLA',   RU: 'Нарушения SLA'       }[lang], goal: { EN: 'Vehicles waiting > 2 min at this BCP — must be 0',     RO: 'Vehicule > 2 min în așteptare la BCP — obiectiv 0', FR: 'Véhicules > 2 min en attente ici — objectif 0', RU: 'ТС ожидают > 2 мин на КПП — цель 0'             }[lang], value: slaBreaches,                          unit: '',  color: slaBreaches > 0 ? 'text-red-400' : 'text-emerald-400', bar: 'bg-red-500', pct: Math.min(100, slaBreaches * 10) },
    { label: { EN: 'High Risk',          RO: 'Risc Ridicat',      FR: 'Haut Risque',        RU: 'Высокий Риск'        }[lang], goal: { EN: 'High-risk vehicles flagged at this BCP right now',     RO: 'Vehicule risc ridicat semnalate la acest BCP',    FR: 'Véhicules à haut risque signalés ici',             RU: 'ТС высокого риска на данном КПП'                 }[lang], value: totalHighRisk,                        unit: '',  color: 'text-red-400',     bar: 'bg-red-500',     pct: Math.min(100, totalHighRisk * 10) },
    { label: { EN: 'RED Decls.',         RO: 'Decl. Canal Roșu',  FR: 'Décl. Rouge',        RU: 'Декл. Красн. Кан.'   }[lang], goal: { EN: 'Active RED channel declarations linked to this BCP',   RO: 'Declarații Canal Roșu active la acest BCP',       FR: 'Déclarations Canal Rouge actives liées ici',       RU: 'Активные декларации красного канала на КПП'      }[lang], value: redDecls,                             unit: '',  color: 'text-amber-400',   bar: 'bg-amber-500',   pct: Math.min(100, redDecls * 8)       },
    { label: { EN: 'Revenue Collected',  RO: 'Venituri Colectate',FR: 'Recettes Perçues',   RU: 'Собранные Доходы'    }[lang], goal: { EN: 'Cumulative duties + VAT + excise via this BCP so far', RO: 'Taxe + TVA + accize colectate prin acest BCP',    FR: 'Droits + TVA + accises perçus via ce point',       RU: 'Пошлины + НДС + акцизы через данный КПП'         }[lang], value: `€${(bcpRevTotal/1000).toFixed(1)}k`,unit: '', color: 'text-indigo-400',  bar: 'bg-indigo-500',  pct: Math.min(100, bcpRevTotal / 500)  },
    { label: { EN: 'Biometric Accuracy', RO: 'Acur. Biom.',       FR: 'Précis. Biom.',      RU: 'Точность Биом.'      }[lang], goal: { EN: 'Face/fingerprint match rate at this BCP. Target >= 95%', RO: 'Rată biom. la acest BCP. Obiectiv >= 95%',      FR: 'Taux biométrique ici. Objectif >= 95%',            RU: 'Совпадение биометрии на КПП. Цель >= 95%'        }[lang], value: bioAccuracy.toFixed(1),               unit: '%', color: bioAccuracy < 90 ? 'text-amber-400' : 'text-emerald-400', bar: 'bg-emerald-500', pct: bioAccuracy },
  ];

  // ── Derived document processing metrics ─────────────────────────────────────
  const safeRatio = (n: number, total: number) => total > 0 ? n / total : 0;
  const carsProc   = Math.max(1, Math.round(totalCleared * Math.min(safeRatio(typeCount.car,   Math.max(bcpActive.length,1)), 0.75)));
  const busesProc  = Math.max(0, Math.round(totalCleared * Math.min(safeRatio(typeCount.bus,   Math.max(bcpActive.length,1)), 0.25)));
  const trucksProc = Math.max(0, Math.round(totalCleared * Math.min(safeRatio(typeCount.truck, Math.max(bcpActive.length,1)), 0.50)));
  const personsEst    = carsProc * 2 + busesProc * 20 + trucksProc * 1;
  const passportsBio  = Math.round(personsEst * 0.70);
  const passportsOld  = Math.round(personsEst * 0.16);
  const nationalIDs   = Math.round(personsEst * 0.12);
  const travelDocs    = Math.round(personsEst * 0.02);
  const techPassBP    = carsProc + busesProc + trucksProc;
  const bpDocTotal    = passportsBio + passportsOld + nationalIDs + travelDocs + techPassBP;
  const svDeclTotal   = Math.round(trucksProc * 0.92) + Math.round(carsProc * 0.06) + Math.round(busesProc * 0.12);
  const im4Decls      = Math.round(svDeclTotal * 0.44);
  const ex1Decls      = Math.round(svDeclTotal * 0.31);
  const t1Decls       = Math.round(svDeclTotal * 0.19);
  const ataDecls      = Math.max(0, svDeclTotal - im4Decls - ex1Decls - t1Decls);
  const techPassSV    = trucksProc;
  const svDocTotal    = svDeclTotal + techPassSV;
  const flaggedTotal  = totalHighRisk + bcpDecls.filter(d => d.channel === 'RED' || d.channel === 'YELLOW').length;
  const confirmedHits = bcpActive.filter(v => v.watchlistHit || v.docAnomaly || v.bioMismatch).length
                      + bcpDecls.filter(d => d.status === 'SEIZED' || d.status === 'HELD').length;
  const detectionPct  = flaggedTotal > 0 ? Math.min(99, Math.round((confirmedHits / flaggedTotal) * 100)) : 0;
  const asycudaQueryRate = Math.max(0, svDeclTotal > 0 ? Math.round(svDeclTotal * 4.2) : 0); // ~4.2 queries/decl avg

  // ── NCE Operational Scorecard — 5 top-level rated indicators ──────────────
  const tfRating    = (bcpAvgWait < 45 && totalVehicles < 10) ? 'GOOD'     as const
                    :  bcpAvgWait < 120                        ? 'MEDIUM'   as const
                    :                                            'CRITICAL' as const;
  const secRating   = (totalHighRisk === 0 && bioFails === 0)      ? 'LOW'      as const
                    : (totalHighRisk <= 2  && bioFails <= 1)        ? 'MEDIUM'   as const
                    :  totalHighRisk <= 5                            ? 'HIGH'     as const
                    :                                                  'CRITICAL' as const;
  const coordRating = (slaBreaches === 0 && totalCleared >= 5) ? 'HIGH'   as const
                    :  slaBreaches <= 1                         ? 'MEDIUM' as const
                    :                                             'LOW'    as const;
  const custRating  = (redDecls === 0 && slaBreaches === 0) ? 'LOW'      as const
                    :  redDecls <= 3                          ? 'MEDIUM'   as const
                    :  redDecls <= 7                          ? 'HIGH'     as const
                    :                                          'CRITICAL' as const;
  const sc_crits    = ([tfRating === 'CRITICAL', secRating === 'CRITICAL', custRating === 'CRITICAL'] as boolean[]).filter(Boolean).length;
  const sc_warns    = ([tfRating === 'MEDIUM',   secRating !== 'LOW',      custRating !== 'LOW',   coordRating !== 'HIGH'] as boolean[]).filter(Boolean).length;
  const stabRating  = sc_crits >= 2           ? 'CRITICAL' as const
                    : sc_crits === 1           ? 'DEGRADED' as const
                    : sc_warns >= 3            ? 'DEGRADED' as const
                    : sc_warns >= 1            ? 'STABLE'   as const
                    :                           'OPTIMAL'  as const;

  return (
    <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">

      {/* ── NCE Operational Scorecard ────────────────────────────────────── */}
      <div className="bg-[#0D1219] border border-slate-800/50 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500">
            {{ EN: 'NCE Operational Status', RO: 'Status Operațional MCN', FR: 'État Opérationnel NCE', RU: 'Операционный Статус NCE' }[lang]}
          </span>
          <div className="flex-1 h-px bg-slate-800/60" />
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${stabRating === 'CRITICAL' ? 'bg-red-400' : stabRating === 'DEGRADED' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className="text-[7px] font-mono uppercase tracking-widest text-slate-600">LIVE · {bcpName}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">

          {/* 1 — Traffic Flow */}
          {(() => {
            const bg  = tfRating === 'GOOD'     ? 'bg-emerald-500/5 border-emerald-500/20'  : tfRating === 'MEDIUM' ? 'bg-amber-500/5 border-amber-500/20'  : 'bg-red-500/10 border-red-500/25';
            const txt = tfRating === 'GOOD'     ? 'text-emerald-300'                         : tfRating === 'MEDIUM' ? 'text-amber-300'                         : 'text-red-300';
            const val = ({ GOOD: { EN:'GOOD', RO:'BUN', FR:'BON', RU:'ХОРОШО' }, MEDIUM: { EN:'MEDIUM', RO:'MEDIU', FR:'MOYEN', RU:'СРЕДНИЙ' }, CRITICAL: { EN:'CRITICAL', RO:'CRITIC', FR:'CRITIQUE', RU:'КРИТИЧНО' } } as const)[tfRating][lang];
            return (
              <div className={`rounded-lg p-3 border flex flex-col gap-1 ${bg} ${tfRating === 'CRITICAL' ? 'animate-pulse' : ''}`}>
                <div className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{{ EN:'Traffic Flow', RO:'Flux Trafic', FR:'Flux de Trafic', RU:'Поток Трафика' }[lang]}</div>
                <div className={`text-[14px] font-black uppercase tracking-tight leading-none ${txt}`}>{val}</div>
                <div className="text-[8px] text-slate-600 font-mono mt-0.5">{bcpAvgWait}s avg · {totalVehicles} veh</div>
              </div>
            );
          })()}

          {/* 2 — Security Level */}
          {(() => {
            const bg  = secRating === 'LOW' ? 'bg-emerald-500/5 border-emerald-500/20' : secRating === 'MEDIUM' ? 'bg-amber-500/5 border-amber-500/20' : secRating === 'HIGH' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-red-500/10 border-red-500/25';
            const txt = secRating === 'LOW' ? 'text-emerald-300'                        : secRating === 'MEDIUM' ? 'text-amber-300'                        : secRating === 'HIGH' ? 'text-orange-300'                        : 'text-red-300';
            const val = ({ LOW: { EN:'LOW', RO:'SCĂZUT', FR:'BAS', RU:'НИЗКИЙ' }, MEDIUM: { EN:'MEDIUM', RO:'MEDIU', FR:'MOYEN', RU:'СРЕДНИЙ' }, HIGH: { EN:'HIGH', RO:'RIDICAT', FR:'ÉLEVÉ', RU:'ВЫСОКИЙ' }, CRITICAL: { EN:'CRITICAL', RO:'CRITIC', FR:'CRITIQUE', RU:'КРИТИЧНО' } } as const)[secRating][lang];
            return (
              <div className={`rounded-lg p-3 border flex flex-col gap-1 ${bg} ${secRating === 'CRITICAL' ? 'animate-pulse' : ''}`}>
                <div className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{{ EN:'Security Level', RO:'Nivel Securitate', FR:'Niveau Sécurité', RU:'Уровень Безоп.' }[lang]}</div>
                <div className={`text-[14px] font-black uppercase tracking-tight leading-none ${txt}`}>{val}</div>
                <div className="text-[8px] text-slate-600 font-mono mt-0.5">{totalHighRisk} hi-risk · {bioFails} bio↯</div>
              </div>
            );
          })()}

          {/* 3 — Coordination Efficiency */}
          {(() => {
            const bg  = coordRating === 'HIGH' ? 'bg-emerald-500/5 border-emerald-500/20' : coordRating === 'MEDIUM' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-red-500/10 border-red-500/25';
            const txt = coordRating === 'HIGH' ? 'text-emerald-300'                        : coordRating === 'MEDIUM' ? 'text-amber-300'                        : 'text-red-300';
            const val = ({ HIGH: { EN:'HIGH', RO:'RIDICATĂ', FR:'ÉLEVÉE', RU:'ВЫСОКАЯ' }, MEDIUM: { EN:'MEDIUM', RO:'MEDIE', FR:'MOYENNE', RU:'СРЕДНЯЯ' }, LOW: { EN:'LOW', RO:'SCĂZUTĂ', FR:'FAIBLE', RU:'НИЗКАЯ' } } as const)[coordRating][lang];
            return (
              <div className={`rounded-lg p-3 border flex flex-col gap-1 ${bg}`}>
                <div className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{{ EN:'Coord. Efficiency', RO:'Eficiență Coord.', FR:'Efficacité Coord.', RU:'Эфф. Координации' }[lang]}</div>
                <div className={`text-[14px] font-black uppercase tracking-tight leading-none ${txt}`}>{val}</div>
                <div className="text-[8px] text-slate-600 font-mono mt-0.5">{totalCleared} cleared · {slaBreaches} SLA↯</div>
              </div>
            );
          })()}

          {/* 4 — Customs Delay */}
          {(() => {
            const bg  = custRating === 'LOW' ? 'bg-emerald-500/5 border-emerald-500/20' : custRating === 'MEDIUM' ? 'bg-amber-500/5 border-amber-500/20' : custRating === 'HIGH' ? 'bg-orange-500/5 border-orange-500/20' : 'bg-red-500/10 border-red-500/25';
            const txt = custRating === 'LOW' ? 'text-emerald-300'                        : custRating === 'MEDIUM' ? 'text-amber-300'                        : custRating === 'HIGH' ? 'text-orange-300'                        : 'text-red-300';
            const val = ({ LOW: { EN:'LOW', RO:'SCĂZUT', FR:'FAIBLE', RU:'НИЗКАЯ' }, MEDIUM: { EN:'MEDIUM', RO:'MEDIU', FR:'MOYEN', RU:'СРЕДНЯЯ' }, HIGH: { EN:'HIGH', RO:'RIDICAT', FR:'ÉLEVÉ', RU:'ВЫСОКАЯ' }, CRITICAL: { EN:'CRITICAL', RO:'CRITIC', FR:'CRITIQUE', RU:'КРИТИЧНО' } } as const)[custRating][lang];
            return (
              <div className={`rounded-lg p-3 border flex flex-col gap-1 ${bg} ${custRating === 'CRITICAL' ? 'animate-pulse' : ''}`}>
                <div className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{{ EN:'Customs Delay', RO:'Întârziere Vamală', FR:'Retard Douanier', RU:'Задержки Таможни' }[lang]}</div>
                <div className={`text-[14px] font-black uppercase tracking-tight leading-none ${txt}`}>{val}</div>
                <div className="text-[8px] text-slate-600 font-mono mt-0.5">{redDecls} RED decl. · {slaBreaches} breach</div>
              </div>
            );
          })()}

          {/* 5 — Operational Stability */}
          {(() => {
            const bg  = (stabRating === 'OPTIMAL' || stabRating === 'STABLE') ? 'bg-emerald-500/5 border-emerald-500/20' : stabRating === 'DEGRADED' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-red-500/10 border-red-500/30';
            const txt = (stabRating === 'OPTIMAL' || stabRating === 'STABLE') ? 'text-emerald-300'                         : stabRating === 'DEGRADED' ? 'text-amber-300'                         : 'text-red-300';
            const val = ({ OPTIMAL: { EN:'OPTIMAL', RO:'OPTIM', FR:'OPTIMAL', RU:'ОПТИМ.' }, STABLE: { EN:'STABLE', RO:'STABIL', FR:'STABLE', RU:'СТАБИЛЬНО' }, DEGRADED: { EN:'DEGRADED', RO:'DEGRADAT', FR:'DÉGRADÉ', RU:'ДЕГРАДИРОВАН' }, CRITICAL: { EN:'CRITICAL', RO:'CRITIC', FR:'CRITIQUE', RU:'КРИТИЧНО' } } as const)[stabRating][lang];
            return (
              <div className={`rounded-lg p-3 border flex flex-col gap-1 ${bg} ${stabRating === 'CRITICAL' ? 'animate-pulse' : ''}`}>
                <div className="text-[8px] font-bold uppercase tracking-wide text-slate-500">{{ EN:'Op. Stability', RO:'Stabilitate Op.', FR:'Stabilité Op.', RU:'Операц. Стабил.' }[lang]}</div>
                <div className={`text-[14px] font-black uppercase tracking-tight leading-none ${txt}`}>{val}</div>
                <div className="text-[8px] text-slate-600 font-mono mt-0.5">{sc_crits} crit · {sc_warns} warn</div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* BCP Profile Header */}
      <div className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <h2 className="text-base font-bold text-slate-100 uppercase tracking-wide">{bcpName}</h2>
              <span className="text-[9px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">{selectedBCP}</span>
            </div>
            <p className="text-[10px] text-slate-500">
              {bcpObj?.countryA} ↔ {bcpObj?.countryB}
              {' · '}{entryLanes} { { EN: 'entry', RO: 'intrare', FR: 'entrée', RU: 'въезд' }[lang] }
              {' / '}{exitLanes} { { EN: 'exit lanes', RO: 'benzi ieșire', FR: 'voies sortie', RU: 'полос выезд' }[lang] }
              {truckLanes > 0 ? ` · ${truckLanes} ${ { EN: 'truck lanes', RO: 'benzi TIR', FR: 'voies PL', RU: 'полос ГА' }[lang] }` : ''}
            </p>
          </div>
          {/* Traffic type mix */}
          <div className="flex items-center gap-4 shrink-0">
            {([
              { key: 'car'   as const, icon: '🚗', label: { EN: 'Cars',    RO: 'Autoturisme', FR: 'Voitures', RU: 'Легковые' }[lang], clr: 'text-blue-400',   bar: 'bg-blue-500'   },
              { key: 'bus'   as const, icon: '🚌', label: { EN: 'Coaches', RO: 'Autobuze',    FR: 'Autocars', RU: 'Автобусы' }[lang], clr: 'text-violet-400', bar: 'bg-violet-500' },
              { key: 'truck' as const, icon: '🚛', label: { EN: 'Trucks',  RO: 'Camioane',    FR: 'Camions',  RU: 'Грузовые' }[lang], clr: 'text-amber-400',  bar: 'bg-amber-500'  },
            ]).map(t => {
              const n   = typeCount[t.key] ?? 0;
              const pct = Math.round((n / typeTotal) * 100);
              return (
                <div key={t.key} className="flex flex-col items-center gap-0.5 min-w-[44px]">
                  <span className="text-lg">{t.icon}</span>
                  <span className={`text-sm font-bold ${t.clr}`}>{n}</span>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${t.bar} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[8px] text-slate-600">{pct}%</span>
                  <span className="text-[7px] text-slate-700 truncate max-w-[44px] text-center">{t.label}</span>
                </div>
              );
            })}
          </div>
          {/* Risk breakdown */}
          <div className="flex items-center gap-2 shrink-0">
            {([
              { label: { EN: 'High', RO: 'Ridicat', FR: 'Élevé',  RU: 'Высок.' }[lang], val: bcpActive.filter(v=>v.risk==='High').length,   cls: 'text-red-400 border-red-500/30 bg-red-500/5'              },
              { label: { EN: 'Med.', RO: 'Mediu',   FR: 'Moyen',  RU: 'Средн.' }[lang], val: bcpActive.filter(v=>v.risk==='Medium').length, cls: 'text-amber-400 border-amber-500/30 bg-amber-500/5'        },
              { label: { EN: 'Low',  RO: 'Scăzut',  FR: 'Faible', RU: 'Низкий' }[lang], val: bcpActive.filter(v=>v.risk==='Low').length,    cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5'  },
            ].map(r => (
              <div key={r.label} className={`rounded-lg border px-2 py-1.5 text-center min-w-[44px] ${r.cls}`}>
                <div className="text-xl font-light">{r.val}</div>
                <div className="text-[8px] uppercase font-bold opacity-70">{r.label}</div>
              </div>
            )))}
          </div>
        </div>
      </div>

      {/* ── Indicatori de Performanță — 5 Piloni ─────────────────────────── */}
      <div className="space-y-4">

        {/* 1. PROCESATE */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-[11px] text-emerald-400 font-black">P</span>
            <span className="text-[11px] font-bold text-slate-100 uppercase tracking-wider">Procesate — Documente Verificate</span>
            <span className="ml-auto text-[9px] font-mono text-emerald-400">{bpDocTotal + svDocTotal} doc.</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* BP side */}
            <div className="space-y-1.5">
              <div className="text-[8px] text-blue-400 font-bold uppercase tracking-widest pb-1 border-b border-blue-900/30">
                🔵 PF — Poliția de Frontieră
              </div>
              {([
                { label: 'Pașapoarte biometrice (BAC/EAC)', val: passportsBio, src: 'ICAO Doc 9303 · ePassport RFID' },
                { label: 'Pașapoarte clasice (MRZ scan)', val: passportsOld, src: 'OCR · SIS II cross-ref.' },
                { label: 'Cărți de identitate naționale', val: nationalIDs, src: 'eID PACE · Reg. UE 2019/1157' },
                { label: 'Documente călătorie (CTD / RL)', val: travelDocs, src: 'UNHCR · ICAO Doc 9303' },
                { label: 'Pașapoarte tehnice vehicule', val: techPassBP, src: 'Reg. național vehicule + EUCARIS' },
              ] as const).map(d => (
                <div key={d.label} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[8px] text-slate-400 leading-tight block">{d.label}</span>
                    <span className="text-[7px] text-slate-700 leading-tight block">{d.src}</span>
                  </div>
                  <span className="text-[11px] font-light text-blue-300 shrink-0 font-mono tabular-nums">{d.val}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-slate-800/40 flex justify-between items-center">
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wide">Total PF</span>
                <span className="text-sm font-bold text-blue-400 font-mono">{bpDocTotal}</span>
              </div>
            </div>
            {/* SV side */}
            <div className="space-y-1.5">
              <div className="text-[8px] text-orange-400 font-bold uppercase tracking-widest pb-1 border-b border-orange-900/30">
                🟠 SV — Serviciul Vamal
              </div>
              {([
                { label: 'Declarații import IM4', val: im4Decls, src: 'ASYCUDA World · Tarif TARIC/RM' },
                { label: 'Declarații export EX1', val: ex1Decls, src: 'ASYCUDA World · ECS' },
                { label: 'Tranzit NCTS / T1 / T2', val: t1Decls, src: 'NCTS · ASYCUDA · EMCS' },
                { label: 'Carnet ATA / TIR', val: ataDecls, src: 'ARCA / IRU TIR-EPD' },
                { label: 'Pașapoarte tehnice (TIR/camioane)', val: techPassSV, src: 'Reg. național + e-CMR' },
              ] as const).map(d => (
                <div key={d.label} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[8px] text-slate-400 leading-tight block">{d.label}</span>
                    <span className="text-[7px] text-slate-700 leading-tight block">{d.src}</span>
                  </div>
                  <span className="text-[11px] font-light text-orange-300 shrink-0 font-mono tabular-nums">{d.val}</span>
                </div>
              ))}
              <div className="pt-1 border-t border-slate-800/40 flex justify-between items-center">
                <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wide">Total SV</span>
                <span className="text-sm font-bold text-orange-400 font-mono">{svDocTotal}</span>
              </div>
            </div>
          </div>
          {/* ASYCUDA note */}
          <div className="mt-3 px-3 py-2 rounded-lg border border-orange-900/20 bg-orange-950/10">
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-bold text-orange-500 uppercase tracking-widest">ASYCUDA World</span>
              <span className="text-[7px] text-slate-600">· UNCTAD Automated System for Customs Data · SV-MD deployment</span>
              <span className="text-[8px] font-mono text-orange-400 ml-auto">{asycudaQueryRate} interogări</span>
            </div>
            <p className="text-[7px] text-slate-600 mt-0.5 leading-relaxed">
              Gestionează toate declarațiile vamale (IM4/EX1/NCTS/ATA), aplică selectivitatea automată de risc (canal VERDE/GALBEN/ROȘU), calculează taxele și accizele, interogează TARIC, EMCS și EORI. Baza de date primară a Serviciului Vamal al RM.
            </p>
          </div>
        </div>

        {/* 2. RISC RIDICAT */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center text-[11px] text-red-400 font-black">R</span>
            <span className="text-[11px] font-bold text-slate-100 uppercase tracking-wider">Risc Ridicat — Profil Amenințare</span>
            <span className={`ml-auto text-sm font-bold font-mono ${totalHighRisk > 3 ? 'text-red-400 animate-pulse' : totalHighRisk > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {totalHighRisk} vehicule
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            {([
              { label: { EN: 'Watchlist Hit', RO: 'Hit Listă Supraveghere', FR: 'Hit Liste Surveillance', RU: 'Попадание в Список' }[lang], val: bcpActive.filter(v=>v.watchlistHit).length, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', src: 'SIS II · INTERPOL I-24/7 · Europol EIS' },
              { label: { EN: 'Doc. Anomaly', RO: 'Anomalie Documente', FR: 'Anomalie Documents', RU: 'Аномалия Документов' }[lang], val: bcpActive.filter(v=>v.docAnomaly).length,   color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', src: 'MRZ OCR · RFID BAC/EAC · SOP-005' },
              { label: { EN: 'Bio Mismatch', RO: 'Nepotrivire Biom.', FR: 'Désaccord Biom.', RU: 'Несовпадение Биом.' }[lang], val: bcpActive.filter(v=>v.bioMismatch).length,   color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', src: 'Face · Iris · Fingerprint scanner' },
              { label: { EN: 'RED Decl.', RO: 'Declarație Roșu', FR: 'Décl. Rouge', RU: 'Красный Кан.' }[lang], val: redDecls, color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/20', src: 'ASYCUDA selectivity engine · risk matrix' },
            ] as const).map(r => (
              <div key={r.label} className={`rounded-lg border p-2.5 ${r.bg}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <div className={`text-xl font-light ${r.color}`}>{r.val}</div>
                    <div className="text-[8px] text-slate-500 mt-0.5">{r.label}</div>
                    <div className="text-[7px] text-slate-700 mt-0.5 leading-tight">{r.src}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <details className="mt-1">
            <summary className="text-[8px] text-slate-700 cursor-pointer hover:text-slate-500 select-none">
              {{ EN: '▸ How is risk score calculated?', RO: '▸ Cum se calculează scorul de risc?', FR: '▸ Comment le score de risque est-il calculé?', RU: '▸ Как рассчитывается оценка риска?' }[lang]}
            </summary>
            <div className="mt-2 text-[8px] text-slate-500 leading-relaxed space-y-1">
              <p><span className="text-slate-300 font-bold">Formula:</span> Score = (routeRisk × 35) + (originRisk × 25) + (watchlist × 20) + (docAnomaly × 12) + (bioMismatch × 8)</p>
              <p><span className="text-slate-400">routeRisk</span> — risc itinerariu bazat pe istoricul traseului (0–1)</p>
              <p><span className="text-slate-400">originRisk</span> — risc țara de origine (conform listei INTERPOL / EU)</p>
              <p><span className="text-slate-400">watchlist</span> — plăcuța de înmatriculare sau identitatea persoanei în SIS II / INTERPOL</p>
              <p><span className="text-slate-400">docAnomaly</span> — checksum MRZ FAIL sau chip RFID neautentic</p>
              <p><span className="text-slate-400">bioMismatch</span> — față / iris / amprente sub pragul de concordanță</p>
              <p className="pt-1 border-t border-slate-800/40">Score &gt;= 75 → RIDICAT · 40–74 → MEDIU · &lt; 40 → SCĂZUT</p>
            </div>
          </details>
        </div>

        {/* 3. RATĂ DETECTARE */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-[11px] text-violet-400 font-black">D</span>
            <span className="text-[11px] font-bold text-slate-100 uppercase tracking-wider">Rată Detectare</span>
            <span className={`ml-auto text-sm font-bold font-mono ${detectionPct >= 60 ? 'text-emerald-400' : detectionPct >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
              {detectionPct}%
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-3">
            <div className={`h-full rounded-full transition-all duration-700 ${detectionPct >= 60 ? 'bg-emerald-500' : detectionPct >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${detectionPct}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-slate-900/40 rounded p-2 border border-slate-800/40 text-center">
              <div className="text-sm font-light text-violet-300">{flaggedTotal}</div>
              <div className="text-[7px] text-slate-600 uppercase mt-0.5">Semnalate / Inspectate</div>
            </div>
            <div className="bg-slate-900/40 rounded p-2 border border-slate-800/40 text-center">
              <div className="text-sm font-light text-emerald-300">{confirmedHits}</div>
              <div className="text-[7px] text-slate-600 uppercase mt-0.5">Confirmate (sechestrate + reținute)</div>
            </div>
            <div className="bg-slate-900/40 rounded p-2 border border-slate-800/40 text-center">
              <div className="text-sm font-light text-slate-300">{slaBreaches}</div>
              <div className="text-[7px] text-slate-600 uppercase mt-0.5">Depășiri SLA (&gt;2 min)</div>
            </div>
          </div>
          <details>
            <summary className="text-[8px] text-slate-700 cursor-pointer hover:text-slate-500 select-none">
              {{ EN: '▸ Detection Rate methodology — data sources', RO: '▸ Metodologie Rată Detectare — surse de date', FR: '▸ Méthodologie Taux Détection — sources', RU: '▸ Методология Коэффициента Обнаружения' }[lang]}
            </summary>
            <div className="mt-2 text-[8px] text-slate-500 leading-relaxed space-y-1">
              <p><span className="text-slate-300 font-bold">Formula:</span> (Confirmate Sechestrate + Reținute + Anomalii Vehicule) / (Total Semnalate Risc Ridicat + Canal R/G) × 100</p>
              <p><span className="text-violet-400 font-bold">ASYCUDA World</span> — motor de selectivitate: atribuie automat canal ROȘU / GALBEN / VERDE la declarații pe baza matricei de risc (HS code, valoare, origine, trader history). Este prima linie de detectare vamală.</p>
              <p><span className="text-blue-400 font-bold">SIS II + INTERPOL I-24/7</span> — interogări în timp real la toate persoanele și vehiculele. O detectare SIS II = persoană / vehicul semnalate în baza de date europeană.</p>
              <p><span className="text-amber-400 font-bold">Risk Score engine (MRZ + Bio + Route)</span> — calculat la nivel de vehicul. Score &gt;= 75 = RIDICAT și trimis automat spre inspecție secundară.</p>
              <p><span className="text-emerald-400 font-bold">EUCARIS + VSCI</span> — interogare VIN pentru detectare vehicule furate / cod VIN modificat.</p>
              <p className="pt-1 border-t border-slate-800/40 text-slate-600">Notă: rata &lt;30% sugerează selectivitate slabă a riscului sau lipsa inspecțiilor fizice. Obiectiv operațional: &gt;= 55%.</p>
            </div>
          </details>
        </div>

      </div>

      {/* ── Quick-stats mini-row (legacy KPI cards) */}
      <div className="grid grid-cols-4 gap-3">
        {kpis.slice(0,4).map(k => (
          <div key={k.label} className="bg-[#0D1118] border border-slate-800/40 rounded-lg p-3">
            <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-0.5">{k.label}</div>
            <div className={`text-xl font-light ${k.color} flex items-baseline gap-0.5`}>
              {k.value}<span className="text-[10px] opacity-60">{k.unit}</span>
            </div>
            <div className="mt-2 h-0.5 bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full ${k.bar} transition-all duration-700`} style={{ width: `${k.pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Revenue breakdown — BCP-specific from linked declarations */}
      {(() => {
        const releasedBcp = bcpDecls.filter(d => d.status === 'RELEASED' || d.status === 'SUBMITTED' || d.status === 'INSPECTION');
        const bcpDuties  = releasedBcp.reduce((s,d) => s + d.duties, 0);
        const bcpVat     = releasedBcp.reduce((s,d) => s + d.vat,    0);
        const bcpExcise  = releasedBcp.reduce((s,d) => s + d.excise, 0);
        return (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: { EN: 'Duties',  RO: 'Taxe Vamale', FR: 'Droits',  RU: 'Пошлины' }[lang], val: bcpDuties,  color: 'text-indigo-400' },
              { label: { EN: 'VAT',     RO: 'TVA',          FR: 'TVA',     RU: 'НДС'     }[lang], val: bcpVat,     color: 'text-purple-400' },
              { label: { EN: 'Excise',  RO: 'Accize',       FR: 'Accises', RU: 'Акцизы'  }[lang], val: bcpExcise,  color: 'text-pink-400'   },
            ].map(r => (
              <div key={r.label} className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                  <span>{r.label}</span>
                  <span className="text-[8px] text-blue-400 font-mono">{bcpName}</span>
                </div>
                <div className={`text-xl font-light ${r.color}`}>€{r.val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Trend Charts */}
      {usedRevHist.length >= 2 && usedThruHist.length >= 2 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Revenue trend — interactive */}
          <div className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-3">
              {{ EN: 'Declared Value Trend (EUR)', RO: 'Evoluție Valoare Declarată (EUR)', FR: 'Évolution Valeur Déclarée (EUR)', RU: 'Динамика Задекларированной Стоимости' }[lang]}
            </div>
            {(() => {
              const slicedRev = usedRevHist.slice(-40);
              const maxR = Math.max(...slicedRev.map(h => h.amount), 1);
              const svgW = 100; const svgH = 60;
              const rx = (i: number) => (i / Math.max(slicedRev.length - 1, 1)) * svgW;
              const ry = (v: number) => svgH - (v / maxR) * svgH;
              const rPts = slicedRev.map((h, i) => `${rx(i)},${ry(h.amount)}`).join(' ');
              const selRev = revClickIdx !== null ? slicedRev[revClickIdx] ?? null : null;
              return (
                <>
                  <div className="relative cursor-crosshair" onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const idx = Math.round(x * (slicedRev.length - 1));
                    setRevClickIdx(prev => prev === idx ? null : Math.max(0, Math.min(slicedRev.length - 1, idx)));
                  }}>
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-20" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="gradRevKPI" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <line x1="0" y1={svgH} x2={svgW} y2={svgH} stroke="#334155" strokeWidth="0.5" />
                      <polygon points={`${rPts} ${svgW},${svgH} 0,${svgH}`} fill="url(#gradRevKPI)" />
                      <polyline fill="none" stroke="#6366f1" strokeWidth="2" points={rPts} vectorEffect="non-scaling-stroke" />
                      {revClickIdx !== null && revClickIdx < slicedRev.length && (
                        <>
                          <line x1={rx(revClickIdx)} y1={0} x2={rx(revClickIdx)} y2={svgH} stroke="#94a3b880" strokeWidth="0.6" strokeDasharray="2,2" />
                          <circle cx={rx(revClickIdx)} cy={ry(slicedRev[revClickIdx].amount)} r="2.5" fill="#6366f1" stroke="white" strokeWidth="0.8" />
                        </>
                      )}
                    </svg>
                  </div>
                  <div className="text-[9px] text-slate-600 mt-1">
                    {{ EN: 'Click chart to see declared value at that point', RO: 'Click pe grafic pentru valoarea declarată la acel moment', FR: 'Cliquez pour voir la valeur à ce point', RU: 'Нажмите для просмотра стоимости в этот момент' }[lang]}
                  </div>
                  {selRev && (
                    <div className="mt-2 bg-slate-900/60 border border-indigo-500/20 rounded-lg p-2.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">{{ EN: 'Declared Total', RO: 'Total Declarat', FR: 'Total Déclaré', RU: 'Задекларировано' }[lang]}</span>
                        <span className="font-mono font-bold text-indigo-300">€{selRev.amount.toLocaleString()}</span>
                      </div>
                      <div className="text-[8px] text-slate-600 mt-0.5 font-mono">
                        {new Date(selRev.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Throughput dual-line chart */}
          <div className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                {{ EN: 'Controlled Vehicles — Entry & Exit', RO: 'Vehicule Controlate — Intrare & Ieșire', FR: 'Véhicules Contrôlés — Entrée & Sortie', RU: 'Контролируемые ТС — Въезд & Выезд' }[lang]}
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[9px] text-emerald-400">
                  <span className="w-4 h-0.5 bg-emerald-500 inline-block rounded" />
                  {{ EN: 'Entry', RO: 'Intrare', FR: 'Entrée', RU: 'Въезд' }[lang]}
                </span>
                <span className="flex items-center gap-1 text-[9px] text-blue-400">
                  <span className="w-4 h-0.5 bg-blue-500 inline-block rounded" />
                  {{ EN: 'Exit', RO: 'Ieșire', FR: 'Sortie', RU: 'Выезд' }[lang]}
                </span>
              </div>
            </div>
            {(() => {
              const sliced = usedThruHist.slice(-40);
              const maxV   = Math.max(...sliced.map(h => h.entry + h.exit), 1);
              const svgW = 100; const svgH = 60;
              const ptX = (i: number) => (i / Math.max(sliced.length - 1, 1)) * svgW;
              const ptY = (v: number) => svgH - (v / maxV) * svgH;
              const entryPts = sliced.map((h, i) => `${ptX(i)},${ptY(h.entry)}`).join(' ');
              const exitPts  = sliced.map((h, i) => `${ptX(i)},${ptY(h.exit)}`).join(' ');
              const sel = chartClickIdx !== null ? sliced[chartClickIdx] ?? null : null;
              return (
                <>
                  <div className="relative cursor-crosshair" onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width;
                    const idx = Math.round(x * (sliced.length - 1));
                    setChartClickIdx(prev => prev === idx ? null : Math.max(0, Math.min(sliced.length - 1, idx)));
                  }}>
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-20" preserveAspectRatio="none">
                      <line x1="0" y1={svgH} x2={svgW} y2={svgH} stroke="#334155" strokeWidth="0.5" />
                      <polyline fill="none" stroke="#10b981" strokeWidth="1.5" points={entryPts} vectorEffect="non-scaling-stroke" />
                      <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" points={exitPts}  vectorEffect="non-scaling-stroke" />
                      {chartClickIdx !== null && chartClickIdx < sliced.length && (
                        <line x1={ptX(chartClickIdx)} y1={0} x2={ptX(chartClickIdx)} y2={svgH} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="2,2" />
                      )}
                    </svg>
                  </div>
                  <div className="text-[9px] text-slate-600 mt-1">
                    {{ EN: 'Click chart to see vehicle type breakdown', RO: 'Click pe grafic pentru detalii pe tipuri de vehicule', FR: 'Cliquez sur le graphique pour les détails par type', RU: 'Нажмите на график для детализации по типам ТС' }[lang]}
                  </div>
                  {sel && (
                    <div className="mt-2 bg-slate-900/70 border border-slate-700/50 rounded-lg p-3">
                      <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">
                        {{ EN: 'Breakdown at selected point', RO: 'Detalii la momentul selectat', FR: 'Détail au point sélectionné', RU: 'Детализация выбранного момента' }[lang]}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                        <div className="text-emerald-400 font-bold">{{ EN: 'Entry total', RO: 'Total intrare', FR: 'Total entrée', RU: 'Итого въезд' }[lang]}: {sel.entry}</div>
                        <div className="text-blue-400 font-bold">{{ EN: 'Exit total', RO: 'Total ieșire', FR: 'Total sortie', RU: 'Итого выезд' }[lang]}: {sel.exit}</div>
                        {(['car','bus','truck'] as const).map(t => {
                          const typeLabel: Record<typeof t, Record<Language, string>> = {
                            car:   { EN: 'Car', RO: 'Autoturism', FR: 'Voiture', RU: 'Легковой' },
                            bus:   { EN: 'Bus', RO: 'Autobus',    FR: 'Bus',     RU: 'Автобус' },
                            truck: { EN: 'Truck', RO: 'Camion',   FR: 'Camion',  RU: 'Грузовой' },
                          };
                          return (
                            <React.Fragment key={t}>
                              <div className="text-slate-400">{typeLabel[t][lang]}: <span className="text-emerald-300">{sel.entryByType?.[t] ?? 0}</span></div>
                              <div className="text-slate-500">{typeLabel[t][lang]}: <span className="text-blue-300">{sel.exitByType?.[t] ?? 0}</span></div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* BCP Performance Table */}
      <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
          <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'BCP-Level Performance Indicators', RO: 'Indicatori de Performanță pe PVF/PTF', FR: 'Indicateurs de Performance par PdP', RU: 'Показатели Эффективности КПП' }[lang]}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800 bg-slate-900/50">
              <th className="p-3">{{ EN: 'Checkpoint', RO: 'Punct de Trecere', FR: 'Point de Passage', RU: 'КПП' }[lang]}</th><th className="p-3 text-right">{{ EN: 'Cleared', RO: 'Procesate', FR: 'Traités', RU: 'Пройдено' }[lang]}</th><th className="p-3 text-right">{{ EN: 'High Risk', RO: 'Risc Ridicat', FR: 'Haut Risque', RU: 'Высокий Риск' }[lang]}</th><th className="p-3 text-right">{{ EN: 'Detection Rate', RO: 'Rată Detectare', FR: 'Taux Détection', RU: 'Уровень Обнаружения' }[lang]}</th><th className="p-3 text-right">{{ EN: 'Revenue', RO: 'Venituri', FR: 'Recettes', RU: 'Доходы' }[lang]}</th><th className="p-3 text-right">{{ EN: 'Status', RO: 'Status', FR: 'Statut', RU: 'Статус' }[lang]}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800/50">
              {BCPS.map(bcp => {
                const perf     = bcpPerformance[bcp.id] || { cleared: 0, highRisk: 0 };
                const detRate  = perf.cleared > 0 ? ((perf.highRisk / perf.cleared) * 100).toFixed(1) : '0.0';
                const isActive = bcp.id === selectedBCP;
                const bcpRevH  = bcpRevenueHistory[bcp.id] ?? [];
                const bcpRevT  = bcpRevH.length > 0 ? bcpRevH[bcpRevH.length - 1].amount : 0;
                return (
                  <tr key={bcp.id} className={`text-xs transition-colors ${isActive ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500' : 'hover:bg-slate-800/20'}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
                        <div className={`font-medium ${isActive ? 'text-emerald-300' : 'text-slate-300'}`}>{bcp.name}</div>
                      </div>
                      <div className="text-[9px] text-slate-600">{bcp.countryA} ↔ {bcp.countryB}</div>
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-400">{perf.cleared}</td>
                    <td className="p-3 text-right font-mono text-red-400">{perf.highRisk}</td>
                    <td className="p-3 text-right"><span className={`font-mono ${parseFloat(detRate) > 10 ? 'text-amber-400' : 'text-slate-400'}`}>{detRate}%</span></td>
                    <td className="p-3 text-right font-mono text-indigo-400 text-[10px]">€{(bcpRevT/1000).toFixed(1)}k</td>
                    <td className="p-3 text-right"><div className={`w-2 h-2 rounded-full ml-auto ${perf.cleared > 10 ? 'bg-emerald-500' : 'bg-slate-600'}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Interoperability Layer ───────────────────────────────────────────────────
const InteropLayer: React.FC<{ vehicles: Vehicle[]; declarations: Declaration[]; lang: Language; selectedBCP: string }> = ({ vehicles, declarations, lang, selectedBCP }) => {
  const [queryFeed, setQueryFeed] = useState<{ time: number; system: string; qKey: string; result: 'HIT' | 'CLEAR' }[]>([]);
  const [expandedQuery, setExpandedQuery] = useState<number | null>(null);
  const [systems, setSystems] = useState<ExternalSystem[]>(() => EXTERNAL_SYSTEMS.map(s => ({ ...s })));

  const activeEngineKeys = BCP_ACTIVE_ENGINES[selectedBCP] ?? DEFAULT_ENGINES;
  const activeEngineCount = activeEngineKeys.length;

  useEffect(() => {
    const queryTypeKeys = activeEngineKeys;
    const feedInterval = setInterval(() => {
      setSystems(prev => prev.map(s => ({
        ...s,
        latencyMs: Math.max(5, Math.round(s.latencyMs + (Math.random() - 0.5) * s.latencyMs * 0.18)),
        queriesHour: Math.max(1, s.queriesHour + Math.round((Math.random() - 0.4) * 8)),
        status: s.id === 'FATF'
          ? (Math.random() < 0.15 ? (s.status === 'ONLINE' ? 'DEGRADED' : 'ONLINE') : s.status)
          : (Math.random() < 0.02 ? (s.status === 'ONLINE' ? 'DEGRADED' : 'ONLINE') : s.status),
      })));
      if (Math.random() < 0.7) {
        setSystems(cur => {
          const sys = randomItem(cur);
          setQueryFeed(prev => [{
            time: Date.now(),
            system: sys.name,
            qKey: randomItem(queryTypeKeys),
            result: (Math.random() < 0.08 ? 'HIT' : 'CLEAR') as 'HIT' | 'CLEAR',
          }, ...prev].slice(0, 25));
          return cur;
        });
      }
    }, 800);
    return () => clearInterval(feedInterval);
  }, []);

  const statusColor = (s: ExternalSystem['status']) =>
    s === 'ONLINE' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
    s === 'DEGRADED' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
    'text-red-400 bg-red-500/10 border-red-500/20';

  const typeColor: Record<string, string> = {
    Border: 'text-blue-400', Intelligence: 'text-violet-400', Trade: 'text-emerald-400',
    Identity: 'text-cyan-400', Environmental: 'text-teal-400', Financial: 'text-indigo-400',
    National: 'text-orange-400', Customs: 'text-amber-400',
  };

  const totalQueries = systems.reduce((a, s) => a + s.queriesHour, 0);
  const onlineCount = systems.filter(s => s.status === 'ONLINE').length;

  // ── Pipeline live values ─────────────────────────────────────────────────────
  const pipActiveVs  = vehicles.filter(v => v.status !== 'cleared');
  const pipRiskH     = pipActiveVs.filter(v => v.risk === 'High').length;
  const pipRiskM     = pipActiveVs.filter(v => v.risk === 'Medium').length;
  const pipTriggered = pipActiveVs.filter(v => v.watchlistHit || v.docAnomaly || v.bioMismatch).length;
  const pipLatePlate = pipActiveVs.length > 0 ? pipActiveVs[pipActiveVs.length - 1].plate : '— — —';
  const pipTrend     = pipActiveVs.length > 10
    ? { EN: '↑ Rising',  RO: '↑ Creștere',  FR: '↑ En hausse',  RU: '↑ Рост'      }[lang]
    : pipActiveVs.length < 5
    ? { EN: '↓ Easing',  RO: '↓ Scădere',   FR: '↓ En baisse',  RU: '↓ Снижение'  }[lang]
    : { EN: '→ Stable',  RO: '→ Stabil',     FR: '→ Stable',     RU: '→ Стабильно' }[lang];
  const pipStatus    = pipRiskH > 3
    ? { EN: 'CRITICAL',  RO: 'CRITIC',       FR: 'CRITIQUE',     RU: 'КРИТИЧНО'    }[lang]
    : pipRiskH > 1
    ? { EN: 'ELEVATED',  RO: 'RIDICAT',      FR: 'ÉLEVÉ',        RU: 'ПОВЫШЕН'     }[lang]
    : { EN: 'STABLE',    RO: 'STABIL',       FR: 'STABLE',       RU: 'СТАБИЛЬНО'   }[lang];
  const redChan = declarations.filter(d => d.channel === 'RED' && (d.status === 'SUBMITTED' || d.status === 'INSPECTION')).length;

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-y-auto custom-scrollbar">

      {/* ══════════════════════════════════════════════════════════════════════
          AI PROCESSING PIPELINE — end-to-end data-flow diagram
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="col-span-12 bg-[#0d111a] border border-slate-800/60 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">
                {{ EN: 'AI Processing Pipeline', RO: 'Lanțul de Procesare AI', FR: 'Pipeline de Traitement IA', RU: 'Конвейер Обработки ИИ' }[lang]}
              </h3>
              <span className="text-[8px] text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase animate-pulse">LIVE</span>
            </div>
            <p className="text-[9px] text-slate-500 mt-0.5">
              {{ EN: 'End-to-end data flow · Camera capture → Officer action', RO: 'Flux complet de date · Captare video → Acțiunea ofițerului', FR: 'Flux de données complet · Caméra → Action de l\'officier', RU: 'Полный поток данных · Видео → Действие офицера' }[lang]}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-4 text-[9px] text-slate-500">
            {[
              { dot: '#22d3ee', label: { EN: 'Capture',    RO: 'Captare',      FR: 'Capture',     RU: 'Захват'       }[lang] },
              { dot: '#a78bfa', label: { EN: 'Processing', RO: 'Procesare',    FR: 'Traitement',  RU: 'Обработка'    }[lang] },
              { dot: '#fb923c', label: { EN: 'Intelligence',RO:'Analiză',      FR: 'Intelligence',RU: 'Анализ'       }[lang] },
              { dot: '#34d399', label: { EN: 'Action',     RO: 'Acțiune',      FR: 'Action',      RU: 'Действие'     }[lang] },
            ].map(g => (
              <span key={g.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: g.dot }} />
                {g.label}
              </span>
            ))}
          </div>
        </div>

        {/* Pipeline nodes */}
        <div className="px-4 py-4 overflow-x-auto no-scrollbar">
          <div className="flex items-stretch min-w-max gap-0">
            {(() => {
              const stages = [
                /* 0 */ {
                  id: 'cam',
                  phase: { EN: 'INPUT',    RO: 'INTRARE',    FR: 'ENTRÉE',    RU: 'ВВОД'       }[lang],
                  title: { EN: 'Camera / BCP Lane Video',    RO: 'Cameră / Video Culoar',   FR: 'Caméra / Vidéo Voie',  RU: 'Камера / Видео Полосы' }[lang],
                  live:  `${pipActiveVs.length} vehs · HD`,
                  color: '#22d3ee',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>,
                },
                /* 1 */ {
                  id: 'ocr',
                  phase: { EN: 'AI OCR',   RO: 'IA OCR',     FR: 'IA OCR',    RU: 'ИИ ОЦП'     }[lang],
                  title: { EN: 'AI Plate Recognition',       RO: 'Recunoaștere Plăcuță AI', FR: 'Reconnaissance Plaque IA', RU: 'ИИ Распознавание Номеров' }[lang],
                  live:  { EN: 'Conf: 97.3% · 28 fps', RO: 'Conf: 97.3% · 28 fps', FR: 'Conf: 97,3% · 28 ips', RU: 'Точн: 97.3% · 28 к/с' }[lang],
                  color: '#60a5fa',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>,
                },
                /* 2 */ {
                  id: 'plate',
                  phase: { EN: 'EXTRACT',  RO: 'EXTRAGERE',  FR: 'EXTRACTION',RU: 'ИЗВЛЕЧЕНИЕ' }[lang],
                  title: { EN: 'Plate + Confidence Score',   RO: 'Plăcuță + Scor Încredere', FR: 'Plaque + Score Confiance', RU: 'Номер + Оценка Уверенности' }[lang],
                  live:  `${pipLatePlate}`,
                  color: '#818cf8',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>,
                },
                /* 3 */ {
                  id: 'db',
                  phase: { EN: 'QUERY',    RO: 'INTEROGARE', FR: 'REQUÊTE',   RU: 'ЗАПРОС'     }[lang],
                  title: { EN: 'Cross-check Databases',      RO: 'Verificare Baze de Date',  FR: 'Recoupement Bases de Données', RU: 'Проверка по Базам Данных' }[lang],
                  live:  `${totalQueries.toLocaleString()}/h · ${onlineCount} DBs`,
                  color: '#a78bfa',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/></svg>,
                },
                /* 4 */ {
                  id: 'policy',
                  phase: { EN: 'RULES',    RO: 'REGULI',     FR: 'RÈGLES',    RU: 'ПРАВИЛА'    }[lang],
                  title: { EN: 'Rule-Based Policy Engine',   RO: 'Motor Politici Bazate pe Reguli', FR: 'Moteur de Politiques', RU: 'Механизм Политик' }[lang],
                  live:  `${pipTriggered} ${lang === 'RO' ? 'declanșate' : lang === 'FR' ? 'déclenchées' : lang === 'RU' ? 'сработало' : 'triggered'}`,
                  color: '#fbbf24',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>,
                },
                /* 5 */ {
                  id: 'ml',
                  phase: { EN: 'ML',       RO: 'ML',         FR: 'ML',        RU: 'МЛ'         }[lang],
                  title: { EN: 'ML Risk Classification',     RO: 'Clasificare Risc ML',      FR: 'Classification Risque ML', RU: 'ML Классификация Рисков' }[lang],
                  live:  `H: ${pipRiskH}  M: ${pipRiskM}  RED: ${redChan}`,
                  color: '#fb923c',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/></svg>,
                },
                /* 6 */ {
                  id: 'forecast',
                  phase: { EN: 'FORECAST', RO: 'PROGNOZĂ',   FR: 'PRÉVISION', RU: 'ПРОГНОЗ'    }[lang],
                  title: { EN: 'Regression Forecasting',     RO: 'Prognoze prin Regresie',   FR: 'Prévision par Régression', RU: 'Регрессионный Прогноз' }[lang],
                  live:  pipTrend,
                  color: '#2dd4bf',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>,
                },
                /* 7 */ {
                  id: 'dash',
                  phase: { EN: 'LIVE',     RO: 'LIVE',       FR: 'LIVE',      RU: 'LIVE'       }[lang],
                  title: { EN: 'Joint Coordination Dashboard', RO: 'Tablou de Bord Comun',  FR: 'Tableau de Bord Commun', RU: 'Единый Панель Координации' }[lang],
                  live:  pipStatus,
                  color: '#34d399',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>,
                },
                /* 8 */ {
                  id: 'officers',
                  phase: { EN: 'ACTION',   RO: 'ACȚIUNE',    FR: 'ACTION',    RU: 'ДЕЙСТВИЕ'   }[lang],
                  title: { EN: 'Border Guard + Customs Officers', RO: 'Polițiști + Inspectori Vamali', FR: 'Gardes Frontière + Douaniers', RU: 'Пограничники + Таможенники' }[lang],
                  live:  { EN: 'Joint ops · Staffed', RO: 'Operațiuni comune · Echipat', FR: 'Opérations conjointes · Équipé', RU: 'Совм. операции · Укомплектовано' }[lang],
                  color: '#86efac',
                  icon: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>,
                },
              ];

              return stages.map((s, i) => (
                <React.Fragment key={s.id}>
                  {/* ── Node card ── */}
                  <div className="w-[118px] shrink-0 flex flex-col rounded-xl border p-2.5 bg-slate-900/50 relative"
                    style={{ borderColor: `${s.color}28` }}>
                    {/* Phase label */}
                    <div className="text-[8px] font-bold uppercase tracking-widest mb-2" style={{ color: s.color }}>{s.phase}</div>
                    {/* Icon */}
                    <div className="flex justify-center mb-2">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.color}14`, border: `1px solid ${s.color}28`, color: s.color }}>
                        {s.icon}
                      </div>
                    </div>
                    {/* Title */}
                    <div className="text-[9px] text-slate-200 font-medium text-center leading-tight mb-2 flex-1">{s.title}</div>
                    {/* Live value */}
                    <div className="rounded-md px-1.5 py-1 text-center" style={{ background: `${s.color}0e`, border: `1px solid ${s.color}22` }}>
                      <div className="text-[8px] font-mono leading-tight" style={{ color: s.color }}>{s.live}</div>
                    </div>
                    {/* Step number */}
                    <div className="absolute top-1.5 right-2 text-[8px] font-bold text-slate-700">{i + 1}</div>
                  </div>

                  {/* ── Connector arrow ── */}
                  {i < stages.length - 1 && (() => {
                    const isBidi = i === stages.length - 2; // Dashboard ↔ Officers
                    return (
                      <div className={`relative flex flex-col items-center justify-center ${isBidi ? 'w-12' : 'w-7'} shrink-0 gap-0`}>
                        {isBidi && (
                          <div className="text-[6px] font-bold tracking-widest mb-0.5 text-emerald-400/70 uppercase">SYNC</div>
                        )}
                        {/* Base line */}
                        <div className="relative w-full flex items-center" style={{ height: '14px' }}>
                          <div className="w-full h-px" style={{ background: `linear-gradient(to right, ${s.color}40, ${stages[i+1].color}40)` }} />
                          {/* Forward arrow head */}
                          <svg className="absolute right-0 shrink-0" width="5" height="7" viewBox="0 0 5 7">
                            <path d="M0 0l5 3.5L0 7z" style={{ fill: stages[i+1].color, opacity: 0.5 }} />
                          </svg>
                          {/* Backward arrow head (only on bidirectional connector) */}
                          {isBidi && (
                            <svg className="absolute left-0 shrink-0" width="5" height="7" viewBox="0 0 5 7">
                              <path d="M5 0L0 3.5L5 7z" style={{ fill: s.color, opacity: 0.5 }} />
                            </svg>
                          )}
                          {/* Forward flowing particle */}
                          <div className="pipeline-dot" style={{ background: s.color, boxShadow: `0 0 7px ${s.color}cc`, animationDelay: `${i * 0.25}s` }} />
                          {/* Reverse flowing particle (only on bidirectional connector) */}
                          {isBidi && (
                            <div className="pipeline-dot-rev" style={{ background: stages[i+1].color, boxShadow: `0 0 7px ${stages[i+1].color}cc`, animationDelay: `1.1s` }} />
                          )}
                        </div>
                        {isBidi && (
                          <div className="text-[6px] text-slate-600 mt-0.5">real-time</div>
                        )}
                      </div>
                    );
                  })()}
                </React.Fragment>
              ));
            })()}
          </div>
        </div>
      </div>
      {/* ══════════════════════════════════════════════════════════════════════ */}

      <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: { EN: 'Systems Online',     RO: 'Sisteme Online',     FR: 'Systèmes en Ligne',   RU: 'Системы Онлайн'      }[lang], desc: { EN: 'Connected and operational external databases', RO: 'Baze de date externe conectate și funcționale', FR: 'Bases de données externes connectées et opérationnelles', RU: 'Подключённые и работающие внешние базы данных' }[lang], value: `${onlineCount}/${systems.length}`, color: 'text-emerald-400' },
            { label: { EN: 'Queries / Hour',     RO: 'Interogări / Oră',   FR: 'Requêtes / Heure',    RU: 'Запросов / Час'      }[lang], desc: { EN: 'Automated checks sent per hour to external systems (plates, passports, HS codes)', RO: 'Verificări automate trimise pe oră către sisteme externe (plăci, pașapoarte, coduri vamale)', FR: 'Vérifications automatiques envoyées par heure aux systèmes externes', RU: 'Автоматические проверки, отправляемые в час внешним системам' }[lang], value: totalQueries.toLocaleString(), color: 'text-cyan-400' },
            { label: { EN: 'Active Protocols',   RO: 'Protocoale Active',  FR: 'Protocoles Actifs',   RU: 'Активные Протоколы'  }[lang], desc: { EN: 'Communication standards in use (REST, SOAP, SFTP etc.)', RO: 'Standarde de comunicare utilizate (REST, SOAP, SFTP etc.)', FR: 'Normes de communication utilisées (REST, SOAP, SFTP etc.)', RU: 'Используемые протоколы связи (REST, SOAP, SFTP и т.д.)' }[lang], value: new Set(systems.map(s => s.protocol.split('/')[0])).size, color: 'text-indigo-400' },
          ].map(s => (
            <div key={s.label} className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{s.label}</div>
              <div className="text-[8px] text-slate-700 leading-snug mb-2">{s.desc}</div>
              <div className={`text-2xl font-light ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Systems Table */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Connected External Systems', RO: 'Sisteme Externe Conectate', FR: 'Systèmes Externes Connectés', RU: 'Подключённые Внешние Системы' }[lang]}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800 bg-slate-900/50">
                <th className="p-3">{{ EN:'System', RO:'Sistem', FR:'Système', RU:'Система' }[lang]}</th><th className="p-3">{{ EN:'Type', RO:'Tip', FR:'Type', RU:'Тип' }[lang]}</th><th className="p-3 text-right">{{ EN:'Latency', RO:'Latență', FR:'Latence', RU:'Задержка' }[lang]}</th><th className="p-3 text-right">{{ EN:'Queries/h', RO:'Interogări/h', FR:'Requêtes/h', RU:'Запросов/ч' }[lang]}</th><th className="p-3 text-right">{{ EN:'Hit Rate', RO:'Rată Pozitivă', FR:'Taux Positif', RU:'Уровень Совп.' }[lang]}</th><th className="p-3">{{ EN:'Protocol', RO:'Protocol', FR:'Protocole', RU:'Протокол' }[lang]}</th><th className="p-3 text-center">{{ EN:'Status', RO:'Status', FR:'Statut', RU:'Статус' }[lang]}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800/50">
                {systems.map(sys => (
                  <tr key={sys.id} className="text-xs hover:bg-slate-800/20">
                    <td className="p-3"><div className="font-medium text-slate-200">{sys.name}</div><div className="text-[9px] text-slate-600">{sys.country}</div></td>
                    <td className="p-3"><span className={`text-[10px] font-medium ${typeColor[sys.type] || 'text-slate-400'}`}>{sys.type}</span></td>
                    <td className="p-3 text-right font-mono"><span className={sys.latencyMs > 100 ? 'text-amber-400' : 'text-slate-300'}>{sys.latencyMs}ms</span></td>
                    <td className="p-3 text-right font-mono text-slate-300">{sys.queriesHour.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-slate-400">{sys.hitRatePct}%</td>
                    <td className="p-3 font-mono text-[10px] text-slate-500">{sys.protocol}</td>
                    <td className="p-3 text-center"><span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${statusColor(sys.status)}`}>{sys.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Live Query Feed */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl flex flex-col flex-1">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex flex-col gap-0.5">
            {/* AUTOMATED SYSTEM badge */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
              <span className="text-[8px] font-bold text-teal-500/80 uppercase tracking-widest">AUTOMATED · {activeEngineCount} ENGINES · ML ACTIVE</span>
              <span className="text-[8px] text-slate-600 ml-auto font-mono">{queryFeed.filter(q => q.result === 'HIT').length} HITs / {queryFeed.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Live Query Feed', RO: 'Flux Interogări Live', FR: 'Flux de Requêtes Live', RU: 'Живая Лента Запросов' }[lang]}</h3>
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
            </div>
            <p className="text-[9px] text-slate-600 leading-snug">{{ EN: 'Automated real-time checks — each line is a query to an external database (plates, passports, HS codes, watchlists). HIT = suspicious match found.', RO: 'Verificări automate în timp real — fiecare linie reprezintă o consultare a unei baze de date externe (plăci, pașapoarte, coduri HS, liste urmărire). HIT = potrivire suspectă găsită.', FR: 'Vérifications automatiques en temps réel — chaque ligne est une requête vers une base externe (plaques, passeports, codes HS, listes de surveillance). HIT = correspondance suspecte trouvée.', RU: 'Автоматические проверки в реальном времени — каждая строка это запрос к внешней базе данных (номера, паспорта, коды HS, списки наблюдения). HIT = найдено подозрительное совпадение.' }[lang]}</p>
          </div>
          <details className="px-3 py-2 border-b border-slate-800/40">
            <summary className="text-[9px] text-slate-600 cursor-pointer hover:text-slate-400 select-none">
              {{ EN: '▸ How does this work?', RO: '▸ Cum funcționează?', FR: '▸ Comment ça marche ?', RU: '▸ Как это работает?' }[lang]}
            </summary>
            <div className="mt-2 space-y-1">
              <p className="text-[9px] text-slate-500 leading-relaxed">{{ EN: 'Every vehicle triggers automated queries to 6 external databases. Each query uses a different ML model: plate recognition (CNN), identity matching (Gradient Boosting), HS code risk (Random Forest), passport RFID (rule-based), EORI status (API lookup), PNR travel (LSTM sequence model).', RO: 'Fiecare vehicul declanșează interogări automate la 6 baze de date externe. Fiecare interogare folosește un model ML diferit: recunoaștere plăcuță (CNN), potrivire identitate (Gradient Boosting), risc cod HS (Random Forest), pașaport RFID (bazat pe reguli), status EORI (API lookup), călătorie PNR (model secvențial LSTM).', FR: 'Chaque véhicule déclenche des requêtes automatiques vers 6 bases de données externes. Chaque requête utilise un modèle ML différent: reconnaissance plaque (CNN), correspondance identité (Gradient Boosting), risque code SH (Random Forest), passeport RFID (basé sur règles), statut EORI (lookup API), voyage PNR (modèle séquentiel LSTM).', RU: 'Каждое ТС инициирует автоматические запросы к 6 внешним базам данных. Каждый запрос использует разную ML-модель: распознавание номера (CNN), идентификация личности (Gradient Boosting), риск кода HS (Random Forest), паспорт RFID (правила), статус EORI (API-запрос), путешествие PNR (LSTM).' }[lang]}</p>
              <p className="text-[9px] text-slate-600">{{ EN: 'GREEN = no match found (CLEAR). RED = match found (HIT) — requires officer attention.', RO: 'VERDE = nicio corespondență găsită (LIBER). ROȘU = corespondență găsită (HIT) — necesită atenție ofițer.', FR: 'VERT = aucune correspondance (LIBRE). ROUGE = correspondance trouvée (HIT) — attention officier requise.', RU: 'ЗЕЛЁНЫЙ = совпадений нет (ЧИСТО). КРАСНЫЙ = найдено совпадение (HIT) — требует внимания офицера.' }[lang]}</p>
            </div>
          </details>
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
            {queryFeed.length === 0 && <div className="text-center py-8 text-slate-600 text-xs">{{ EN: 'Initializing feed...', RO: 'Se inițializează...', FR: 'Initialisation...', RU: 'Инициализация...' }[lang]}</div>}
            {(() => {
              const qLabel: Record<string, string> = {
                plate:    { EN: 'Plate Lookup',    RO: 'Verificare Plăcuță',      FR: 'Vérif. Plaque',      RU: 'Поиск Номера'         }[lang],
                identity: { EN: 'Identity Query',  RO: 'Interogare Identitate',   FR: 'Requête Identité',   RU: 'Запрос Личности'      }[lang],
                hscode:   { EN: 'HS Code Lookup',  RO: 'Verificare Cod HS',       FR: 'Vérif. Code SH',     RU: 'Поиск Кода HS'        }[lang],
                passport: { EN: 'Passport Scan',   RO: 'Scanare Pașaport',        FR: 'Scan Passeport',     RU: 'Скан Паспорта'        }[lang],
                eori:     { EN: 'Trader EORI',     RO: 'EORI Comerciant',         FR: 'EORI Négociant',     RU: 'EORI Торговца'        }[lang],
                pnr:      { EN: 'PNR Cross-Ref',   RO: 'Ref. Încrucișată PNR',   FR: 'Réf. Croisée PNR',  RU: 'Перекр. ПИП'         }[lang],
                // BP-domain query types
                interpol:  { EN: 'Interpol Red Notice', RO: 'Aviz Roșu Interpol',  FR: 'Notice Rouge Interpol', RU: 'Красное Уведомление Интерпол' }[lang],
                overstay:  { EN: '180-Day Overstay',    RO: 'Depășire 180 Zile',   FR: 'Dépassement 180 Jours', RU: 'Превышение 180 Суток'         }[lang],
                migration:  { EN: 'Migration Risk',     RO: 'Risc Migrație',       FR: 'Risque Migratoire',     RU: 'Миграционный Риск'            }[lang],
              };
              const qExplain: Record<string, string> = {
                plate:    { EN: 'Vehicle plate checked vs SIS II, INTERPOL WVDB & national stolen-vehicle registry', RO: 'Plăcuța verificată față de SIS II, INTERPOL WVDB și registrul național de vehicule furate', FR: 'Plaque vérifiée vs SIS II, INTERPOL WVDB et registre national des véhicules volés', RU: 'Номер проверен по SIS II, INTERPOL WVDB и нац. реестру угнанных ТС' }[lang],
                identity: { EN: 'Traveller identity validated against biometric DB, SIS II persons & national crossing history', RO: 'Identitate călător validată față de baze biometrice, SIS II persoane și istoricul trecerilor', FR: 'Identité du voyageur validée vs BD biométrique, SIS II personnes et historique de passage', RU: 'Личность путешественника проверена по биометрической БД, SIS II и истории пересечений' }[lang],
                hscode:   { EN: 'Declared HS code cross-referenced for duty rates, import prohibitions and known smuggling patterns', RO: 'Codul HS declarat verificat față de tarife, prohibiții la import și tipare de contrabandă cunoscute', FR: 'Code SH déclaré recoupé avec les taux de droits, prohibitions et schémas de contrebande connus', RU: 'Код HS сверен с тарифными ставками, запретами на ввоз и известными схемами контрабанды' }[lang],
                passport: { EN: 'Travel document validated vs Interpol SLTD (Stolen and Lost Travel Documents) database', RO: 'Document de călătorie validat față de baza SLTD Interpol (documente furate sau pierdute)', FR: 'Document de voyage validé vs base SLTD Interpol (documents de voyage volés et perdus)', RU: 'Документ проверен по базе Интерпол SLTD (похищенные и утерянные документы)' }[lang],
                eori:     { EN: 'Trader EORI number and AEO certification status verified in EU Customs Information Systems', RO: 'EORI și statutul AEO al comerciantului verificate în Sistemele Informaționale Vamale UE', FR: 'Numéro EORI et statut AEO du négociant vérifiés dans les systèmes d\'information douaniers UE', RU: 'EORI и статус УЭО торговца проверены в информационных системах таможни ЕС' }[lang],
                pnr:      { EN: 'Passenger Name Record matched against intelligence watchlists and high-risk traveller alerts', RO: 'Date PNR potrivite față de liste de informații și alerte călători cu risc ridicat', FR: 'PNR du passager comparé aux listes de surveillance et alertes voyageurs à risque', RU: 'ПИП пассажира сверен с разведывательными списками и предупреждениями о высокорисковых путешественниках' }[lang],
                interpol:  { EN: 'Person cross-referenced vs Interpol Red Notice, SIS II Alert & national wanted persons registry', RO: 'Persoana verificată față de Aviz Roșu Interpol, Alertă SIS II și registrul național persoane urmărite', FR: 'Personne recoupée vs Notice Rouge Interpol, Alerte SIS II et registre national des personnes recherchées', RU: 'Лицо сверено с Красным Уведомлением Интерпол, Тревогой SIS II и нац. реестром разыскиваемых' }[lang],
                overstay:  { EN: 'Foreign-plate vehicle checked for 180-day rule violations (non-EU vehicles must exit after 180 days)', RO: 'Vehicul cu plăci străine verificat pentru depășirea regulii 180 zile (vehiculele non-UE trebuie să iasă după 180 zile)', FR: 'Véhicule étranger vérifié pour violation règle 180 jours (véhicules non-UE doivent sortir après 180 jours)', RU: 'Иностранное ТС проверено на нарушение правила 180 дней (не-ЕС ТС должны выехать через 180 дней)' }[lang],
                migration:  { EN: 'Passenger travel pattern analysed for irregular migration indicators: undocumented persons, asylum seeker profile, smuggling network links', RO: 'Tiparul de călătorie al pasagerilor analizat pentru indicatori de migrație neregulamentară: persoane fără documente, profil solicitant azil, conexiuni rețea traficanți', FR: 'Schéma de voyage des passagers analysé pour indicateurs migration irrégulière: sans-papiers, profil demandeur asile, liens réseaux passeurs', RU: 'Паттерн поездок пассажира проанализирован на признаки незаконной миграции: лица без документов, профиль соискателя убежища, связи с сетями контрабандистов' }[lang],
              };
              const qHit: Record<string, string> = {
                plate:    { EN: '⚠ Plate flagged — intercept & hold, await intelligence confirmation', RO: '⚠ Plăcuță semnalată — interceptați și rețineți, așteptați confirmare', FR: '⚠ Plaque signalée — intercepter & retenir, attendre confirmation', RU: '⚠ Номер в базе — перехватить и задержать, ждать подтверждения' }[lang],
                identity: { EN: '⚠ Identity alert — biometric secondary check required immediately', RO: '⚠ Alertă identitate — verificare biometrică secundară obligatorie imediat', FR: '⚠ Alerte identité — contrôle biométrique secondaire immédiat requis', RU: '⚠ Тревога личности — немедленно провести повторную биометрию' }[lang],
                hscode:   { EN: '⚠ HS risk flag — mandatory physical inspection of declared goods', RO: '⚠ Risc cod HS — inspecție fizică obligatorie a mărfurilor declarate', FR: '⚠ Alerte code SH — inspection physique obligatoire des marchandises déclarées', RU: '⚠ Тревога HS — обязателен физический досмотр задекларированных товаров' }[lang],
                passport: { EN: '⚠ Document hit in SLTD — detain immediately, notify Interpol NCB', RO: '⚠ Document în baza SLTD — rețineți imediat, notificați NCB Interpol', FR: '⚠ Document dans SLTD — détenir immédiatement, notifier NCB Interpol', RU: '⚠ Документ в базе SLTD — задержать немедленно, уведомить НЦБ Интерпол' }[lang],
                eori:     { EN: '⚠ EORI suspended/invalid — hold shipment, escalate to customs supervisor', RO: '⚠ EORI suspendat/invalid — rețineti transportul, escaladați la supervizor vamal', FR: '⚠ EORI suspendu/invalide — retenir l\'envoi, escalader au superviseur', RU: '⚠ EORI приостановлен/недействителен — задержать груз, доложить руководству' }[lang],
                pnr:      { EN: '⚠ PNR watchlist match — notify intelligence liaison, monitor covertly', RO: '⚠ PNR corespunde listei — notificați ofițerul de informații, supravegheați discret', FR: '⚠ Correspondance PNR — notifier l\'officier de renseignement, surveiller discrètement', RU: '⚠ ПИП в списке наблюдения — уведомить офицера разведки, вести наблюдение' }[lang],
                interpol:  { EN: '⚠ WANTED — Interpol Red Notice match. DO NOT approach alone. Detain in secure area, notify supervisor immediately, contact NCB via MIND/FIND', RO: '⚠ URMĂRIT — Corespondență Aviz Roșu Interpol. NU abordați singur. Reținere în zonă securizată, notificați supervizor imediat, contactați NCB prin MIND/FIND', FR: '⚠ RECHERCHÉ — Correspondance Notice Rouge Interpol. NE PAS approcher seul. Détenir zone sécurisée, notifier superviseur immédiatement, contacter BCN via MIND/FIND', RU: '⚠ РАЗЫСКИВАЕТСЯ — Совпадение Красное Уведомление Интерпол. НЕ подходите в одиночку. Задержать в безопасной зоне, немедленно уведомить супервизора, связаться с НЦБ через MIND/FIND' }[lang],
                overstay:  { EN: '⚠ 180-DAY VIOLATION — Vehicle entry date exceeds legal stay. Issue administrative warning, record plate, notify customs broker if commercial vehicle', RO: '⚠ DEPĂȘIRE 180 ZILE — Data intrării vehiculului depășește șederea legală. Emiteți avertisment administrativ, înregistrați placa, notificați brokerul vamal dacă vehicul comercial', FR: '⚠ VIOLATION 180 JOURS — Date entrée véhicule dépasse séjour légal. Émettre avertissement administratif, enregistrer plaque, notifier transitaire si véhicule commercial', RU: '⚠ НАРУШЕНИЕ 180 ДНЕЙ — Дата въезда ТС превышает законный срок. Выдать административное предупреждение, записать номер, уведомить таможенного брокера для коммерческого ТС' }[lang],
                migration:  { EN: '⚠ MIGRATION ALERT — Irregular profile detected. Conduct in-depth interview. Check asylum claim history. Contact border police migration officer. Do NOT return without proper procedure', RO: '⚠ ALERTĂ MIGRAȚIE — Profil neregulamentar detectat. Efectuați interviu aprofundat. Verificați istoricul cereri azil. Contactați ofițerul de migrație al poliției de frontieră. NU returnați fără procedura corectă', FR: '⚠ ALERTE MIGRATION — Profil irrégulier détecté. Effectuer entretien approfondi. Vérifier historique demandes asile. Contacter officier migration police frontière. NE PAS reconduire sans procédure', RU: '⚠ ТРЕВОГА МИГРАЦИЯ — Выявлен нерегулярный профиль. Провести углублённое интервью. Проверить историю заявлений на убежище. Связаться с офицером миграции пограничной службы. НЕ высылать без надлежащей процедуры' }[lang],
              };
              return queryFeed.map((q, i) => (
                <div key={i} className={`p-2 rounded border cursor-pointer ${q.result === 'HIT' ? 'border-red-500/30 bg-red-500/5' : 'border-slate-800/50 bg-slate-900/30'}`} onClick={() => setExpandedQuery(expandedQuery === i ? null : i)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[10px] text-slate-300 font-medium">{qLabel[q.qKey] ?? q.qKey}</span>
                        <span className="text-[8px] text-slate-600 truncate">· {q.system}</span>
                      </div>
                      <p className="text-[8px] text-slate-600 leading-tight">{qExplain[q.qKey] ?? ''}</p>
                      {q.result === 'HIT' && <p className="text-[8px] text-red-400 font-medium mt-1 leading-tight">{qHit[q.qKey] ?? ''}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${q.result === 'HIT' ? 'text-red-400 bg-red-500/10' : 'text-emerald-400 bg-emerald-500/10'}`}>{q.result}</span>
                      <span className="text-slate-700 font-mono text-[8px]">{new Date(q.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                    </div>
                  </div>
                  {expandedQuery === i && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800/40 space-y-1">
                      <div className="text-[8px] text-slate-600">
                        {{ EN: 'ML Model:', RO: 'Model ML:', FR: 'Modèle ML:', RU: 'Модель ML:' }[lang]} {
                          q.qKey === 'plate' ? 'CNN Plate Recognizer v4.2' :
                          q.qKey === 'identity' ? 'Gradient Boosting Identity Scorer v3.1' :
                          q.qKey === 'hscode' ? 'Random Forest HS Risk Classifier' :
                          q.qKey === 'passport' ? 'RFID Rule Engine + Checksum Validator' :
                          q.qKey === 'eori' ? 'EORI Registry API Lookup' :
                          q.qKey === 'pnr' ? 'LSTM PNR Sequence Anomaly Detector' :
                          q.qKey === 'interpol' ? 'Interpol MIND/FIND Real-Time Check + SIS II' :
                          q.qKey === 'overstay' ? 'Entry/Exit Record Cross-Check (EES Reg.EU 2017/2226)' :
                          q.qKey === 'migration' ? 'Eurodac + EUROSUR Pattern Classifier (SVM)' :
                          'Rule-Based Validator'
                        }
                      </div>
                      <div className="text-[8px] text-slate-600">{{ EN: 'Latency:', RO: 'Latență:', FR: 'Latence:', RU: 'Задержка:' }[lang]} {(Math.abs(q.time % 77) + 12)}ms</div>
                      {q.result === 'HIT' && (
                        <div className="text-[8px] text-amber-400 leading-tight">
                          {{ EN: 'A HIT means this vehicle or person matched a record in an external database. This does NOT automatically mean it is a criminal — it means the officer must manually verify and decide the next step.', RO: 'Un HIT înseamnă că acest vehicul sau persoană a corespuns cu un înregistrare dintr-o bază de date externă. Aceasta NU înseamnă automat că este infractor — ofițerul trebuie să verifice manual și să decidă pasul următor.', FR: "Un HIT signifie que ce véhicule ou cette personne correspond à un enregistrement dans une base externe. Cela ne signifie PAS automatiquement qu'il s'agit d'un criminel — l'officier doit vérifier manuellement et décider de la prochaine étape.", RU: 'HIT означает, что данное ТС или лицо совпало с записью во внешней базе данных. Это НЕ означает автоматически наличие преступления — офицер должен вручную проверить и принять решение о следующем шаге.' }[lang]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── AI / Risk Layer  (Operational Risk Intelligence) ────────────────────────
// ─── BCP Threat Profiles ─────────────────────────────────────────────────────
interface BcpThreat {
  id: string;
  institution: 'BP' | 'CS' | 'JOINT';
  titleKey: Record<Language, string>;
  descKey: Record<Language, string>;
  indicators: Record<Language, string[]>;
  legislation: string;
  goods: Record<Language, string>;
  actionsKey: Record<Language, string[]>;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  sanctionsKey?: Record<Language, string>;
}
const BCP_THREAT_PROFILES: Record<string, BcpThreat[]> = {
  BCP_LEUSENI: [
    { id: 'LEU-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Commercial Invoice Fraud', RO: 'Fraudă Facturi Comerciale', FR: 'Fraude Factures Commerciales', RU: 'Мошенничество с Накладными' },
      descKey:  { EN: 'Leuseni — busiest EU corridor. ML engine flags high rate of undervalued truck consignments. HS code mismatches on electronics and textiles.', RO: 'Leușeni — principal coridor UE. Motorul ML semnalează declarații subevaluate frecvente pe transporturi de camioane. Neconcordanțe cod HS pe electronice și textile.', FR: 'Leuseni — principal corridor UE. Moteur ML signale forte proportion de sous-évaluations. Incohérences SH sur électronique et textile.', RU: 'Леушень — главный коридор ЕС. Система ML фиксирует завышенную долю занижений по грузовым партиям. Несоответствия кода HS на электронике и текстиле.' },
      indicators: { EN: ['Value <30% of market price', 'HS code mismatch', 'Repeat trader without AEO'], RO: ['Valoare <30% din prețul pieței', 'Neconcordanță cod HS', 'Comerciant repetat fără AEO'], FR: ['Valeur <30% prix marché', 'Incohérence SH', 'Commerçant récurrent sans AEO'], RU: ['Стоимость <30% рыночной цены', 'Несоответствие кода HS', 'Регулярный трейдер без AEO'] },
      legislation: 'Art.244-246 CC · OLAF Reg.883/2013 · Reg.EU 952/2013 (CUC)',
      goods: { EN: 'Electronics, textiles declared as raw materials', RO: 'Electronice, textile declarate ca materii prime', FR: 'Électronique, textiles déclarés matières premières', RU: 'Электроника, текстиль задекларированы как сырьё' },
      actionsKey: { EN: ['Verify invoice against TARIC', 'Request original purchase contracts', 'Escalate to OLAF if gap >40%'], RO: ['Verificați factura față de TARIC', 'Solicitați contracte originale', 'Escaladați la OLAF dacă diferența >40%'], FR: ['Vérifier facture vs TARIC', 'Demander contrats originaux', 'Escalader OLAF si écart >40%'], RU: ['Проверьте счёт по TARIC', 'Запросите оригиналы договоров', 'Передайте в OLAF при расхождении >40%'] },
    },
    { id: 'LEU-2', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Fuel Tank Concealment', RO: 'Rezervoare Ascunse — Combustibil Accizabil', FR: 'Réservoirs Dissimulés — Carburant Accisé', RU: 'Скрытые Баки — Акцизное Топливо' },
      descKey:  { EN: 'Modified truck fuel systems carrying excise diesel beyond declared quantities. Frequent on E581 route.', RO: 'Sisteme de combustibil modificate pe camioane, motorină accizabilă peste cantitățile declarate. Frecvent pe ruta E581.', FR: 'Systèmes carburant modifiés transportant diesel accisé au-delà des quantités déclarées. Fréquent sur E581.', RU: 'Изменённые топливные системы грузовиков. Акцизное топливо сверх задекларированного объёма. Типично для маршрута E581.' },
      indicators: { EN: ['Tank weight/volume ratio anomaly', 'Driver nervous at customs', 'Route matches known excise corridor'], RO: ['Raport greutate/volum rezervor neobișnuit', 'Șofer nervos la vamă', 'Rută corespunde coridor accizabil'], FR: ['Ratio poids/volume réservoir inhabituel', 'Conducteur nerveux', 'Itinéraire corridor accisé'], RU: ['Аномалия масса/объём бака', 'Нервозность водителя', 'Маршрут известного акцизного коридора'] },
      legislation: 'NC 2710 · Dir.2008/118/EC · Art.251-253 CC',
      goods: { EN: 'Diesel in extra 200-500L hidden tanks', RO: 'Motorină în rezervoare ascunse 200-500L', FR: 'Diesel dans réservoirs cachés 200-500L', RU: 'Дизель в скрытых баках 200-500L' },
      actionsKey: { EN: ['Density meter on all tanks', 'Ultrasound chassis scan', 'Compare declared vs actual volume'], RO: ['Densimetru pe toate rezervoarele', 'Scaner ultrasonic șasiu', 'Comparați volumul declarat vs real'], FR: ['Densimètre tous réservoirs', 'Scanner ultrasons châssis', 'Comparer volume déclaré vs réel'], RU: ['Денситометрия всех баков', 'УЗ-сканер шасси', 'Сравните задекларированный и фактический объём'] },
    },
    { id: 'LEU-0', institution: 'BP', severity: 'HIGH',
      titleKey: { EN: 'Interpol Red Notice — Wanted Persons', RO: 'Aviz Roșu Interpol — Persoane Urmărite', FR: 'Notice Rouge Interpol — Personnes Recherchées', RU: 'Красное Уведомление Интерпол — Разыскиваемые Лица' },
      descKey:  { EN: 'Leuseni is a primary EU exit/entry point. Wanted persons attempt to cross using altered documents or within groups. Interpol MIND/FIND queried on every person.', RO: 'Leușeni este un punct principal de intrare/ieșire UE. Persoanele urmărite încearcă să treacă folosind documente alterate sau în cadrul grupurilor. MIND/FIND Interpol interogat pentru fiecare persoană.', FR: 'Leuseni est un point d\'entrée/sortie UE principal. Les personnes recherchées tentent de passer avec documents altérés ou dans des groupes. MIND/FIND Interpol interrogé pour chaque personne.', RU: 'Леушень — основной въезд/выезд ЕС. Разыскиваемые лица пытаются пересечь границу с изменёнными документами или в составе групп. MIND/FIND Интерпол запрашивается по каждому лицу.' },
      indicators: { EN: ['MIND/FIND positive match', 'Document UV elements altered', 'Person avoids eye contact / sweating', 'Travel route inconsistent with stated purpose'], RO: ['Potrivire pozitivă MIND/FIND', 'Elemente UV document alterate', 'Persoana evită contactul vizual / transpiră', 'Rută de călătorie inconsistentă cu scopul declarat'], FR: ['Correspondance positive MIND/FIND', 'Éléments UV document altérés', 'Personne évite contact visuel / transpire', 'Itinéraire incohérent avec motif déclaré'], RU: ['Положительное совпадение MIND/FIND', 'Изменены UV-элементы документа', 'Лицо избегает зрительного контакта / потеет', 'Маршрут не соответствует заявленной цели'] },
      legislation: 'Art.89 Interpol Rules · SIS II Art.26-32 · Art.23 LP',
      goods: { EN: 'Persons — subject to international arrest warrant', RO: 'Persoane — subiect al mandatelor de arest internațional', FR: 'Personnes — faisant l\'objet de mandats d\'arrêt internationaux', RU: 'Лица — под международным ордером на арест' },
      actionsKey: { EN: ['DO NOT approach alone', 'Request backup immediately', 'Detain in secure room', 'Contact NCB Moldova via MIND/FIND', 'Preserve all documents'], RO: ['NU abordați singur', 'Solicitați întăriri imediat', 'Reținere în camera securizată', 'Contactați NCB Moldova prin MIND/FIND', 'Păstrați toate documentele'], FR: ['NE PAS approcher seul', 'Demander renforts immédiatement', 'Détenir en salle sécurisée', 'Contacter BCN Moldova via MIND/FIND', 'Conserver tous les documents'], RU: ['НЕ подходите в одиночку', 'Запросить подкрепление немедленно', 'Задержать в охраняемой комнате', 'Связаться с НЦБ Молдовы через MIND/FIND', 'Сохранить все документы'] },
    },
    { id: 'LEU-0B', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: '180-Day Rule — Foreign Vehicle Overstay', RO: 'Regula 180 Zile — Depășire Ședere Vehicul Străin', FR: 'Règle 180 Jours — Dépassement Séjour Véhicule Étranger', RU: 'Правило 180 Дней — Превышение Срока Иностранного ТС' },
      descKey:  { EN: 'Non-EU vehicles entering Moldova may stay max 180 days per year. Leuseni records the highest volume of returning vehicles — many attempt to exit after overstaying to reset the clock.', RO: 'Vehiculele non-UE care intră în Moldova pot sta maxim 180 zile pe an. Leușeni înregistrează cel mai mare volum de vehicule care revin — multe încearcă să iasă după depășirea perioadei pentru a reseta contorul.', FR: 'Les véhicules non-UE entrant en Moldova peuvent rester max 180 jours par an. Leuseni enregistre le plus grand volume de véhicules qui reviennent — beaucoup tentent de sortir après dépassement pour réinitialiser le compteur.', RU: 'Не-ЕС ТС, въезжающие в Молдову, могут оставаться максимум 180 дней в году. Леушень регистрирует наибольший объём возвращающихся ТС — многие пытаются выехать после превышения срока для сброса счётчика.' },
      indicators: { EN: ['Entry date >180 days ago', 'Multiple border crossings in same year', 'Foreign plates (non-EU/MD)', 'Entry stamp inconsistent with current date'], RO: ['Data intrării >180 zile în urmă', 'Traversări multiple în același an', 'Plăci străine (non-UE/MD)', 'Ștampila de intrare inconsistentă cu data curentă'], FR: ['Date entrée >180 jours', 'Traversées multiples même année', 'Plaques étrangères (non-UE/MD)', 'Tampon entrée incohérent avec date actuelle'], RU: ['Дата въезда >180 дней назад', 'Несколько пересечений в течение года', 'Иностранные номера (не-ЕС/MD)', 'Штамп въезда не соответствует текущей дате'] },
      legislation: 'Reg.EU 2017/2226 (EES) · Art.8 LP · Leg.263/2012 RM',
      goods: { EN: 'Foreign-registered vehicle (non-EU/MD) — administrative violation', RO: 'Vehicul înregistrat în străinătate (non-UE/MD) — contravenție administrativă', FR: 'Véhicule immatriculé à l\'étranger (non-UE/MD) — violation administrative', RU: 'ТС с иностранной регистрацией (не-ЕС/MD) — административное нарушение' },
      actionsKey: { EN: ['Check EES/entry stamp date', 'Issue administrative fine notice', 'Record plate and owner data', 'Notify customs if commercial vehicle', 'Allow exit but flag for future monitoring'], RO: ['Verificați data EES/ștampila intrare', 'Emiteți notificare amendă administrativă', 'Înregistrați placa și datele proprietarului', 'Notificați vama dacă vehicul comercial', 'Permiteți ieșirea dar semnalați pentru monitorizare viitoare'], FR: ['Vérifier date EES/tampon entrée', 'Émettre avis amende administrative', 'Enregistrer plaque et données propriétaire', 'Notifier douanes si véhicule commercial', 'Autoriser sortie mais signaler monitoring futur'], RU: ['Проверьте дату EES/штамп въезда', 'Выдать уведомление об административном штрафе', 'Записать номер и данные владельца', 'Уведомить таможню для коммерческого ТС', 'Разрешить выезд, но отметить для мониторинга'] },
    },
    { id: 'LEU-3', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Concealed Persons in Trucks', RO: 'Persoane Ascunse în Camioane', FR: 'Personnes Dissimulées dans Camions', RU: 'Люди в Грузовиках' },
      descKey:  { EN: 'High-volume crossing exploited for concealment of persons in truck cargo. Mixed migration flows detected.', RO: 'Punct cu trafic intens exploatat pentru ascunderea persoanelor în cargo de camioane. Fluxuri migratorii mixte detectate.', FR: 'Point à fort trafic exploité pour dissimuler des personnes dans la cargaison. Flux migratoires mixtes.', RU: 'Высокий поток используется для укрытия людей в грузовиках. Выявлены смешанные миграционные потоки.' },
      indicators: { EN: ['Cargo weight anomaly vs manifest', 'CO2/heat sensor alert', 'Driver unable to account for all seals'], RO: ['Anomalie greutate cargo vs manifest', 'Alertă senzor CO2/căldură', 'Șofer nu poate justifica toate sigiliile'], FR: ['Anomalie poids cargo vs manifeste', 'Alerte capteur CO2/chaleur', 'Conducteur incapable justifier sceaux'], RU: ['Аномалия веса груза vs манифест', 'Тревога датчика CO2/тепла', 'Водитель не может объяснить все пломбы'] },
      legislation: 'Reg.EU 2016/1624 · Art.1-4 LP · Dir.2013/33/EU',
      goods: { EN: 'Persons — concealed in cargo voids / refrigerated units', RO: 'Persoane — ascunse în goluri de cargo / unități frigorifice', FR: 'Personnes — dissimulées dans vides cargo / unités frigorifiques', RU: 'Люди — в пустотах груза / рефрижераторах' },
      actionsKey: { EN: ['CO2 probe of cargo compartment', 'X-ray scan all high-risk trucks', 'Alert rapid response unit if detected'], RO: ['Sondă CO2 compartiment cargo', 'Scanare X-ray camioane risc ridicat', 'Alertați unitatea de intervenție rapidă dacă se detectează'], FR: ['Sonde CO2 compartiment cargo', 'Scan X-ray camions haut risque', 'Alerter unité réponse rapide si détection'], RU: ['Зонд CO2 грузового отсека', 'Рентгеновское сканирование', 'Оповестить группу реагирования при обнаружении'] },
    },
  ],
  BCP_SCULENI: [
    { id: 'SCL-1', institution: 'BP', severity: 'HIGH',
      titleKey: { EN: 'Identity Document Fraud', RO: 'Fraudă Documente Identitate', FR: 'Fraude Documents Identité', RU: 'Подделка Документов Личности' },
      descKey:  { EN: 'Sculeni is a high-risk point for forged/altered identity documents. Proximity to Iasi creates demand for falsified EU papers.', RO: 'Sculeni este un punct cu risc ridicat pentru documente falsificate/alterate. Proximitatea Iașiului creează cerere pentru acte UE falsificate.', FR: 'Sculeni est un point à haut risque de documents falsifiés. La proximité d\'Iasi génère une demande de faux papiers UE.', RU: 'Скулень — зона высокого риска поддельных документов. Близость Ясс стимулирует спрос на фальшивые документы ЕС.' },
      indicators: { EN: ['UV features missing or wrong', 'RFID chip mismatch', 'MRZ checksum error'], RO: ['Elemente UV lipsă sau incorecte', 'Discrepanță cip RFID', 'Eroare sumă control MRZ'], FR: ['Caractéristiques UV manquantes', 'Discordance puce RFID', 'Erreur checksum MRZ'], RU: ['Отсутствуют UV-элементы', 'Несоответствие RFID-чипа', 'Ошибка контрольной суммы MRZ'] },
      legislation: 'Art.23 LP · Reg.EU 2019/1157 · SIS II Art.36',
      goods: { EN: 'Forged Romanian/EU passports and ID cards', RO: 'Pașapoarte/CI românești/UE falsificate', FR: 'Passeports/CIN roumains/UE falsifiés', RU: 'Поддельные румынские/ЕС паспорта и удостоверения' },
      actionsKey: { EN: ['Full UV/IR document inspection', 'Compare RFID chip vs visual zone', 'Escalate to document fraud specialist'], RO: ['Inspecție completă UV/IR', 'Comparați cip RFID vs zona vizuală', 'Escaladați la specialist fraude documentare'], FR: ['Inspection complète UV/IR', 'Comparer puce RFID vs zone visuelle', 'Escalader à spécialiste'], RU: ['Полная UV/IR-проверка', 'Сравните RFID с визуальной зоной', 'Передайте специалисту по подделке'] },
    },
    { id: 'SCL-2', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Counterfeit Consumer Goods', RO: 'Mărfuri Contrafăcute de Consum', FR: 'Marchandises de Consommation Contrefaites', RU: 'Контрафактные Потребительские Товары' },
      descKey:  { EN: 'Passenger vehicles importing counterfeit branded goods (clothing, cosmetics, electronics) declared as personal effects.', RO: 'Vehicule de pasageri importând mărfuri contrafăcute de marcă declarate ca efecte personale.', FR: 'Véhicules de passagers important des marchandises contrefaites déclarées effets personnels.', RU: 'Легковые автомобили ввозят контрафактные брендовые товары, задекларированные как личные вещи.' },
      indicators: { EN: ['Luggage weight anomaly', 'Identical goods in multiple bags', 'No brand authorization'], RO: ['Anomalie greutate bagaje', 'Marfă identică în mai multe genți', 'Fără autorizație de marcă'], FR: ['Anomalie poids bagages', 'Marchandises identiques en plusieurs sacs', 'Pas d\'autorisation de marque'], RU: ['Аномалия веса багажа', 'Одинаковый товар в нескольких сумках', 'Нет авторизации бренда'] },
      legislation: 'Reg.EU 608/2013 · TRIPS Art.51 · Art.244 CC',
      goods: { EN: 'Counterfeit clothing, cosmetics, electronics', RO: 'Haine, cosmetice, electronice contrafăcute', FR: 'Vêtements, cosmétiques, électronique contrefaits', RU: 'Контрафактная одежда, косметика, электроника' },
      actionsKey: { EN: ['Request brand authorization documents', 'Verify HS code vs physical goods', 'Sample for laboratory'], RO: ['Solicitați documente autorizare marcă', 'Verificați cod HS față de marfă', 'Eșantion pentru laborator'], FR: ['Demander autorisation de marque', 'Vérifier SH vs marchandise', 'Prélever échantillon'], RU: ['Запросите авторизацию бренда', 'Проверьте код HS', 'Образец для лаборатории'] },
    },
    { id: 'SCL-3', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Undeclared Currency Transport', RO: 'Transport Valute Nedeclarate', FR: 'Transport Devises Non Déclarées', RU: 'Незадекларированная Валюта' },
      descKey:  { EN: 'Known route for undeclared cash flows above EUR 10,000 threshold, often concealed in personal luggage or vehicle cavities.', RO: 'Rută cunoscută pentru fluxuri de numerar nedeclarat peste 10.000 EUR, adesea ascuns în bagaje personale sau cavități vehicul.', FR: 'Route connue pour flux de liquidités non déclarées au-dessus de 10 000 EUR.', RU: 'Известный маршрут незадекларированной наличности свыше 10 000 EUR.' },
      indicators: { EN: ['K9 currency alert', 'Luggage weight anomaly', 'Multiple same-day crossings'], RO: ['Alertă K9 valute', 'Anomalie greutate bagaje', 'Traversări multiple aceeași zi'], FR: ['Alerte K9 devises', 'Anomalie poids bagage', 'Traversées multiples même jour'], RU: ['Тревога K9 на наличные', 'Аномалия веса багажа', 'Несколько пересечений в один день'] },
      legislation: 'Reg.EU 2018/1672 · FATF Rec.32 · Art.5 POL-005',
      goods: { EN: 'Cash EUR/USD above EUR 10,000', RO: 'Numerar EUR/USD peste 10.000 EUR', FR: 'Espèces EUR/USD au-dessus de 10 000 EUR', RU: 'Наличные EUR/USD свыше 10 000 EUR' },
      actionsKey: { EN: ['Mandatory currency declaration ≥ EUR 10,000', 'K9 currency sweep', 'Check travel frequency'], RO: ['Declarare obligatorie ≥ 10.000 EUR', 'Trecere K9 valute', 'Verificați frecvența călătoriilor'], FR: ['Déclaration obligatoire ≥ 10 000 EUR', 'Passage K9 devises', 'Vérifier fréquence voyages'], RU: ['Обязательное декларирование ≥ 10 000 EUR', 'K9 по всему багажу', 'Проверьте частоту пересечений'] },
    },
  ],
  BCP_COSTESTI: [
    { id: 'CST-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Alcohol Excise Evasion', RO: 'Evaziune Accize Alcool', FR: 'Évasion Accises Alcool', RU: 'Уклонение от Акцизов на Алкоголь' },
      descKey:  { EN: 'Costesti corridor used for smuggling undeclared wine and spirits. Moldova is a major wine producer — large volumes concealed in modified compartments.', RO: 'Coridorul Costești folosit pentru contrabandă vin și băuturi spirtoase nedeclarate. Moldova este producător major de vin — volume mari ascunse în compartimente modificate.', FR: 'Corridor Costesti utilisé pour la contrebande de vin et spiritueux non déclarés.', RU: 'Коридор Костешть используется для контрабанды вина и спиртных напитков. Молдова — крупный производитель вина.' },
      indicators: { EN: ['Vehicle lower than tare weight', 'Alcohol odour in cabin', 'Undeclared beverage containers'], RO: ['Vehicul mai greu decât tara', 'Miros alcool în cabină', 'Containere băuturi nedeclarate'], FR: ['Véhicule plus lourd que tare', 'Odeur alcool cabine', 'Contenants boissons non déclarés'], RU: ['Вес ТС выше тары', 'Запах алкоголя в кабине', 'Незадекларированные ёмкости с напитками'] },
      legislation: 'NC 2204-2208 · Dir.2008/118/EC · Art.251 CC',
      goods: { EN: 'Wine/spirits in modified floors or extra tanks', RO: 'Vin/spirtoase în podele modificate sau rezervoare suplimentare', FR: 'Vin/spiritueux dans doubles planchers ou réservoirs', RU: 'Вино/спирт в изменённом полу или доп. баках' },
      actionsKey: { EN: ['Weigh vehicle vs manifest', 'Gas detector for alcohol vapour', 'Open cargo if >2% weight discrepancy'], RO: ['Cântăriți vs manifest', 'Detector gaz vapori alcool', 'Deschideți cargo dacă >2% discrepanță'], FR: ['Peser vs manifeste', 'Détecteur vapeurs alcool', 'Ouvrir cargo si >2% écart'], RU: ['Взвесьте vs манифест', 'Газоанализатор на алкоголь', 'Откройте груз при расхождении >2%'] },
    },
    { id: 'CST-2', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Tobacco Concealment', RO: 'Ascundere Tutun', FR: 'Dissimulation Tabac', RU: 'Сокрытие Табака' },
      descKey:  { EN: 'Cigarettes hidden in personal vehicles — spare wheel wells, door panels, under seats. Common at this lower-traffic crossing.', RO: 'Țigarete ascunse în vehicule personale — locaș roată rezervă, panouri uși, sub scaune. Comun la acest PTF cu trafic redus.', FR: 'Cigarettes dissimulées dans véhicules personnels — roue de secours, panneaux de portes.', RU: 'Сигареты в личных автомобилях — ниша запасного колеса, дверные панели, под сиденьями.' },
      indicators: { EN: ['Tobacco smell in vehicle interior', 'Seat/panel tampering', 'K9 alert'], RO: ['Miros tutun în interior', 'Alterare scaune/panouri', 'Alertă K9'], FR: ['Odeur tabac intérieur', 'Modification sièges/panneaux', 'Alerte K9'], RU: ['Запах табака в салоне', 'Вскрытие сидений/панелей', 'Тревога K9'] },
      legislation: 'NC 2402 · Art.248-250 CC · FCTC Art.15',
      goods: { EN: 'Cigarettes 200–5,000 sticks per vehicle', RO: 'Țigarete 200–5.000 bucăți per vehicul', FR: 'Cigarettes 200–5 000 unités par véhicule', RU: 'Сигареты 200–5 000 штук на ТС' },
      actionsKey: { EN: ['K9 sweep of vehicle interior', 'Physical probe spare wheel well', 'Open door panels if K9 alerts'], RO: ['Trecere K9 interior vehicul', 'Sondă fizică locaș roată rezervă', 'Deschideți panouri dacă K9 alertează'], FR: ['Passage K9 intérieur', 'Sonde roue de secours', 'Ouvrir panneaux si alerte K9'], RU: ['K9 по салону', 'Проверьте нишу запасного колеса', 'Откройте панели при тревоге K9'] },
    },
  ],
  BCP_CAHUL: [
    { id: 'CAH-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco Smuggling Corridor', RO: 'Coridor Contrabandă Tutun', FR: 'Corridor Contrebande Tabac', RU: 'Коридор Контрабанды Табака' },
      descKey:  { EN: 'Cahul is a known tobacco transit point. Cigarettes transported in trucks and minibuses, often concealed in bulk goods shipments.', RO: 'Cahul este un punct de tranzit de tutun cunoscut. Țigarete transportate în camioane și microbuze, adesea ascunse în expedieri de mărfuri vrac.', FR: 'Cahul est un point de transit tabac connu. Cigarettes transportées dans camions et minibus.', RU: 'Кагул — известная транзитная точка табака. Сигареты в грузовиках и микроавтобусах.' },
      indicators: { EN: ['Tobacco K9 alert', 'Vehicle weight vs declared tare', 'Bulk goods with tobacco odour'], RO: ['Alertă K9 tutun', 'Greutate vehicul vs tara declarată', 'Mărfuri vrac cu miros tutun'], FR: ['Alerte K9 tabac', 'Poids vs tare déclarée', 'Vrac avec odeur tabac'], RU: ['Тревога K9 по табаку', 'Вес vs задекларированная тара', 'Навалочный груз с запахом табака'] },
      legislation: 'NC 2402 · Art.248-250 CC · Dir.2011/64/EU',
      goods: { EN: 'Cigarettes 5,000–50,000 sticks per truck', RO: 'Țigarete 5.000–50.000 bucăți per camion', FR: 'Cigarettes 5 000–50 000 unités par camion', RU: 'Сигареты 5 000–50 000 штук на грузовик' },
      actionsKey: { EN: ['K9 sweep all vehicles', 'Measure weight vs tare', 'Probe double walls and floors'], RO: ['K9 toate vehiculele', 'Măsurați greutate vs tara', 'Sondați pereți dubli și podele'], FR: ['K9 tous véhicules', 'Peser vs tare', 'Sonder doubles murs et planchers'], RU: ['K9 по всем ТС', 'Взвесьте vs тара', 'Проверьте двойные стенки и пол'] },
    },
    { id: 'CAH-2', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Stolen Vehicle Export', RO: 'Export Vehicule Furate', FR: 'Export Véhicules Volés', RU: 'Экспорт Угнанных Автомобилей' },
      descKey:  { EN: 'Passenger cars stolen in Romania entering Moldova with cloned VINs or false plates.', RO: 'Autoturisme furate în România intrând în Moldova cu VIN-uri clonate sau plăci false.', FR: 'Voitures volées en Roumanie entrant en Moldavie avec VINs clonés ou fausses plaques.', RU: 'Автомобили, угнанные в Румынии, въезжают в Молдову с клонированными VIN или поддельными номерами.' },
      indicators: { EN: ['VIN in INTERPOL WVDB', 'Vehicle colour/body vs registration', 'VIN plate tampering'], RO: ['VIN în INTERPOL WVDB', 'Culoare/caroserie vehicul vs înregistrare', 'Alterare plăcuță VIN'], FR: ['VIN dans INTERPOL WVDB', 'Couleur/carrosserie vs immatriculation', 'Falsification plaque VIN'], RU: ['VIN в INTERPOL WVDB', 'Кузов/цвет vs регистрация', 'Вмешательство в VIN-пластину'] },
      legislation: 'Art.186-187 CP · INTERPOL WVDB · Reg.EU 2018/1672',
      goods: { EN: 'Stolen passenger cars — cloned VIN/plates', RO: 'Autoturisme furate — VIN/plăci clonate', FR: 'Voitures volées — VIN/plaques clonés', RU: 'Угнанные автомобили — клонированные VIN/номера' },
      actionsKey: { EN: ['VIN check INTERPOL WVDB', 'Inspect VIN plate for tampering', 'Compare body vs registration photo'], RO: ['Verificați VIN în INTERPOL WVDB', 'Inspectați plăcuța VIN', 'Comparați caroseria cu fotografia din act'], FR: ['Vérifier VIN INTERPOL WVDB', 'Inspecter plaque VIN', 'Comparer carrosserie vs photo'], RU: ['Проверьте VIN в INTERPOL WVDB', 'Осмотрите VIN-пластину', 'Сравните кузов с фото в документе'] },
    },
  ],
  BCP_GIURGIULESTI1: [
    { id: 'GG1-1', institution: 'CS', severity: 'CRITICAL',
      titleKey: { EN: 'Fuel/Energy Smuggling — Danube Zone', RO: 'Contrabandă Combustibil/Energie — Zona Dunăre', FR: 'Contrebande Carburant/Énergie — Zone Danube', RU: 'Контрабанда Топлива — Зона Дуная' },
      descKey:  { EN: 'Giurgiulesti port zone: large-scale fuel and energy product smuggling using modified tankers and river barges. K9 and density meter checks mandatory.', RO: 'Zona portului Giurgiulești: contrabandă de combustibil și produse energetice la scară largă folosind cisterne și barje modificate.', FR: 'Zone portuaire Giurgiulesti: contrebande carburant à grande échelle via citernes et barges modifiées.', RU: 'Порт Джурджулешть: крупная контрабанда нефтепродуктов через цистерны и речные баржи.' },
      indicators: { EN: ['Density meter anomaly on tanker', 'Barge weight vs declared manifest', 'Multiple tanker crossings in 24h'], RO: ['Anomalie densimetru pe cisternă', 'Greutate barjă vs manifest declarat', 'Traversări multiple cisternă în 24h'], FR: ['Anomalie densimètre citerne', 'Poids barge vs manifeste', 'Traversées multiples citerne en 24h'], RU: ['Аномалия денситометра цистерны', 'Вес баржи vs манифест', 'Несколько рейсов цистерны за 24ч'] },
      legislation: 'NC 2710 · Dir.2008/118/EC · Art.251-253 CC · Reg.EU 2022/879',
      goods: { EN: 'Diesel/petrol/LPG in extra compartments', RO: 'Motorină/benzină/GPL în compartimente suplimentare', FR: 'Diesel/essence/GPL dans compartiments supplémentaires', RU: 'Дизель/бензин/СПГ в доп. отсеках' },
      actionsKey: { EN: ['Density meter reading on all tanks', 'Cross-check manifest vs weight', 'Notify anti-smuggling unit for large tankers'], RO: ['Citire densimetru pe toate rezervoarele', 'Verificați manifest vs greutate', 'Notificați unitatea anti-contrabandă pentru cisterne mari'], FR: ['Lecture densimètre tous réservoirs', 'Croiser manifeste vs poids', 'Notifier unité anti-contrebande pour grandes citernes'], RU: ['Денситометрия всех баков', 'Сверьте манифест с весом', 'Уведомите антиконтрабандное подразделение'] },
    },
    { id: 'GG1-2', institution: 'BP', severity: 'HIGH',
      titleKey: { EN: 'Human Trafficking — Port Route', RO: 'Trafic de Persoane — Ruta Port', FR: 'Traite des Personnes — Route Port', RU: 'Торговля Людьми — Портовый Маршрут' },
      descKey:  { EN: 'Port zone exploited by trafficking networks. Victims transported as "seasonal workers" in commercial vehicles.', RO: 'Zona port exploatată de rețele de trafic. Victime transportate ca "muncitori sezonieri" în vehicule comerciale.', FR: 'Zone port exploitée par réseaux de traite. Victimes transportées comme travailleurs saisonniers.', RU: 'Портовая зона используется сетями торговли людьми. Жертвы как «сезонные рабочие» в коммерческих ТС.' },
      indicators: { EN: ['Employment contracts with identical text', 'Passports held by third party', 'Victims avoid eye contact'], RO: ['Contracte cu text identic', 'Pașapoarte reținute de terți', 'Victime evită contactul vizual'], FR: ['Contrats texte identique', 'Passeports détenus par tiers', 'Victimes évitent contact visuel'], RU: ['Одинаковые трудовые договоры', 'Паспорта у третьих лиц', 'Жертвы избегают зрительного контакта'] },
      legislation: 'Art.165-168 CP · Palermo Protocol Art.3 · Dir.2011/36/EU',
      goods: { EN: 'Persons — transported as workers with forged papers', RO: 'Persoane — transportate ca muncitori cu acte false', FR: 'Personnes — transportées comme travailleurs avec faux papiers', RU: 'Люди — как рабочие с поддельными документами' },
      actionsKey: { EN: ['Interview each passenger separately', 'Check biometrics of all persons', 'Alert anti-trafficking unit if suspected'], RO: ['Intervievați fiecare pasager separat', 'Verificați biometria tuturor', 'Alertați unitatea anti-trafic'], FR: ['Interviewer chaque passager séparément', 'Vérifier biométrie de tous', 'Alerter unité anti-traite'], RU: ['Опросите каждого пассажира', 'Проверьте биометрию всех', 'Свяжитесь с антиторговым подразделением'] },
    },
  ],
  BCP_GIURGIULESTI2: [
    { id: 'GG2-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Rail Cargo Concealment', RO: 'Ascundere Marfă în Vagoane CFR', FR: 'Dissimulation dans Wagons Ferroviaires', RU: 'Сокрытие Груза в Железнодорожных Вагонах' },
      descKey:  { EN: 'Rail wagons used to conceal tobacco, alcohol or contraband within declared bulk agricultural or construction cargo.', RO: 'Vagoane CFR folosite pentru a ascunde tutun, alcool sau contrabandă în mărfuri agricole vrac sau materiale de construcții declarate.', FR: 'Wagons ferroviaires utilisés pour dissimuler tabac, alcool dans fret agricole ou matériaux de construction.', RU: 'Железнодорожные вагоны для сокрытия табака, алкоголя в задекларированных сельскохозяйственных грузах.' },
      indicators: { EN: ['Wagon weight exceeds declared load', 'False bottom detected in inspection', 'Seals not matching customs records'], RO: ['Greutate vagon depășește încărcătura declarată', 'Fund fals detectat la inspecție', 'Sigilii nu corespund înregistrărilor vamale'], FR: ['Poids wagon dépasse charge déclarée', 'Double fond détecté', 'Joints non conformes aux registres douaniers'], RU: ['Вес вагона превышает задекларированный', 'Обнаружено двойное дно', 'Пломбы не совпадают с таможенными записями'] },
      legislation: 'NC 2402/2710 · Art.248-253 CC · Reg.EU 952/2013',
      goods: { EN: 'Tobacco/alcohol hidden in agricultural bulk cargo wagons', RO: 'Tutun/alcool ascuns în vagoane cargo agricol vrac', FR: 'Tabac/alcool dissimulé dans wagons vrac agricoles', RU: 'Табак/алкоголь в вагонах с навалочными сельхозгрузами' },
      actionsKey: { EN: ['Weight check vs rail manifest', 'Probe false bottom with rods', 'K9 sweep of all wagons'], RO: ['Control greutate vs manifest feroviar', 'Sondați fundul fals cu tije', 'K9 toate vagoanele'], FR: ['Contrôle poids vs manifeste rail', 'Sonder double fond avec tiges', 'K9 tous wagons'], RU: ['Взвесьте vs манифест', 'Зондирование двойного дна', 'K9 по всем вагонам'] },
    },
    { id: 'GG2-2', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'False Transit Declaration', RO: 'Declarație de Tranzit Falsă', FR: 'Déclaration de Transit Fausse', RU: 'Ложная Транзитная Декларация' },
      descKey:  { EN: 'Goods declared as transit but effectively imported without customs clearance. Common on rail route.', RO: 'Mărfuri declarate ca tranzit dar importate efectiv fără vămuire. Comun pe ruta feroviară.', FR: 'Marchandises déclarées transit mais effectivement importées sans dédouanement.', RU: 'Товары задекларированы как транзит, но фактически импортированы без таможенного оформления.' },
      indicators: { EN: ['T1 transit not closed at exit', 'Wagon not appearing at declared exit BCP', 'Trader history of transit abuse'], RO: ['Tranzit T1 nedeschis la ieșire', 'Vagon neapărând la PTF de ieșire declarat', 'Istoricul comerciantului de abuz tranzit'], FR: ['Transit T1 non clôturé à sortie', 'Wagon n\'apparaissant pas au PdP sortie déclaré', 'Historique d\'abus transit'], RU: ['Транзит T1 не закрыт на выезде', 'Вагон не появился на заявленном КПП', 'История злоупотреблений транзитом'] },
      legislation: 'Reg.EU 952/2013 Art.226 · NCTS · Art.244 CC',
      goods: { EN: 'Goods under T1 transit procedure — undeclared import', RO: 'Mărfuri sub procedura tranzit T1 — import nedeclarat', FR: 'Marchandises sous T1 — importation non déclarée', RU: 'Товары по процедуре транзита T1 — незадекларированный импорт' },
      actionsKey: { EN: ['Verify T1 movement reference in NCTS', 'Confirm transit closure at exit BCP', 'Initiate inquiry procedure if not closed'], RO: ['Verificați referința T1 în NCTS', 'Confirmați închiderea tranzitului la PTF de ieșire', 'Inițiați procedura de anchetă dacă nu e închis'], FR: ['Vérifier référence T1 dans NCTS', 'Confirmer clôture transit au PdP sortie', 'Initier procédure enquête si non clôturé'], RU: ['Проверьте ссылку T1 в NCTS', 'Подтвердите закрытие транзита', 'Инициируйте расследование при незакрытии'] },
    },
  ],
  BCP_LIPCANI: [
    { id: 'LIP-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco Smuggling — North Corridor', RO: 'Contrabandă Tutun — Coridor Nord', FR: 'Contrebande Tabac — Corridor Nord', RU: 'Контрабанда Табака — Северный Коридор' },
      descKey:  { EN: 'Northern crossing used for tobacco transit from Ukraine/Belarus via Moldova to Romania. Hidden in double walls and spare wheel compartments.', RO: 'Trecere nordică folosită pentru tranzit tutun din Ucraina/Belarus prin Moldova spre România. Ascuns în pereți dubli și locașuri de roată de rezervă.', FR: 'Passage nord utilisé pour transit tabac Ukraine/Bélarus via Moldavie vers Roumanie.', RU: 'Северный переход для транзита табака из Украины/Беларуси через Молдову в Румынию.' },
      indicators: { EN: ['Vehicle weight vs tare anomaly', 'Tobacco K9 alert', 'Seals on double wall compartments broken'], RO: ['Anomalie greutate vs tara', 'Alertă K9 tutun', 'Sigilii pereți dubli rupte'], FR: ['Anomalie poids vs tare', 'Alerte K9 tabac', 'Joints doubles murs cassés'], RU: ['Аномалия веса vs тара', 'Тревога K9 по табаку', 'Пломбы двойных стенок сломаны'] },
      legislation: 'NC 2402 · Art.248-250 CC · Dir.2011/64/EU · FCTC',
      goods: { EN: 'Cigarettes in false walls / floor voids', RO: 'Țigarete în pereți falsi / goluri podea', FR: 'Cigarettes dans faux murs / vides plancher', RU: 'Сигареты в двойных стенках / пустотах пола' },
      actionsKey: { EN: ['K9 tobacco sweep', 'Weight vs tare check', 'Probe spare wheel and panels'], RO: ['K9 tutun', 'Control greutate vs tara', 'Sondați roata rezervă și panouri'], FR: ['K9 tabac', 'Peser vs tare', 'Sonder roue secours et panneaux'], RU: ['K9 по табаку', 'Контроль веса vs тара', 'Проверьте запасное колесо и панели'] },
    },
    { id: 'LIP-2', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Irregular Migration Attempt', RO: 'Tentativă de Migrație Neregulamentară', FR: 'Tentative Migration Irrégulière', RU: 'Попытка Незаконной Миграции' },
      descKey:  { EN: 'Northern Lipcani used by small groups attempting irregular entry/exit. Remote location reduces surveillance pressure.', RO: 'Lipcani de nord folosit de grupuri mici care încearcă intrarea/ieșirea neregulamentară. Locația îndepărtată reduce presiunea de supraveghere.', FR: 'Lipcani nord utilisé par petits groupes tentant entrée/sortie irrégulière.', RU: 'Северный Липкань используется небольшими группами для нелегального въезда/выезда.' },
      indicators: { EN: ['No travel documents', 'Passengers hidden in cargo area', 'Vehicle detouring vs declared route'], RO: ['Fără documente de călătorie', 'Pasageri ascunși în zona cargo', 'Vehicul face ocol față de ruta declarată'], FR: ['Pas de documents voyage', 'Passagers cachés en zone cargo', 'Détournement de route'], RU: ['Нет документов', 'Пассажиры в грузовом отсеке', 'Отклонение от заявленного маршрута'] },
      legislation: 'Reg.EU 2016/1624 · Art.1-4 LP · EUROSUR',
      goods: { EN: 'Persons — attempting irregular crossing', RO: 'Persoane — tentativă de trecere neregulamentară', FR: 'Personnes — tentant traversée irrégulière', RU: 'Люди — попытка нелегального пересечения' },
      actionsKey: { EN: ['Check all passenger compartments', 'Verify biometrics of all persons', 'Alert perimeter patrol if detected outside BCP'], RO: ['Verificați toate compartimentele pasageri', 'Verificați biometria tuturor', 'Alertați patrula perimetrală dacă sunt detectați în afara PTF'], FR: ['Vérifier tous compartiments passagers', 'Vérifier biométrie de tous', 'Alerter patrouille si détectés hors PdP'], RU: ['Проверьте все пассажирские отсеки', 'Биометрия всех лиц', 'Оповестите патруль при обнаружении вне КПП'] },
    },
  ],
  BCP_UNGURI: [
    { id: 'UNG-1', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Small-Scale Tobacco Smuggling', RO: 'Contrabandă Tutun la Scară Mică', FR: 'Contrebande Tabac Petite Échelle', RU: 'Мелкая Контрабанда Табака' },
      descKey:  { EN: 'Remote small crossing exploited for personal-use tobacco above legal limits. Low surveillance compared to major BCPs.', RO: 'Trecere mică îndepărtată exploatată pentru tutun de uz personal peste limitele legale. Supraveghere redusă față de PTF-urile principale.', FR: 'Petit passage éloigné exploité pour tabac usage personnel au-delà des limites légales.', RU: 'Удалённый малый КПП используется для личного табака сверх лимита. Низкий уровень наблюдения.' },
      indicators: { EN: ['Multiple cigarette packs in personal luggage', 'Traveller declares below actual quantity', 'Frequent crossings by same person'], RO: ['Pachete multiple țigarete în bagaj personal', 'Călătorul declară sub cantitatea reală', 'Traversări frecvente ale aceleiași persoane'], FR: ['Paquets multiples cigarettes en bagage', 'Quantité déclarée inférieure au réel', 'Traversées fréquentes même personne'], RU: ['Несколько пачек сигарет в багаже', 'Задекларировано меньше реального', 'Частые пересечения одного лица'] },
      legislation: 'NC 2402 · Reg.EU 2008/118/EC · Art.248 CC',
      goods: { EN: 'Cigarettes above personal allowance (200 sticks)', RO: 'Țigarete peste norma personală (200 bucăți)', FR: 'Cigarettes au-delà de la franchise (200 unités)', RU: 'Сигареты сверх личной нормы (200 штук)' },
      actionsKey: { EN: ['Count cigarettes vs declaration', 'Check travel frequency for same traveller', 'Seize excess, issue penalty notice'], RO: ['Numărați țigaretele vs declarație', 'Verificați frecvența călătoriilor', 'Sechestrați excesul, emiteți notificare de sancțiune'], FR: ['Compter cigarettes vs déclaration', 'Vérifier fréquence voyages', 'Saisir excédent, émettre avertissement'], RU: ['Пересчитайте сигареты vs декларация', 'Проверьте частоту поездок', 'Изъять излишек, выдать предписание'] },
    },
    { id: 'UNG-2', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Document Irregularities', RO: 'Neregularități Documente', FR: 'Irrégularités Documentaires', RU: 'Нарушения в Документах' },
      descKey:  { EN: 'Small crossing, low staff presence. Occasionally used by persons with expired or invalid travel documents.', RO: 'Trecere mică, prezență scăzută de personal. Ocazional folosită de persoane cu documente de călătorie expirate sau invalide.', FR: 'Petit passage, faible présence. Utilisé par des personnes avec documents expirés ou invalides.', RU: 'Малый КПП, мало сотрудников. Иногда используется лицами с просроченными документами.' },
      indicators: { EN: ['Expired passport/ID', 'Name mismatch vs database', 'Biometric pending or failed'], RO: ['Pașaport/CI expirat', 'Neconcordanță nume vs bază de date', 'Biometrie în așteptare sau eșuată'], FR: ['Passeport/CIN expiré', 'Non-concordance nom vs base', 'Biométrie en attente ou échouée'], RU: ['Просроченный паспорт/удостоверение', 'Несоответствие имени в базе', 'Биометрия ожидает или не прошла'] },
      legislation: 'Art.23 LP · Reg.EU 2016/399 (SBC)',
      goods: { EN: 'N/A — document/identity control', RO: 'N/A — control documente/identitate', FR: 'N/A — contrôle documents/identité', RU: 'Н/П — контроль документов/личности' },
      actionsKey: { EN: ['SIS II / SINS database check', 'Biometric re-collection if mismatch', 'Refer to duty supervisor if expired'], RO: ['Verificare SIS II / SINS', 'Re-colectare biometrie dacă discrepanță', 'Referire la supervizor dacă expirat'], FR: ['Vérification SIS II / SINS', 'Re-collecte biométrie si discordance', 'Référer superviseur si expiré'], RU: ['Проверка SIS II / SINS', 'Повторный сбор биометрии', 'Передать дежурному при истечении'] },
    },
  ],
  BCP_GRIMANCAUTI: [
    { id: 'GRM-1', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Tobacco in Personal Vehicles', RO: 'Tutun în Vehicule Personale', FR: 'Tabac dans Véhicules Personnels', RU: 'Табак в Личных Автомобилях' },
      descKey:  { EN: 'Low-surveillance remote crossing. Travellers exploit reduced staffing to import tobacco above legal personal limits.', RO: 'Trecere îndepărtată cu supraveghere redusă. Călătorii exploatează personalul redus pentru a importa tutun peste limitele personale legale.', FR: 'Passage éloigné peu surveillé. Voyageurs exploitent effectifs réduits pour importer tabac au-delà des limites.', RU: 'Удалённый КПП с малой охраной. Путешественники используют нехватку персонала.' },
      indicators: { EN: ['Luggage heavier than typical tourist', 'Tobacco smell in vehicle', 'Multiple packs visible or K9 alert'], RO: ['Bagaj mai greu decât turist tipic', 'Miros tutun în vehicul', 'Pachete multiple vizibile sau alertă K9'], FR: ['Bagages plus lourds que touriste type', 'Odeur tabac véhicule', 'Paquets multiples ou alerte K9'], RU: ['Багаж тяжелее обычного туриста', 'Запах табака в ТС', 'Видны несколько пачек или тревога K9'] },
      legislation: 'NC 2402 · Art.248 CC · Dir.2011/64/EU',
      goods: { EN: 'Cigarettes/tobacco above personal allowance', RO: 'Țigarete/tutun peste norma personală', FR: 'Cigarettes/tabac au-delà de la franchise', RU: 'Сигареты/табак сверх личной нормы' },
      actionsKey: { EN: ['K9 sweep', 'Count items vs declaration', 'Issue penalty if excess confirmed'], RO: ['K9 sweep', 'Numărați vs declarație', 'Emiteți sancțiune dacă exces confirmat'], FR: ['K9 sweep', 'Compter vs déclaration', 'Émettre sanction si excédent confirmé'], RU: ['K9', 'Пересчитайте vs декларация', 'Наложите взыскание при подтверждении'] },
    },
  ],
  BCP_CRIVA: [
    { id: 'CRV-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco & Alcohol — Remote Crossing Exploitation', RO: 'Tutun & Alcool — Exploatarea Trecerii Remote', FR: 'Tabac & Alcool — Exploitation Passage Éloigné', RU: 'Табак и Алкоголь — Малый Отдалённый КПП' },
      descKey:  { EN: 'Criva — far north small crossing. Minimal staffing exploited for higher-volume tobacco and alcohol smuggling by small organised groups.', RO: 'Criva — trecere mică în nordul îndepărtat. Personal minim exploatat pentru contrabandă tutun și alcool de volum mai mare de grupuri mici organizate.', FR: 'Criva — petit passage extrême nord. Personnel minimal exploité pour contrebande tabac et alcool par petits groupes organisés.', RU: 'Крива — малый КПП на дальнем севере. Минимальный персонал — мишень для малых организованных групп.' },
      indicators: { EN: ['Vehicle weight anomaly', 'Multiple vehicles crossing in succession', 'K9 tobacco/alcohol alert'], RO: ['Anomalie greutate vehicul', 'Vehicule multiple traversând succesiv', 'Alertă K9 tutun/alcool'], FR: ['Anomalie poids véhicule', 'Véhicules successifs', 'Alerte K9 tabac/alcool'], RU: ['Аномалия веса ТС', 'Несколько ТС подряд', 'Тревога K9 по табаку/алкоголю'] },
      legislation: 'NC 2402/2204-2208 · Art.248-251 CC',
      goods: { EN: 'Cigarettes and spirits above legal limits', RO: 'Țigarete și spirtoase peste limitele legale', FR: 'Cigarettes et spiritueux au-delà des limites', RU: 'Сигареты и спиртное сверх нормы' },
      actionsKey: { EN: ['Weight check + K9 sweep', 'Coordinate with mobile anti-smuggling unit', 'Request reinforcement if convoy detected'], RO: ['Control greutate + K9', 'Coordonați cu unitatea mobilă anti-contrabandă', 'Solicitați întărire dacă se detectează convoi'], FR: ['Contrôle poids + K9', 'Coordonner avec unité mobile', 'Demander renfort si convoi'], RU: ['Взвешивание + K9', 'Координация с мобильным подразделением', 'Запросить подкрепление при обнаружении колонны'] },
    },
  ],
  BCP_LEOVA: [
    { id: 'LEO-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Wine & Spirits Excise Fraud', RO: 'Fraudă Accize Vinuri și Spirtoase', FR: 'Fraude Accises Vins et Spiritueux', RU: 'Акцизное Мошенничество — Вина и Спиртные Напитки' },
      descKey:  { EN: 'Leova crossing used to export Moldovan wine and spirits without proper excise documentation. Modified tank compartments in trucks.', RO: 'Trecerea Leova folosită pentru exportul vinului și spirtoaselor moldovenești fără documentație de accize corespunzătoare. Compartimente cisternă modificate în camioane.', FR: 'Passage Leova utilisé pour exporter vins et spiritueux moldaves sans documentation accises.', RU: 'Леова используется для экспорта молдавского вина и спирта без акцизной документации.' },
      indicators: { EN: ['Excise stamps absent or forged', 'Vehicle weight vs liquid density mismatch', 'No excise accompanying document (DAA)'], RO: ['Timbre accizabile absente sau falsificate', 'Greutate vehicul vs densitate lichid neconcordantă', 'Fără document de însoțire accize (DAA)'], FR: ['Timbres accises absents ou faux', 'Poids véhicule vs densité liquide', 'Pas de DAA'], RU: ['Акцизные марки отсутствуют или поддельные', 'Вес ТС vs плотность жидкости', 'Нет сопроводительного документа (DAA)'] },
      legislation: 'NC 2204-2208 · Dir.2008/118/EC · Legea 1124-XIV · Art.251 CC',
      goods: { EN: 'Wine/spirits without proper excise documentation', RO: 'Vinuri/spirtoase fără documentație accize corespunzătoare', FR: 'Vins/spiritueux sans documentation accises', RU: 'Вина/спирт без акцизной документации' },
      actionsKey: { EN: ['Verify excise stamps and DAA', 'Density check on liquid cargo', 'Cross-check with national excise registry'], RO: ['Verificați timbrele și DAA', 'Control densitate cargo lichid', 'Verificați cu registrul național de accize'], FR: ['Vérifier timbres et DAA', 'Contrôle densité fret liquide', 'Croiser avec registre accises national'], RU: ['Проверьте акцизные марки и DAA', 'Денситометрия жидкого груза', 'Сверьте с национальным акцизным реестром'] },
    },
  ],
  BCP_PALANCA: [
    { id: 'PAL-1', institution: 'CS', severity: 'CRITICAL',
      titleKey: { EN: 'Dual-Use Goods — Conflict Zone Export', RO: 'Mărfuri cu Dublă Utilizare — Export Zonă Conflict', FR: 'Biens Double Usage — Export Zone Conflit', RU: 'Товары Двойного Назначения — Экспорт в Зону Конфликта' },
      descKey:  { EN: 'Palanca — main Moldova-Ukraine corridor. Intelligence flags potential export of dual-use electronics and components to conflict zone without export licences.', RO: 'Palanca — principalul coridor Moldova-Ucraina. Informațiile semnalează exportul potențial de electronice cu dublă utilizare fără licențe de export.', FR: 'Palanca — principal corridor Moldavie-Ukraine. Renseignement signale exportation potentielle biens double usage sans licences.', RU: 'Паланка — главный коридор Молдова-Украина. Разведка указывает на экспорт товаров двойного назначения без лицензий.' },
      indicators: { EN: ['HS 84xx/85xx without export licence', 'Destination is active conflict area', 'Vague goods description'], RO: ['HS 84xx/85xx fără licență export', 'Destinație zonă de conflict activ', 'Descriere marfă vagă'], FR: ['SH 84xx/85xx sans licence export', 'Destination zone conflit actif', 'Description marchandise vague'], RU: ['HS 84xx/85xx без лицензии', 'Назначение — зона активного конфликта', 'Расплывчатое описание товара'] },
      legislation: 'Reg.EU 2021/821 · Reg.EU 833/2014 (sanctions) · Art.2 CAEX',
      goods: { EN: 'Electronics, components, optical equipment under export control', RO: 'Electronice, componente, echipamente optice sub control de export', FR: 'Électronique, composants, optique sous contrôle export', RU: 'Электроника, компоненты, оптика под экспортным контролем' },
      actionsKey: { EN: ['Verify export licence for HS 84xx/85xx', 'Check destination vs sanctions list', 'Notify CAEX if licence missing'], RO: ['Verificați licența export HS 84xx/85xx', 'Verificați destinația vs lista sancțiuni', 'Notificați CAEX dacă licența lipsește'], FR: ['Vérifier licence export SH 84xx/85xx', 'Vérifier destination vs liste sanctions', 'Notifier CAEX si licence manquante'], RU: ['Проверьте лицензию на экспорт HS 84xx/85xx', 'Сверьте страну с санкционным списком', 'Уведомите CAEX при отсутствии лицензии'] },
    },
    { id: 'PAL-2', institution: 'BP', severity: 'HIGH',
      titleKey: { EN: 'Irregular Migration from Ukraine', RO: 'Migrație Neregulamentară din Ucraina', FR: 'Migration Irrégulière depuis Ukraine', RU: 'Нелегальная Миграция из Украины' },
      descKey:  { EN: 'Main Ukraine-Moldova crossing. Mixed migration flows from conflict-affected population. Draft-age males and persons without documentation require specific attention.', RO: 'Principala trecere Ucraina-Moldova. Fluxuri migratorii mixte din populația afectată de conflict. Bărbați de vârstă militară și persoane fără documente necesită atenție.', FR: 'Principal passage Ukraine-Moldavie. Flux migratoires mixtes. Hommes en âge de conscription sans documents.', RU: 'Главный переход Украина-Молдова. Смешанные потоки вынужденных переселенцев. Мужчины призывного возраста без документов.' },
      indicators: { EN: ['No travel documents', 'Males 18-60 without Ukrainian military exemption', 'Signs of long travel — exhaustion, minimal luggage'], RO: ['Fără documente de călătorie', 'Bărbați 18-60 fără scutire militară ucraineană', 'Semne de călătorie lungă'], FR: ['Pas de documents voyage', 'Hommes 18-60 sans exemption militaire ukrainienne', 'Signes de long voyage'], RU: ['Нет документов', 'Мужчины 18-60 без освобождения от службы', 'Признаки длительной поездки'] },
      legislation: 'Dir.2013/33/EU · Reg.EU 604/2013 · Art.1-4 LP · Dec.EU 2022/382',
      goods: { EN: 'Persons — mixed migration / war refugees', RO: 'Persoane — migrație mixtă / refugiați de război', FR: 'Personnes — migration mixte / réfugiés de guerre', RU: 'Люди — смешанная миграция / беженцы войны' },
      actionsKey: { EN: ['Screen for protection needs', 'Check Ukrainian military exemption documents', 'Contact asylum authority if claim made'], RO: ['Evaluați nevoi de protecție', 'Verificați documente scutire militară ucraineană', 'Contactați autoritatea de azil'], FR: ['Évaluer besoins protection', 'Vérifier exemption militaire ukrainienne', 'Contacter autorité asile si demande'], RU: ['Оцените потребность в защите', 'Проверьте украинское освобождение от службы', 'Свяжитесь с ведомством убежища'] },
    },
    { id: 'PAL-3', institution: 'JOINT', severity: 'HIGH',
      titleKey: { EN: 'Weapons Components Interdiction', RO: 'Interceptare Componente de Armament', FR: 'Interdiction Composants d\'Armement', RU: 'Перехват Компонентов Вооружений' },
      descKey:  { EN: 'Intelligence watch: weapons parts, ammunition components, and military equipment transiting without proper licences.', RO: 'Supraveghere informativă: componente de armament, componente de muniții și echipament militar în tranzit fără licențe corespunzătoare.', FR: 'Surveillance renseignement: pièces d\'armement, composants munitions, équipement militaire en transit sans licences.', RU: 'Разведывательный надзор: компоненты оружия, боеприпасы, военная техника в транзите без лицензий.' },
      indicators: { EN: ['HS 9306 / 8710 / 8801 without licence', 'Military-pattern packaging', 'Consignee is unknown entity in conflict area'], RO: ['HS 9306/8710/8801 fără licență', 'Ambalaj tip militar', 'Destinatar entitate necunoscută în zonă de conflict'], FR: ['SH 9306/8710/8801 sans licence', 'Emballage type militaire', 'Destinataire entité inconnue zone conflit'], RU: ['HS 9306/8710/8801 без лицензии', 'Упаковка военного типа', 'Получатель — неизвестная структура в зоне конфликта'] },
      legislation: 'Legea 105/2018 (export control) · Reg.EU 258/2012 · Wassenaar Arrangement',
      goods: { EN: 'Weapons components, ammunition, military equipment', RO: 'Componente arme, muniții, echipament militar', FR: 'Composants d\'armes, munitions, équipement militaire', RU: 'Компоненты оружия, боеприпасы, военная техника' },
      actionsKey: { EN: ['Joint BP-CS-Intelligence secondary inspection', 'Verify export control licence for HS 9306', 'Notify Intelligence unit and CAEX immediately'], RO: ['Inspecție secundară comună PF-SV-INT', 'Verificați licența export control HS 9306', 'Notificați imediat unitatea INT și CAEX'], FR: ['Inspection secondaire conjointe PF-SV-INT', 'Vérifier licence contrôle export SH 9306', 'Notifier immédiatement INT et CAEX'], RU: ['Совместный вторичный досмотр ПФ-ТС-INT', 'Проверьте лицензию HS 9306', 'Немедленно уведомите INT и CAEX'] },
    },
  ],
  BCP_OTACI: [
    { id: 'OTC-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco Mass Smuggling — Transnistrian Route', RO: 'Contrabandă Masivă Tutun — Ruta Transnistreană', FR: 'Contrebande Massive Tabac — Route Transnistrienne', RU: 'Крупная Контрабанда Табака — Приднестровский Маршрут' },
      descKey:  { EN: 'Otaci is adjacent to the Transnistrian separatist zone — a region of Moldova not under Moldovan customs control de facto. Large tobacco shipments originating from this area bypass normal excise procedures. OLAF priority corridor.', RO: 'Otaci este adiacent zonei separatiste transnistrene — o regiune a Republicii Moldova aflată de facto în afara controlului vamal moldovenesc. Transporturi mari de tutun din această zonă eludează procedurile normale de accize. Coridor prioritar OLAF.', FR: 'Otaci est adjacent à la zone séparatiste transnistrienne — région de Moldavie de facto hors contrôle douanier moldave. Importantes cargaisons tabac contournant les procédures accises. Corridor prioritaire OLAF.', RU: 'Отачь прилегает к приднестровской сепаратистской зоне — части Молдовы, де-факто находящейся вне молдавского таможенного контроля. Крупные партии табака из этой зоны обходят акцизный контроль. Приоритетный коридор OLAF.' },
      indicators: { EN: ['Large tobacco volumes in trucks', 'Origin: Transnistrian separatist-controlled zone (part of Moldova)', 'No valid Moldovan/EU excise markings'], RO: ['Volume mari tutun în camioane', 'Origine: zona transnistreană controlată de separatiști (parte a Moldovei)', 'Fără marcaje accizabile valide moldovenești/UE'], FR: ['Grands volumes tabac en camions', 'Origine: zone transnistrienne sous contrôle séparatiste (partie de la Moldavie)', 'Pas de marquages accises moldaves/UE valides'], RU: ['Большие объёмы табака в грузовиках', 'Происхождение: приднестровская сепаратистская зона (часть Молдовы)', 'Нет действительных молдавских/ЕС акцизных маркировок'] },
      legislation: 'NC 2402 · FCTC Art.15 · OLAF Reg.883/2013 · Art.248-250 CC',
      goods: { EN: 'Cigarettes 50,000–500,000 sticks per truck from the Transnistrian separatist zone', RO: 'Țigarete 50.000–500.000 bucăți per camion din zona separatistă transnistreană', FR: 'Cigarettes 50 000–500 000 unités par camion depuis la zone séparatiste transnistrienne', RU: 'Сигареты 50 000–500 000 штук на грузовик из приднестровской сепаратистской зоны' },
      actionsKey: { EN: ['Full cargo scan (X-ray + K9)', 'Verify excise documentation and origin', 'Notify OLAF and anti-smuggling unit'], RO: ['Scanare cargo completă (X-ray + K9)', 'Verificați documentația accize și originea', 'Notificați OLAF și unitatea anti-contrabandă'], FR: ['Scan cargo complet (X-ray + K9)', 'Vérifier doc. accises et origine', 'Notifier OLAF et unité anti-contrebande'], RU: ['Полное сканирование (рентген + K9)', 'Проверьте акцизную документацию и происхождение', 'Уведомите OLAF и антиконтрабандное подразделение'] },
    },
    { id: 'OTC-2', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Cross-Border Organised Crime Transit', RO: 'Tranzit Criminalitate Organizată Transfrontalieră', FR: 'Transit Criminalité Organisée Transfrontalière', RU: 'Транзит Трансграничной Организованной Преступности' },
      descKey:  { EN: 'Otaci ferry and road crossing: known transit point for OC networks operating from the Transnistrian separatist zone, a region of Moldova outside effective state control.', RO: 'Feribotul și trecerea rutieră Otaci: punct de tranzit cunoscut pentru rețele CO care operează din zona separatistă transnistreană, regiune a Moldovei în afara controlului efectiv al statului.', FR: 'Ferry et passage routier Otaci: point transit connu pour réseaux CO opérant depuis la zone séparatiste transnistrienne, région de Moldavie hors contrôle effectif de l\'État.', RU: 'Паром и дорожный переход Отачь: транзитная точка ОПГ, действующих из приднестровской сепаратистской зоны — части Молдовы вне эффективного государственного контроля.' },
      indicators: { EN: ['SIS II / SINS active flags', 'Vehicles matching known OC profiles', 'Biometric mismatch on driver'], RO: ['Marcaje active SIS II / SINS', 'Vehicule corespunzând profilelor CO cunoscute', 'Discrepanță biometrică șofer'], FR: ['Signalements actifs SIS II / SINS', 'Véhicules correspondant profils CO connus', 'Discordance biométrique conducteur'], RU: ['Активные метки SIS II / SINS', 'ТС по профилям ОПГ', 'Несоответствие биометрии водителя'] },
      legislation: 'SIS II · INTERPOL I-24/7 · Art.10 LP · UNTOC',
      goods: { EN: 'Unknown — full secondary inspection required', RO: 'Necunoscut — inspecție secundară completă necesară', FR: 'Inconnu — inspection secondaire complète requise', RU: 'Неизвестно — требуется полный вторичный досмотр' },
      actionsKey: { EN: ['Run SIS II / INTERPOL check on driver and vehicle', 'Secondary inspection — cargo and occupants', 'Alert Intelligence unit'], RO: ['Verificare SIS II / INTERPOL șofer și vehicul', 'Inspecție secundară cargo și ocupanți', 'Alertați unitatea INT'], FR: ['Vérification SIS II / INTERPOL conducteur et véhicule', 'Inspection secondaire', 'Alerter unité INT'], RU: ['Проверка SIS II / INTERPOL', 'Вторичный досмотр груза и пассажиров', 'Оповестить подразделение INT'] },
    },
  ],
  BCP_BRICENI: [
    { id: 'BRC-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco & Alcohol Smuggling', RO: 'Contrabandă Tutun și Alcool', FR: 'Contrebande Tabac et Alcool', RU: 'Контрабанда Табака и Алкоголя' },
      descKey:  { EN: 'Briceni northwest border. Transit corridor for tobacco from Belarus/Russia via Ukraine. Alcohol also smuggled in modified compartments.', RO: 'Frontiera nord-vest Briceni. Coridor de tranzit pentru tutun din Belarus/Rusia via Ucraina. Alcool smuglit și în compartimente modificate.', FR: 'Frontière nord-ouest Briceni. Corridor transit tabac Bélarus/Russie via Ukraine.', RU: 'Северо-западный Брычень. Транзитный коридор табака из Беларуси/России через Украину.' },
      indicators: { EN: ['Origin: BY or RU plates', 'K9 tobacco/alcohol alert', 'Vehicle weight anomaly'], RO: ['Plăci de origine BY sau RU', 'Alertă K9 tutun/alcool', 'Anomalie greutate vehicul'], FR: ['Plaques BY ou RU', 'Alerte K9 tabac/alcool', 'Anomalie poids véhicule'], RU: ['Номера BY или RU', 'Тревога K9 по табаку/алкоголю', 'Аномалия веса ТС'] },
      legislation: 'NC 2402/2204-2208 · Art.248-251 CC · FCTC',
      goods: { EN: 'Cigarettes and spirits from BY/RU', RO: 'Țigarete și spirtoase din BY/RU', FR: 'Cigarettes et spiritueux BY/RU', RU: 'Сигареты и спирт из BY/RU' },
      actionsKey: { EN: ['Enhanced scrutiny of BY/RU vehicles', 'K9 sweep and weight check', 'Verify origin documentation'], RO: ['Scrutin sporit vehicule BY/RU', 'K9 și control greutate', 'Verificați documentația de origine'], FR: ['Contrôle renforcé véhicules BY/RU', 'K9 et pesée', 'Vérifier doc. origine'], RU: ['Усиленный досмотр ТС BY/RU', 'K9 и взвешивание', 'Проверьте документы о происхождении'] },
    },
    { id: 'BRC-2', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Human Trafficking — Ukraine Route', RO: 'Trafic Persoane — Ruta Ucraina', FR: 'Traite Personnes — Route Ukraine', RU: 'Торговля Людьми — Украинский Маршрут' },
      descKey:  { EN: 'Northwest Ukraine-Moldova crossing used by trafficking networks exploiting conflict displacement.', RO: 'Trecere nord-vest Ucraina-Moldova folosită de rețele de trafic care exploatează deplasarea generată de conflict.', FR: 'Passage nord-ouest Ukraine-Moldavie exploité par réseaux de traite.', RU: 'Северо-западный переход Украина-Молдова используется сетями торговли людьми.' },
      indicators: { EN: ['Bus with passengers unable to speak independently', 'Forged employment contracts', 'Biometric mismatch'], RO: ['Autobuz cu pasageri incapabili să vorbească independent', 'Contracte de muncă false', 'Discrepanță biometrică'], FR: ['Bus avec passagers incapables de parler indépendamment', 'Contrats emploi falsifiés', 'Discordance biométrique'], RU: ['Автобус с пассажирами, неспособными говорить самостоятельно', 'Поддельные трудовые договоры', 'Несоответствие биометрии'] },
      legislation: 'Art.165-168 CP · Palermo Protocol · Dir.2011/36/EU',
      goods: { EN: 'Persons — trafficking victims as transit workers', RO: 'Persoane — victime trafic ca muncitori în tranzit', FR: 'Personnes — victimes traite comme travailleurs transit', RU: 'Люди — жертвы торговли как транзитные рабочие' },
      actionsKey: { EN: ['Individual interview each passenger', 'Check biometrics for all persons', 'Notify anti-trafficking unit'], RO: ['Interviu individual fiecare pasager', 'Biometrie pentru toate persoanele', 'Notificați anti-trafic'], FR: ['Interview individuel passagers', 'Biométrie toutes personnes', 'Notifier anti-traite'], RU: ['Индивидуальный опрос пассажиров', 'Биометрия всех лиц', 'Уведомить антиторговое подразделение'] },
    },
  ],
  BCP_BASARABEASCA: [
    { id: 'BSB-1', institution: 'CS', severity: 'CRITICAL',
      titleKey: { EN: 'Rail Cargo Mass Concealment', RO: 'Ascundere Masivă Marfă Feroviară', FR: 'Dissimulation Massive Fret Ferroviaire', RU: 'Массовое Сокрытие Железнодорожного Груза' },
      descKey:  { EN: 'Basarabeasca is a major rail crossing. Large volumes of tobacco and excise goods concealed in rail wagons declared as agricultural or construction goods.', RO: 'Basarabeasca este o trecere feroviară majoră. Volume mari de tutun și mărfuri accizabile ascunse în vagoane declarate ca agricole sau materiale de construcții.', FR: 'Basarabeasca est un passage ferroviaire majeur. Grands volumes tabac et accises dissimulés dans wagons déclarés agricoles.', RU: 'Басарабяска — крупный железнодорожный переход. Большие объёмы табака в вагонах с задекларированными с/х грузами.' },
      indicators: { EN: ['Wagon overweight vs declared cargo', 'False compartments in agricultural wagons', 'OLAF intelligence flag on train consist'], RO: ['Vagon supraponderal vs marfă declarată', 'Compartimente false în vagoane agricole', 'Semnalizare OLAF pe composiția trenului'], FR: ['Wagon surchargé vs cargaison déclarée', 'Compartiments faux wagons agricoles', 'Signalement OLAF sur composition train'], RU: ['Вагон тяжелее задекларированного', 'Ложные отсеки в сельхозвагонах', 'Флаг OLAF на состав поезда'] },
      legislation: 'NC 2402/2710 · OLAF Reg.883/2013 · Art.248-253 CC · CIM convention',
      goods: { EN: 'Tobacco/fuel hidden in rail wagon false floors and walls', RO: 'Tutun/combustibil ascuns în podele false și pereți vagoane', FR: 'Tabac/carburant caché dans faux planchers et murs wagons', RU: 'Табак/топливо в ложных полах и стенках вагонов' },
      actionsKey: { EN: ['Weight check entire train consist', 'Physical probe of wagons (rods/K9)', 'Notify OLAF and rail police'], RO: ['Control greutate întreg composiția trenului', 'Sondare fizică vagoane (tije/K9)', 'Notificați OLAF și poliția feroviară'], FR: ['Peser toute la composition', 'Sonde physique wagons (tiges/K9)', 'Notifier OLAF et police ferroviaire'], RU: ['Взвесить весь состав', 'Физическое зондирование вагонов', 'Уведомить OLAF и транспортную полицию'] },
    },
    { id: 'BSB-2', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Excise Goods in Rail Wagons', RO: 'Mărfuri Accizabile în Vagoane', FR: 'Marchandises Accisées dans Wagons', RU: 'Акцизные Товары в Вагонах' },
      descKey:  { EN: 'Alcohol and fuel products moved in rail wagons without excise documentation. Higher-risk given volume capacity of rail transport.', RO: 'Alcool și produse petroliere în vagoane fără documentație accize. Risc mai mare dată find capacitatea de volum a transportului feroviar.', FR: 'Alcool et carburant en wagons sans doc. accises. Risque plus élevé vu la capacité du fret ferroviaire.', RU: 'Алкоголь и нефтепродукты в вагонах без акцизной документации.' },
      indicators: { EN: ['Missing excise stamps on alcohol', 'No EMCS movement document for excisable goods', 'Tanker wagon weight anomaly'], RO: ['Timbre accizabile lipsă pe alcool', 'Fără document de mișcare EMCS', 'Anomalie greutate vagon cisternă'], FR: ['Timbres accises manquants', 'Pas de doc. mouvement EMCS', 'Anomalie poids wagon citerne'], RU: ['Нет акцизных марок', 'Нет документа EMCS', 'Аномалия веса цистерны'] },
      legislation: 'Dir.2008/118/EC · EMCS · Legea 1124-XIV · Art.251 CC',
      goods: { EN: 'Bulk alcohol/fuel without excise documentation', RO: 'Alcool/combustibil vrac fără documentație accize', FR: 'Alcool/carburant vrac sans doc. accises', RU: 'Нефасованный алкоголь/топливо без акцизной документации' },
      actionsKey: { EN: ['Verify EMCS movement document', 'Check excise stamps vs quantity', 'Density check on liquid wagons'], RO: ['Verificați documentul EMCS', 'Verificați timbrele vs cantitate', 'Control densitate vagoane lichide'], FR: ['Vérifier doc. EMCS', 'Vérifier timbres vs quantité', 'Contrôle densité wagons liquides'], RU: ['Проверьте документ EMCS', 'Сверьте марки с количеством', 'Денситометрия жидких вагонов'] },
    },
  ],
  BCP_TUDORA: [
    { id: 'TUD-1', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Tobacco in Personal Luggage', RO: 'Tutun în Bagaj Personal', FR: 'Tabac en Bagage Personnel', RU: 'Табак в Личном Багаже' },
      descKey:  { EN: 'Small crossing. Regular exploitation by travellers importing tobacco above personal allowances from Ukraine.', RO: 'Trecere mică. Exploatare regulată de călători importând tutun din Ucraina peste normele personale.', FR: 'Petit passage. Exploitation régulière par voyageurs important tabac au-delà des franchises.', RU: 'Малый КПП. Регулярный провоз табака из Украины сверх нормы.' },
      indicators: { EN: ['Multiple cigarette cartons in luggage', 'K9 alert', 'Frequent crossings same traveller'], RO: ['Cartoane multiple țigarete în bagaj', 'Alertă K9', 'Traversări frecvente același călător'], FR: ['Cartouches multiples cigarettes', 'Alerte K9', 'Traversées fréquentes même voyageur'], RU: ['Несколько блоков сигарет в багаже', 'Тревога K9', 'Частые пересечения одного путешественника'] },
      legislation: 'NC 2402 · Art.248 CC · Dir.2011/64/EU',
      goods: { EN: 'Cigarettes above 200-stick personal limit', RO: 'Țigarete peste limita personală de 200 bucăți', FR: 'Cigarettes dépassant limite 200 unités', RU: 'Сигареты сверх личного лимита в 200 штук' },
      actionsKey: { EN: ['Count cigarettes vs allowance', 'Check travel frequency', 'Seize excess and issue notice'], RO: ['Numărați vs normă', 'Verificați frecvența', 'Sechestru și notificare'], FR: ['Compter vs franchise', 'Vérifier fréquence', 'Saisir et notifier'], RU: ['Подсчёт vs норма', 'Проверить частоту', 'Изъять излишек и уведомить'] },
    },
  ],
  BCP_SAITI: [
    { id: 'SAI-1', institution: 'JOINT', severity: 'HIGH',
      titleKey: { EN: 'Organised Crime — Gagauzia Corridor', RO: 'Criminalitate Organizată — Coridor Găgăuzia', FR: 'Crime Organisé — Corridor Gagaouzie', RU: 'Организованная Преступность — Гагаузский Коридор' },
      descKey:  { EN: 'Saiti is in the Gagauzia region. Intelligence links this corridor to organised crime networks with Russia connections using it for contraband and money flows.', RO: 'Saiți se află în zona Găgăuzia. Informațiile leagă acest coridor de rețele de criminalitate organizată cu conexiuni rusești, folosindu-l pentru contrabandă și fluxuri financiare.', FR: 'Saiti en zone Gagaouzie. Renseignement lie corridor à réseaux CO avec connexions russes.', RU: 'Сайты — Гагаузия. Разведка связывает коридор с ОПГ, связанными с Россией.' },
      indicators: { EN: ['SIS II OC flags on passengers/vehicles', 'Cash above EUR 10,000 not declared', 'Vehicles linked to known OC profiles'], RO: ['Marcaje OC SIS II pe pasageri/vehicule', 'Numerar >10.000 EUR nedeclarat', 'Vehicule legate de profiluri CO cunoscute'], FR: ['Signalements OC SIS II', 'Espèces > 10 000 EUR non déclarées', 'Véhicules liés à profils CO connus'], RU: ['Метки ОПГ SIS II', 'Наличные > 10 000 EUR не задекларированы', 'ТС по профилям ОПГ'] },
      legislation: 'UNTOC · SIS II · Art.324-333 CP (OC) · FATF Rec.32',
      goods: { EN: 'Contraband goods + undeclared cash flows', RO: 'Mărfuri de contrabandă + fluxuri numerar nedeclarate', FR: 'Marchandises contrebande + flux espèces non déclarées', RU: 'Контрабандные товары + незадекларированные денежные потоки' },
      actionsKey: { EN: ['Full SIS II / INTERPOL check', 'K9 currency and contraband sweep', 'Joint BP-CS-Intelligence inspection'], RO: ['Verificare completă SIS II / INTERPOL', 'K9 valute și contrabandă', 'Inspecție comună PF-SV-INT'], FR: ['Vérification complète SIS II / INTERPOL', 'K9 devises et contrebande', 'Inspection conjointe PF-SV-INT'], RU: ['Полная проверка SIS II / INTERPOL', 'K9 по наличным и контрабанде', 'Совместный досмотр ПФ-ТС-INT'] },
    },
    { id: 'SAI-2', institution: 'CS', severity: 'MEDIUM',
      titleKey: { EN: 'Tobacco Smuggling', RO: 'Contrabandă Tutun', FR: 'Contrebande Tabac', RU: 'Контрабанда Табака' },
      descKey:  { EN: 'Tobacco smuggling linked to Gagauzia-based networks. Cigarettes concealed in personal vehicles and minibuses.', RO: 'Contrabandă tutun legată de rețele din Găgăuzia. Țigarete ascunse în vehicule personale și microbuze.', FR: 'Contrebande tabac liée à réseaux de Gagaouzie.', RU: 'Контрабанда табака, связанная с гагаузскими сетями.' },
      indicators: { EN: ['Tobacco odour', 'K9 alert', 'Gagauzia-origin passengers frequent crossings'], RO: ['Miros tutun', 'Alertă K9', 'Pasageri de origine găgăuzeană traversări frecvente'], FR: ['Odeur tabac', 'Alerte K9', 'Passagers origine gagaouze traversées fréquentes'], RU: ['Запах табака', 'Тревога K9', 'Пассажиры гагаузского происхождения с частыми пересечениями'] },
      legislation: 'NC 2402 · Art.248-250 CC',
      goods: { EN: 'Cigarettes above legal limits', RO: 'Țigarete peste limitele legale', FR: 'Cigarettes au-delà des limites légales', RU: 'Сигареты сверх нормы' },
      actionsKey: { EN: ['K9 sweep', 'Weight check', 'Document all high-frequency travellers'], RO: ['K9', 'Control greutate', 'Documentați toți călătorii de frecvență înaltă'], FR: ['K9', 'Pesée', 'Documenter tous les voyageurs haute fréquence'], RU: ['K9', 'Взвешивание', 'Задокументируйте всех частых путешественников'] },
    },
  ],
  BCP_CEADARLUGA1: [
    { id: 'CL1-1', institution: 'JOINT', severity: 'HIGH',
      titleKey: { EN: 'Organised Crime Network — Gagauzia Hub', RO: 'Rețea Criminalitate Organizată — Hub Găgăuzia', FR: 'Réseau Crime Organisé — Hub Gagaouzie', RU: 'Сеть ОПГ — Хаб Гагаузии' },
      descKey:  { EN: 'Ceadir-Lunga 1 is a Gagauz capital crossing. Intelligence identifies it as hub for OC networks with Russia/CIS links. Multi-commodity smuggling and money flows.', RO: 'Ceadîr-Lunga 1 este o trecere în capitala găgăuzeană. Informațiile o identifică ca hub pentru rețele CO cu legături Rusia/CSI.', FR: 'Ceadir-Lunga 1 passage capitale gagaouze. Renseignement identifie hub réseaux CO liens Russie/CEI.', RU: 'Чадыр-Лунга 1 — переход в столице Гагаузии. Разведка выявляет узел ОПГ с российскими/СНГ связями.' },
      indicators: { EN: ['Multiple INTERPOL/SIS II flags', 'Luxury vehicles from RU/BY', 'Undeclared cash above EUR 10,000'], RO: ['Marcaje multiple INTERPOL/SIS II', 'Vehicule de lux din RU/BY', 'Numerar nedeclarat >10.000 EUR'], FR: ['Signalements multiples INTERPOL/SIS II', 'Véhicules luxe RU/BY', 'Espèces > 10 000 EUR non déclarées'], RU: ['Несколько меток INTERPOL/SIS II', 'Роскошные ТС из RU/BY', 'Наличные > 10 000 EUR не задекларированы'] },
      legislation: 'UNTOC · SIS II · FATF Rec.32 · Art.324-333 CP',
      goods: { EN: 'Contraband + cash + OC-linked goods', RO: 'Contrabandă + numerar + mărfuri legate de CO', FR: 'Contrebande + espèces + marchandises CO', RU: 'Контрабанда + наличные + товары ОПГ' },
      actionsKey: { EN: ['Full SIS II / INTERPOL check', 'Joint secondary inspection', 'Alert Intelligence and financial crime unit'], RO: ['Verificare completă SIS II / INTERPOL', 'Inspecție secundară comună', 'Alertați INT și unitatea criminalitate financiară'], FR: ['Vérification complète SIS II/INTERPOL', 'Inspection secondaire conjointe', 'Alerter INT et unité crime financier'], RU: ['Полная проверка SIS II/INTERPOL', 'Совместный вторичный досмотр', 'Оповестить INT и подразделение финансовых преступлений'] },
    },
    { id: 'CL1-2', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco Mass Smuggling', RO: 'Contrabandă Masivă Tutun', FR: 'Contrebande Massive Tabac', RU: 'Массовая Контрабанда Табака' },
      descKey:  { EN: 'High-volume cigarette smuggling through Gagauzia capital crossing. Products sourced from outside EU customs territory.', RO: 'Contrabandă mare volum țigarete prin trecerea capitalei găgăuzene. Produse provenite din afara teritoriului vamal UE.', FR: 'Contrebande haute volume cigarettes passage capitale gagaouze.', RU: 'Крупная контрабанда сигарет через столицу Гагаузии.' },
      indicators: { EN: ['K9 tobacco alert', 'Origin: non-EU excise territory', 'Large truck with suspicious cargo weight'], RO: ['Alertă K9 tutun', 'Origine: teritoriu accizabil non-UE', 'Camion mare cu greutate cargo suspectă'], FR: ['Alerte K9 tabac', 'Origine: territoire accises non-UE', 'Grand camion poids suspect'], RU: ['Тревога K9 по табаку', 'Происхождение: не-ЕС акцизная территория', 'Большой грузовик с подозрительным весом'] },
      legislation: 'NC 2402 · Art.248-250 CC · Dir.2011/64/EU · OLAF',
      goods: { EN: 'Cigarettes 50,000–500,000 sticks per truck', RO: 'Țigarete 50.000–500.000 bucăți per camion', FR: 'Cigarettes 50 000–500 000 par camion', RU: 'Сигареты 50 000–500 000 штук на грузовик' },
      actionsKey: { EN: ['X-ray scan + K9 sweep', 'Verify excise documentation', 'Notify OLAF if volumes exceed threshold'], RO: ['Scanare X-ray + K9', 'Verificați documentele accize', 'Notificați OLAF dacă volumele depășesc pragul'], FR: ['Scan X-ray + K9', 'Vérifier doc. accises', 'Notifier OLAF si volumes dépassent seuil'], RU: ['Рентген + K9', 'Проверьте акцизные документы', 'Уведомить OLAF при превышении порога'] },
    },
  ],
  BCP_CEADARLUGA2: [
    { id: 'CL2-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Fuel Smuggling — Adjacent Terminal', RO: 'Contrabandă Combustibil — Terminal Adiacent', FR: 'Contrebande Carburant — Terminal Adjacent', RU: 'Контрабанда Топлива — Смежный Терминал' },
      descKey:  { EN: 'Adjacent to CL1, this terminal used for fuel product smuggling in tanker trucks. Density checks are critical.', RO: 'Adiacent CL1, acest terminal folosit pentru contrabandă produse petroliere în camioane cisternă. Controale densimetru critice.', FR: 'Adjacent CL1, terminal utilisé pour contrebande carburant en camions citernes.', RU: 'Рядом с CL1, этот терминал используется для контрабанды нефтепродуктов в цистернах.' },
      indicators: { EN: ['Density meter anomaly on tanker', 'Origin mismatch with declared route', 'Multiple tanker crossings in 24h'], RO: ['Anomalie densimetru cisternă', 'Neconcordanță origine cu ruta declarată', 'Traversări multiple cisternă în 24h'], FR: ['Anomalie densimètre citerne', 'Origine incohérente route déclarée', 'Traversées multiples citerne 24h'], RU: ['Аномалия денситометра цистерны', 'Несоответствие происхождения', 'Несколько рейсов цистерны за 24ч'] },
      legislation: 'NC 2710 · Dir.2008/118/EC · Art.251-253 CC',
      goods: { EN: 'Diesel/petrol in extra tank compartments', RO: 'Motorină/benzină în compartimente suplimentare', FR: 'Diesel/essence dans compartiments supplémentaires', RU: 'Дизель/бензин в доп. отсеках' },
      actionsKey: { EN: ['Density meter all tanks', 'Cross-check manifest vs weight', 'Coordinate with anti-smuggling unit'], RO: ['Densimetru toate rezervoarele', 'Verificați manifest vs greutate', 'Coordonați cu anti-contrabandă'], FR: ['Densimètre tous réservoirs', 'Vérifier manifeste vs poids', 'Coordonner avec anti-contrebande'], RU: ['Денситометрия всех баков', 'Сверьте манифест с весом', 'Координация с антиконтрабандным подразделением'] },
    },
  ],
  BCP_MIRNOE: [
    { id: 'MIR-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco Concealment — Low-Surveillance Crossing', RO: 'Ascundere Tutun — Trecere cu Supraveghere Redusă', FR: 'Dissimulation Tabac — Passage Faible Surveillance', RU: 'Сокрытие Табака — Малоохраняемый КПП' },
      descKey:  { EN: 'Mirnoe is a small remote crossing with minimal staffing, exploited for tobacco smuggling above limits.', RO: 'Mirnoe este o trecere mică și îndepărtată cu personal minim, exploatată pentru contrabandă tutun.', FR: 'Mirnoe est un petit passage éloigné avec personnel minimal, exploité pour la contrebande tabac.', RU: 'Мирное — малый КПП с минимальным персоналом, используемый для контрабанды табака.' },
      indicators: { EN: ['K9 tobacco alert', 'Vehicle heavier than tare', 'Panels/seats showing signs of removal'], RO: ['Alertă K9 tutun', 'Vehicul mai greu decât tara', 'Panouri/scaune cu semne de demontare'], FR: ['Alerte K9 tabac', 'Véhicule plus lourd que tare', 'Panneaux/sièges montrant signes de démontage'], RU: ['Тревога K9', 'ТС тяжелее тары', 'Панели/сиденья со следами вскрытия'] },
      legislation: 'NC 2402 · Art.248-250 CC · FCTC',
      goods: { EN: 'Cigarettes hidden in vehicle cavities', RO: 'Țigarete ascunse în cavitățile vehiculului', FR: 'Cigarettes cachées dans cavités du véhicule', RU: 'Сигареты в полостях ТС' },
      actionsKey: { EN: ['K9 and weight check', 'Physical probe of vehicle cavities', 'Request mobile reinforcement unit if volumes large'], RO: ['K9 și control greutate', 'Sondă fizică cavități vehicul', 'Solicitați unitate mobilă dacă volume mari'], FR: ['K9 et pesée', 'Sonde physique cavités', 'Demander renfort mobile si volumes importants'], RU: ['K9 и взвешивание', 'Физическое зондирование полостей', 'Запросить мобильное подкрепление при больших объёмах'] },
    },
  ],
  BCP_CISMICHIOI: [
    { id: 'CIS-1', institution: 'CS', severity: 'HIGH',
      titleKey: { EN: 'Tobacco & Fuel Smuggling', RO: 'Contrabandă Tutun și Combustibil', FR: 'Contrebande Tabac et Carburant', RU: 'Контрабанда Табака и Топлива' },
      descKey:  { EN: 'Southern remote crossing. Used for combined tobacco and fuel smuggling. Low staffing allows higher volumes to pass undetected.', RO: 'Trecere sudică îndepărtată. Folosită pentru contrabandă combinată tutun și combustibil. Personal redus permite volume mai mari să treacă nedetectate.', FR: 'Passage sud éloigné. Contrebande combinée tabac et carburant.', RU: 'Южный отдалённый КПП. Комбинированная контрабанда табака и топлива.' },
      indicators: { EN: ['K9 tobacco alert + density anomaly on tank', 'Vehicle overweight', 'Multiple daily crossings'], RO: ['Alertă K9 tutun + anomalie densitate cisternă', 'Vehicul supraponderal', 'Traversări multiple zilnice'], FR: ['Alerte K9 tabac + anomalie densité citerne', 'Véhicule surchargé', 'Traversées multiples quotidiennes'], RU: ['K9 по табаку + аномалия плотности', 'Перегруженное ТС', 'Несколько ежедневных пересечений'] },
      legislation: 'NC 2402/2710 · Art.248-253 CC · Dir.2008/118/EC',
      goods: { EN: 'Cigarettes and diesel in hidden compartments', RO: 'Țigarete și motorină în compartimente ascunse', FR: 'Cigarettes et diesel dans compartiments cachés', RU: 'Сигареты и дизель в скрытых отсеках' },
      actionsKey: { EN: ['K9 sweep + density meter', 'Weight check vs manifest', 'Mobile anti-smuggling unit backup'], RO: ['K9 + densimetru', 'Control greutate vs manifest', 'Sprijin unitate mobilă anti-contrabandă'], FR: ['K9 + densimètre', 'Peser vs manifeste', 'Appui unité mobile anti-contrebande'], RU: ['K9 + денситометрия', 'Вес vs манифест', 'Поддержка мобильного антиконтрабандного подразделения'] },
    },
    { id: 'CIS-2', institution: 'BP', severity: 'MEDIUM',
      titleKey: { EN: 'Illegal Persons Transit', RO: 'Tranzit Ilegal Persoane', FR: 'Transit Illégal Personnes', RU: 'Незаконный Транзит Лиц' },
      descKey:  { EN: 'Remote southern crossing used by individuals attempting transit without proper documentation.', RO: 'Trecere sudică îndepărtată folosită de persoane care încearcă tranzitul fără documentație corespunzătoare.', FR: 'Passage sud éloigné utilisé par individus tentant transit sans documents.', RU: 'Отдалённый южный КПП используется лицами без надлежащих документов.' },
      indicators: { EN: ['No valid travel document', 'Person not in passenger manifest', 'Biometric failure'], RO: ['Fără document de călătorie valid', 'Persoana nu e în manifestul de pasageri', 'Eșec biometric'], FR: ['Pas de document voyage valide', 'Personne absente du manifeste', 'Échec biométrique'], RU: ['Нет документов', 'Лицо отсутствует в манифесте', 'Сбой биометрии'] },
      legislation: 'Art.23 LP · Reg.EU 2016/399 · EUROSUR',
      goods: { EN: 'Persons — unlawful transit', RO: 'Persoane — tranzit ilegal', FR: 'Personnes — transit illégal', RU: 'Люди — незаконный транзит' },
      actionsKey: { EN: ['Biometric check all persons', 'SIS II database query', 'Detain and notify supervisor'], RO: ['Biometrie toate persoanele', 'Interogare bază date SIS II', 'Reținere și notificare supervizor'], FR: ['Biométrie toutes personnes', 'Requête SIS II', 'Détenir et notifier superviseur'], RU: ['Биометрия всех лиц', 'Запрос SIS II', 'Задержать и уведомить супервизора'] },
    },
  ],
};
// Fallback for any unmapped BCP
BCP_THREAT_PROFILES['DEFAULT'] = BCP_THREAT_PROFILES['BCP_LEUSENI'];

BCP_THREAT_PROFILES['DEFAULT'] = BCP_THREAT_PROFILES['BCP_GOLDEN'];

// ── Common customs rules: vehicle temporary admission (Codul Vamal al RM) ──
const COMMON_TEMPORARY_ADMISSION: BcpThreat[] = [
  { id: 'COMMON-TA-1', institution: 'CS', severity: 'MEDIUM',
    titleKey: { EN: 'Temporary Admission — Basic 180-Day Rule', RO: 'Admitere Temporară — Regula de Bază 180 Zile', FR: 'Admission Temporaire — Règle de Base 180 Jours', RU: 'Временный Ввоз — Базовое Правило 180 Дней' },
    descKey:  { EN: 'Vehicles may circulate under the temporary admission regime for a maximum of 180 CUMULATIVE days within a 12-month interval from the first entry into the country (Codul Vamal RM, Art. 52–56). Exceeding this limit constitutes an administrative customs violation subject to fine, regardless of how many separate trips compose the 180-day total.', RO: 'Maşinile pot circula în regim de admitere temporară cel mult 180 de zile cumulat, într-un interval de 12 luni de la prima introducere în țară (Codul Vamal RM, art. 52–56). Depăşirea acestei limite constituie contravenție vamală administrativă susceptibilă de amendă, indiferent de numărul de călătorii separate ce compun totalul de 180 de zile.', FR: 'Les véhicules peuvent circuler en régime d’admission temporaire au maximum 180 jours CUMULÉS dans un intervalle de 12 mois à compter de la première entrée (Code Douanier RM, art. 52–56). Le dépassement constitue une infraction douanière administrative.', RU: 'Транспортные средства могут находиться в режиме временного ввоза не более 180 СУММАРНЫХ дней в 12-месячном интервале с момента первого въезда (Таможенный кодекс РМ, ст. 52–56). Превышение — административное нарушение.' },
    indicators: { EN: ['Entry date exceeds 180 cumulative days in 12-month window', 'Multiple short-trip returns (clock-reset pattern)', 'Non-EU / non-MD registration plate', 'EES or stamp data shows repeated crossings within year', 'No valid temporary admission document presented'], RO: ['Data intrării depăşeşte 180 zile cumulate în interval de 12 luni', 'Traversari scurte repetate (tipar de resetare contor)', 'Placă de înmatriculare non-UE / non-MD', 'Date EES sau ştampile arată traversari repetate în cursul anului', 'Niciun document valabil de admitere temporară prezentat'], FR: ['Date entrée dépasse 180 jours cumulés sur 12 mois', 'Courts voyages répétés (tentatives réinitialisation)', 'Immatriculation non-UE / non-MD', 'Données EES ou tampons — passages répétés dans l’année', 'Aucun document admission temporaire valide présenté'], RU: ['Дата въезда превышает 180 суммарных дней за 12 месяцев', 'Повторяющиеся короткие поездки (попытки сброса счётчика)', 'Номера не-ЕС / не-MD', 'Данные EES / штампов — повторные пересечения за год', 'Отсутствует документ временного ввоза'] },
    legislation: 'Art. 52-56 Codul Vamal RM · Reg.EU 2017/2226 (EES) · Leg. 1149/2000 RM',
    goods: { EN: 'Foreign-registered vehicle — temporary admission regime (max 180 cumulative days / 12 months)', RO: 'Vehicul înregistrat în străinătate — regim admitere temporară (max 180 zile cumulate / 12 luni)', FR: 'Véhicule immatriculé à l’étranger — régime admission temporaire (max 180 jours cumulés / 12 mois)', RU: 'ТС с иностранной регистрацией — режим временного ввоза (max 180 суммарных дней / 12 месяцев)' },
    actionsKey: { EN: ['Query EES or entry stamp history — calculate cumulative days in last 12 months', 'If cumulative days >180: open administrative violation file', 'Record vehicle plate, VIN, owner identity and all crossing dates', 'Issue written customs notice (Cod Vamal Art. 56) — fine + possible vehicle detention', 'If vehicle used commercially without import regime: refer to ANSC and customs broker'], RO: ['Interogați EES sau istoricul ştampilelor — calculați zilele cumulate în ultimele 12 luni', 'Dacă zile cumulate >180: deschideți dosar contravenție administrativă', 'Înregistrați placa, VIN-ul, identitatea proprietarului şi toate datele de traversare', 'Emiteți notificare vamală scrisă (Cod Vamal art. 56) — amendă + posibilă reținere vehicul', 'Dacă vehiculul este utilizat comercial fără regim de import: referiți la ANSC şi broker vamal'], FR: ['Interroger EES ou historique tampons — calculer jours cumulés sur 12 derniers mois', 'Si jours cumulés >180 : ouvrir dossier contravention administrative', 'Enregistrer plaque, VIN, identité propriétaire et toutes dates traverser', 'Notifier par écrit (Code Douanier Art. 56) — amende + possible rétention véhicule', 'Si usage commercial sans régime import : transmettre à ANSC et transitaire'], RU: ['Запросить EES или историю штампов — подсчитать суммарные дни за 12 месяцев', 'При суммарных днях >180 : открыть дело об административном нарушении', 'Записать номер, VIN, личность владельца и все даты пересечений', 'Выдать письменное таможенное уведомление (ст. 56) — штраф + возможный задержания ТС', 'При коммерческом использовании без режима импорта : передать в ANSC и таможенному брокеру'] },
    sanctionsKey: { EN: 'Exceeding the 180-day limit triggers administrative fines. If the vehicle is not removed from the country within 30 days of the administrative report (proces-verbal) being drawn up, the customs authorities will collect all import duties — mandatory customs clearance (vămuire obligatorie) applies immediately.', RO: 'Depășirea termenului de 180 de zile atrage amenzi contravenționale. Dacă mașina nu este scoasă din țară în termen de 30 de zile de la întocmirea procesului-verbal, autoritățile vamale vor încasa toate drepturile de import (vămuire obligatorie).', FR: 'Le dépassement du délai de 180 jours entraîne des amendes contraventionnelles. Si le véhicule n\'est pas sorti du pays dans les 30 jours suivant l\'établissement du procès-verbal, les autorités douanières percevront l\'ensemble des droits d\'importation (dédouanement obligatoire).', RU: 'Превышение срока 180 дней влечёт административные штрафы. Если ТС не вывезено из страны в течение 30 дней с момента составления протокола, таможенные органы взыскивают все импортные пошлины (обязательное таможенное оформление).' },
  },
  { id: 'COMMON-TA-2', institution: 'CS', severity: 'MEDIUM',
    titleKey: { EN: 'Temporary Admission — Non-Resident Owner (180 Days, No Import)', RO: 'Admitere Temporară — Persoane Nerezidente (180 Zile, Fără Import)', FR: 'Admission Temporaire — Propriétaire Non-Résident (180 Jours, Sans Import)', RU: 'Временный Ввоз — Нерезидент (180 Дней Без Импорта)' },
    descKey:  { EN: 'Non-resident individuals — persons with domicile or residence abroad who hold a vehicle ownership or authorised-use document — may use the vehicle in Moldova for up to 180 days without placing it under an import regime (H.G. 1140/2005, Cod Vamal RM). Upon expiry the vehicle must either exit the country or be placed under a customs regime (import, lease, etc.).', RO: 'Persoanele fizice care au domiciliul sau reşdința în străinătate şi dețin un act de proprietate sau folosință pot utiliza maşina în Moldova timp de 180 de zile fără a o plasa în regim de import (H.G. 1140/2005, Codul Vamal RM). La expirare, vehiculul trebuie să iasă din țară sau să fie plasat într-un regim vamal (import, leasing etc.).', FR: 'Les personnes physiques ayant leur domicile ou résidence à l’étranger et détenant un titre de propriété ou d’usage peuvent utiliser le véhicule en Moldova 180 jours sans le soumettre au régime d’importation (H.G. 1140/2005, Code Douanier RM). À expiration, le véhicule doit sortir ou être placé sous un régime douanier.', RU: 'Физические лица, проживающие за рубежом, обладающие документом о праве собственности или пользования, могут использовать ТС в Молдове 180 дней без помещения под режим импорта (ПП 1140/2005, Таможенный кодекс РМ). По истечении срока — выезд или помещение под таможенный режим.' },
    indicators: { EN: ['Non-resident owner / driver presenting foreign residency document', 'Vehicle ownership or use certificate (foreign registration)', 'Stay duration approaching or exceeding 180 days in Moldova', 'No import declaration on record for this vehicle', 'Driver claims “personal vehicle” but registration country differs from driver’s residence'], RO: ['Proprietar / şofer nerezident prezentând document de reşdință externă', 'Act de proprietate sau folosință vehicul (certificat de înmatriculare străin)', 'Durata şedinței apropiindu-se sau depăşind 180 de zile în Moldova', 'Nicio declarație de import în evidență pentru acest vehicul', 'Şofarul susține “vehicul personal” dar țara de înmatriculare diferă de reşdința şoferului'], FR: ['Propriétaire / conducteur non-résident présentant attestation résidence étrangère', 'Titre propriété ou usage véhicule (certificat immatriculation étranger)', 'Durée séjour approchant ou dépassant 180 jours en Moldova', 'Pas de déclaration importation enregistrée pour ce véhicule', 'Conducteur invoque « véhicule personnel » mais pays immatriculation diffère de sa résidence'], RU: ['Собственник / водитель-нерезидент с документом иностранного проживания', 'Свидетельство о праве собственности или пользования (иностранное )', 'Срок пребывания ТС в Молдове приближается к 180 дням или превышает их', 'Импортная декларация на данное ТС отсутствует', 'Водитель утверждает «личное TS», но страна регистрации отличается от страны проживания'] },
    legislation: 'Art. 53-54 Codul Vamal RM · H.G. 1140/2005 · Reg.EU 2017/2226 (EES)',
    goods: { EN: 'Private vehicle under non-resident temporary admission — without import regime (max 180 days)', RO: 'Vehicul privat în regim admitere temporară nerezident — fără regim de import (max 180 zile)', FR: 'Véhicule privé en admission temporaire non-résident — sans régime d’importation (max 180 jours)', RU: 'Частное ТС в режиме временного ввоза нерезидента — без режима импорта (max 180 дней)' },
    actionsKey: { EN: ['Verify non-resident status: foreign residency certificate or passport domicile stamp', 'Confirm vehicle ownership or use document matches driver identity', 'Calculate total days vehicle has been in Moldova using EES or SIME system', 'If days >180: inform driver of legal obligation to exit or place vehicle under import regime', 'If driver refuses: issue customs notice and refer to ANSC / customs broker', 'Record all data: plate, VIN, driver ID, document number, crossing history'], RO: ['Verificați statutul de nerezident: certificat de reşdință străină sau ştampilă domiciliu din paşaport', 'Confirmați că actul de proprietate sau folosință corespunde identității şoferului', 'Calculați zilele totale ale vehiculului în Moldova folosind sistemul EES sau SIME', 'Dacă zile >180: informați şofărul cu privire la obligația legală de ieşire sau plasare vehicul în regim de import', 'Dacă şofărul refuză: emiteți notificare vamală şi referiți la ANSC / broker vamal', 'Înregistrați toate datele: placă, VIN, ID şofer, număr document, istoricul traversarilor'], FR: ['Vérifier statut non-résident : attestation résidence étrangère ou cachet domicile passeport', 'Confirmer titre propriété ou usage correspond à identité conducteur', 'Calculer jours totaux véhicule en Moldova via EES ou système SIME', 'Si jours >180 : informer conducteur obligation légale sortie ou placement sous régime import', 'Si refus : émettre avis douanier et transmettre à ANSC / transitaire', 'Enregistrer toutes données : plaque, VIN, ID conducteur, n° document, historique traverser'], RU: ['Подтвердить статус нерезидента: свидетельство о проживании за рубежом или штамп паспорта', 'Убедиться, что документ соответствует личности водителя', 'Подсчитать дни ТС в Молдове через EES или систему SIME', 'При >180 дней : уведомить о юридической обязанности выехать или поместить под режим импорта', 'При отказе : выдать таможенное уведомление, передать в ANSC / брокер', 'Зафиксировать: номер, VIN, ID водителя, номер документа, историю пересечений'] },
    sanctionsKey: { EN: 'Exceeding the 180-day limit triggers administrative fines. If the vehicle is not removed from the country within 30 days of the administrative report (proces-verbal) being drawn up, the customs authorities will collect all import duties — mandatory customs clearance (vămuire obligatorie) applies immediately.', RO: 'Depășirea termenului de 180 de zile atrage amenzi contravenționale. Dacă mașina nu este scoasă din țară în termen de 30 de zile de la întocmirea procesului-verbal, autoritățile vamale vor încasa toate drepturile de import (vămuire obligatorie).', FR: 'Le dépassement du délai de 180 jours entraîne des amendes contraventionnelles. Si le véhicule n\'est pas sorti du pays dans les 30 jours suivant l\'établissement du procès-verbal, les autorités douanières percevront l\'ensemble des droits d\'importation (dédouanement obligatoire).', RU: 'Превышение срока 180 дней влечёт административные штрафы. Если ТС не вывезено из страны в течение 30 дней с момента составления протокола, таможенные органы взыскивают все импортные пошлины (обязательное таможенное оформление).' },
  },
];

const COMMON_BP_INTEL: BcpThreat[] = [
  { id: 'COMMON-BP-DOC', institution: 'BP', severity: 'HIGH',
    titleKey: { EN: 'Travel Document Fraud — Forgeries & Counterfeits', RO: 'Documente de Călătorie Falsificate — Falsuri și Contrafaceri', FR: 'Fraude Documents de Voyage — Faux et Contrefaçons', RU: 'Подделка Документов — Фальсификация и Контрафакт' },
    descKey:  { EN: 'Organised groups circulate forged passports, cloned MRZ strips, and lookalike identity documents at this crossing. UV/IR inspection and RFID chip verification are mandatory for all RED and YELLOW channel passengers.', RO: 'Grupuri organizate circulă pașapoarte falsificate, benzi MRZ clonate și documente de identitate asemănătoare. Inspecția UV/IR și verificarea cipului RFID sunt obligatorii pentru toți pasagerii pe canal ROȘU și GALBEN.', FR: 'Des groupes organisés font circuler des passeports falsifiés, bandes MRZ clonées et faux documents d\'identité. Inspection UV/IR et vérification RFID obligatoires pour tout passager canal ROUGE et JAUNE.', RU: 'Организованные группы используют поддельные паспорта, клонированные MRZ-полосы и похожие документы. Проверка UV/IR и RFID обязательна для всех пассажиров красного и жёлтого каналов.' },
    indicators: { EN: ['MRZ checksum failure on scanner', 'UV/IR security features absent or misaligned', 'RFID chip BAC/EAC authentication failure', 'Photo substitution — lookalike person detected', 'Document country inconsistent with declared residency', 'Multiple nationalities presented for same person'], RO: ['Eșec sumă control MRZ la scanner', 'Elemente de securitate UV/IR absente sau deplasate', 'Eroare autentificare cip RFID BAC/EAC', 'Substituție fotografie — persoană asemănătoare detectată', 'Țara emitentă inconsistentă cu reședința declarată', 'Naționalități multiple prezentate pentru aceeași persoană'], FR: ['Échec checksum MRZ au scanner', 'Éléments UV/IR absents ou décalés', 'Échec authentification puce RFID BAC/EAC', 'Substitution photo — sosie détecté', 'Pays émetteur incohérent avec résidence déclarée', 'Nationalités multiples présentées pour même personne'], RU: ['Сбой контрольной суммы MRZ на сканере', 'Элементы UV/IR отсутствуют или смещены', 'Ошибка аутентификации RFID BAC/EAC', 'Замена фото — похожий человек', 'Страна выдачи не совпадает с местом жительства', 'Несколько национальностей на одно лицо'] },
    legislation: 'Art. 360-364 Cod Penal RM · Reg.EU 2019/1157 · ICAO Doc 9303 · Directiva (UE) 2019/945',
    goods: { EN: 'No goods — identity and document security violation', RO: 'Fără mărfuri — infracțiune de securitate a identității și documentelor', FR: 'Pas de marchandises — infraction sécurité documents et identité', RU: 'Товары отсутствуют — нарушение безопасности личности и документов' },
    actionsKey: { EN: ['Run full biometric check (face / iris / fingerprint) vs chip data', 'UV/IR lamp inspection — verify all security features vs reference chart', 'RFID chip readout — compare MRZ with VIZ and chip biography', 'Cross-check SIS II, INTERPOL I-24/7, national watch-list', 'If anomaly: retain document, isolate passenger, call document examiner immediately', 'Do NOT return document — initiate administrative detention protocol'], RO: ['Efectuați verificare biometrică completă (față / iris / amprente) față de cipul documentului', 'Inspecție lampă UV/IR — verificați toate elementele de securitate față de tabelul de referință', 'Citire cip RFID — comparați datele MRZ cu VIZ și biografia cipului', 'Verificare încrucișată SIS II, INTERPOL I-24/7, liste naționale', 'Dacă anomalie: rețineți documentul, izolați pasagerul, chemați imediat examinatorul', 'NU returnați documentul — inițiați protocolul de reținere administrativă'], FR: ['Effectuer vérification biométrique complète (visage / iris / empreintes) vs puce', 'Inspection UV/IR — vérifier tous éléments sécurité vs tableau de référence', 'Lecture puce RFID — comparer MRZ avec VIZ et biographie puce', 'Vérifier SIS II, INTERPOL I-24/7, listes nationales', 'Si anomalie : retenir document, isoler passager, appeler expert documents immédiatement', 'NE PAS rendre le document — engager protocole de rétention administrative'], RU: ['Провести полную биометрическую верификацию (лицо / радужка / отпечатки) vs чип', 'Проверка UV/IR — все элементы безопасности по справочной таблице', 'Считывание RFID — сравнить MRZ с VIZ и биографией чипа', 'Проверить в ШИС II, ИНТЕРПОЛ I-24/7, национальные списки', 'При аномалии: изъять документ, изолировать пассажира, вызвать эксперта', 'НЕ возвращать документ — инициировать протокол административного задержания'] },
  },
  { id: 'COMMON-BP-MIG', institution: 'BP', severity: 'HIGH',
    titleKey: { EN: 'Illegal Migration — Concealed Persons in Vehicles', RO: 'Migrație Ilegală — Persoane Ascunse în Vehicule', FR: 'Migration Irrégulière — Personnes Dissimulées dans Véhicules', RU: 'Незаконная Миграция — Люди в Транспортных Средствах' },
    descKey:  { EN: 'Migrants hidden in trucks, cars, buses or crossing between posts. Organised smuggling networks exploit this BCP\'s traffic patterns. Irregular entry attempts peak at night and during high-volume periods.', RO: 'Migranți ascunși în camioane, autoturisme, autobuze sau care traversează între posturi. Rețelele organizate exploatează tiparele de trafic ale acestui PTF. Tentativele de intrare neregulamentară ating vârfuri noaptea și în perioadele de volum ridicat.', FR: 'Migrants dissimulés dans camions, voitures, autobus ou traversant entre postes. Les réseaux organisés exploitent les flux. Tentatives irrégulières culminent la nuit et en forte circulation.', RU: 'Мигранты в грузовиках, автомобилях, автобусах. Организованные сети используют трафик КПП. Пики нелегального въезда — ночью и при высоком трафике.' },
    indicators: { EN: ['Vehicle weight exceeds documented load', 'K9 alert — human scent positive', 'CO2 / heartbeat sensor positive reading', 'Cargo space shows signs of recent occupancy (food, water, clothing)', 'Driver unusually nervous or evasive about route', 'Multiple passengers cannot state same destination or contact'], RO: ['Greutatea vehiculului depășește încărcătura documentată', 'Alertă K9 — miros uman pozitiv', 'Citire pozitivă senzor CO2 / bătăi inimă', 'Spațiul de marfă arată semne de ocupare recentă (mâncare, apă, îmbrăcăminte)', 'Șoferul nervos sau evaziv cu privire la rută', 'Mai mulți pasageri nu pot declara aceeași destinație sau contact'], FR: ['Poids véhicule supérieur charge documentée', 'Alerte K9 — présence humaine', 'Capteur CO2 / battements cœur positif', 'Espace cargo avec signes d\'occupation récente', 'Conducteur nerveux ou évasif sur l\'itinéraire', 'Passagers incapables de déclarer même destination'], RU: ['Вес ТС превышает задокументированный груз', 'Тревога K9 — запах человека', 'Датчик CO2/сердцебиения положительный', 'Следы недавнего присутствия людей в грузовом отсеке', 'Водитель нервничает или уклоняется', 'Пассажиры не называют единое место назначения'] },
    legislation: 'Art. 362-362² Cod Penal RM (trafic de persoane) · Legea 270/2008 · UNHCR Protocol 1967 · Reg.(UE) 2016/794 (Europol)',
    goods: { EN: 'No goods — persons attempting irregular border crossing', RO: 'Fără mărfuri — persoane care încearcă traversarea neregulamentară a frontierei', FR: 'Pas de marchandises — personnes tentant traversée irrégulière', RU: 'Товары отсутствуют — лица, пытающиеся нелегально пересечь границу' },
    actionsKey: { EN: ['Activate K9 unit for human-scent sweep of all vehicle cavities', 'Use CO2 / heartbeat sensor system on all compartments', 'Weigh vehicle on dynamic scale — compare to declared tare + goods weight', 'If positive: cordon area, call supervisor and emergency services immediately', 'Ensure safety of detected persons — provide first aid if needed', 'Open ILLEGAL MIGRATION file — record all persons, vehicle and driver data', 'Coordinate with INTERPOL I-24/7 and national migration authority (BMA)'], RO: ['Activați unitatea K9 pentru detecție miros uman în toate cavitățile vehiculului', 'Folosiți sistemul de senzori CO2 / bătăi inimă pe toate compartimentele', 'Cântăriți vehiculul pe cântar dinamic — comparați cu tara declarată + greutatea mărfii', 'Dacă pozitiv: cordonați zona, chemați supervizorul și serviciile de urgență imediat', 'Asigurați siguranța persoanelor detectate — acordați prim ajutor dacă este nevoie', 'Deschideți dosar MIGRAȚIE ILEGALĂ — înregistrați toate persoanele, vehiculul și șoferul', 'Coordonați cu INTERPOL I-24/7 și autoritatea de migrație (BMA)'], FR: ['Activer unité K9 pour détection odeur humaine dans toutes cavités', 'Utiliser capteurs CO2 / cœur sur tous compartiments', 'Peser sur bascule dynamique — comparer tare déclarée + poids marchandises', 'Si positif : cordonner, appeler superviseur et urgences immédiatement', 'Assurer sécurité personnes détectées — premiers secours si nécessaire', 'Ouvrir dossier MIGRATION IRRÉGULIÈRE — enregistrer toutes personnes, véhicule, conducteur', 'Coordonner INTERPOL I-24/7 et autorité migration (BMA)'], RU: ['Задействовать K9 для обнаружения запаха людей', 'Использовать датчики CO2/сердцебиения во всех отсеках', 'Взвесить ТС на динамических весах — сравнить с декларируемой тарой', 'При положительном: оцепить зону, вызвать супервизора и экстренные службы', 'Обеспечить безопасность обнаруженных лиц — первая помощь при необходимости', 'Открыть дело НЕЗАКОННАЯ МИГРАЦИЯ — зафиксировать всех лиц, ТС и водителя', 'Координация с ИНТЕРПОЛ I-24/7 и миграционным органом (BMA)'] },
  },
  { id: 'COMMON-BP-OVS', institution: 'BP', severity: 'MEDIUM',
    titleKey: { EN: 'Illegal Overstay — Visa / Residence Permit Exceeded', RO: 'Ședere Ilegală — Depășire Viză / Permis de Ședere', FR: 'Séjour Irrégulier — Dépassement Visa / Titre de Séjour', RU: 'Незаконное Пребывание — Превышение Визы / ВНЖ' },
    descKey:  { EN: 'Persons exiting after staying in Moldova beyond their authorised period (tourist visa, visa-free 90/180 days, or expired residence permit). An administrative fine must be issued. If overstay exceeds 30 days, entry ban protocol applies.', RO: 'Persoane care ies după ce au rămas în Moldova peste perioada autorizată (viză turistică, fără viză 90/180 zile sau permis de ședere expirat). Se emite amendă contravențională. Dacă depășirea este peste 30 de zile, se aplică interdicție de intrare.', FR: 'Personnes quittant le pays après dépassement de leur durée autorisée (visa touriste, sans visa 90/180 jours ou permis expiré). Amende obligatoire. Si dépassement > 30 jours, protocole d\'interdiction d\'entrée.', RU: 'Лица, выезжающие после превышения разрешённого срока (туристическая виза, безвизовый 90/180 дней или просроченный ВНЖ). Обязателен административный штраф. При превышении > 30 дней — запрет въезда.' },
    indicators: { EN: ['EES or stamp history shows stay exceeds authorised duration', 'Visa validity expired before exit date', 'Residence permit expired — no renewal on record', 'Person evasive about actual length of stay', '90/180-day visa-free calculation not respected'], RO: ['EES sau istoricul ștampilelor arată depășirea duratei autorizate', 'Viza expirată înainte de data ieșirii', 'Permis de ședere expirat — fără reînnoire în evidențe', 'Persoana evazivă cu privire la durata reală a șederii', 'Calculul de 90/180 zile fără viză nerespect'], FR: ['EES ou tampons montrent dépassement durée autorisée', 'Visa expiré avant date sortie', 'Titre séjour expiré sans renouvellement', 'Personne évasive sur durée réelle séjour', 'Calcul 90/180 jours sans visa non respecté'], RU: ['EES или штампы показывают превышение срока', 'Виза истекла до даты выезда', 'ВНЖ просрочен — продление не зафиксировано', 'Лицо уклоняется от вопросов о сроке пребывания', 'Расчёт 90/180 дней не соблюдён'] },
    legislation: 'Art. 54-56 Legea 200/2010 (regimul străinilor) · Reg.EU 2017/2226 (EES) · Art. 12 Cod Contravențional RM',
    goods: { EN: 'No goods — administrative overstay violation', RO: 'Fără mărfuri — contravenție administrativă de depășire ședere', FR: 'Pas de marchandises — infraction administrative dépassement séjour', RU: 'Товары отсутствуют — административное нарушение срока пребывания' },
    actionsKey: { EN: ['Query EES or verify entry stamps — calculate total authorised vs actual days', 'If overstay confirmed: issue administrative violation protocol (proces-verbal)', 'Collect fine per national tariff schedule (Cod Contravențional)', 'If overstay > 30 days: initiate entry ban — record in national register', 'Notify immigration authority (BMA) for tracking', 'Record all identity data, entry/exit dates and violation details'], RO: ['Interogați EES sau verificați ștampilele de intrare — calculați zilele autorizate față de cele reale', 'Dacă depășire confirmată: emiteți proces-verbal contravenție administrativă', 'Percepeți amenda conform grilei naționale (Cod Contravențional)', 'Dacă depășire > 30 zile: inițiați interdicție de intrare — înregistrați în registrul național', 'Notificați autoritatea de imigrare (BMA) pentru urmărire', 'Înregistrați toate datele de identitate, datele de intrare/ieșire și detaliile contravenției'], FR: ['Interroger EES ou vérifier tampons entrée — calculer jours autorisés vs réels', 'Si dépassement confirmé : établir proces-verbal de contravention administrative', 'Percevoir amende selon barème national', 'Si dépassement > 30 jours : interdiction entrée — enregistrer au registre national', 'Notifier autorité immigration (BMA)', 'Enregistrer toutes données identité, dates et détails contravention'], RU: ['Запросить EES или проверить штампы — подсчитать разрешённые vs фактические дни', 'При подтверждённом превышении: составить протокол административного нарушения', 'Взыскать штраф по тарифной сетке (Кодекс о правонарушениях)', 'При превышении > 30 дней: запрет въезда — внести в национальный реестр', 'Уведомить миграционный орган (BMA)', 'Зафиксировать данные личности, даты и детали нарушения'] },
  },
  { id: 'COMMON-BP-VIN', institution: 'JOINT', severity: 'HIGH',
    titleKey: { EN: 'Stolen Vehicle / Modified VIN Code', RO: 'Autovehicul Furat / Cod VIN Modificat', FR: 'V\u00e9hicule Vol\u00e9 / Code VIN Modifi\u00e9', RU: '\u0423\u0433\u043d\u0430\u043d\u043d\u044b\u0439 \u0410\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u044c / \u0418\u0437\u043c\u0435\u043d\u0451\u043d\u043d\u044b\u0439 VIN' },
    descKey: { EN: 'Stolen vehicles — most often premium cars, luxury SUVs and vans — enter with re-stamped, ground-down or replacement VIN plates to disguise their real identity. This is a JOINT BP + Customs threat: BP must verify vehicle identity against EUCARIS / INTERPOL VSCI; Customs must verify the declared value against market value and check the technical passport for chassis / engine number tampering. Linked to organised cross-border crime networks and the unofficial second-hand car market.', RO: 'Autovehicule furate — de regul\u0103 autoturisme premium, SUV-uri de lux \u015fi furgonetep — intr\u0103 cu num\u0103rul VIN re\u015btampilat, frezat sau \u00een\u0103lnuit pentru a ascunde identitatea real\u0103. Este o amenin\u021bare COMUN\u0102 PF + Vam\u0103: PF verific\u0103 identitatea vehiculului \u00een EUCARIS / INTERPOL VSCI; Vama verific\u0103 valoarea declarat\u0103 vs. valoarea de pia\u021b\u0103 \u015fi num\u0103rul de \u015fasiu / motor \u00een pa\u015faportu tehnic. Leg\u0103tur\u0103 cu re\u021bele de criminalitate organizat\u0103 transfrontalier\u0103.', FR: 'V\u00e9hicules vol\u00e9s — souvent des voitures premium, SUV de luxe et camionnettes — entrent avec le code VIN regrav\u00e9, effac\u00e9 ou remplac\u00e9 pour dissimuler leur identit\u00e9. Menace CONJOINTE PF + Douane: la PF v\u00e9rifie dans EUCARIS / INTERPOL VSCI ; la Douane v\u00e9rifie la valeur d\u00e9clar\u00e9e vs. valeur march\u00e9 et le passeport technique pour les falsifications de num\u00e9ro de ch\u00e2ssis.', RU: '\u0423\u0433\u043d\u0430\u043d\u043d\u044b\u0435 \u0430\u0432\u0442\u043e\u043c\u043e\u0431\u0438\u043b\u0438 — \u043f\u0440\u0435\u0436\u0434\u0435 \u0432\u0441\u0435\u0433\u043e \u043f\u0440\u0435\u043c\u0438\u0430\u043b\u044c\u043d\u044b\u0435, \u043b\u044e\u043a\u0441\u043e\u0432\u044b\u0435 \u0432\u043d\u0435\u0434\u043e\u0440\u043e\u0436\u043d\u0438\u043a\u0438 \u0438 \u0444\u0443\u0440\u0433\u043e\u043d\u044b — \u043f\u0435\u0440\u0435\u0441\u0435\u043a\u0430\u044e\u0442 \u0433\u0440\u0430\u043d\u0438\u0446\u0443 \u0441 \u043f\u0435\u0440\u0435\u0431\u0438\u0442\u044b\u043c, \u0441\u0442\u0451\u0440\u0442\u044b\u043c \u0438\u043b\u0438 \u0437\u0430\u043c\u0435\u043d\u0451\u043d\u043d\u044b\u043c \u043a\u043e\u0434\u043e\u043c VIN. \u0421\u043e\u0432\u043c\u0435\u0441\u0442\u043d\u0430\u044f \u0443\u0433\u0440\u043e\u0437\u0430 \u041f\u0424 + \u0422\u0430\u043c\u043e\u0436\u043d\u044f.' },
    indicators: { EN: ['VIN plate shows signs of grinding, re-stamping or replacement', 'VIN on door frame / firewall / engine block / gearbox do not match each other', 'EUCARIS query: no record found or record belongs to different vehicle', 'INTERPOL VSCI hit — vehicle reported stolen', 'Declared customs value far below market value for make/model/year', 'Driver evasive about origin of vehicle or ownership history', 'Technical passport (pasaport tehnic) has corrections or erasures', 'Paint or glass date codes pre-date declared manufacture year', 'ECU / OBD VIN does not match physical VIN plate', 'Temporary Admission (TA) documents but no departure record in previous visits'], RO: ['Placuta VIN prezinta urme de polizare, re\u015btampilare sau \u00eenlocuire', 'VIN-ul de pe cadrul u\u015fii / planul de foc / blocul motor / cutia de viteze nu coincid', 'Interogare EUCARIS: niciun rezultat sau rezultatul apar\u021bine unui vehicul diferit', 'Hit INTERPOL VSCI — vehicul raportat furat', 'Valoarea vamal\u0103 declarat\u0103 mult sub valoarea de pia\u021b\u0103 pentru marca/model/an', '\u0218oferul este evaziv privind originea vehiculului sau istoricul de proprietate', 'Pa\u015faportul tehnic prezint\u0103 corect\u0103ri sau \u015ftersturi', 'Codurile de dat\u0103 ale vopselei sau geamurilor sunt anterioare anului de fabrica\u021bie declarat', 'VIN-ul \u00een ECU/OBD nu coincide cu placa fizic\u0103 VIN', 'Documente de admitere temporar\u0103 (AT) f\u0103r\u0103 \u00eenregistrare de ie\u015fire la vizitele anterioare'], FR: ['Plaque VIN montre des traces de meulage, re-frappe ou remplacement', 'VIN sur montant porte / tablier / bloc moteur / bo\u00eete vitesse ne correspondent pas', 'Requ\u00eate EUCARIS : aucun r\u00e9sultat ou r\u00e9sultat appartient \u00e0 un autre v\u00e9hicule', 'Hit INTERPOL VSCI — v\u00e9hicule signal\u00e9 vol\u00e9', 'Valeur douani\u00e8re d\u00e9clar\u00e9e bien inf\u00e9rieure \u00e0 la valeur march\u00e9 pour la marque/mod\u00e8le/ann\u00e9e', 'Conducteur \u00e9vasif sur l\u2019origine ou l\u2019historique du v\u00e9hicule', 'Passeport technique pr\u00e9sente des corrections ou ratures', 'Codes date peinture ou vitrages ant\u00e9rieurs \u00e0 l\u2019ann\u00e9e de fabrication d\u00e9clar\u00e9e', 'VIN dans ECU/OBD ne correspond pas \u00e0 la plaque physique', 'AT sans enregistrement de sortie lors de visites pr\u00e9c\u00e9dentes'], RU: ['\u041f\u043b\u0430\u0441\u0442\u0438\u043d\u0430 VIN \u0441 \u0441\u043b\u0435\u0434\u0430\u043c\u0438 \u0448\u043b\u0438\u0444\u043e\u0432\u043a\u0438, \u043f\u0435\u0440\u0435\u0431\u0438\u0432\u043a\u0438 \u0438\u043b\u0438 \u0437\u0430\u043c\u0435\u043d\u044b', '\u041d\u043e\u043c\u0435\u0440 VIN \u043d\u0430 \u0441\u0442\u043e\u0439\u043a\u0435 \u0434\u0432\u0435\u0440\u0438 / \u043f\u0435\u0440\u0435\u0433\u043e\u0440\u043e\u0434\u043a\u0435 / \u0431\u043b\u043e\u043a\u0435 \u0434\u0432\u0438\u0433\u0430\u0442\u0435\u043b\u044f \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442', '\u0417\u0430\u043f\u0440\u043e\u0441 EUCARIS: \u043d\u0435\u0442 \u0437\u0430\u043f\u0438\u0441\u0438 \u0438\u043b\u0438 \u0437\u0430\u043f\u0438\u0441\u044c \u043f\u0440\u0438\u043d\u0430\u0434\u043b\u0435\u0436\u0438\u0442 \u0434\u0440\u0443\u0433\u043e\u043c\u0443 \u0422\u0421', '\u0421\u0440\u0430\u0431\u0430\u0442\u044b\u0432\u0430\u043d\u0438\u0435 INTERPOL VSCI — \u0422\u0421 \u0437\u0430\u044f\u0432\u043b\u0435\u043d\u043e \u0432 \u0440\u043e\u0437\u044b\u0441\u043a', '\u0414\u0435\u043a\u043b\u0430\u0440\u0438\u0440\u0443\u0435\u043c\u0430\u044f \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0437\u043d\u0430\u0447\u0438\u0442\u0435\u043b\u044c\u043d\u043e \u043d\u0438\u0436\u0435 \u0440\u044b\u043d\u043e\u0447\u043d\u043e\u0439 \u0434\u043b\u044f \u043c\u0430\u0440\u043a\u0438/\u043c\u043e\u0434\u0435\u043b\u0438/\u0433\u043e\u0434\u0430', '\u0412\u043e\u0434\u0438\u0442\u0435\u043b\u044c \u0443\u043a\u043b\u043e\u043d\u044f\u0435\u0442\u0441\u044f \u043e\u0442 \u0432\u043e\u043f\u0440\u043e\u0441\u043e\u0432 \u043e \u043f\u0440\u043e\u0438\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u0438 \u0422\u0421', '\u0422\u0435\u0445\u043f\u0430\u0441\u043f\u043e\u0440\u0442 \u0441\u043e\u0434\u0435\u0440\u0436\u0438\u0442 \u0438\u0441\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u0438\u043b\u0438 \u043f\u043e\u0434\u0447\u0438\u0441\u0442\u043a\u0438', '\u041a\u043e\u0434\u044b \u0434\u0430\u0442 \u043d\u0430 \u043b\u0430\u043a\u0435 / \u0441\u0442\u0435\u043a\u043b\u0430\u0445 \u0441\u0442\u0430\u0440\u0448\u0435 \u0437\u0430\u044f\u0432\u043b\u0435\u043d\u043d\u043e\u0433\u043e \u0433\u043e\u0434\u0430 \u0432\u044b\u043f\u0443\u0441\u043a\u0430', 'VIN \u0432 \u0411\u041b\u041e\u043a/ECU \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0435\u0442 \u0441 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043a\u043e\u0439 \u043f\u043b\u0430\u0441\u0442\u0438\u043d\u043e\u0439', '\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u044b \u0412\u0412 \u0431\u0435\u0437 \u0437\u0430\u043f\u0438\u0441\u0438 \u043e \u0432\u044b\u0435\u0437\u0434\u0435 \u0432 \u043f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0445 \u043f\u043e\u0435\u0437\u0434\u043a\u0430\u0445'] },
    legislation: 'Art. 186-196 Cod Penal RM (furt / fals material) \u00b7 Art. 273 Cod Penal RM (t\u0103inuire) \u00b7 Conv. ONU criminalitate organizat\u0103 (Palermo) \u00b7 EUCARIS Conv. 2000 \u00b7 INTERPOL VSCI \u00b7 Directiva UE 2014/42/UE (sechestru)',
    goods: { EN: 'Vehicle body / chassis — premium cars, SUVs, vans (value EUR 15,000–200,000+)', RO: 'Caroseria vehiculului / \u015fasiu — autoturisme premium, SUV-uri, furgonetep (valoare EUR 15.000–200.000+)', FR: 'Carrosserie / ch\u00e2ssis — voitures premium, SUV, camionnettes (valeur EUR 15 000–200 000+)', RU: '\u041a\u0443\u0437\u043e\u0432 / \u0440\u0430\u043c\u0430 — \u043f\u0440\u0435\u043c\u0438\u0430\u043b\u044c\u043d\u044b\u0435 \u0430\u0432\u0442\u043e, \u0432\u043d\u0435\u0434\u043e\u0440\u043e\u0436\u043d\u0438\u043a\u0438, \u0444\u0443\u0440\u0433\u043e\u043d\u044b (\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c EUR 15.000–200.000+)' },
    actionsKey: { EN: ['Verify VIN on door frame, firewall (dashboard), engine block and gearbox — must all match', 'Run EUCARIS query — cross-check ownership, registration country and VIN', 'Run INTERPOL VSCI query via I-24/7 — check stolen vehicle database', 'Scan ECU / OBD port — read VIN from on-board computer and compare with physical VIN', 'Check technical passport (pa\u015faport tehnic) — chassis and engine numbers must match', 'Inspect VIN plate under UV / magnification for grinding or re-stamping marks', 'Compare declared customs value against EUROTAX / market data for make/model/year', 'If mismatch confirmed: immobilise vehicle, notify Intelligence Officer, open Article 186/196 Cod Penal dossier', 'Do NOT allow the vehicle to proceed — risk of evidence destruction', 'Request forensic VIN examination by Criminalistics Department if needed'], RO: ['Verifica\u021bi VIN pe cadrul u\u015fii, planul de foc (tablou de bord), blocul motor \u015fi cutia de viteze — trebuie s\u0103 coincid\u0103', 'Interogare EUCARIS — verifica\u021bi proprietarul, \u021bara de \u00eenmatriculare \u015fi VIN-ul', 'Interogare INTERPOL VSCI via I-24/7 — verifica\u021bi baza de date vehicule furate', 'Scana\u021bi ECU / portul OBD — cititi VIN din calculatorul de bord \u015fi compara\u021bi cu cel fizic', 'Verifica\u021bi pa\u015faportul tehnic — numerele de \u015fasiu \u015fi motor trebuie s\u0103 corespund\u0103', 'Inspectati placa VIN sub UV / lup\u0103 pentru urme de polizare sau re\u015btampilare', 'Compara\u021bi valoarea vamal\u0103 declarat\u0103 cu datele EUROTAX / pia\u021b\u0103 pentru marca/model/an', 'Dac\u0103 discrepan\u021ba este confirmat\u0103: imobiliza\u021bi vehiculul, notifica\u021bi Ofi\u021berul de Informa\u021bii, deschide\u021bi dosar Art. 186/196 Cod Penal', 'Nu permite\u021bi vehiculului s\u0103 continue — risc de distrugere a probelor', 'Solicita\u021bi expertiz\u0103 criminalistic\u0103 VIN de la Departamentul Criminalistic\u0103 dac\u0103 este necesar'], FR: ['V\u00e9rifier VIN sur montant de porte, tablier, bloc moteur et bo\u00eete de vitesses — doivent correspondre', 'Requ\u00eate EUCARIS — v\u00e9rifier propri\u00e9taire, pays immatriculation et VIN', 'Requ\u00eate INTERPOL VSCI via I-24/7 — v\u00e9rifier base v\u00e9hicules vol\u00e9s', 'Scanner port ECU/OBD — lire VIN calculateur de bord et comparer physique', 'V\u00e9rifier passeport technique — num\u00e9ros ch\u00e2ssis et moteur doivent correspondre', 'Inspecter plaque VIN sous UV / loupe pour traces meulage ou re-frappe', 'Comparer valeur d\u00e9clar\u00e9e avec donn\u00e9es EUROTAX / march\u00e9 pour marque/mod\u00e8le/ann\u00e9e', 'Si \u00e9cart confirm\u00e9 : immobiliser v\u00e9hicule, notifier OFC, ouvrir dossier Art. 186/196', 'Ne pas laisser repartir le v\u00e9hicule — risque destruction preuves', 'Demander expertise criminalistique VIN si n\u00e9cessaire'], RU: ['\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c VIN \u043d\u0430 \u0441\u0442\u043e\u0439\u043a\u0435 \u0434\u0432\u0435\u0440\u0438, \u043f\u0435\u0440\u0435\u0433\u043e\u0440\u043e\u0434\u043a\u0435, \u0431\u043b\u043e\u043a\u0435 \u0434\u0432\u0438\u0433\u0430\u0442\u0435\u043b\u044f \u0438 \u041a\u041f\u041f — \u0432\u0441\u0435 \u0434\u043e\u043b\u0436\u043d\u044b \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0442\u044c', '\u0417\u0430\u043f\u0440\u043e\u0441 EUCARIS — \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430, \u0441\u0442\u0440\u0430\u043d\u0443 \u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u0438 \u0438 VIN', '\u0417\u0430\u043f\u0440\u043e\u0441 INTERPOL VSCI \u0447\u0435\u0440\u0435\u0437 I-24/7 — \u0431\u0430\u0437\u0430 \u0443\u0433\u043d\u0430\u043d\u043d\u044b\u0445 \u0422\u0421', '\u0421\u043a\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043f\u043e\u0440\u0442 ECU/OBD — \u0441\u0447\u0438\u0442\u0430\u0442\u044c VIN \u0438\u0437 \u0411\u041b\u041e\u041a\u0430 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u044f \u0438 \u0441\u0440\u0430\u0432\u043d\u0438\u0442\u044c \u0441 \u0444\u0438\u0437\u0438\u0447\u0435\u0441\u043a\u0438\u043c', '\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0442\u0435\u0445\u043f\u0430\u0441\u043f\u043e\u0440\u0442 — \u043d\u043e\u043c\u0435\u0440\u0430 \u0448\u0430\u0441\u0441\u0438 \u0438 \u0434\u0432\u0438\u0433\u0430\u0442\u0435\u043b\u044f \u0434\u043e\u043b\u0436\u043d\u044b \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u0442\u044c', '\u041e\u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u043f\u043b\u0430\u0441\u0442\u0438\u043d\u0443 VIN \u043f\u043e\u0434 UV / \u043b\u0443\u043f\u043e\u0439 \u043d\u0430 \u0441\u043b\u0435\u0434\u044b \u0448\u043b\u0438\u0444\u043e\u0432\u043a\u0438', '\u0421\u0440\u0430\u0432\u043d\u0438\u0442\u044c \u0434\u0435\u043a\u043b\u0430\u0440\u0438\u0440\u0443\u0435\u043c\u0443\u044e \u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0441 \u0434\u0430\u043d\u043d\u044b\u043c\u0438 EUROTAX / \u0440\u044b\u043d\u043a\u0430', '\u041f\u0440\u0438 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u043e\u043c \u043d\u0435\u0441\u043e\u043e\u0442\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0438: \u0437\u0430\u0431\u043b\u043e\u043a\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0422\u0421, \u0443\u0432\u0435\u0434\u043e\u043c\u0438\u0442\u044c \u043e\u0444\u0438\u0446\u0435\u0440\u0430 \u0440\u0430\u0437\u0432\u0435\u0434\u043a\u0438, \u0432\u043e\u0437\u0431\u0443\u0434\u0438\u0442\u044c \u0434\u0435\u043b\u043e \u043f\u043e \u0441\u0442. 186/196 \u041a\u041f', '\u041d\u0435 \u043f\u0440\u043e\u043f\u0443\u0441\u043a\u0430\u0442\u044c \u0422\u0421 \u0434\u0430\u043b\u044c\u0448\u0435 — \u0440\u0438\u0441\u043a \u0443\u043d\u0438\u0447\u0442\u043e\u0436\u0435\u043d\u0438\u044f \u0434\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u044c\u0441\u0442\u0432', '\u041f\u0440\u0438 \u043d\u0435\u043e\u0431\u0445\u043e\u0434\u0438\u043c\u043e\u0441\u0442\u0438 \u0437\u0430\u043f\u0440\u043e\u0441\u0438\u0442\u044c \u043a\u0440\u0438\u043c\u0438\u043d\u0430\u043b\u0438\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u0443\u044e \u044d\u043a\u0441\u043f\u0435\u0440\u0442\u0438\u0437\u0443 VIN'] },
    sanctionsKey: { EN: 'Art. 186 Cod Penal RM: theft (up to 15 years). Art. 195-196: document forgery (3–7 years). Vehicle seizure mandatory. Criminal dossier to Prosecutor. EUCARIS / INTERPOL notification.', RO: 'Art. 186 Cod Penal RM: furt calificat (p\u00e2n\u0103 la 15 ani). Art. 195-196: fals \u00een documente (3–7 ani). Sechestru obligatoriu. Dosar penal la Procuratur\u0103. Notificare EUCARIS / INTERPOL.', FR: 'Art. 186 Cod Penal RM: vol qualifi\u00e9 (jusqu\u2019\u00e0 15 ans). Art. 195-196: faux (3–7 ans). Saisie obligatoire. Dossier p\u00e9nal au Parquet. Notification EUCARIS / INTERPOL.', RU: '\u0421\u0442. 186 \u0423\u041a \u0420\u041c: \u043a\u0440\u0430\u0436\u0430 (\u0434\u043e 15 \u043b\u0435\u0442). \u0421\u0442. 195-196: \u043f\u043e\u0434\u0434\u0435\u043b\u043a\u0430 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u043e\u0432 (3–7 \u043b\u0435\u0442). \u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0439 \u0430\u0440\u0435\u0441\u0442 \u0422\u0421. \u0423\u0433\u043e\u043b\u043e\u0432\u043d\u043e\u0435 \u0434\u0435\u043b\u043e \u043f\u0440\u043e\u043a\u0443\u0440\u043e\u0440\u0443. \u0423\u0432\u0435\u0434\u043e\u043c\u043b\u0435\u043d\u0438\u0435 EUCARIS / INTERPOL.' },
  },
];


// ─── BCP-specific active policy engines ─────────────────────────────────────
// Each BCP activates only the query types matching its risk profile.
// BP-domain: plate, identity, passport, interpol, overstay, migration
// CS-domain: hscode, eori, pnr
const BCP_ACTIVE_ENGINES: Record<string, string[]> = {
  // Major road BCPs — full suite
  BCP_LEUSENI:       ['plate','identity','hscode','passport','eori','pnr','interpol','overstay','migration'],
  BCP_SCULENI:       ['plate','identity','passport','interpol','overstay','migration','pnr','hscode'],
  BCP_PALANCA:       ['plate','identity','passport','hscode','eori','interpol','overstay'],
  // River / multimodal BCPs
  BCP_GIURGIULESTI1: ['plate','identity','hscode','passport','eori','overstay'],
  BCP_GIURGIULESTI2: ['plate','identity','hscode','passport','overstay'],
  // Secondary road BCPs
  BCP_CAHUL:         ['plate','identity','passport','overstay','migration'],
  BCP_COSTESTI:      ['plate','identity','passport','hscode','overstay'],
  BCP_LEOVA:         ['plate','identity','passport','overstay','migration'],
  BCP_LIPCANI:       ['plate','identity','passport','hscode','interpol'],
  BCP_OTACI:         ['plate','identity','passport','overstay'],
  BCP_BRICENI:       ['plate','identity','passport','migration'],
  // Small / pedestrian BCPs — lightweight
  BCP_BASARABEASCA:  ['plate','identity','passport','overstay'],
  BCP_CEADARLUGA1:   ['plate','identity','passport'],
  BCP_CEADARLUGA2:   ['plate','identity','passport'],
  BCP_GRIMANCAUTI:   ['plate','identity','passport','migration'],
  BCP_UNGURI:        ['plate','identity','passport'],
  BCP_CRIVA:         ['plate','identity','passport','migration'],
  BCP_TUDORA:        ['plate','identity','passport'],
  BCP_SAITI:         ['plate','identity','passport'],
  BCP_MIRNOE:        ['plate','identity','passport','overstay'],
  BCP_CISMICHIOI:    ['plate','identity','passport','overstay'],
};
const DEFAULT_ENGINES = ['plate','identity','passport','overstay'];

const AIRiskLayer: React.FC<{ vehicles: Vehicle[]; declarations: Declaration[]; pred: Predictions | null; lang: Language; selectedBCP: string }> = ({ vehicles, declarations, pred, lang, selectedBCP }) => {
  const [reportVehicle, setReportVehicle] = useState<Vehicle | null>(null);
  const [reportBcp, setReportBcp]         = useState<string | null>(null);
  const [aiSitrep, setAiSitrep]           = useState<string | null>(null);
  const [aiSitrepLoading, setAiSitrepLoading] = useState(false);
  const [expandedThreat,  setExpandedThreat]  = useState<string | null>(null);
  const [expandedCase,    setExpandedCase]    = useState<string | null>(null);
  const [expandedReport,  setExpandedReport]  = useState<string | null>(null);
  const [panelLang,       setPanelLang]       = useState<Language>(lang);
  const [expandedTruck,   setExpandedTruck]   = useState<string | null>(null);
  const [expandedRedDecl, setExpandedRedDecl] = useState<string | null>(null);
  const [expandedRedBP,   setExpandedRedBP]   = useState<string | null>(null);
  const [profileTab,      setProfileTab]      = useState<'scenarios'|'red'>('scenarios');
  const [actionQueueTab, setActionQueueTab] = useState<'flagged'|'red'|'reports'|'network'>('reports');
  const [casesTab, setCasesTab] = useState<'pf'|'sv'>('pf');
  const [riskInstFilter, setRiskInstFilter] = useState<'ALL'|'BP'|'CS'>('ALL');

  const activeVehicles    = vehicles.filter(v => v.status !== 'cleared');
  const bcpActiveVehicles = activeVehicles.filter(v => v.bcpId === selectedBCP);
  const netHighRisk       = activeVehicles.filter(v => v.risk === 'High').length;
  const activeDecls    = declarations.filter(d => d.status === 'SUBMITTED' || d.status === 'INSPECTION');
  const bcpActiveDecls = activeDecls.filter(d => {
    const lv = vehicles.find(v => v.id === d.linkedVehicleId || v.plate === d.vehiclePlate);
    return lv ? lv.bcpId === selectedBCP : true;
  });
  const vTotal = bcpActiveVehicles.length || 1;
  const dTotal = bcpActiveDecls.length    || 1;

  const riskCounts = {
    High:   bcpActiveVehicles.filter(v => v.risk === 'High').length,
    Medium: bcpActiveVehicles.filter(v => v.risk === 'Medium').length,
    Low:    bcpActiveVehicles.filter(v => v.risk === 'Low').length,
  };
  const chanCounts = {
    RED:    bcpActiveDecls.filter(d => d.channel === 'RED').length,
    YELLOW: bcpActiveDecls.filter(d => d.channel === 'YELLOW').length,
    GREEN:  bcpActiveDecls.filter(d => d.channel === 'GREEN').length,
  };
  const watchlistHits = bcpActiveVehicles.filter(v => v.watchlistHit).length;
  const docAnomalies  = bcpActiveVehicles.filter(v => v.docAnomaly).length;
  const bioFailures   = bcpActiveVehicles.filter(v => v.bioMismatch).length;

  const highRiskVehicles = bcpActiveVehicles
    .filter(v => v.risk === 'High')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);

  const redDecls = bcpActiveDecls
    .filter(d => d.channel === 'RED')
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 6);

  // ── BP RED flags: migration + interpol + overstay + doc fraud (merged) ──────
  const redBPVehicles = bcpActiveVehicles
    .filter(v =>
         (v.watchlistHit && v.vehicleType === 'bus')
      || (v.vehicleType === 'bus' && v.risk === 'High')
      || (v.watchlistHit && v.routeRisk > 0.7 && v.vehicleType !== 'truck')
      || (v.routeRisk > 0.8 && v.vehicleType !== 'truck' && v.risk === 'High')
      || (v.docAnomaly && v.bioMismatch)
      || (v.docAnomaly && v.risk === 'High' && v.watchlistHit)
    )
    .filter(v => !redDecls.some(d => d.linkedVehicleId === v.id || d.vehiclePlate === v.plate))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 8);

  const trendColor = pred?.trend === 'CRITICAL' ? 'text-red-400' : pred?.trend === 'DETERIORATING' ? 'text-amber-400' : pred?.trend === 'IMPROVING' ? 'text-emerald-400' : 'text-blue-400';
  const trendLabel = pred?.trend === 'IMPROVING'
    ? { EN: '↓ Improving', RO: '↓ Ameliorare', FR: '↓ Amélioration', RU: '↓ Улучшение' }[lang]
    : pred?.trend === 'DETERIORATING'
    ? { EN: '↑ Deteriorating', RO: '↑ Deteriorare', FR: '↑ Détérioration', RU: '↑ Ухудшение' }[lang]
    : pred?.trend === 'CRITICAL'
    ? { EN: '↑ Critical', RO: '↑ Critic', FR: '↑ Critique', RU: '↑ Критический' }[lang]
    : { EN: '→ Stable', RO: '→ Stabil', FR: '→ Stable', RU: '→ Стабильно' }[lang];

  const statusLabel: Record<string, string> = {
    waiting_border:  { EN: 'Queuing',          RO: 'Coadă',                 FR: 'En File',             RU: 'В Очереди'          }[lang],
    in_border:       { EN: 'Border Check',      RO: 'Control Frontieră',     FR: 'Contrôle Frontière',  RU: 'Паспортный Контроль' }[lang],
    waiting_customs: { EN: 'Awaiting Customs',  RO: 'Așteptare Vamă',        FR: 'Attente Douane',      RU: 'Ожидание Таможни'   }[lang],
    in_customs:      { EN: 'Customs Check',     RO: 'Control Vamal',         FR: 'Contrôle Douanier',   RU: 'Таможенный Контроль' }[lang],
  };

  return (
    <>
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-y-auto custom-scrollbar">

      {/* ── Left column ── */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">

        {/* Risk summary cards */}
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: { EN: 'High-Risk Vehicles',       RO: 'Vehicule Risc Ridicat',     FR: 'Véhicules Haut Risque',     RU: 'ТС Высокого Риска'           }[lang], val: riskCounts.High,   border: 'border-red-500/30 bg-red-500/5',   text: 'text-red-400',    dot: 'bg-red-500 animate-pulse' },
            { label: { EN: 'Medium-Risk',               RO: 'Risc Mediu',                FR: 'Risque Moyen',               RU: 'Средний Риск'                }[lang], val: riskCounts.Medium, border: 'border-amber-500/30 bg-amber-500/5', text: 'text-amber-400',  dot: 'bg-amber-500' },
            { label: { EN: 'RED Channel Declarations',  RO: 'Declarații Canal ROȘU',     FR: 'Décl. Canal ROUGE',          RU: 'Декл. Красного Канала'       }[lang], val: chanCounts.RED,    border: 'border-rose-500/30 bg-rose-500/5',  text: 'text-rose-400',   dot: 'bg-rose-500' },
          ] as const).map(c => (
            <div key={c.label} className={`rounded-xl border p-3 ${c.border}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{c.label}</span>
              </div>
              <div className={`text-3xl font-light ${c.text}`}>{c.val}</div>
            </div>
          ))}
        </div>

        {/* High-risk vehicle list */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden flex flex-col flex-1">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-start justify-between shrink-0">
            <div className="flex-1 min-w-0">
              {/* BCP scope badge + tab bar */}
              <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-[9px] font-bold text-red-300 uppercase tracking-wide truncate">{BCPS.find(b=>b.id===selectedBCP)?.name ?? selectedBCP}</span>
                  <span className="text-[8px] text-slate-600 ml-auto shrink-0 font-mono">BCP {riskCounts.High} / NET {netHighRisk}</span>
              </div>
              <div className="flex gap-1 mt-1">
                {([{id:'flagged'  as const, label:{ EN:'🚦 Flagged', RO:'🚦 Semnalate', FR:'🚦 Signalés', RU:'🚦 Отмеч.' }[lang]},{id:'red'      as const, label:{ EN:'🔴 Red Channel', RO:'🔴 Canal Roșu', FR:'🔴 Canal Rouge', RU:'🔴 Красный' }[lang]},{id:'reports'  as const, label:{ EN:'📊 Risk Reports', RO:'📊 Rapoarte Risc', FR:'📊 Rapports', RU:'📊 Отчёты' }[lang]},{id:'network'  as const, label:{ EN:'🌐 Network', RO:'🌐 Rețea', FR:'🌐 Réseau', RU:'🌐 Сеть' }[lang]},]).map(t => (
                  <button key={t.id} onClick={()=>setActionQueueTab(t.id)} className={`text-[8px] font-bold px-2 py-0.5 rounded border transition-colors ${actionQueueTab===t.id ? 'bg-red-500/15 text-red-300 border-red-500/30' : 'text-slate-600 border-slate-800 hover:text-slate-400'}`}>{t.label}</button>
                ))}
              </div>
              <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Joint Risk Command', RO: 'Comandă Unificată Risc', FR: 'Commandement Conjoint Risques', RU: 'Единый Центр Управления Рисками' }[lang]}</h3>
              <p className="text-[9px] text-slate-500 mt-0.5">{{ EN: 'Unified risk analysis · Red Channel joint view · Risk analyst intelligence reports · ', RO: 'Analiză unificată risc · Vedere comună Canal Roșu · Rapoarte informațive analişti risc · ', FR: 'Analyse de risque unifiée · Vue conjointe Canal Rouge · Rapports analystes risque · ', RU: 'Единый анализ риска · Красный канал · Аналитические отчёты · ' }[lang]}<span className="text-blue-400">{{ EN: 'click for analyst report', RO: 'click pentru raport analist', FR: 'cliquez pour le rapport', RU: 'нажмите для отчёта' }[lang]}</span></p>
              <details className="mt-1">
                <summary className="text-[8px] text-slate-700 cursor-pointer hover:text-slate-500 select-none">{{ EN: '▸ How is risk calculated?', RO: '▸ Cum se calculează riscul?', FR: '▸ Comment le risque est-il calculé ?', RU: '▸ Как рассчитывается риск?' }[lang]}</summary>
                <div className="mt-1 text-[8px] text-slate-600 leading-relaxed space-y-0.5">
                  <p>{{ EN: 'Score 0–100: starts at 30 (base). +30 if watchlist hit, +20 if document anomaly, +15 if biometric failure, +25 if route risk >0.7, +10 for high-risk goods (HS 2402/2710). HIGH ≥70 · MEDIUM 40–69 · LOW <40.', RO: 'Scor 0–100: pornește de la 30 (bază). +30 dacă este pe liste de urmărire, +20 anomalie document, +15 eșec biometric, +25 dacă risc rută >0,7, +10 pentru mărfuri cu risc ridicat (HS 2402/2710). RIDICAT ≥70 · MEDIU 40–69 · SCĂZUT <40.', FR: 'Score 0-100: commence à 30 (base). +30 si correspondance watchlist, +20 si anomalie doc, +15 si échec biométrique, +25 si risque itinéraire >0,7, +10 pour marchandises à risque (SH 2402/2710). ÉLEVÉ ≥70 · MOYEN 40-69 · FAIBLE <40.', RU: 'Оценка 0–100: начинается с 30 (база). +30 при совпадении watchlist, +20 аномалия документа, +15 сбой биометрии, +25 риск маршрута >0,7, +10 товары высокого риска (HS 2402/2710). ВЫСОКИЙ ≥70 · СРЕДНИЙ 40–69 · НИЗКИЙ <40.' }[lang]}</p>
                </div>
              </details>
            </div>
            {riskCounts.High > 0 && <span className="text-[10px] font-bold text-red-400 animate-pulse">{riskCounts.High} {{ EN: 'flagged', RO: 'semnalate', FR: 'signalés', RU: 'отмечено' }[lang]}</span>}
          </div>
          {actionQueueTab === 'flagged' && (
          <>
          {highRiskVehicles.length === 0
            ? <div className="py-10 text-center text-slate-600 text-xs">{{ EN: 'No high-risk vehicles in queue', RO: 'Niciun vehicul cu risc ridicat în coadă', FR: 'Aucun véhicule à haut risque en file', RU: 'Нет ТС высокого риска в очереди' }[lang]}</div>
            : <div className="divide-y divide-slate-800/40 overflow-y-auto custom-scrollbar">
                {highRiskVehicles.map(v => {
                  const linkedDecl = declarations.find(d => d.linkedVehicleId === v.id || d.vehiclePlate === v.plate);
                  const flagDefs = [
                    { key: 'wl',  show: v.watchlistHit, label: { EN: 'Watchlist Hit', RO: 'Watchlist Hit',   FR: 'Surveillance',      RU: 'В Базах'            }[lang] },
                    { key: 'doc', show: v.docAnomaly,   label: { EN: 'Doc Anomaly',   RO: 'Anomalie Doc',    FR: 'Doc Anormal',       RU: 'Аномалия Документа' }[lang] },
                    { key: 'bio', show: v.bioMismatch,  label: { EN: 'Bio Failure',   RO: 'Eroare Bio',      FR: 'Échec Biométrique', RU: 'Сбой Биометрии'     }[lang] },
                  ].filter(f => f.show);

                  // ── Threat-category detection ──────────────────────────
                  const hs = linkedDecl?.hsCode ?? '';
                  const goodsLow = (v.goodsType ?? '').toLowerCase();
                  let threatKey = 'intel';
                  if      (v.vehicleType === 'bus'  && v.bioMismatch)                         threatKey = 'trafficking';
                  else if (v.vehicleType === 'bus'  && (v.watchlistHit || v.risk === 'High')) threatKey = 'migration';
                  else if (hs === '2402' || goodsLow.includes('tobacco'))                     threatKey = 'tobacco';
                  else if (hs === '2710' || goodsLow.includes('fuel'))                        threatKey = 'excise';
                  else if (v.vehicleType === 'car'  && v.watchlistHit && v.docAnomaly)        threatKey = 'vehicle_theft';
                  else if (v.vehicleType === 'car'  && v.bioMismatch)                         threatKey = 'identity';
                  else if (v.vehicleType === 'truck' && v.docAnomaly)                         threatKey = 'fraud';
                  // BCP-specific boost when no specific signal
                  if (threatKey === 'intel') {
                    const bcpBoost: Record<string, string> = {
                      BCP_LEUSENI:       'fraud',
                      BCP_SCULENI:       'identity',
                      BCP_COSTESTI:      'excise',
                      BCP_CAHUL:         'tobacco',
                      BCP_GIURGIULESTI1: 'excise',
                      BCP_GIURGIULESTI2: 'fraud',
                      BCP_LIPCANI:       'tobacco',
                      BCP_UNGURI:        'tobacco',
                      BCP_GRIMANCAUTI:   'tobacco',
                      BCP_CRIVA:         'tobacco',
                      BCP_LEOVA:         'excise',
                      BCP_PALANCA:       'intel',
                      BCP_OTACI:         'tobacco',
                      BCP_BRICENI:       'tobacco',
                      BCP_BASARABEASCA:  'excise',
                      BCP_TUDORA:        'tobacco',
                      BCP_SAITI:         'intel',
                      BCP_CEADARLUGA1:   'intel',
                      BCP_CEADARLUGA2:   'excise',
                      BCP_MIRNOE:        'tobacco',
                      BCP_CISMICHIOI:    'tobacco',
                    };
                    if (bcpBoost[v.bcpId]) threatKey = bcpBoost[v.bcpId];
                  }

                  type TInfo = { label: string; color: string; bg: string; border: string; legal: string; goods: string };
                  const threatMap: Record<string, TInfo> = {
                    migration:    { label: { EN: 'Migration Risk',        RO: 'Risc Migrație',        FR: 'Risque Migration',       RU: 'Риск Миграции'             }[lang], color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', legal: 'Reg.EU 2016/1624 · Dir.2013/33/EU · Art.1-4 LP',    goods: { EN: 'Concealed persons in cargo cavities / modified vehicle compartments',               RO: 'Persoane ascunse în cavități de marfă / compartimente modificate',                          FR: 'Personnes dissimulées dans des cavités cargo / compartiments modifiés',                      RU: 'Люди в грузовых полостях / изменённых отсеках транспортного средства'       }[lang] },
                    trafficking:  { label: { EN: 'Human Trafficking',     RO: 'Trafic Persoane',      FR: 'Traite de Personnes',    RU: 'Торговля Людьми'            }[lang], color: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/20',   legal: 'Art.165-168 CP · Palermo Protocol Art.3 · UNTOC',   goods: { EN: 'Victims in luggage compartments / false floors / sealed cargo trunks',              RO: 'Victime în sertare de bagaje / podele false / trunchiuri cargo sigilate',                    FR: 'Victimes dans bagages / faux planchers / coffres de cargaison scellés',                      RU: 'Жертвы в багажных отсеках / ложном поле / запечатанных грузовых отсеках'    }[lang] },
                    tobacco:      { label: { EN: 'Tobacco Smuggling',     RO: 'Contrabandă Tutun',    FR: 'Contrebande Tabac',      RU: 'Контрабанда Табака'         }[lang], color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  legal: 'NC 2402 · Art.248-250 CC · Dir.2011/64/EU · FCTC',  goods: { EN: 'Cigarettes in false walls / fuel tanks / double floors / spare wheel wells',         RO: 'Țigarete în pereți dubli / rezervoare / podele false / locașuri roată de rezervă',          FR: 'Cigarettes dans faux murs / réservoirs / doubles planchers / logements roue de secours',     RU: 'Сигареты в двойных стенках / баках / ложном полу / нишах запасного колеса'  }[lang] },
                    excise:       { label: { EN: 'Excise Goods',          RO: 'Mărfuri Accizabile',   FR: 'Marchandises Accisées',  RU: 'Акцизные Товары'            }[lang], color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', legal: 'NC 2710-2203 · Dir.2008/118/EC · Art.251-253 CC',   goods: { EN: 'Fuel/alcohol in extra tanks / concealed reservoir cavities / modified chassis',      RO: 'Combustibil/alcool în rezervoare suplimentare / cavități ascunse / șasiu modificat',         FR: 'Carburant/alcool dans réservoirs supplémentaires / cavités dissimulées / châssis modifié',   RU: 'Топливо/алкоголь в доп. баках / скрытых полостях / изменённом шасси'        }[lang] },
                    vehicle_theft:{ label: { EN: 'Stolen/Cloned Vehicle', RO: 'Vehicul Furat/Clonat', FR: 'Véhicule Volé/Cloné',   RU: 'Угнанное/Клонированное ТС' }[lang], color: 'text-red-300',    bg: 'bg-red-600/10',    border: 'border-red-500/20',    legal: 'Art.186-187 CP · INTERPOL WVDB · Reg.EU 2018/1672',goods: { EN: 'Vehicle itself is the smuggled commodity — cloned VIN / false plates detected',        RO: 'Vehiculul însuși este marfa de contrabandă — VIN clonat / plăci false detectate',            FR: 'Le véhicule lui-même est la marchandise de contrebande — VIN cloné / fausses plaques',       RU: 'Само ТС является контрабандным товаром — клонированный VIN / поддельные номера' }[lang] },
                    identity:     { label: { EN: 'Identity Fraud',        RO: 'Fraudă Identitate',    FR: 'Fraude Identité',        RU: 'Подмена Личности'           }[lang], color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', legal: 'Art.23 LP · SIS II Art.36 · Reg.EU 2019/817',       goods: { EN: 'Cloned identity documents / biometric bypass — secondary passenger inspection',      RO: 'Documente de identitate clonate / eludare biometrică — inspecție secundară pasageri',        FR: 'Documents d\'identité clonés / contournement biométrique — inspection secondaire passagers', RU: 'Клонированные удостоверения / обход биометрии — вторичная проверка пассажиров' }[lang] },
                    fraud:        { label: { EN: 'Commercial Fraud',      RO: 'Fraudă Comercială',    FR: 'Fraude Commerciale',     RU: 'Коммерч. Мошенничество'    }[lang], color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20',   legal: 'Art.244-246 CC · OLAF Reg.883/2013 · Dir.2017/1371', goods: { EN: 'Undervalued goods / false HS codes / phantom consignments / counterfeit invoices',    RO: 'Mărfuri subevaluate / coduri HS false / consignații fictive / facturi contrafăcute',         FR: 'Marchandises sous-évaluées / codes SH faux / envois fantômes / factures contrefaites',       RU: 'Заниженная стоимость / ложные коды ТН ВЭД / фиктивные партии / поддельные счета' }[lang] },
                    intel:        { label: { EN: 'Intelligence Alert',    RO: 'Alertă Informativă',   FR: 'Alerte Renseignement',   RU: 'Оперативная Тревога'        }[lang], color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20',    legal: 'SIS II · INTERPOL I-24/7 · Art.10 LP',              goods: { EN: 'Unknown — secondary physical inspection and full cargo scan required',               RO: 'Necunoscut — inspecție fizică secundară și scanare completă a mărfii obligatorie',           FR: 'Inconnu — inspection physique secondaire et scan complet de la cargaison requis',            RU: 'Неизвестно — обязательный вторичный досмотр и полное сканирование груза'     }[lang] },
                  };
                  const threat = threatMap[threatKey] ?? threatMap.intel;
                  const bcpShort: Record<string, string> = {
                    BCP_LEUSENI:       'LEU',
                    BCP_SCULENI:       'SCL',
                    BCP_COSTESTI:      'CST',
                    BCP_CAHUL:         'CAH',
                    BCP_GIURGIULESTI1: 'GG1',
                    BCP_GIURGIULESTI2: 'GG2',
                    BCP_LIPCANI:       'LIP',
                    BCP_UNGURI:        'UNG',
                    BCP_GRIMANCAUTI:   'GRM',
                    BCP_CRIVA:         'CRV',
                    BCP_LEOVA:         'LEO',
                    BCP_PALANCA:       'PAL',
                    BCP_OTACI:         'OTC',
                    BCP_BRICENI:       'BRC',
                    BCP_BASARABEASCA:  'BSB',
                    BCP_TUDORA:        'TUD',
                    BCP_SAITI:         'SAI',
                    BCP_CEADARLUGA1:   'CL1',
                    BCP_CEADARLUGA2:   'CL2',
                    BCP_MIRNOE:        'MIR',
                    BCP_CISMICHIOI:    'CIS',
                  };

                  return (
                    <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-800/50 transition-colors" onClick={() => setReportVehicle(v)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold text-red-200">{v.plate}</span>
                          <span className="text-[8px] font-mono text-slate-600 bg-slate-800/60 px-1 rounded">{bcpShort[v.bcpId] ?? v.bcpId}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="text-[9px] text-slate-500 capitalize">{v.vehicleType} · {v.subType}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${threat.bg} ${threat.color} ${threat.border}`}>{threat.label}</span>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                          {flagDefs.map(f => (
                            <span key={f.key} className="text-[8px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20">{f.label}</span>
                          ))}
                          <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700">{statusLabel[v.status] ?? v.status}</span>
                        </div>
                        {/* Legal reference + smuggled goods */}
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800/40">
                          <div className="font-mono text-[7px] tracking-tight" style={{ color: `${threat.color.replace('text-', '').includes('-') ? '' : ''}` }}>
                            <span className="text-slate-600">{threat.legal}</span>
                          </div>
                          <div className={`text-[8px] italic mt-0.5 leading-tight ${threat.color} opacity-80`}>{threat.goods}</div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-light text-red-400">{v.riskScore.toFixed(0)}</div>
                        <div className="text-[9px] text-slate-600">{{ EN: 'score', RO: 'scor', FR: 'score', RU: 'балл' }[lang]}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
          }
          </>
          )}
          {actionQueueTab === 'network' && (
          (() => {
            const netByBcp = BCPS.map(b => ({
              id: b.id, name: b.name,
              count: vehicles.filter(v => v.risk === 'High' && v.status !== 'cleared' && v.bcpId === b.id).length
            })).filter(b => b.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
            if (netByBcp.length === 0) return null;
            return (
              <div className="mt-2 pt-2 border-t border-slate-800/40 px-4 pb-3">
                <div className="text-[8px] text-slate-600 uppercase font-bold tracking-wider mb-1.5">Network High-Risk Snapshot</div>
                <div className="space-y-1">
                  {netByBcp.map(b => (
                    <div key={b.id} className={`flex items-center gap-2 text-[8px] ${b.id === selectedBCP ? 'text-red-300 font-bold' : 'text-slate-500'}`}>
                      <span className="w-28 truncate">{b.name}</span>
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-700 ${b.id === selectedBCP ? 'bg-red-500' : 'bg-slate-700'}`} style={{ width: `${Math.min(100, b.count * 14)}%` }} />
                      </div>
                      <span className="w-4 text-right font-mono">{b.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()
          )}
        </div>

        {actionQueueTab === 'red' && (
        <div className="bg-[#111623] border border-red-900/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-900/30 bg-red-950/10">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span className="text-[8px] font-bold text-red-400/80 uppercase tracking-widest">UNIFIED RED CHANNEL · SINGLE SOURCE OF TRUTH</span>
                    {(chanCounts.RED > 0 || redBPVehicles.length > 0) && (
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {chanCounts.RED > 0 && <span className="text-[8px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/30">{chanCounts.RED} CS</span>}
                    {redBPVehicles.length > 0 && <span className="text-[8px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30">{redBPVehicles.length} BP</span>}
                  </div>
                )}
                </div>
                <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">
                  🔴 {{ EN: 'RED Channel — BP & Customs Joint View', RO: 'Canal ROȘU — Vedere Comună PF & Vamă', FR: 'Canal ROUGE — Vue Conjointe PF & Douane', RU: 'Красный Канал — Совместный Контроль ПФ и Таможня' }[lang]}
                </h3>
                <p className="text-[9px] text-slate-500 mt-0.5">{{ EN: 'This is the ONLY place RED channel vehicles appear. BP section: biometric/document/migration flags. Customs section: goods/HS/value/channel. Both require coordinated action.', RO: 'Acesta este SINGURUL loc unde apar vehiculele pe canal ROȘU. Secțiunea PF: semnale biometrice/documentare/migrație. Secțiunea Vamă: marfă/HS/valoare/canal. Ambele necesită acțiune coordonată.', FR: "C'est le SEUL endroit où apparaissent les véhicules du canal ROUGE. Section PF: signaux biométriques/documentaires/migration. Section Douane: marchandises/SH/valeur/canal. Les deux nécessitent une action coordonnée.", RU: 'Это ЕДИНСТВЕННОЕ место, где отображаются ТС КРАСНОГО канала. Раздел ПФ: биометрия/документы/миграция. Раздел Таможни: товары/HS/стоимость/канал. Оба требуют скоординированных действий.' }[lang]}</p>
              </div>
            </div>
            <details className="mt-2">
              <summary className="text-[8px] text-slate-600 cursor-pointer hover:text-slate-400 select-none">{{ EN: '▸ Why one section instead of two?', RO: '▸ De ce o singură secțiune în loc de două?', FR: '▸ Pourquoi une section au lieu de deux?', RU: '▸ Почему один раздел вместо двух?' }[lang]}</summary>
              <p className="text-[8px] text-slate-600 mt-1 leading-relaxed">{{ EN: 'Previously the RED channel appeared in two places (AI Risk layer + Trade Intelligence). This created confusion and duplication. Now it is consolidated here with both perspectives: Border Police flags (identity, biometrics, migration) and Customs flags (goods, value, HS code). The Trade Intelligence HOLDS tab shows a different dataset: already held/seized declarations.', RO: 'Anterior, canalul ROȘU apărea în două locuri (strat AI Risc + Informații Comerciale). Aceasta crea confuzie și duplicare. Acum este consolidat aici cu ambele perspective: semnale PF (identitate, biometrie, migrație) și semnale Vamă (marfă, valoare, cod HS). Fila REȚINUTE din Informații Comerciale arată un alt set de date: declarații deja reținute/confiscate.', FR: "Auparavant le canal ROUGE apparaissait à deux endroits (couche IA Risque + Renseignement Commercial). Cela créait confusion et duplication. Désormais consolidé ici avec les deux perspectives: signaux PF (identité, biométrie, migration) et signaux Douane (marchandises, valeur, code SH). L'onglet RETENUES montre un ensemble de données différent.", RU: 'Ранее КРАСНЫЙ канал отображался в двух местах (слой ИИ-Риска + Торговая Разведка). Это создавало путаницу и дублирование. Теперь он объединён здесь с обеими перспективами: флаги ПФ (личность, биометрия, миграция) и флаги Таможни (товары, стоимость, код HS). Вкладка ЗАДЕРЖАННЫЕ показывает другой набор данных.' }[lang]}</p>
            </details>
          </div>
          {(redDecls.length === 0 && redBPVehicles.length === 0)
            ? <div className="py-8 text-center text-slate-600 text-xs">{{ EN: 'No RED channel items', RO: 'Niciun element pe canal ROȘU', FR: 'Aucun élément canal ROUGE', RU: 'Нет элементов красного канала' }[lang]}</div>
            : <div className="divide-y divide-slate-800/40">
                {redDecls.map(d => {
                  const linkedV = vehicles.find(v => v.id === d.linkedVehicleId || v.plate === d.vehiclePlate);
                  const bioOk = linkedV ? (!linkedV.bioMismatch) : true;
                  const docOk = linkedV ? (!linkedV.docAnomaly) : true;
                  const wl = linkedV?.watchlistHit ?? false;
                  const routeRisk = linkedV?.routeRisk ?? d.riskScore / 100;
                  return (
                    <div key={d.id} className="px-4 py-3 cursor-pointer hover:bg-slate-800/20 transition-colors" onClick={() => setExpandedRedDecl(expandedRedDecl === d.id ? null : d.id)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] font-bold text-amber-400/70 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20">🟠 CS</span>
                          <span className="font-mono text-[10px] font-bold text-red-300">{d.mrn}</span>
                          {linkedV && <span className="font-mono text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">{linkedV.plate}</span>}
                        </div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${d.status === 'INSPECTION' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{d.status}</span>
                      </div>
                      {/* BP + CS dual-perspective indicators */}
                      <div className="grid grid-cols-2 gap-2 mb-1.5">
                        {/* Left: Border Police indicators */}
                        <div className="space-y-1">
                          <div className="text-[7px] text-blue-500/70 font-bold uppercase mb-0.5">🔵 PF</div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${bioOk ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse'}`}>
                            <span className="font-bold">BIO</span>
                            <span>{bioOk ? { EN: 'OK', RO: 'OK', FR: 'OK', RU: 'ОК' }[lang] : { EN: 'FAIL', RO: 'EȘEC', FR: 'ÉCHEC', RU: 'СБОЙ' }[lang]}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${docOk ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                            <span className="font-bold">DOC</span>
                            <span>{docOk ? { EN: 'OK', RO: 'OK', FR: 'OK', RU: 'ОК' }[lang] : { EN: 'ANOMALY', RO: 'ANOMALIE', FR: 'ANOMALIE', RU: 'АНОМАЛИЯ' }[lang]}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${wl ? 'bg-red-600/10 text-red-300 border-red-500/30 animate-pulse' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                            <span className="font-bold">WL</span>
                            <span>{wl ? { EN: 'HIT', RO: 'HIT', FR: 'HIT', RU: 'HIT' }[lang] : 'CLEAR'}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${routeRisk > 0.6 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                            <span className="font-bold">RTE</span>
                            <span>{(routeRisk * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                        {/* Right: Customs indicators */}
                        <div className="space-y-1">
                          <div className="text-[7px] text-emerald-500/70 font-bold uppercase mb-0.5">🟢 CS</div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${d.channel === 'RED' ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                            <span className="font-bold">CH</span>
                            <span>{d.channel}</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${d.riskBand === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' : d.riskBand === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                            <span className="font-bold">HS</span>
                            <span className="font-mono truncate">{d.hsCode}</span>
                          </div>
                          <div className="flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border bg-slate-800/50 text-slate-400 border-slate-700/40">
                            <span className="font-bold">VAL</span>
                            <span className="font-mono truncate">€{(d.value/1000).toFixed(1)}k</span>
                          </div>
                          <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${d.status === 'INSPECTION' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                            <span className="font-bold">STA</span>
                            <span>{d.status}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-[8px] text-slate-600 font-mono">{d.originCountry.substring(0,3).toUpperCase()} → {d.destinationCountry.substring(0,3).toUpperCase()} · {linkedV?.vehicleType ?? d.vehicleType ?? '—'}</div>
                      {expandedRedDecl === d.id && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800/40 text-[8px] space-y-1">
                          <div className="text-[7px] text-blue-500/60 font-bold uppercase tracking-wide mb-0.5">🔵 PF — {{ EN: 'biometric · identity · route', RO: 'biometric · identitate · rută', FR: 'biométrie · identité · itinéraire', RU: 'биометрия · личность · маршрут' }[lang]}</div>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">BIO</span> — {{ EN: 'Biometric check: face, iris, fingerprints compared against the travel document. FAIL = mismatch detected.', RO: 'Verificare biometrică: față, iris, amprente comparate cu documentul de călătorie. EȘEC = neconcordanță detectată.', FR: 'Contrôle biométrique: visage, iris, empreintes comparés au document de voyage. ÉCHEC = incohérence détectée.', RU: 'Биометрическая проверка: лицо, радужная оболочка, отпечатки сверены с документом. СБОЙ = обнаружено несоответствие.' }[lang]}</p>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">DOC</span> — {{ EN: 'Document scan: MRZ checksum, UV features, RFID chip data. ANOMALY = data inconsistency detected.', RO: 'Scanare document: sumă control MRZ, elemente UV, date cip RFID. ANOMALIE = inconsistență date detectată.', FR: 'Scan document: checksum MRZ, éléments UV, données puce RFID. ANOMALIE = incohérence détectée.', RU: 'Сканирование документа: контрольная сумма MRZ, UV-элементы, данные RFID. АНОМАЛИЯ = обнаружена несогласованность данных.' }[lang]}</p>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">WL</span> — {{ EN: 'Watchlist: checked against SIS II, INTERPOL, Europol databases. HIT = record found — requires manual verification.', RO: 'Liste de urmărire: verificat față de SIS II, INTERPOL, Europol. HIT = înregistrare găsită — necesită verificare manuală.', FR: 'Listes de surveillance: vérifié contre SIS II, INTERPOL, Europol. HIT = enregistrement trouvé — vérification manuelle requise.', RU: 'Базы наблюдения: проверка по SIS II, INTERPOL, Европол. HIT = запись найдена — требуется ручная проверка.' }[lang]}</p>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">{{ EN: 'RTE', RO: 'RUT', FR: 'RTE', RU: 'МАР' }[lang]}</span> — {{ EN: 'Route risk (%): ML score based on origin country, transit countries, and known smuggling corridors. >60% = elevated attention required.', RO: 'Risc rută (%): scor ML bazat pe țara de origine, țările de tranzit și coridoarele cunoscute de contrabandă. >60% = atenție sporită necesară.', FR: "Risque itinéraire (%): score ML basé sur pays d'origine, pays de transit et corridors de contrebande connus. >60% = attention accrue requise.", RU: 'Риск маршрута (%): оценка ML на основе страны происхождения, транзитных стран и известных контрабандных коридоров. >60% = требуется усиленное внимание.' }[lang]}</p>
                          <div className="text-[7px] text-amber-500/60 font-bold uppercase tracking-wide mt-1 mb-0.5">🟠 CS — {{ EN: 'goods · channel · value · status', RO: 'marfă · canal · valoare · stare', FR: 'marchandises · canal · valeur · statut', RU: 'товары · канал · стоимость · статус' }[lang]}</div>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">CH</span> — {{ EN: 'Customs channel: assigned by automated risk engine. RED = physical inspection mandatory. YELLOW = documentary/X-ray check. GREEN = standard clearance. Channel cannot be manually downgraded without supervisor override.', RO: 'Canal vamal: atribuit de motorul de risc automatizat. ROȘU = inspecție fizică obligatorie. GALBEN = control documentar/X-ray. VERDE = dare în liberă circulație standard. Canalul nu poate fi retrogradat manual fără aprobare supervizor.', FR: "Canal douanier : attribué par le moteur de risque automatisé. ROUGE = inspection physique obligatoire. JAUNE = contrôle documentaire/RX. VERT = dédouanement standard. Le canal ne peut pas être rétrogradé manuellement sans autorisation superviseur.", RU: 'Таможенный канал: присваивается автоматической системой риска. КРАСНЫЙ = обязателен физический досмотр. ЖЁЛТЫЙ = документальная/рентген-проверка. ЗЕЛЁНЫЙ = стандартное оформление. Канал не может быть понижен вручную без разрешения супервизора.' }[lang]}</p>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">HS</span> — {{ EN: 'HS code (Harmonised System, 6 digits): international goods classification. Risk flags triggered by high-risk commodity categories: dual-use goods, CITES species, alcohol/tobacco/weapons. Code mismatch with declared goods description = undervaluation or mis-description suspicion.', RO: 'Cod HS (Sistemul Armonizat, 6 cifre): clasificare internațională a mărfurilor. Semnale de risc declanșate de categorii cu risc ridicat: mărfuri cu utilizare duală, specii CITES, alcool/tutun/arme. Nepotrivire cod cu descrierea mărfurilor declarate = suspiciune de subevaluare sau falsă descriere.', FR: "Code SH (Système Harmonisé, 6 chiffres) : classification internationale des marchandises. Signaux déclenchés par catégories à risque : biens à double usage, espèces CITES, alcool/tabac/armes. Discordance code/description = suspicion de sous-évaluation ou fausse déclaration.", RU: 'Код ТН ВЭД (6 знаков): международная классификация товаров. Флаги риска по категориям высокого риска: товары двойного использования, СИТЕС, алкоголь/табак/оружие. Несоответствие кода описанию = подозрение в занижении стоимости или ложном описании.' }[lang]}</p>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">VAL</span> — {{ EN: 'Declared customs value (EUR). Under-declaration = duty/VAT evasion risk. Significant mismatch with invoice price, weight, or market value triggers documentary check and possible seizure. Above-threshold declarations require mandatory duty assessment.', RO: 'Valoarea vamală declarată (EUR). Subdeclarare = risc evaziune taxe/TVA. Diferența semnificativă față de prețul din factură, greutate sau prețul de piață declanșează control documentar și posibilă confiscare. Declarațiile peste prag necesită evaluare taxe obligatorie.', FR: "Valeur en douane déclarée (EUR). Sous-déclaration = risque évasion droits/TVA. Écart significatif avec prix facture, poids ou valeur marché = contrôle documentaire et possible saisie. Déclarations au-dessus du seuil : évaluation droits obligatoire.", RU: 'Заявленная таможенная стоимость (EUR). Занижение = риск уклонения от пошлин/НДС. Значительное расхождение с ценой счёта, весом или рыночной стоимостью — документальная проверка и возможное изъятие. Декларации выше порога — обязательная оценка пошлин.' }[lang]}</p>
                          <p className="text-slate-600"><span className="font-bold text-slate-500">STA</span> — {{ EN: 'Declaration processing status: PENDING = awaiting officer assignment. INSPECTION = physical check underway — officer on site. HOLD = detained pending further documentary analysis or laboratory testing. RELEASED = cleared and goods released. SEIZED = goods confiscated — criminal referral initiated.', RO: 'Starea procesării declarației: ÎN AȘTEPTARE = așteptare repartizare ofițer. INSPECȚIE = control fizic în desfășurare — ofițer prezent. REȚINUT = deținut pentru analiză documentară sau testare de laborator. ELIBERAT = dat în liberă circulație. CONFISCAT = marfă confiscată — referire penală inițiată.', FR: "Statut de traitement de la déclaration : EN ATTENTE = attribution officier en cours. INSPECTION = contrôle physique en cours — officier sur site. RETENU = détenu pour analyse documentaire ou tests laboratoire. LIBÉRÉ = dédouané. SAISI = marchandises confisquées — renvoi pénal initié.", RU: 'Статус обработки декларации: ОЖИДАНИЕ = ожидает назначения офицера. ДОСМОТР = физическая проверка — офицер на месте. ЗАДЕРЖАН = задержан для документальной проверки или лаборатории. ВЫПУЩЕН = оформлен, товары выпущены. ИЗЪЯТ = товар конфискован, возбуждено уголовное дело.' }[lang]}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* 🔵 BP — Active Flags (migration · interpol · overstay · doc fraud) */}
                {redBPVehicles.length > 0 && (<>
                  {redBPVehicles.map(v => (
                    <div key={v.id} className="px-4 py-3 border-l-2 border-blue-500/40 bg-blue-950/5 hover:bg-blue-950/10 transition-colors cursor-pointer" onClick={() => setExpandedRedBP(expandedRedBP === v.id ? null : v.id)}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[7px] font-bold text-blue-400/70 bg-blue-500/10 px-1 py-0.5 rounded border border-blue-500/20">🔵 PF</span>
                          <span className="font-mono text-[10px] font-bold text-blue-300">{v.plate}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                            v.vehicleType === 'bus' ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                            : v.vehicleType === 'car' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                            : 'bg-slate-800/50 text-slate-400 border-slate-700/40'}`}>{v.vehicleType.toUpperCase()}</span>
                        </div>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${v.risk === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>{v.risk.toUpperCase()}</span>
                      </div>
                      {/* WL · RTE · BIO · DOC — always all four */}
                      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                        <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${v.watchlistHit ? 'bg-red-600/10 text-red-300 border-red-500/30 animate-pulse' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                          <span className="font-bold">WL</span>
                          <span>{v.watchlistHit ? { EN: 'HIT', RO: 'HIT', FR: 'HIT', RU: 'HIT' }[lang] : 'CLEAR'}</span>
                        </div>
                        <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${v.routeRisk > 0.6 ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-800/50 text-slate-500 border-slate-700/40'}`}>
                          <span className="font-bold">RTE</span>
                          <span>{(v.routeRisk * 100).toFixed(0)}%</span>
                        </div>
                        <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${v.bioMismatch ? 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse' : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20'}`}>
                          <span className="font-bold">BIO</span>
                          <span>{v.bioMismatch ? { EN: 'FAIL', RO: 'EȘEC', FR: 'ÉCHEC', RU: 'СБОЙ' }[lang] : { EN: 'OK', RO: 'OK', FR: 'OK', RU: 'ОК' }[lang]}</span>
                        </div>
                        <div className={`flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded border ${v.docAnomaly ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' : 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20'}`}>
                          <span className="font-bold">DOC</span>
                          <span>{v.docAnomaly ? { EN: 'ANOMALY', RO: 'ANOMALIE', FR: 'ANOMALIE', RU: 'АНОМАЛИЯ' }[lang] : { EN: 'OK', RO: 'OK', FR: 'OK', RU: 'ОК' }[lang]}</span>
                        </div>
                      </div>
                      {/* Auto-tags — all applicable reasons */}
                      <div className="flex gap-1 flex-wrap mb-1">
                        {v.watchlistHit && v.vehicleType === 'bus' && <span className="text-[7px] bg-violet-900/30 text-violet-300 px-1 py-0.5 rounded border border-violet-700/30">{{ EN: 'Trafficking / migration — WL', RO: 'Trafic / migrație — WL', FR: 'Trafic / migration — WL', RU: 'Трафикинг / миграция — WL' }[lang]}</span>}
                        {v.watchlistHit && v.vehicleType !== 'bus' && <span className="text-[7px] bg-red-900/30 text-red-300 px-1 py-0.5 rounded border border-red-700/30">{{ EN: 'Interpol / SIS II match', RO: 'Corespondență Interpol / SIS II', FR: 'Correspondance Interpol / SIS II', RU: 'Совпадение Интерпол / ШИС II' }[lang]}</span>}
                        {!v.watchlistHit && v.vehicleType === 'bus' && v.risk === 'High' && <span className="text-[7px] bg-violet-900/30 text-violet-300 px-1 py-0.5 rounded border border-violet-700/30">{{ EN: 'Migration risk — high-risk bus', RO: 'Risc migrație — autobuz risc ridicat', FR: 'Risque migration — autobus à risque élevé', RU: 'Риск миграции — автобус высокого риска' }[lang]}</span>}
                        {v.routeRisk > 0.7 && <span className="text-[7px] bg-amber-900/30 text-amber-300 px-1 py-0.5 rounded border border-amber-700/30">{{ EN: 'High-risk corridor', RO: 'Coridor cu risc ridicat', FR: 'Corridor à haut risque', RU: 'Коридор высокого риска' }[lang]}</span>}
                        {v.routeRisk > 0.8 && v.vehicleType !== 'truck' && <span className="text-[7px] bg-red-900/30 text-red-300 px-1 py-0.5 rounded border border-red-700/30">{{ EN: 'Possible 180-day overstay', RO: 'Posibilă depășire 180 zile', FR: 'Dépassement possible 180 jours', RU: 'Возможное превышение 180 суток' }[lang]}</span>}
                        {v.docAnomaly && v.bioMismatch && <span className="text-[7px] bg-red-900/30 text-red-300 px-1 py-0.5 rounded border border-red-700/30">{{ EN: 'Identity fraud — doc+bio double failure', RO: 'Fraudă identitate — eșec dublu doc+bio', FR: 'Fraude identité — double échec doc+bio', RU: 'Мошенничество с личностью — двойной сбой' }[lang]}</span>}
                        {v.docAnomaly && !v.bioMismatch && <span className="text-[7px] bg-amber-900/30 text-amber-300 px-1 py-0.5 rounded border border-amber-700/30">{{ EN: 'Forged document suspected', RO: 'Document fals suspectat', FR: 'Falsification de document suspectée', RU: 'Подозрение на поддельный документ' }[lang]}</span>}
                      </div>
                      <div className="text-[8px] text-slate-600">{v.origin} → {v.destination} · R:{v.riskScore.toFixed(0)} · {statusLabel[v.status] ?? v.status}</div>
                      {expandedRedBP === v.id && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800/40 text-[8px] space-y-1">
                          <p className="text-slate-500"><span className="font-bold text-blue-400/80">WL</span> — {{ EN: 'Watchlist (SIS II / INTERPOL / Europol): CLEAR = no match in any database. HIT = active record found — mandatory supervisor alert, do NOT release without authorisation.', RO: 'Watchlist (SIS II / INTERPOL / Europol): CLEAR = fără corespondență în nicio bază de date. HIT = înregistrare activă găsită — alertă obligatorie supervizor, NU eliberați fără autorizație.', FR: "Watchlist (SIS II / INTERPOL / Europol) : CLEAR = aucune correspondance. HIT = fiche active trouvée — alerte superviseur obligatoire, NE PAS libérer sans autorisation.", RU: 'Базы наблюдения (ШИС II / ИНТЕРПОЛ / Европол): CLEAR = совпадений нет. HIT = найдена активная запись — обязательное уведомление супервизора, НЕ отпускать без разрешения.' }[lang]}</p>
                          <p className="text-slate-500"><span className="font-bold text-blue-400/80">RTE %</span> — {{ EN: 'Route risk score (ML model, 0–100 %): evaluates origin country risk profile, declared transit countries and known smuggling corridors. >60 % = elevated scrutiny required. >80 % = high-risk corridor — additional documentation and interview mandatory.', RO: 'Scor risc rută (model ML, 0–100 %): evaluează profilul de risc al țării de origine, țările de tranzit declarate și coridoarele de contrabandă cunoscute. >60 % = verificare suplimentară necesară. >80 % = coridor cu risc ridicat — documentație suplimentară și interviu obligatoriu.', FR: "Score risque itinéraire (modèle ML, 0–100 %) : évalue le profil risque pays d'origine, pays de transit déclarés et corridors de contrebande connus. >60 % = contrôle renforcé requis. >80 % = corridor haut risque — documentation et entretien supplémentaires obligatoires.", RU: 'Оценка риска маршрута (ML, 0–100 %): учитывает профиль риска страны происхождения, заявленных транзитных стран и известных контрабандных коридоров. >60 % = усиленный контроль. >80 % = коридор высокого риска — дополнительные документы и собеседование обязательны.' }[lang]}</p>
                          <p className="text-slate-500"><span className="font-bold text-blue-400/80">BIO</span> — {{ EN: 'Biometric check (ICAO 9303): facial recognition, iris scan, fingerprint comparison against travel document chip data. OK = all biometric features verified and match. FAIL = mismatch detected — possible identity fraud, retain for manual identity verification.', RO: 'Verificare biometrică (ICAO 9303): recunoaștere facială, scanare iris, amprente comparate cu datele cipului documentului de călătorie. OK = toate trăsăturile biometrice verificate și corespund. EȘEC = neconcordanță detectată — posibilă fraudă de identitate, reținut pentru verificare manuală.', FR: "Contrôle biométrique (ICAO 9303) : reconnaissance faciale, iris, empreintes vs puce document de voyage. OK = toutes les biométries vérifiées et concordantes. ÉCHEC = incohérence détectée — fraude d'identité possible, retenir pour vérification manuelle.", RU: 'Биометрическая проверка (ИКАО 9303): лицо, радужная оболочка, отпечатки vs чип документа. ОК = все биометрические данные подтверждены. СБОЙ = несоответствие — возможное мошенничество с личностью, задержать для ручной верификации.' }[lang]}</p>
                          <p className="text-slate-500"><span className="font-bold text-blue-400/80">DOC</span> — {{ EN: 'Document scan: MRZ checksum validation, UV/IR security features, RFID chip integrity (BAC/EAC protocol). OK = document authentic and data consistent. ANOMALY = inconsistency detected — possible forgery or data manipulation, escalate to document examiner.', RO: 'Scanare document: validare sumă control MRZ, elemente de securitate UV/IR, integritate cip RFID (protocol BAC/EAC). OK = document autentic și date coerente. ANOMALIE = inconsistență detectată — posibilă falsificare sau manipulare date, escaladați la examinator de documente.', FR: "Scan document : validation checksum MRZ, éléments UV/IR, intégrité puce RFID (protocole BAC/EAC). OK = document authentique et données cohérentes. ANOMALIE = incohérence — falsification ou manipulation possible, escalader à l'examinateur.", RU: 'Сканирование документа: контрольная сумма MRZ, UV/IR-элементы, RFID-чип (BAC/EAC). ОК = документ подлинный, данные согласованы. АНОМАЛИЯ = несоответствие — возможная подделка, передать эксперту.' }[lang]}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </>)}
              </div>
          }
        </div>
        )}
        {/* ── Risk Reports tab ── */}
        {actionQueueTab === 'reports' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 sticky top-0 z-10">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse shrink-0" />
                  <span className="text-[8px] font-bold text-violet-400/80 uppercase tracking-widest">UNITATEA DE ANALIZĂ A RISCURILOR</span>
                </div>
                <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Risk Analyst Reports', RO: 'Rapoarte Analiști Risc', FR: 'Rapports Analystes Risque', RU: 'Аналитические Отчёты' }[lang]}</h3>
                <p className="text-[9px] text-slate-500 mt-0.5">{{ EN: 'Uploaded by Risk Analysis Unit · OCC: read-only', RO: 'Publicate de Unitatea de Analiză a Riscurilor · OCC: doar vizualizare', FR: 'Publiés par UAR · OCC: lecture seule', RU: 'Загружено аналитиками · для ОЦК: только чтение' }[lang]}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[8px] font-mono text-violet-400">{RISK_ANALYST_REPORTS.filter(r => !r.isRead).length} new</span>
                <span className="text-[7px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-1 rounded uppercase tracking-wider">🔒 VIEW ONLY</span>
              </div>
            </div>
            {/* Institution filter */}
            <div className="flex gap-1 mt-2.5">
              {(['ALL','BP','CS'] as const).map(inst => {
                const instStyles = {
                  ALL: { active: 'bg-violet-600/20 text-violet-300 border-violet-500/40', inactive: 'text-slate-500 border-slate-800 hover:text-slate-300', label: '🗂 ALL' },
                  BP:  { active: 'bg-blue-600/20 text-blue-300 border-blue-500/40',       inactive: 'text-slate-500 border-slate-800 hover:text-blue-400',   label: '🚔 PF' },
                  CS:  { active: 'bg-amber-600/20 text-amber-300 border-amber-500/40',    inactive: 'text-slate-500 border-slate-800 hover:text-amber-400',  label: '🛃 SV' },
                }[inst];
                const count = inst === 'ALL' ? RISK_ANALYST_REPORTS.length : RISK_ANALYST_REPORTS.filter(r => r.institution === inst).length;
                return (
                  <button key={inst} onClick={() => setRiskInstFilter(inst)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all border ${riskInstFilter === inst ? instStyles.active : instStyles.inactive}`}>
                    {instStyles.label}
                    <span className="font-mono text-[7px] opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Reports list */}
          <div className="divide-y divide-slate-800/40">
            {RISK_ANALYST_REPORTS.filter(r => riskInstFilter === 'ALL' || r.institution === riskInstFilter).map(r => {
              const isOpenR = expandedReport === r.id;
              const classifBadge = r.classification === 'CONFIDENTIAL' ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
              const sevBadgeR = r.severity === 'CRITICAL' ? 'bg-red-500/20 text-red-300 border-red-500/30' : r.severity === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border-blue-500/30';
              const instBadge = r.institution === 'BP' ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : r.institution === 'CS' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-violet-500/15 text-violet-300 border-violet-500/30';
              const instLabel = r.institution === 'BP' ? '🚔 PF' : r.institution === 'CS' ? '🛃 SV' : '🤝 JOINT';
              const catIcon: Record<string,string> = { SMUGGLING:'🚬', DRUGS:'💊', VEHICLE_CRIME:'🚗', MIGRATION:'👤', FRAUD:'🧾', TERRORISM:'⚠️' };
              const hrsAgo = Math.floor(r.uploadedAtMsAgo / 3600000);
              return (
                <div key={r.id} className={`px-4 py-2.5 cursor-pointer hover:bg-slate-800/20 transition-colors ${!r.isRead ? 'border-l-2 border-violet-500' : 'border-l-2 border-transparent'}`}
                  onClick={() => setExpandedReport(isOpenR ? null : r.id)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px]">{catIcon[r.category] ?? '📊'}</span>
                      <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${instBadge}`}>{instLabel}</span>
                      <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${classifBadge}`}>{r.classification}</span>
                      <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${sevBadgeR}`}>{r.severity}</span>
                      {!r.isRead && <span className="text-[6px] font-black text-violet-300 uppercase tracking-widest animate-pulse">NEW</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[7px] text-slate-600 font-mono">{r.id}</span>
                      <svg className={`w-3 h-3 text-slate-600 transition-transform ${isOpenR ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                  <div className="text-[9px] font-semibold text-slate-100 leading-snug">{lang === 'EN' ? r.title.EN : r.title.RO}</div>
                  <div className="text-[8px] text-slate-500 mt-0.5">{r.uploadedBy} · {r.unit.split('—')[0].trim()} · valid: {r.validUntil}</div>
                  {Array.isArray(r.bcpScope)
                    ? <div className="text-[7px] text-slate-600 mt-0.5">BCPs: {r.bcpScope.map(b => b.replace('BCP_','')).join(' · ')}</div>
                    : <div className="text-[7px] text-slate-600 mt-0.5">{{ EN:'All BCPs', RO:'Toate BCPs', FR:'Tous PdP', RU:'Все КПП' }[lang]}</div>
                  }
                  {isOpenR && (
                    <div className="mt-2.5" onClick={e => e.stopPropagation()}>
                      <div className="rounded-lg border border-slate-600/40 bg-slate-700/20 p-3 space-y-2.5">
                        <p className="text-[8.5px] text-slate-300 leading-relaxed">{lang === 'EN' ? r.summary.EN : r.summary.RO}</p>
                        <div>
                          <div className="text-[7px] font-bold text-slate-400 uppercase tracking-wide mb-1">{{ EN:'Indicators', RO:'Indicatori', FR:'Indicateurs', RU:'Признаки' }[lang]}</div>
                          <div className="flex flex-wrap gap-1">
                            {r.indicators.map((ind, i) => (
                              <span key={i} className="text-[7px] bg-slate-600/40 text-slate-300 px-1.5 py-0.5 rounded border border-slate-500/30">{ind}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-[7px] font-bold text-slate-400 uppercase tracking-wide mb-1">{{ EN:'Recommendations', RO:'Recomandări', FR:'Recommandations', RU:'Рекомендации' }[lang]}</div>
                          <div className="space-y-0.5">
                            {r.recommendations.RO.map((rec, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="text-violet-400 text-[8px] shrink-0 mt-px">→</span>
                                <span className="text-[8px] text-slate-300 leading-snug">{rec}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[7px] text-slate-600 border-t border-slate-700/40 pt-1.5">
                          <span>în urmă cu {hrsAgo}h · {r.uploadedBy}</span>
                          <span className="font-bold text-violet-500 uppercase">IGPF INTERNAL</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* ── Right column ── */}
      <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">

        {/* Threat factors */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Live Sensor Flags — THIS BCP', RO: 'Semnale Senzori Live — ACEST BCP', FR: 'Signaux Capteurs Live — CE PdP', RU: 'Живые Сигналы Сенсоров — ЭТОТ КПП' }[lang]}</h3>
            <p className="text-[9px] text-slate-500 mt-0.5">{{ EN: 'Real-time anomaly flags from active sensors at this BCP only', RO: 'Semnale de anomalii în timp real de la sensorii activi ai acestui BCP', FR: "Signaux d'anomalie en temps réel des capteurs actifs à ce PdP uniquement", RU: 'Сигналы аномалий в реальном времени от активных сенсоров этого КПП' }[lang]}</p>
            <details className="mt-1">
              <summary className="text-[8px] text-slate-700 cursor-pointer hover:text-slate-500 select-none">{{ EN: '▸ What are these flags?', RO: '▸ Ce reprezintă aceste semnale?', FR: '▸ Que sont ces signaux ?', RU: '▸ Что означают эти сигналы?' }[lang]}</summary>
              <div className="mt-1 text-[8px] text-slate-600 leading-relaxed">
                <p>{{ EN: 'Live counts from active sensor systems at this BCP right now. CRITICAL = supervisor escalation required immediately. HIGH/ACTIVE = secondary inspection mandatory. MONITORING = flagged for recheck. CLEAR = no anomaly detected. These are NOT historical averages — they reflect the current processing queue only. For network-wide comparison → see Network Threat Radar in the workflow panel.', RO: 'Numărători live de la sistemele de senzori active la acest BCP chiar acum. CRITIC = escaladare imediată la supervizor. RIDICAT/ACTIV = inspecție secundară obligatorie. MONITORIZARE = semnalat pentru reverificare. CLAR = fără anomalie. Acestea NU sunt medii istorice — reflectă coada curentă. Pentru comparație la nivel de rețea → vezi Radar Amenințări Rețea.', FR: "Comptages en direct des capteurs actifs à ce PdP maintenant. CRITIQUE = escalade immédiate superviseur. ÉLEVÉ/ACTIF = inspection secondaire obligatoire. SURVEILLANCE = signalé pour revérification. CLAIR = aucune anomalie. PAS des moyennes historiques — reflète la file d'attente actuelle. Pour comparaison réseau → voir Radar de Menaces Réseau.", RU: 'Живые счётчики активных сенсоров на этом КПП прямо сейчас. КРИТИЧЕСКИЙ = немедленная эскалация к супервизору. ВЫСОКИЙ/АКТИВНЫЙ = вторичный досмотр обязателен. МОНИТОРИНГ = отмечен для проверки. ЧИСТО = аномалий нет. Это НЕ исторические средние — только текущая очередь. Сравнение по сети → см. Радар Угроз Сети.' }[lang]}</p>
              </div>
            </details>
          </div>
          <div className="p-4 space-y-3">
            {([
              { label: { EN: 'Watchlist Hits',        RO: 'Corespondențe Watchlist',  FR: 'Correspondances Watchlist',  RU: 'Совпадения в Базах Наблюдения' }[lang], val: watchlistHits,     total: vTotal, color: 'bg-red-500',    text: 'text-red-400',    sev: watchlistHits > 0 ? (watchlistHits > 2 ? 'CRITICAL' : 'ACTIVE') : 'CLEAR' },
              { label: { EN: 'Document Anomalies',    RO: 'Anomalii Documente',       FR: 'Anomalies Documentaires',    RU: 'Аномалии Документов'           }[lang], val: docAnomalies,      total: vTotal, color: 'bg-amber-500',  text: 'text-amber-400',  sev: docAnomalies  > 0 ? (docAnomalies  > 3 ? 'HIGH'     : 'ACTIVE') : 'CLEAR' },
              { label: { EN: 'Biometric Failures',    RO: 'Erori Biometrice',         FR: 'Échecs Biométriques',        RU: 'Сбои Биометрии'                }[lang], val: bioFailures,       total: vTotal, color: 'bg-orange-500', text: 'text-orange-400', sev: bioFailures   > 0 ? (bioFailures   > 3 ? 'HIGH'     : 'ACTIVE') : 'CLEAR' },
              { label: { EN: 'RED Channel Decls',     RO: 'Declarații Canal ROȘU',    FR: 'Décl. Canal ROUGE',          RU: 'Декл. Красного Канала'         }[lang], val: chanCounts.RED,    total: dTotal, color: 'bg-rose-500',   text: 'text-rose-400',   sev: chanCounts.RED    > 0 ? (chanCounts.RED    > 4 ? 'HIGH' : 'ACTIVE') : 'CLEAR' },
              { label: { EN: 'YELLOW Channel Decls',  RO: 'Declarații Canal GALBEN',  FR: 'Décl. Canal JAUNE',          RU: 'Декл. Жёлтого Канала'          }[lang], val: chanCounts.YELLOW, total: dTotal, color: 'bg-yellow-500', text: 'text-yellow-400', sev: 'MONITORING' },
            ] as const).map(f => (
              <div key={f.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-400">{f.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-mono font-bold ${f.text}`}>{f.val}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      f.sev === 'CRITICAL' || f.sev === 'HIGH' ? 'text-red-400 bg-red-500/10' :
                      f.sev === 'ACTIVE'  ? 'text-amber-400 bg-amber-500/10' :
                      f.sev === 'MONITORING' ? 'text-blue-400 bg-blue-500/10' :
                      'text-emerald-400 bg-emerald-500/10'}`}>{f.sev}</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${f.color} transition-all duration-500`} style={{ width: `${Math.min(100, (f.val / f.total) * 500)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── BCP Threat Scenarios ── */}
        {(() => {
          const threats = [...(BCP_THREAT_PROFILES[selectedBCP] ?? BCP_THREAT_PROFILES['DEFAULT']), ...COMMON_BP_INTEL, ...COMMON_TEMPORARY_ADMISSION];
          const bpThreats = threats.filter(t => t.institution === 'BP');
          const csThreats = threats.filter(t => t.institution === 'CS' || t.institution === 'JOINT');
          const instColor: Record<string, string> = {
            BP:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
            CS:    'text-amber-400 bg-amber-500/10 border-amber-500/20',
            JOINT: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
          };
          const instLabel: Record<string, string> = {
            BP:    { EN: 'Border Police', RO: 'Poliție Frontieră', FR: 'Police Frontière', RU: 'Погранполиция' }[lang],
            CS:    { EN: 'Customs', RO: 'Vamă', FR: 'Douane', RU: 'Таможня' }[lang],
            JOINT: { EN: 'Joint', RO: 'Comun', FR: 'Mixte', RU: 'Совместный' }[lang],
          };
          const sevColor = (s: string) => s === 'CRITICAL' ? 'text-red-400 bg-red-500/10 border-red-500/20' : s === 'HIGH' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20';
          const bcpName = BCPS.find(b => b.id === selectedBCP)?.name ?? selectedBCP;
          return (<>
                        {/* ── Active Cases: PF (Border Police) + SV (Customs) ── */}
            {(() => {
              const sevBadge = (s: string) =>
                s === 'CRITICAL' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                s === 'HIGH'     ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                   'bg-blue-500/20 text-blue-300 border-blue-500/30';
              const bpStatBadge = (s: string) =>
                s === 'DETAINED'    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                s === 'OPEN'        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                s === 'TRANSFERRED' ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' :
                s === 'RESOLVED'    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                      'bg-slate-500/20 text-slate-300 border-slate-500/30';
              const svStatBadge = (s: string) =>
                s === 'SEIZED'      ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                s === 'OPEN'        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                s === 'PROCESSING'  ? 'bg-violet-500/20 text-violet-300 border-violet-500/30' :
                s === 'REFERRED'    ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                s === 'CLOSED'      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                                      'bg-slate-500/20 text-slate-300 border-slate-500/30';
              const bpTypeIcon: Record<string,string> = { FALSE_DOC: '🪪', OVERSTAY: '⏰', STOLEN_VEHICLE: '🚗', SMUGGLING: '📦', WATCHLIST: '⚠️' };
              const svTypeIcon: Record<string,string> = { PRECIOUS_METALS: '🥇', TA_EXPIRED: '⏱️', HS_FRAUD: '🏷️', EXCISE_SMUGGLING: '🍶', UNDERVALUATION: '💰', PROHIBITED_GOODS: '🚫' };
              const accentBP = 'border-blue-500/30 bg-blue-950/10';
              const accentSV = 'border-amber-500/30 bg-amber-950/10';
              return (
                <div className={`rounded-xl border overflow-hidden ${casesTab === 'pf' ? accentBP : accentSV}`}>
                  {/* Header */}
                  <div className={`px-4 py-2.5 border-b ${casesTab === 'pf' ? 'border-blue-800/30 bg-blue-950/20' : 'border-amber-800/30 bg-amber-950/20'} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${casesTab === 'pf' ? 'bg-blue-400' : 'bg-amber-400'} animate-pulse shrink-0`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${casesTab === 'pf' ? 'text-blue-300' : 'text-amber-300'}`}>
                        {{ EN: 'Active Cases — Ongoing Incidents', RO: 'Cazuri Active — Incidente în Desfăşurare', FR: 'Cas Actifs — Incidents en Cours', RU: 'Активные Случаи — Текущие Инциденты' }[lang]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* PF / SV tabs */}
                      <div className="flex gap-0.5 rounded-lg bg-slate-900/60 p-0.5 border border-slate-700/40">
                        <button onClick={() => setCasesTab('pf')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${casesTab === 'pf' ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                          🚔 PF <span className="font-mono text-[7px] bg-blue-500/10 px-1 rounded">{BP_ACTIVE_CASES.length}</span>
                        </button>
                        <button onClick={() => setCasesTab('sv')}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${casesTab === 'sv' ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40' : 'text-slate-500 hover:text-slate-300 border border-transparent'}`}>
                          🛃 SV <span className="font-mono text-[7px] bg-amber-500/10 px-1 rounded">{SV_ACTIVE_CASES.length}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                  {/* PF Cases */}
                  {casesTab === 'pf' && (
                    <div className="divide-y divide-blue-900/20">
                      {BP_ACTIVE_CASES.map(c => {
                        const isOpen = expandedCase === c.id;
                        return (
                          <div key={c.id}
                            className={`px-3 py-2.5 cursor-pointer transition-colors ${isOpen ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'}`}
                            onClick={() => setExpandedCase(isOpen ? null : c.id)}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px]">{bpTypeIcon[c.caseType] ?? '🔴'}</span>
                                <span className="font-mono text-[9px] font-bold text-slate-200">{c.vehicle.plate}</span>
                                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${sevBadge(c.severity)}`}>{c.severity}</span>
                                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${bpStatBadge(c.status)}`}>{c.status}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[7px] text-slate-500 font-mono">{c.bcpName} · {c.openedMinsAgo}m</span>
                                <svg className={`w-3 h-3 text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </div>
                            </div>
                            <div className="text-[9px] font-semibold text-slate-100">{c.title[lang]}</div>
                            <div className="text-[8px] text-slate-500 mt-0.5">{c.vehicle.emoji} {c.vehicle.make}{c.vehicle.operator ? ` · ${c.vehicle.operator}` : ''} · {c.persons.count} pers. ({c.persons.nationalities}) · {c.vehicle.route}</div>
                            {isOpen && (
                              <div className="mt-2.5" onClick={e => e.stopPropagation()}>
                                <div className="rounded-lg border border-slate-600/40 bg-slate-700/20 p-3 space-y-2.5">
                                  <p className="text-[8.5px] text-slate-300 leading-relaxed">{lang === 'EN' ? c.summary.EN : c.summary.RO}</p>
                                  <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                                    <div className="text-[7px] font-bold text-amber-400 uppercase tracking-wide mb-0.5">{{ EN: 'Key Finding', RO: 'Constatare Cheie', FR: 'Constat Clé', RU: 'Ключевая Находка' }[lang]}</div>
                                    <p className="text-[8px] text-amber-200 leading-relaxed">{lang === 'EN' ? c.finding.EN : c.finding.RO}</p>
                                  </div>
                                  <div>
                                    <div className="text-[7px] font-bold text-slate-400 uppercase tracking-wide mb-1">{{ EN: 'Actions Taken', RO: 'Acțiuni Întereprinse', FR: 'Actions Menées', RU: 'Принятые Меры' }[lang]}</div>
                                    <div className="space-y-0.5">
                                      {c.actions.RO.map((a, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                          <span className="text-emerald-400 text-[8px] shrink-0 mt-px">✓</span>
                                          <span className="text-[8px] text-slate-300 leading-snug">{a}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="font-mono text-[7px] text-slate-500 border-t border-slate-700/40 pt-1.5 leading-relaxed">{c.legislation}</div>
                                  <div className="flex items-center justify-between pt-0.5">
                                    <span className="text-[7px] text-slate-600">{c.caseRef} · {c.officerOnCase}</span>
                                    <span className="text-[6px] font-bold text-blue-500 uppercase tracking-wider">IGPF CONFIDENTIAL</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* SV Cases */}
                  {casesTab === 'sv' && (
                    <div className="divide-y divide-amber-900/20">
                      {SV_ACTIVE_CASES.map(c => {
                        const isOpen = expandedCase === c.id;
                        return (
                          <div key={c.id}
                            className={`px-3 py-2.5 cursor-pointer transition-colors ${isOpen ? 'bg-slate-800/30' : 'hover:bg-slate-800/20'}`}
                            onClick={() => setExpandedCase(isOpen ? null : c.id)}>
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[9px]">{svTypeIcon[c.caseType] ?? '🛃'}</span>
                                <span className="font-mono text-[9px] font-bold text-slate-200">{c.vehicle.plate}</span>
                                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${sevBadge(c.severity)}`}>{c.severity}</span>
                                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${svStatBadge(c.status)}`}>{c.status}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[7px] text-slate-500 font-mono">{c.bcpName} · {c.openedMinsAgo}m</span>
                                <svg className={`w-3 h-3 text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </div>
                            </div>
                            <div className="text-[9px] font-semibold text-slate-100">{c.title[lang]}</div>
                            <div className="text-[8px] text-slate-500 mt-0.5">{c.vehicle.emoji} {c.vehicle.make}{c.vehicle.operator ? ` · ${c.vehicle.operator}` : ''} · {c.goods.description} · {c.vehicle.route}</div>
                            {isOpen && (
                              <div className="mt-2.5" onClick={e => e.stopPropagation()}>
                                <div className="rounded-lg border border-slate-600/40 bg-slate-700/20 p-3 space-y-2.5">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded border border-slate-600/30 bg-slate-800/30 px-2 py-1.5">
                                      <div className="text-[7px] font-bold text-slate-500 uppercase mb-0.5">{{ EN: 'Declared', RO: 'Declarat', FR: 'Déclaré', RU: 'Задекларировано' }[lang]}</div>
                                      <div className="text-[8px] text-slate-300">{c.goods.declaredValue}</div>
                                    </div>
                                    {c.goods.actualValue && (
                                      <div className="rounded border border-amber-600/30 bg-amber-950/20 px-2 py-1.5">
                                        <div className="text-[7px] font-bold text-amber-500 uppercase mb-0.5">{{ EN: 'Actual Value', RO: 'Valoare Reală', FR: 'Valeur Réelle', RU: 'Реальная Стоимость' }[lang]}</div>
                                        <div className="text-[8px] text-amber-300 font-bold">{c.goods.actualValue}</div>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[8.5px] text-slate-300 leading-relaxed">{lang === 'EN' ? c.summary.EN : c.summary.RO}</p>
                                  <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5">
                                    <div className="text-[7px] font-bold text-amber-400 uppercase tracking-wide mb-0.5">{{ EN: 'Key Finding', RO: 'Constatare Cheie', FR: 'Constat Clé', RU: 'Ключевая Находка' }[lang]}</div>
                                    <p className="text-[8px] text-amber-200 leading-relaxed">{lang === 'EN' ? c.finding.EN : c.finding.RO}</p>
                                  </div>
                                  <div>
                                    <div className="text-[7px] font-bold text-slate-400 uppercase tracking-wide mb-1">{{ EN: 'Actions Taken', RO: 'Acțiuni Întereprinse', FR: 'Actions Menées', RU: 'Принятые Меры' }[lang]}</div>
                                    <div className="space-y-0.5">
                                      {c.actions.RO.map((a, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                          <span className="text-emerald-400 text-[8px] shrink-0 mt-px">✓</span>
                                          <span className="text-[8px] text-slate-300 leading-snug">{a}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="font-mono text-[7px] text-slate-500 border-t border-slate-700/40 pt-1.5 leading-relaxed">{c.legislation}</div>
                                  <div className="flex items-center justify-between pt-0.5">
                                    <span className="text-[7px] text-slate-600">{c.caseRef} · {c.officerOnCase}</span>
                                    <span className="text-[6px] font-bold text-amber-600 uppercase tracking-wider">SV CONFIDENTIAL</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
                <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'PTF/PVF Intelligence Profile', RO: 'Profil Informativ PTF/PVF', FR: 'Profil Renseignement PTF/PVF', RU: 'Информационный Профиль КПП' }[lang]}</h3>
                <p className="text-[9px] text-slate-500 mt-0.5">{bcpName} · {{ EN: 'BP: false docs · migration · overstay — Customs: goods · smuggling · TA', RO: 'PF: documente false · migrație · ședere ilegală — Vamă: mărfuri · contrabandă · AT', FR: 'PF: faux docs · migration · séjour — Douane: marchandises · contrebande · AT', RU: 'ПФ: фальш. документы · миграция · пребывание — Таможня: товары · контрабанда · ВВ' }[lang]}</p>
                {/* Tab pills */}
                <div className="flex gap-1 mt-2">
                  <button onClick={e => { e.stopPropagation(); setProfileTab('scenarios'); }}
                    className={`px-2.5 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all border ${
                      profileTab === 'scenarios' ? 'bg-slate-600/30 border-slate-500/40 text-slate-200' : 'border-transparent text-slate-600 hover:text-slate-400'
                    }`}>{{ EN: '📋 Scenarios', RO: '📋 Scenarii', FR: '📋 Scénarios', RU: '📋 Сценарии' }[lang]}</button>
                  <button onClick={e => { e.stopPropagation(); setProfileTab('red'); }}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-all border ${
                      profileTab === 'red' ? 'bg-red-600/20 border-red-500/40 text-red-300' : 'border-transparent text-slate-600 hover:text-slate-400'
                    }`}>
                    <span>🔴 {{ EN: 'RED Channel Live', RO: 'Canal Roșu Live', FR: 'Canal Rouge Live', RU: 'Красный Канал' }[lang]}</span>
                    {(redDecls.length + redBPVehicles.length) > 0 && (
                      <span className="bg-red-500/20 text-red-400 px-1 rounded font-mono text-[7px]">{redDecls.length + redBPVehicles.length}</span>
                    )}
                  </button>
                </div>
              </div>
              <div className="divide-y divide-slate-800/40">
                {threats.map(t => {
                  const isOpen = expandedThreat === t.id;
                  return (
                    <div key={t.id} className="cursor-pointer hover:bg-slate-800/20 transition-colors" onClick={() => { const opening = !isOpen; setExpandedThreat(opening ? t.id : null); if (opening) setPanelLang(lang); }}>
                      {/* Header row */}
                      <div className="px-4 py-2.5 flex items-center gap-2">
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${instColor[t.institution]}`}>{instLabel[t.institution]}</span>
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${sevColor(t.severity)}`}>{t.severity}</span>
                        <span className="text-[10px] font-semibold text-slate-200 flex-1 min-w-0 truncate">{t.titleKey[lang]}</span>
                        <svg className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="px-3 pb-3" onClick={e => e.stopPropagation()}>
                          <div className="rounded-lg border border-slate-600/40 bg-slate-700/20 p-3 space-y-2.5">
                            {/* Language pills */}
                            <div className="flex items-center gap-1 pb-1 border-b border-slate-600/30">
                              <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wide mr-1">{{ EN: 'View in', RO: 'Citește în', FR: 'Lire en', RU: 'Читать на' }[lang]}</span>
                              {(['EN','RO','FR','RU'] as Language[]).map(l => (
                                <button key={l} onClick={() => setPanelLang(l as Language)}
                                  className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all border ${
                                    panelLang === l ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'border-slate-600/40 text-slate-500 hover:text-slate-300'
                                  }`}>{l}</button>
                              ))}
                            </div>
                            <p className="text-[9px] text-slate-200 leading-relaxed">{t.descKey[panelLang]}</p>
                            {/* Indicators */}
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase font-bold mb-1 tracking-wide">{{ EN: 'Indicators', RO: 'Indicatori', FR: 'Indicateurs', RU: 'Признаки' }[panelLang]}</div>
                              <div className="flex flex-wrap gap-1">
                                {t.indicators[panelLang].map((ind, i) => (
                                  <span key={i} className="text-[8px] bg-slate-600/40 text-slate-200 px-1.5 py-0.5 rounded border border-slate-500/40">{ind}</span>
                                ))}
                              </div>
                            </div>
                            {/* Goods */}
                            <div className="text-[8px] italic text-slate-300">{t.goods[panelLang]}</div>
                            {/* Legal */}
                            <div className="font-mono text-[7px] text-slate-400 tracking-tight">{t.legislation}</div>
                            {/* Actions */}
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase font-bold mb-1 tracking-wide">{{ EN: 'Officer Actions', RO: 'Acțiuni Ofițer', FR: 'Actions Officier', RU: 'Действия Офицера' }[panelLang]}</div>
                              <ol className="space-y-1">
                                {t.actionsKey[panelLang].map((a, i) => (
                                  <li key={i} className="flex gap-1.5 text-[9px] text-slate-100">
                                    <span className="text-slate-400 font-mono font-bold shrink-0">{i + 1}.</span>
                                    <span>{a}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                            {/* Sanctions */}
                            {t.sanctionsKey && (
                              <div className="px-2.5 py-2 rounded-lg border border-amber-500/40 bg-amber-950/20">
                                <div className="text-[7px] text-amber-400 uppercase font-bold tracking-wide mb-1">⚠ {{ EN: 'Sanctions & Overruns', RO: 'Sancțiuni și Depășiri', FR: 'Sanctions et Dépassements', RU: 'Санкции и Нарушения' }[panelLang]}</div>
                                <p className="text-[8px] text-amber-100 leading-snug">{t.sanctionsKey[panelLang]}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>);
        })()}

        {/* Risk Typology Breakdown */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Risk Typology Breakdown', RO: 'Tipologii de Risc Identificate', FR: 'Typologies de Risques', RU: 'Типологии Рисков' }[lang]}</h3>
              {pred && <span className={`text-[9px] font-bold uppercase ${trendColor}`}>{trendLabel}</span>}
            </div>
            <p className="text-[9px] text-slate-500 mt-0.5">{{ EN: 'Classified threat categories in current queue — 24 h window · this BCP', RO: 'Categorii de amenințări clasificate în coada curentă — fereastră 24 h · acest BCP', FR: 'Catégories de menaces classifiées dans la file actuelle — fenêtre 24 h · ce PdP', RU: 'Классифицированные категории угроз в текущей очереди — окно 24 ч · этот КПП' }[lang]}</p>
            <details className="mt-1">
              <summary className="text-[8px] text-slate-700 cursor-pointer hover:text-slate-500 select-none">{{ EN: '▸ How typologies differ from sensor flags & risk bars', RO: '▸ Cum diferă tipologiile de semnalele senzorilor și barele de risc', FR: '▸ Comment les typologies diffèrent des signaux capteurs et barres de risque', RU: '▸ Чем типологии отличаются от сигналов сенсоров и полос риска' }[lang]}</summary>
              <div className="mt-1 text-[8px] text-slate-600 leading-relaxed">
                <p>{{ EN: 'Typologies classify the NATURE of the threat (e.g. tobacco smuggling, migration) by analysing sensor hits, document flags, and goods data. They are DIFFERENT from: ① Live Sensor Flags (above) which count raw anomaly triggers per type; ② risk level cards (HIGH/MED/LOW) shown at the top of this layer.', RO: 'Tipologiile clasifică NATURA amenințării (ex. contrabandă tutun, migrație) analizând alertele de senzori, semnalele documentare și datele mărfuri. Sunt DIFERITE de: ① Semnalele Senzori Live (sus) care numără declanșările de anomalii per tip; ② cardurile nivel risc (RIDICAT/MEDIU/SCĂZUT) din vârful acestui strat.', FR: "Les typologies classifient la NATURE de la menace (ex. contrebande tabac, migration) via capteurs, documents et marchandises. DIFFÉRENTES de : ① Signaux Capteurs Live (ci-dessus) ; ② cartes niveau risque (ÉLEVÉ/MOYEN/FAIBLE) en haut de la couche.", RU: 'Типологии классифицируют ХАРАКТЕР угрозы (напр. контрабанда, миграция). Отличаются от: ① Живых Сигналов Сенсоров (выше); ② карточек уровня риска (ВЫСОК./СРЕДН./НИЗК.) вверху слоя.' }[lang]}</p>
              </div>
            </details>
          </div>
          <div className="p-4 space-y-2.5">
            <div className="text-[9px] text-slate-500 uppercase font-bold mb-2">{{ EN: 'Identified Risk Typologies (24h)', RO: 'Tipologii Risc Identificate (24h)', FR: 'Typologies de Risques Identifiées (24h)', RU: 'Выявленные Типологии Рисков (24ч)' }[lang]}</div>
            {(() => {
              const furateCar  = activeVehicles.filter(v => v.watchlistHit && v.vehicleType === 'car').length;
              const traficPers = activeVehicles.filter(v => v.watchlistHit && v.vehicleType === 'bus').length;
              const accizDecls = activeDecls.filter(d => d.excise > 0 && d.channel === 'RED').length;
              const fraudaComr = Math.round(chanCounts.YELLOW * 0.25);
              const contrMixt  = Math.round(chanCounts.RED * 0.2);
              const valutNedecl = activeDecls.filter(d => d.value > 10000 && (d.channel === 'RED' || d.channel === 'YELLOW')).length;
              const migratie   = activeVehicles.filter(v => v.risk === 'High' && v.vehicleType === 'bus').length
                               + activeVehicles.filter(v => v.watchlistHit && v.vehicleType !== 'truck').length;
              const tutun      = Math.round(chanCounts.RED * 0.4);
              const acciz      = Math.max(accizDecls, Math.round(chanCounts.RED * 0.3));
              const ALL_TYPS = [
                { label: { EN: 'Illegal Migration',                          RO: 'Migrație Ilegală',                    FR: 'Migration Irrégulière',              RU: 'Незаконная Миграция'                }[lang], val: migratie,    color: 'bg-red-500',    text: 'text-red-400' },
                { label: { EN: 'Tobacco Smuggling',                          RO: 'Contrabandă Tutun',                   FR: 'Contrebande Tabac',                  RU: 'Контрабанда Табака'                 }[lang], val: tutun,       color: 'bg-amber-500',  text: 'text-amber-400' },
                { label: { EN: 'Excise Goods (Alcohol/Fuel)',                RO: 'Mărfuri Accizabile (Alcool/Combustibil)', FR: 'Marchandises Accisées (Alcool/Carburant)', RU: 'Акцизные Товары (Алкоголь/Топливо)' }[lang], val: acciz,  color: 'bg-orange-500', text: 'text-orange-400' },
                { label: { EN: 'Forged Documents',                           RO: 'Documente Falsificate',               FR: 'Documents Falsifiés',                RU: 'Поддельные Документы'               }[lang], val: docAnomalies, color: 'bg-rose-500',  text: 'text-rose-400' },
                { label: { EN: 'Identity Fraud / Biometric Anomaly',         RO: 'Identitate Falsă / Anomalie Biometrică', FR: 'Fraude Identité / Anomalie Biométrique', RU: 'Подмена Личности / Биометрическая Аномалия' }[lang], val: bioFailures, color: 'bg-purple-500', text: 'text-purple-400' },
                { label: { EN: 'Stolen / Cloned Vehicles',                   RO: 'Vehicule Furate / Clonate',           FR: 'Véhicules Volés / Clonés',           RU: 'Угнанные / Клонированные ТС'        }[lang], val: furateCar,   color: 'bg-red-600',    text: 'text-red-300' },
                { label: { EN: 'Human Trafficking',                          RO: 'Trafic de Persoane',                  FR: 'Traite des Personnes',               RU: 'Торговля Людьми'                    }[lang], val: traficPers,  color: 'bg-pink-500',   text: 'text-pink-400' },
                { label: { EN: 'Undeclared Currency (>€10,000)',             RO: 'Valute Nedeclarate (>10.000 EUR)',    FR: 'Devises Non Déclarées (>10 000 €)',  RU: 'Незадекларированная Валюта (>10 000 €)' }[lang], val: valutNedecl, color: 'bg-yellow-600', text: 'text-yellow-400' },
                { label: { EN: 'Commercial Fraud',                           RO: 'Fraudă Comercială',                   FR: 'Fraude Commerciale',                 RU: 'Коммерческое Мошенничество'         }[lang], val: fraudaComr,  color: 'bg-cyan-600',   text: 'text-cyan-400' },
                { label: { EN: 'Counterfeit Goods',                          RO: 'Bunuri Contrafăcute',                 FR: 'Marchandises Contrefaites',          RU: 'Контрафактные Товары'               }[lang], val: contrMixt,   color: 'bg-teal-600',   text: 'text-teal-400' },
              ].filter(t => t.val > 0);
              const maxTypVal = Math.max(...ALL_TYPS.map(t => t.val), 1);
              if (ALL_TYPS.length === 0) return <div className="text-[10px] text-slate-600 py-2">{{ EN: 'No active typology detected', RO: 'Nicio tipologie activă detectată', FR: 'Aucune typologie active détectée', RU: 'Активных типологий не обнаружено' }[lang]}</div>;
              return ALL_TYPS.map(({ label, val, color, text }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold w-44 shrink-0 leading-tight ${text}`}>{label}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${Math.min(100, (val / maxTypVal) * 100)}%` }} />
                  </div>
                  <span className={`font-mono text-sm font-bold w-5 text-right ${text}`}>{val}</span>
                </div>
              ));
            })()}
          </div>
        </div>

      </div>
    </div>

    {/* ── Vehicle Risk-Analysis Report Modal ─────────────────────────────── */}
    {reportVehicle && (() => {
      const v = reportVehicle;
      const bcpObj = BCPS.find(b => b.id === v.bcpId);
      const ANALYSTS = ['Maior Ion CIOBANU', 'Lt. Natalia RUSU', 'Căpitan Andrei POPESCU', 'Inspector Pavel MUNTEANU'];
      const analystName = ANALYSTS[v.id.charCodeAt(0) % ANALYSTS.length];
      const now = new Date();
      const reportId = `RISK-${v.id.slice(-6).toUpperCase()}`;
      type RiskFlag = { code: string; label: string; desc: string; sev: 'CRITICAL' | 'HIGH' };
      const flags: RiskFlag[] = (
        [
          v.watchlistHit ? { code: 'WL-001', label: 'Corespondență Watchlist Național', desc: 'Plăcuța / documentele corespund unei înregistrări active în baza SINS / SCHENGEN. Verificare identitate aprofundată și notificarea imediată a ofițerului de informații este obligatorie.', sev: 'CRITICAL' as const } : null,
          v.docAnomaly   ? { code: 'DA-002', label: 'Anomalie Document Identificată', desc: 'Inconsistență detectată în documentele prezentate (posibil: serie alterată, hologramă lipsă, dată expirare modificată). Verificare manuală obligatorie cu dispozitiv UV și lupă.', sev: 'HIGH' as const } : null,
          v.bioMismatch  ? { code: 'BM-003', label: 'Eșec Verificare Biometrică', desc: 'Nepotrivire între datele biometrice colectate și documentul de identitate prezentat. Probabilitate uzurpare identitate: ridicată. Investigație aprofundată necesară.', sev: 'HIGH' as const } : null,
        ] as (RiskFlag | null)[]
      ).filter((f): f is RiskFlag => f !== null);
      const pfAction = v.watchlistHit
        ? { EN: 'IMMEDIATE DETENTION — Isolate in secondary inspection zone. Notify INT officer and BCP supervisor. Entry denied until status clarified.', RO: 'REȚINERE IMEDIATĂ — Izolare zonă inspecție secundară. Notificare ofițer INT și supervizor BCP. Interdicție traversare frontieră până la clarificarea statutului.', FR: 'DÉTENTION IMMÉDIATE — Isoler en zone d\'inspection secondaire. Notifier officier INT et superviseur PdP. Entrée interdite jusqu\'à clarification.', RU: 'НЕМЕДЛЕННОЕ ЗАДЕРЖАНИЕ — Изолировать в зоне вторичного досмотра. Уведомить офицера INT и руководителя КПП. Въезд запрещён до выяснения обстоятельств.' }[lang]
        : v.docAnomaly
        ? { EN: 'IN-DEPTH CHECK — Document inspection with UV device and magnifier. Cross-check with SINS databases for identity confirmation.', RO: 'VERIFICARE APROFUNDATĂ — Control documente cu dispozitiv UV + lupă. Consultare baze de date SINS pentru confirmare identitate.', FR: 'VÉRIFICATION APPROFONDIE — Contrôle des documents avec dispositif UV et loupe. Consultation des bases SINS pour confirmation d\'identité.', RU: 'УГЛУБЛЁННАЯ ПРОВЕРКА — Контроль документов с УФ-устройством и лупой. Сверка с базами данных SINS для подтверждения личности.' }[lang]
        : v.bioMismatch
        ? { EN: 'IDENTITY INSPECTION — Re-collect biometrics. Manual comparison with original documents. Escalate to supervisor if discrepancy persists.', RO: 'INSPECȚIE IDENTITATE — Re-colectare biometrie. Comparare manuală cu documentele originale. Escaladare la supervizor dacă divergența persistă.', FR: 'INSPECTION D\'IDENTITÉ — Recollecte biométrique. Comparaison manuelle avec les documents originaux. Escalade si la divergence persiste.', RU: 'ПРОВЕРКА ЛИЧНОСТИ — Повторный сбор биометрии. Ручное сравнение с оригиналами документов. Эскалация при сохранении расхождения.' }[lang]
        : { EN: 'Standard identity check. Document verification per SOP-BPF-001.', RO: 'Control standard identitate. Verificare documente de frontieră conform SOP-BPF-001.', FR: 'Contrôle d\'identité standard. Vérification des documents selon SOP-BPF-001.', RU: 'Стандартная проверка личности. Проверка документов согласно SOP-BPF-001.' }[lang];
      const svAction = v.goodsType && v.goodsType !== 'Passengers'
        ? { EN: `MANDATORY PHYSICAL INSPECTION — Declared goods: ${v.goodsType}. Company: ${v.companyName}. Verify declaration vs. physical content. Vehicle scan recommended.`, RO: `INSPECȚIE FIZICĂ OBLIGATORIE — Marfă declarată: ${v.goodsType}. Companie: ${v.companyName}. Verificare conformitate declarație vs. conținut fizic. Scanare vehicul recomandată.`, FR: `INSPECTION PHYSIQUE OBLIGATOIRE — Marchandise déclarée: ${v.goodsType}. Société: ${v.companyName}. Vérification déclaration vs. contenu physique. Scan du véhicule recommandé.`, RU: `ОБЯЗАТЕЛЬНЫЙ ФИЗИЧЕСКИЙ ДОСМОТР — Товар: ${v.goodsType}. Компания: ${v.companyName}. Проверка соответствия декларации и физического содержимого. Сканирование ТС рекомендовано.` }[lang]
        : { EN: 'Baggage and personal effects check. Verify values and currency per legal limits.', RO: 'Control bagaje și efecte personale. Verificare valori, devize și bunuri conform limitelor legale în vigoare.', FR: 'Contrôle bagages et effets personnels. Vérification des valeurs et devises selon les limites légales.', RU: 'Контроль багажа и личных вещей. Проверка ценностей и валюты согласно законодательным лимитам.' }[lang];
      return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={() => setReportVehicle(null)}>
          <div className="bg-[#0c1220] border border-slate-700/60 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            {/* header */}
            <div className="px-6 py-4 border-b border-slate-700/60 bg-slate-900/50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 uppercase tracking-wider">{{ EN: 'Service Classified', RO: 'Clasificat Serviciu', FR: 'Classifié Service', RU: 'Служебно Секретно' }[lang]}</span>
                  <span className="text-[9px] text-slate-500 font-mono">{reportId}</span>
                  <span className="text-[9px] text-slate-600">{now.toLocaleTimeString('ro-MD', { hour: '2-digit', minute: '2-digit' })} · {now.toLocaleDateString('ro-MD')}</span>
                </div>
                <h2 className="text-slate-100 font-bold text-base">{{ EN: 'Risk Analysis Report — Analyst Officer', RO: 'Raport Analiză Risc — Ofițer Analist', FR: 'Rapport Analyse Risques — Officier Analyste', RU: 'Отчёт по Анализу Рисков — Офицер-Аналитик' }[lang]}</h2>
                <p className="text-[10px] text-slate-500">{{ EN: 'Crossing Point', RO: 'Punct de Trecere', FR: 'Point de Passage', RU: 'Пункт Пропуска' }[lang]}: {bcpObj?.name ?? v.bcpId} · JOC</p>
              </div>
              <button onClick={() => setReportVehicle(null)} className="text-slate-500 hover:text-slate-200 transition-colors text-xl leading-none px-2">✕</button>
            </div>
            {/* body */}
            <div className="p-6 space-y-5">
              {/* subject */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/40">
                <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">{{ EN: 'Subject', RO: 'Subiect', FR: 'Sujet', RU: 'Субъект' }[lang]}</div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xl font-bold text-red-300">{v.plate}</span>
                  <span className="text-slate-400 text-sm capitalize">{v.vehicleType} · {v.subType}</span>
                  <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">{{ EN: 'HIGH RISK', RO: 'RISC RIDICAT', FR: 'RISQUE ÉLEVÉ', RU: 'ВЫСОКИЙ РИСК' }[lang]}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
                  <div><span className="text-slate-600">{{ EN: 'Origin', RO: 'Origine', FR: 'Origine', RU: 'Происхождение' }[lang]}: </span><span className="text-slate-300">{v.origin}</span></div>
                  <div><span className="text-slate-600">{{ EN: 'Destination', RO: 'Destinație', FR: 'Destination', RU: 'Назначение' }[lang]}: </span><span className="text-slate-300">{v.destination}</span></div>
                  <div><span className="text-slate-600">{{ EN: 'Company', RO: 'Companie', FR: 'Société', RU: 'Компания' }[lang]}: </span><span className="text-slate-300">{v.companyName}</span></div>
                  <div><span className="text-slate-600">{{ EN: 'Goods Type', RO: 'Tip Marfă', FR: 'Type Marchandise', RU: 'Тип Товара' }[lang]}: </span><span className="text-slate-300">{v.goodsType}</span></div>
                </div>
              </div>
              {/* risk score bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{{ EN: 'Global Risk Score', RO: 'Scor Risc Global', FR: 'Score de Risque Global', RU: 'Глобальный Показатель Риска' }[lang]}</span>
                  <span className="text-2xl font-light text-red-400">{v.riskScore.toFixed(0)}<span className="text-sm text-slate-600">/100</span></span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500" style={{ width: `${v.riskScore}%` }} />
                </div>
              </div>
              {/* risk flags */}
              {flags.length > 0 && (
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">{{ EN: 'Identified Risk Factors', RO: 'Factori de Risc Identificați', FR: 'Facteurs de Risque Identifiés', RU: 'Выявленные Факторы Риска' }[lang]} ({flags.length})</div>
                  <div className="space-y-2">
                    {flags.map(f => (
                      <div key={f.code} className={`rounded-lg p-3 border ${f.sev === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${f.sev === 'CRITICAL' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>{f.sev}</span>
                          <span className="text-[9px] font-mono text-slate-500">{f.code}</span>
                          <span className={`text-xs font-semibold ${f.sev === 'CRITICAL' ? 'text-red-300' : 'text-amber-300'}`}>{f.label}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed">{f.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* PF perspective */}
              <div className="rounded-xl p-4 border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">🔵 POLIȚIA DE FRONTIERĂ</span>
                  <span className="text-[9px] text-slate-500">{{ EN: 'identity · documents · border control', RO: 'identitate · documente · control frontieră', FR: 'identité · documents · contrôle frontière', RU: 'личность · документы · пограничный контроль' }[lang]}</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed font-medium">{pfAction}</p>
              </div>
              {/* SV perspective */}
              <div className="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 SERVICIUL VAMAL</span>
                  <span className="text-[9px] text-slate-500">{{ EN: 'goods · value · taxes · compliance', RO: 'mărfuri · valoare · taxe · conformitate', FR: 'marchandises · valeur · taxes · conformité', RU: 'товары · стоимость · налоги · соответствие' }[lang]}</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed font-medium">{svAction}</p>
              </div>
              {/* footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <div className="text-[9px] text-slate-500">
                  <span className="text-slate-400 font-medium">{{ EN: 'Risk Analyst', RO: 'Analist Risc', FR: 'Analyste Risques', RU: 'Аналитик Рисков' }[lang]}: </span>{analystName} · <span className="font-mono">SIG-JOC-{v.id.slice(-4).toUpperCase()}</span>
                </div>
                <button onClick={() => setReportVehicle(null)} className="text-[10px] px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors border border-slate-700">
                  {{ EN: 'Close Report', RO: 'Închide Raport', FR: 'Fermer le Rapport', RU: 'Закрыть Отчёт' }[lang]}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── BCP Situation Report Modal ──────────────────────────────────────── */}
    {reportBcp && (() => {
      const bcpObj = BCPS.find(b => b.id === reportBcp);
      if (!bcpObj) return null;
      const bVehicles  = vehicles.filter(v => v.bcpId === bcpObj.id && v.status !== 'cleared');
      const bHigh      = bVehicles.filter(v => v.risk === 'High');
      const bWatchlist = bVehicles.filter(v => v.watchlistHit);
      const bDocAnom   = bVehicles.filter(v => v.docAnomaly);
      const bBio       = bVehicles.filter(v => v.bioMismatch);
      const bDecls     = declarations.filter(d => bVehicles.some(v => v.id === d.linkedVehicleId));
      const bRed       = bDecls.filter(d => d.channel === 'RED');
      const pct        = bVehicles.length > 0 ? Math.round((bHigh.length / bVehicles.length) * 100) : 0;
      const riskLevel  = pct > 30 ? { EN: 'HIGH', RO: 'RIDICAT', FR: 'ÉLEVÉ', RU: 'ВЫСОКИЙ' }[lang] : pct > 15 ? { EN: 'MODERATE', RO: 'MODERAT', FR: 'MODÉRÉ', RU: 'УМЕРЕННЫЙ' }[lang] : { EN: 'LOW', RO: 'SCĂZUT', FR: 'FAIBLE', RU: 'НИЗКИЙ' }[lang];
      const riskColor  = pct > 30 ? 'text-red-400' : pct > 15 ? 'text-amber-400' : 'text-emerald-400';
      const barColor   = pct > 30 ? 'bg-red-500' : pct > 15 ? 'bg-amber-500' : 'bg-emerald-500';
      const ANALYSTS   = ['Lt. col. Vasile COJOCARU', 'Căpitan Elena BOTNARU', 'Inspector șef Mihai GROSU'];
      const analystName = ANALYSTS[bcpObj.id.charCodeAt(0) % ANALYSTS.length];
      const now = new Date();
      const pfAdvice = bHigh.length > 3
        ? 'Flux intens de vehicule cu risc ridicat. Se recomandă activarea echipei de inspecție secundară și notificarea șefului de tură.'
        : bWatchlist.length > 0
        ? 'Prezență corespondențe watchlist active. Coordonare imediată cu ofițerul de informații BCP și verificare SINS.'
        : 'Volum de risc moderat. Menținere proceduri standard SOP-BPF-001. Monitorizare continuă recomandată.';
      const svAdvice = bRed.length > 2
        ? 'Număr ridicat de declarații canal ROȘU. Se recomandă suplimentarea echipei de control vamal și prioritizarea scanării vehiculelor grele.'
        : bDocAnom.length > 0
        ? 'Anomalii documentare detectate la mai multe vehicule. Verificare sistematică acte de transport și manifeste marfă.'
        : 'Nivel risc vamal acceptabil. Proceduri selectivitate standard în vigoare.';
      return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4" onClick={() => setReportBcp(null)}>
          <div className="bg-[#0c1220] border border-slate-700/60 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            {/* header */}
            <div className="px-6 py-4 border-b border-slate-700/60 bg-slate-900/50 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase tracking-wider">{{ EN: 'BCP Report', RO: 'Raport BCP', FR: 'Rapport PdP', RU: 'Отчёт КПП' }[lang]}</span>
                  <span className="text-[9px] text-slate-500 font-mono">BCP-{bcpObj.id.toUpperCase()}</span>
                  <span className="text-[9px] text-slate-600">{now.toLocaleTimeString('ro-MD', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <h2 className="text-slate-100 font-bold text-base">{{ EN: 'Crossing Point Situation Report', RO: 'Raport Situație Punct de Trecere', FR: 'Rapport de Situation Point de Passage', RU: 'Отчёт о Ситуации на КПП' }[lang]}</h2>
                <p className="text-[10px] text-slate-500">{bcpObj.name} · {bcpObj.countryA} ↔ {bcpObj.countryB}</p>
              </div>
              <button onClick={() => setReportBcp(null)} className="text-slate-500 hover:text-slate-200 transition-colors text-xl leading-none px-2">✕</button>
            </div>
            {/* body */}
            <div className="p-6 space-y-5">
              {/* stats row */}
              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: { EN: 'Total Active', RO: 'Total Active',  FR: 'Total Actifs',  RU: 'Всего Активных' }[lang], val: String(bVehicles.length), color: 'text-slate-300' },
                  { label: { EN: 'High Risk',   RO: 'Risc Ridicat', FR: 'Haut Risque',   RU: 'Высокий Риск'   }[lang], val: String(bHigh.length),    color: 'text-red-400' },
                  { label: { EN: '% Risk',      RO: '% Risc',       FR: '% Risque',      RU: '% Риска'        }[lang], val: `${pct}%`,               color: riskColor },
                ] as const).map(s => (
                  <div key={s.label} className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40 text-center">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">{s.label}</div>
                    <div className={`text-2xl font-light ${s.color}`}>{s.val}</div>
                  </div>
                ))}
              </div>
              {/* risk bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{{ EN: 'Current Risk Level', RO: 'Nivel Risc Curent', FR: 'Niveau de Risque Actuel', RU: 'Текущий Уровень Риска' }[lang]}</span>
                  <span className={`text-sm font-bold ${riskColor}`}>{riskLevel}</span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              {/* factor counts */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/40">
                <div className="text-[9px] text-slate-500 uppercase font-bold mb-3 tracking-wider">{{ EN: 'Active Risk Factors at BCP', RO: 'Factori de Risc Activi la BCP', FR: 'Facteurs de Risque Actifs au PdP', RU: 'Активные Факторы Риска на КПП' }[lang]}</div>
                <div className="space-y-2">
                  {([
                    { label: { EN: 'Watchlist Matches',       RO: 'Corespondențe Watchlist', FR: 'Correspondances Watchlist',  RU: 'Совпадения Watchlist'    }[lang], val: bWatchlist.length, color: 'text-red-400' },
                    { label: { EN: 'Document Anomalies',     RO: 'Anomalii Documente',       FR: 'Anomalies Documentaires',    RU: 'Аномалии Документов'     }[lang], val: bDocAnom.length,   color: 'text-amber-400' },
                    { label: { EN: 'Biometric Failures',     RO: 'Eșecuri Biometrice',       FR: 'Échecs Biométriques',        RU: 'Сбои Биометрии'          }[lang], val: bBio.length,       color: 'text-orange-400' },
                    { label: { EN: 'RED Channel Declarations', RO: 'Declarații Canal ROȘU',  FR: 'Déclarations Canal ROUGE',   RU: 'Декларации Красного Канала' }[lang], val: bRed.length,    color: 'text-rose-400' },
                  ] as const).map(f => (
                    <div key={f.label} className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">{f.label}</span>
                      <span className={`text-sm font-bold font-mono ${f.color}`}>{f.val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* high-risk vehicle list */}
              {bHigh.length > 0 && (
                <div>
                  <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">{{ EN: 'High-Risk Vehicles', RO: 'Vehicule Risc Ridicat', FR: 'Véhicules Haut Risque', RU: 'ТС Высокого Риска' }[lang]} ({bHigh.length})</div>
                  <div className="space-y-1">
                    {bHigh.slice(0, 5).map(v => (
                      <div key={v.id} className="flex items-center justify-between bg-red-500/5 rounded-lg px-3 py-1.5 border border-red-500/20">
                        <span className="font-mono text-sm text-red-300">{v.plate}</span>
                        <span className="text-[9px] text-slate-500 capitalize">{v.subType}</span>
                        <span className="text-[10px] font-bold text-red-400">{v.riskScore.toFixed(0)}</span>
                      </div>
                    ))}
                    {bHigh.length > 5 && <div className="text-[9px] text-slate-600 text-center pt-1">+{bHigh.length - 5} {{ EN: 'more vehicles', RO: 'vehicule suplimentare', FR: 'véhicules supplémentaires', RU: 'дополнительных ТС' }[lang]}</div>}
                  </div>
                </div>
              )}
              {/* PF recommendation */}
              <div className="rounded-xl p-4 border border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">🔵 POLIȚIA DE FRONTIERĂ</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">{pfAdvice}</p>
              </div>
              {/* SV recommendation */}
              <div className="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">🟡 SERVICIUL VAMAL</span>
                </div>
                <p className="text-[10px] text-slate-300 leading-relaxed">{svAdvice}</p>
              </div>
              {/* footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                <div className="text-[9px] text-slate-500">
                  <span className="text-slate-400 font-medium">{{ EN: 'Analyst Officer', RO: 'Ofițer Analist', FR: 'Officier Analyste', RU: 'Офицер-Аналитик' }[lang]}: </span>{analystName}
                </div>
                <button onClick={() => setReportBcp(null)} className="text-[10px] px-4 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors border border-slate-700">
                  {{ EN: 'Close Report', RO: 'Închide Raport', FR: 'Fermer le Rapport', RU: 'Закрыть Отчёт' }[lang]}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
    </>
  );
};

// ─── Decision-Support Layer ───────────────────────────────────────────────────
const DecisionSupportLayer: React.FC<{
  stats: { waiting: Vehicle[]; inControl: Vehicle[]; avgWaitSec: number; riskCounts: Record<RiskLevel, number> };
  vehicles: Vehicle[]; declarations: Declaration[]; alerts: Alert[];
  bcpPerformance: Record<string, { cleared: number; highRisk: number }>;
  pred: Predictions | null;
  lang: Language;
  selectedBCP: string;
}> = ({ stats, vehicles, declarations, alerts, bcpPerformance, pred, lang, selectedBCP }) => {
  const bcpObj = BCPS.find(b => b.id === selectedBCP);
  const bcpName = bcpObj?.name ?? selectedBCP;

  // ── Type labels fully translated ──
  const typeLabel: Record<string, string> = {
    PREDICTIVE:   { EN: 'PREDICTIVE',   RO: 'PREDICTIV',    FR: 'PRÉDICTIF',   RU: 'ПРОГНОСТИЧЕСКИЙ' }[lang],
    OPERATIONAL:  { EN: 'OPERATIONAL',  RO: 'OPERAȚIONAL',  FR: 'OPÉRATIONNEL',RU: 'ОПЕРАЦИОННЫЙ'    }[lang],
    SECURITY:     { EN: 'SECURITY',     RO: 'SECURITATE',   FR: 'SÉCURITÉ',    RU: 'БЕЗОПАСНОСТЬ'    }[lang],
    CUSTOMS:      { EN: 'CUSTOMS',      RO: 'VAMAL',        FR: 'DOUANE',      RU: 'ТАМОЖНЯ'         }[lang],
    INTELLIGENCE: { EN: 'INTELLIGENCE', RO: 'INFORMAȚII',   FR: 'RENSEIGNEMENT',RU: 'РАЗВЕДКА'       }[lang],
    'BORDER POLICE': { EN: 'BORDER POLICE', RO: 'POLIȚIE FRONTIERĂ', FR: 'POLICE FRONTIÈRE', RU: 'ПОГРАНПОЛИЦИЯ' }[lang],
    STATUS:       { EN: 'STATUS',       RO: 'STATUS',       FR: 'STATUT',      RU: 'СТАТУС'          }[lang],
    BCP:          { EN: 'BCP-SPECIFIC', RO: 'SPECIFIC BCP', FR: 'SPÉCIFIQUE BCP', RU: 'СПЕЦИФИЧНО BCP' }[lang],
  };

  const recommendations = useMemo(() => {
    const recs: { id: string; priority: 'CRITICAL'|'HIGH'|'MEDIUM'; type: string; action: string; detail: string; ref: string }[] = [];

    // ── Predictive recommendations (future-state, higher precedence) ──
    if (pred) {
      if (pred.saturation === 'CRITICAL')
        recs.push({ id: 'PRED-001', priority: 'CRITICAL', type: 'PREDICTIVE',
          action: { EN: 'IMMINENT: Open emergency lanes — critical saturation forecast', RO: 'IMINENT: Deschideți benzile de urgență — saturare critică prognozată', FR: 'IMMINENT: Ouvrir voies urgence — saturation critique prévue', RU: 'НЕМЕДЛЕННО: Открыть аварийные полосы — прогноз критического насыщения' }[lang],
          detail: { EN: `Expected: ${Math.round(pred.queue2m)} vehicles / ${Math.round(pred.wait2m)}s avg wait within +2 min. Operational stress: ${pred.stressIndex}%.`, RO: `Prognozat: ${Math.round(pred.queue2m)} vehicule / ${Math.round(pred.wait2m)}s așteptare medie în +2 min. Stres operațional: ${pred.stressIndex}%.`, FR: `Prévu: ${Math.round(pred.queue2m)} véhicules / ${Math.round(pred.wait2m)}s attente moy. dans +2 min. Stress opérationnel: ${pred.stressIndex}%.`, RU: `Ожидается: ${Math.round(pred.queue2m)} ТС / ${Math.round(pred.wait2m)}с среднее ожидание через +2 мин. Операционная нагрузка: ${pred.stressIndex}%.` }[lang],
          ref: 'SOP-001 / POL-007' });
      else if (pred.saturation === 'HIGH')
        recs.push({ id: 'PRED-002', priority: 'HIGH', type: 'PREDICTIVE',
          action: { EN: 'Activate secondary lane within next 2 minutes', RO: 'Activați banda secundară în următoarele 2 minute', FR: 'Activer voie secondaire dans les 2 prochaines minutes', RU: 'Активировать дополнительную полосу в течение 2 минут' }[lang],
          detail: { EN: `Forecast: ${Math.round(pred.queue5m)} vehicles / ${Math.round(pred.wait5m)}s wait within +5 min. Operational stress: ${pred.stressIndex}%.`, RO: `Prognoză: ${Math.round(pred.queue5m)} vehicule / ${Math.round(pred.wait5m)}s așteptare în +5 min. Stres operațional: ${pred.stressIndex}%.`, FR: `Prévision: ${Math.round(pred.queue5m)} véhicules / ${Math.round(pred.wait5m)}s attente dans +5 min. Stress: ${pred.stressIndex}%.`, RU: `Прогноз: ${Math.round(pred.queue5m)} ТС / ${Math.round(pred.wait5m)}с ожидание через +5 мин. Нагрузка: ${pred.stressIndex}%.` }[lang],
          ref: 'SOP-001 / POL-007' });
      else if (pred.trend === 'DETERIORATING')
        recs.push({ id: 'PRED-003', priority: 'MEDIUM', type: 'PREDICTIVE',
          action: { EN: 'Monitor — queue growing, prepare secondary lane', RO: 'Monitorizați — coada crește, pregătiți banda secundară', FR: 'Surveiller — file en croissance, préparer voie secondaire', RU: 'Мониторинг — очередь растёт, подготовьте дополнительную полосу' }[lang],
          detail: { EN: `Queue trending upward. Projected ${Math.round(pred.queue10m)} vehicles within +10 min. Operational stress: ${pred.stressIndex}%.`, RO: `Coadă în tendință ascendentă. Prognozat ${Math.round(pred.queue10m)} vehicule în +10 min. Stres: ${pred.stressIndex}%.`, FR: `File en hausse. Prévu ${Math.round(pred.queue10m)} véhicules dans +10 min. Stress: ${pred.stressIndex}%.`, RU: `Очередь растёт. Прогноз: ${Math.round(pred.queue10m)} ТС через +10 мин. Нагрузка: ${pred.stressIndex}%.` }[lang],
          ref: 'SOP-001 / POL-007' });
      else if (pred.trend === 'IMPROVING')
        recs.push({ id: 'PRED-OK', priority: 'MEDIUM', type: 'PREDICTIVE',
          action: { EN: 'Queue easing — consider lane consolidation', RO: 'Coada se îmbunătățește — considerați consolidarea benzilor', FR: 'File en amélioration — envisager consolidation voies', RU: 'Очередь уменьшается — рассмотреть консолидацию полос' }[lang],
          detail: { EN: `Forecast: ${Math.round(pred.queue5m)} vehicles within +5 min. Operational stress: ${pred.stressIndex}%. Conditions improving.`, RO: `Prognoză: ${Math.round(pred.queue5m)} vehicule în +5 min. Stres: ${pred.stressIndex}%. Condiții în îmbunătățire.`, FR: `Prévision: ${Math.round(pred.queue5m)} véhicules dans +5 min. Stress: ${pred.stressIndex}%. Conditions s'améliorent.`, RU: `Прогноз: ${Math.round(pred.queue5m)} ТС через +5 мин. Нагрузка: ${pred.stressIndex}%. Ситуация улучшается.` }[lang],
          ref: 'N/A' });
    }

    // ── Reactive — operational ──
    if (stats.avgWaitSec > 120)
      recs.push({ id: 'REC-001', priority: 'CRITICAL', type: 'OPERATIONAL',
        action: { EN: 'Activate additional lanes immediately', RO: 'Activați imediat benzile suplimentare', FR: 'Activer les voies supplémentaires immédiatement', RU: 'Немедленно открыть дополнительные полосы' }[lang],
        detail: { EN: `Avg wait ${stats.avgWaitSec.toFixed(0)}s exceeds critical 120s SLA. Open secondary lanes at affected BCPs.`, RO: `Așteptare medie ${stats.avgWaitSec.toFixed(0)}s depășește SLA critic de 120s. Deschideți benzile secundare.`, FR: `Attente moy. ${stats.avgWaitSec.toFixed(0)}s dépasse SLA critique de 120s. Ouvrir voies secondaires.`, RU: `Среднее ожидание ${stats.avgWaitSec.toFixed(0)}с превышает критический SLA 120с. Откройте дополнительные полосы.` }[lang],
        ref: 'SOP-001 / POL-007' });
    else if (stats.avgWaitSec > 60)
      recs.push({ id: 'REC-002', priority: 'HIGH', type: 'OPERATIONAL',
        action: { EN: 'Open secondary lanes at congested BCPs', RO: 'Deschideți benzile secundare la BCPs aglomerate', FR: 'Ouvrir voies secondaires aux BCPs encombrés', RU: 'Открыть дополнительные полосы на перегруженных КПП' }[lang],
        detail: { EN: `Avg wait ${stats.avgWaitSec.toFixed(0)}s exceeds 60s warning threshold.`, RO: `Așteptare medie ${stats.avgWaitSec.toFixed(0)}s depășește pragul de avertizare de 60s.`, FR: `Attente moy. ${stats.avgWaitSec.toFixed(0)}s dépasse le seuil d'avertissement de 60s.`, RU: `Среднее ожидание ${stats.avgWaitSec.toFixed(0)}с превышает предупредительный порог 60с.` }[lang],
        ref: 'SOP-001 / POL-007' });

    // ── Reactive — security ──
    if (stats.riskCounts.High > 5)
      recs.push({ id: 'REC-003', priority: 'CRITICAL', type: 'SECURITY',
        action: { EN: 'Deploy additional joint inspection team', RO: 'Dislocați echipă suplimentară de inspecție comună', FR: 'Déployer équipe d\'inspection conjointe supplémentaire', RU: 'Направить дополнительную совместную группу досмотра' }[lang],
        detail: { EN: `${stats.riskCounts.High} high-risk vehicles at ${bcpName} — inspection capacity may be overwhelmed.`, RO: `${stats.riskCounts.High} vehicule cu risc ridicat la ${bcpName} — capacitatea de inspecție poate fi depășită.`, FR: `${stats.riskCounts.High} véhicules haut risque à ${bcpName} — capacité d'inspection peut être dépassée.`, RU: `${stats.riskCounts.High} высокорисковых ТС на ${bcpName} — пропускная способность досмотра может быть превышена.` }[lang],
        ref: 'SOP-003 / POL-002' });

    // ── Reactive — customs ──
    const redDecls = declarations.filter(d => d.channel === 'RED' && d.status === 'SUBMITTED').length;
    if (redDecls > 4)
      recs.push({ id: 'REC-004', priority: 'HIGH', type: 'CUSTOMS',
        action: { EN: 'Escalate RED-channel declarations to customs supervisor', RO: 'Escaladați declarațiile canal ROȘU la supervizorul vamal', FR: 'Escalader déclarations canal ROUGE au superviseur douanier', RU: 'Передать декларации красного канала начальнику таможни' }[lang],
        detail: { EN: `${redDecls} RED-channel declarations pending at ${bcpName} — risk of backlog.`, RO: `${redDecls} declarații canal ROȘU în așteptare la ${bcpName} — risc de întârzieri.`, FR: `${redDecls} déclarations canal ROUGE en attente à ${bcpName} — risque d'accumulation.`, RU: `${redDecls} деклараций красного канала ожидают обработки на ${bcpName} — риск накопления.` }[lang],
        ref: 'POL-003 / SOP-003' });

    // ── Reactive — intelligence ──
    const watchlistHits = vehicles.filter(v => v.watchlistHit).length;
    if (watchlistHits > 0)
      recs.push({ id: 'REC-005', priority: 'CRITICAL', type: 'INTELLIGENCE',
        action: { EN: 'Notify Intelligence Liaison — active watchlist hit(s)', RO: 'Notificați Ofițerul de Legătură Informații — corespondență activă în liste', FR: 'Notifier Liaison Renseignement — correspondance active dans les listes', RU: 'Уведомить офицера связи разведки — активное совпадение в базах' }[lang],
        detail: { EN: `${watchlistHits} vehicle(s) at ${bcpName} matched watchlist. Immediate coordination with INT-007 required.`, RO: `${watchlistHits} vehicul(e) la ${bcpName} găsite în liste de urmărire. Coordonare imediată cu INT-007 necesară.`, FR: `${watchlistHits} véhicule(s) à ${bcpName} correspondant aux listes. Coordination immédiate avec INT-007 requise.`, RU: `${watchlistHits} ТС на ${bcpName} совпало с базами наблюдения. Требуется немедленная координация с INT-007.` }[lang],
        ref: 'SOP-004 / POL-006' });

    // ── Reactive — border police ──
    const bioFails = vehicles.filter(v => v.bioMismatch && (v.status === 'in_border' || v.status === 'waiting_customs')).length;
    if (bioFails > 2)
      recs.push({ id: 'REC-006', priority: 'HIGH', type: 'BORDER POLICE',
        action: { EN: 'Run biometric system diagnostic + manual checks', RO: 'Efectuați diagnostic sistem biometric + verificări manuale', FR: 'Effectuer diagnostic système biométrique + contrôles manuels', RU: 'Диагностика биометрической системы + ручные проверки' }[lang],
        detail: { EN: `${bioFails} concurrent biometric failures at ${bcpName}. May indicate system fault or coordinated identity fraud.`, RO: `${bioFails} erori biometrice simultane la ${bcpName}. Poate indica defecțiune sistem sau tentativă coordonată de fraudă identitate.`, FR: `${bioFails} échecs biométriques simultanés à ${bcpName}. Peut indiquer panne système ou fraude identité coordonnée.`, RU: `${bioFails} одновременных сбоев биометрии на ${bcpName}. Возможна неисправность системы или скоординированное мошенничество с личностью.` }[lang],
        ref: 'SOP-002 / POL-001' });

    // ── BCP-specific scenario recommendation ──
    const bcpThreat = (BCP_THREAT_PROFILES[selectedBCP] ?? BCP_THREAT_PROFILES['DEFAULT'])[0];
    if (bcpThreat) {
      recs.push({ id: 'BCP-001', priority: bcpThreat.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH', type: 'BCP',
        action: { EN: `${bcpName}: Apply scenario protocol — ${bcpThreat.titleKey.EN}`, RO: `${bcpName}: Aplicați protocolul scenariului — ${bcpThreat.titleKey.RO}`, FR: `${bcpName}: Appliquer protocole scénario — ${bcpThreat.titleKey.FR}`, RU: `${bcpName}: Применить протокол сценария — ${bcpThreat.titleKey.RU}` }[lang],
        detail: { EN: bcpThreat.descKey.EN, RO: bcpThreat.descKey.RO, FR: bcpThreat.descKey.FR, RU: bcpThreat.descKey.RU }[lang],
        ref: bcpThreat.legislation });
    }

    if (recs.length === 0)
      recs.push({ id: 'REC-OK', priority: 'MEDIUM', type: 'STATUS',
        action: { EN: 'All systems nominal — no immediate action required', RO: 'Toate sistemele nominale — nicio acțiune imediată necesară', FR: 'Tous systèmes nominaux — aucune action immédiate requise', RU: 'Все системы в норме — немедленных действий не требуется' }[lang],
        detail: { EN: 'Current operational metrics are within acceptable thresholds.', RO: 'Parametrii operaționali actuali se încadrează în pragurile acceptabile.', FR: 'Les indicateurs opérationnels actuels sont dans les seuils acceptables.', RU: 'Текущие операционные показатели находятся в допустимых пределах.' }[lang],
        ref: 'N/A' });
    return recs;
  }, [stats, vehicles, declarations, alerts, pred, lang, selectedBCP]);

  const escalations = useMemo(() =>
    vehicles.filter(v => v.risk === 'High' && (v.status === 'in_border' || v.status === 'in_customs'))
      .map(v => ({ plate: v.plate, type: v.vehicleType,
        flags: [
          v.watchlistHit && { EN: 'Watchlist', RO: 'Watchlist', FR: 'Surveillance', RU: 'Наблюдение' }[lang],
          v.docAnomaly   && { EN: 'Doc Anomaly', RO: 'Anomalie Doc', FR: 'Anomalie Doc', RU: 'Аномалия Документа' }[lang],
          v.bioMismatch  && { EN: 'Bio Mismatch', RO: 'Eroare Bio', FR: 'Échec Biométrique', RU: 'Сбой Биометрии' }[lang],
        ].filter(Boolean) as string[],
        stage: v.status === 'in_border'
          ? { EN: 'Border Check', RO: 'Control Frontieră', FR: 'Contrôle Frontière', RU: 'Паспортный Контроль' }[lang]
          : { EN: 'Customs', RO: 'Vamă', FR: 'Douane', RU: 'Таможня' }[lang],
        score: v.riskScore }))
  , [vehicles]);

  const priStyle = (p: string) => p === 'CRITICAL' ? 'border-red-500/40 bg-red-500/5 text-red-300' : p === 'HIGH' ? 'border-amber-500/40 bg-amber-500/5 text-amber-300' : 'border-blue-500/40 bg-blue-500/5 text-blue-300';
  const priDot = (p: string) => p === 'CRITICAL' ? 'bg-red-500 animate-pulse' : p === 'HIGH' ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 overflow-y-auto custom-scrollbar">
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Active Recommendations', RO: 'Recomandări Active', FR: 'Recommandations Actives', RU: 'Активные Рекомендации' }[lang]}</h3>
            <span className="text-[10px] text-slate-500">{recommendations.length} {{ EN: recommendations.length !== 1 ? 'items' : 'item', RO: 'elemente', FR: 'éléments', RU: 'позиций' }[lang]}</span>
          </div>
          <div className="divide-y divide-slate-800/40">
            {/* BCP context header */}
            <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/40 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
              <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{{ EN: 'Active BCP:', RO: 'BCP Activ:', FR: 'PdP Actif:', RU: 'Активный КПП:' }[lang]}</span>
              <span className="text-[9px] text-blue-400 font-mono">{bcpName}</span>
            </div>
            {recommendations.map(r => {
              const priLabelT = r.priority === 'CRITICAL' ? { EN: 'CRITICAL', RO: 'CRITIC', FR: 'CRITIQUE', RU: 'КРИТИЧЕСКИЙ' }[lang] : r.priority === 'HIGH' ? { EN: 'HIGH', RO: 'RIDICAT', FR: 'ÉLEVÉ', RU: 'ВЫСОКИЙ' }[lang] : { EN: 'MEDIUM', RO: 'MEDIU', FR: 'MOYEN', RU: 'СРЕДНИЙ' }[lang];
              return (
              <div key={r.id} className={`p-4 border-l-2 ${r.priority === 'CRITICAL' ? 'border-l-red-500' : r.priority === 'HIGH' ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${priDot(r.priority)}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${priStyle(r.priority)}`}>{priLabelT}</span>
                      <span className="text-[9px] text-slate-500 uppercase">{typeLabel[r.type] ?? r.type}</span>
                      <span className="text-[9px] font-mono text-slate-700">{r.id}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-200 mb-1">{r.action}</div>
                    <div className="text-[10px] text-slate-400 leading-relaxed">{r.detail}</div>
                    <div className="text-[9px] text-slate-600 mt-1 font-mono">{{ EN: 'Ref:', RO: 'Ref:', FR: 'Réf:', RU: 'Ссыл:' }[lang]} {r.ref}</div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-5 flex flex-col gap-4">
        {/* Escalation Queue */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
            <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Escalation Queue', RO: 'Coadă de Escaladare', FR: 'File d\'Escalade', RU: 'Очередь Эскалации' }[lang]}</h3>
            {escalations.length > 0 && <span className="text-[10px] font-bold text-red-400 animate-pulse">{escalations.length} {{ EN: 'ACTIVE', RO: 'ACTIVE', FR: 'ACTIVES', RU: 'АКТИВНЫХ' }[lang]}</span>}
          </div>
          <div className="divide-y divide-slate-800/40">
            {escalations.length === 0 && <div className="py-6 text-center text-slate-600 text-xs">{{ EN: 'No active escalations', RO: 'Nicio escaladare activă', FR: 'Aucune escalade active', RU: 'Нет активных эскалаций' }[lang]}</div>}
            {escalations.map((e, i) => (
              <div key={i} className="p-3 flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm text-red-200 font-bold">{e.plate}</div>
                  <div className="text-[9px] text-slate-500 capitalize mt-0.5">{e.type} · {e.stage}</div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {e.flags.map(f => <span key={f} className="text-[9px] bg-red-500/10 text-red-400 px-1 rounded border border-red-500/20">{f}</span>)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-light text-red-400">{e.score.toFixed(0)}</div>
                  <div className="text-[9px] text-slate-600">{{ EN: 'risk pts', RO: 'puncte risc', FR: 'pts risque', RU: 'балл риска' }[lang]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latest Security Events */}
        <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[7px] font-black px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 uppercase tracking-widest shrink-0">⚡ ACTION NOW</span>
                <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Critical Alerts — Immediate Action', RO: 'Alerte Critice — Acțiune Imediată', FR: 'Alertes Critiques — Action Immédiate', RU: 'Критические Тревоги — Действуй Сейчас' }[lang]}</h3>
              </div>
              <p className="text-[9px] text-slate-500 mt-0.5">{{ EN: 'HIGH-severity only · this BCP · requires officer decision', RO: 'Doar severitate HIGH · acest BCP · necesită decizie ofițer', FR: 'Sévérité HIGH uniquement · ce PdP · décision officier requise', RU: 'Только HIGH · этот КПП · требует решения офицера' }[lang]}</p>
              <details className="mt-1">
                <summary className="text-[8px] text-slate-700 cursor-pointer hover:text-slate-500 select-none">{{ EN: '▸ How is this different from Operational Log and Network Radar?', RO: '▸ Cum diferă de Jurnalul Operațional și Radar Rețea?', FR: '▸ En quoi diffère-t-il du Journal Opérationnel et du Radar Réseau?', RU: '▸ Чем отличается от Оперативного Журнала и Сетевого Радара?' }[lang]}</summary>
                <div className="mt-1 text-[8px] text-slate-600 leading-relaxed space-y-0.5">
                  <p><span className="text-red-400 font-bold">{{ EN: 'This section', RO: 'Această secțiune', FR: 'Cette section', RU: 'Эта секция' }[lang]}</span> — {{ EN: 'HIGH-severity alerts for THIS BCP only. Max 4 items. Everything here needs an officer action RIGHT NOW. No filtering needed.', RO: 'Alerte HIGH pentru ACEST BCP. Max 4 elemente. Tot ce apare necesită acțiune ofițer IMEDIAT. Fără filtrare.', FR: 'Alertes HIGH de CE PdP uniquement. Max 4 éléments. Tout nécessite une action immédiate. Pas de filtre.', RU: 'Только HIGH-тревоги ЭТОГО КПП. Макс. 4 элемента. Всё требует действия СЕЙЧАС. Фильтрация не нужна.' }[lang]}</p>
                  <p><span className="text-amber-400 font-bold">{{ EN: 'Operational Log', RO: 'Jurnalul Operațional', FR: 'Journal Opérationnel', RU: 'Оперативный Журнал' }[lang]}</span> — {{ EN: 'full audit trail, all severities (HIGH / MEDIUM / LOW), filterable, BCP or network scope. For supervision, incident review and shift handover.', RO: 'jurnal complet, toate severitățile (HIGH / MEDIUM / LOW), filtrabil, BCP sau rețea. Pentru supervizare, revizuire incidente și predare tură.', FR: 'journal complet, toutes sévérités (HIGH / MEDIUM / LOW), filtrable, BCP ou réseau. Pour supervision et passation de quart.', RU: 'полный журнал, все уровни (HIGH / MEDIUM / LOW), фильтруемый, КПП или сеть. Для надзора, разбора инцидентов и сдачи смены.' }[lang]}</p>
                  <p><span className="text-blue-400 font-bold">{{ EN: 'Network Radar', RO: 'Radar Rețea', FR: 'Radar Réseau', RU: 'Сетевой Радар' }[lang]}</span> — {{ EN: 'strategic view: threat LEVEL per BCP across all 21 crossings — not individual events. Use to decide where to reinforce.', RO: 'vedere strategică: NIVELUL de amenințare per BCP la toate cele 21 puncte — nu evenimente individuale. Folosiți pentru a decide unde să trimiteți întăriri.', FR: 'vue stratégique: NIVEAU de menace par PdP sur les 21 passages — pas d\'événements individuels. Pour décider où renforcer.', RU: 'стратегический вид: УРОВЕНЬ угрозы по КПП на всех 21 — не отдельные события. Для решения об усилении.' }[lang]}</p>
                </div>
              </details>
            </div>
          </div>
          <div className="divide-y divide-slate-800/40 max-h-40 overflow-y-auto custom-scrollbar">
            {alerts.filter(a => a.severity === 'HIGH').slice(0, 4).map(a => (
              <div key={a.id} className="p-3 flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-[9px] font-bold text-red-400 uppercase">{a.type}</span>
                    <span className="text-[8px] text-slate-700">{new Date(a.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-[10px] text-slate-300 font-medium leading-tight">{a.title}</div>
                  <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{a.message}</div>
                </div>
              </div>
            ))}
            {alerts.filter(a => a.severity === 'HIGH').length === 0 && <div className="py-4 text-center text-slate-600 text-xs">{{ EN: 'No security events', RO: 'Niciun eveniment de securitate', FR: 'Aucun événement de sécurité', RU: 'Нет событий безопасности' }[lang]}</div>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Human Layer ──────────────────────────────────────────────────────────────
const HumanLayer: React.FC<{ selectedBCP: string; vehicles: Vehicle[]; lang: Language }> = ({ selectedBCP, vehicles, lang }) => {
  const typeAbbr: Record<Officer['type'], string> = { BORDER_GUARD: 'BP', CUSTOMS: 'CS', MANAGEMENT: 'CMD', INTELLIGENCE: 'INT' };
  const typeStyle: Record<Officer['type'], string> = {
    BORDER_GUARD: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    CUSTOMS:      'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    MANAGEMENT:   'text-violet-400 bg-violet-500/10 border-violet-500/20',
    INTELLIGENCE: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };
  const statusDot: Record<Officer['status'], string> = {
    ON_DUTY:  'bg-emerald-500',
    BREAK:    'bg-amber-500 animate-pulse',
    OFF_DUTY: 'bg-slate-700',
  };
  const statusLabel: Record<Officer['status'], string> = {
    ON_DUTY:  { EN: 'On Duty',  RO: 'În Serviciu', FR: 'En Service',   RU: 'На Службе'     }[lang],
    BREAK:    { EN: 'Break',    RO: 'Pauză',        FR: 'Pause',        RU: 'Перерыв'       }[lang],
    OFF_DUTY: { EN: 'Off Duty', RO: 'Liber',        FR: 'Hors Service', RU: 'Вне Службы'    }[lang],
  };
  const statusLabelColor: Record<Officer['status'], string> = { ON_DUTY: 'text-emerald-400', BREAK: 'text-amber-400', OFF_DUTY: 'text-slate-600' };

  const roleLabel: Record<string, string> = {
    'Duty Commander':         { EN: 'Duty Commander',          RO: 'Comandant de Tură',          FR: 'Commandant de Quart',         RU: 'Дежурный Командир'           }[lang],
    'Șef de Tură — DMO':     { EN: 'Shift Chief — DMO',       RO: 'Șef de Tură — DMO',          FR: 'Chef de Quart — DMO',         RU: 'Начальник Смены — УПМ'       }[lang],
    'Șef de Tură — Vamă':    { EN: 'Shift Chief — Customs',   RO: 'Șef de Tură — Vamă',         FR: 'Chef de Quart — Douane',      RU: 'Начальник Смены — Таможня'   }[lang],
    'Intelligence Liaison':   { EN: 'Intelligence Liaison',    RO: 'Ofițer de Legătură INT',     FR: 'Agent de Liaison INT',        RU: 'Офицер Связи Разведки'       }[lang],
    'Senior Border Officer':  { EN: 'Senior Border Officer',   RO: 'Ofițer Superior Frontieră',  FR: 'Officier Frontière Senior',   RU: 'Старший Пограничный Офицер'  }[lang],
    'Border Officer':         { EN: 'Border Officer',          RO: 'Ofițer de Frontieră',        FR: 'Officier de Frontière',       RU: 'Пограничный Офицер'          }[lang],
    'Customs Officer':        { EN: 'Customs Officer',         RO: 'Inspector Vamal',             FR: 'Inspecteur Douanier',         RU: 'Таможенный Инспектор'        }[lang],
    'Senior Customs Officer': { EN: 'Senior Customs Officer',  RO: 'Inspector Vamal Superior',   FR: 'Inspecteur Douanier Senior',  RU: 'Старший Таможенный Инспектор'}[lang],
  };

  const institutionLabel: Record<string, { name: string; role: string }> = {
    NP: {
      name: { EN: 'National Police',           RO: 'Poliția Națională',           FR: 'Police Nationale',              RU: 'Национальная Полиция'           }[lang],
      role: { EN: 'Law enforcement support, criminal investigation & joint border operations', RO: 'Suport forțe de ordine, investigații penale & operațiuni comune de frontieră', FR: 'Soutien forces de l\'ordre, enquêtes pénales & opérations frontalières conjointes', RU: 'Поддержка правопорядка, уголовные расследования & совместные пограничные операции' }[lang],
    },
    INT: {
      name: { EN: 'Intelligence Directorate',  RO: 'Direcția de Informații',      FR: 'Direction du Renseignement',    RU: 'Разведывательное Управление'    }[lang],
      role: { EN: 'Counter-intelligence, threat analysis, risk sharing & operational liaison', RO: 'Contrainformații, analiză amenințări, schimb de riscuri & legătură operațională', FR: 'Contre-espionnage, analyse menaces, partage risques & liaison opérationnelle', RU: 'Контрразведка, анализ угроз, обмен рисками & оперативная связь' }[lang],
    },
  };

  const [roster, setRoster] = useState<Officer[]>(() => OFFICERS_ROSTER.map(o => ({ ...o })));
  const [scenario, setScenario] = useState<'NORMAL' | 'PEAK' | 'RISK'>('NORMAL');

  // Officer micro-break rotation: every 90s flip one ON_DUTY ↔ BREAK
  useEffect(() => {
    const interval = setInterval(() => {
      setRoster(prev => {
        const updated = prev.map(o => ({ ...o }));
        const eligible = updated.filter(o => o.type === 'BORDER_GUARD' || o.type === 'CUSTOMS');
        const onBreak  = eligible.filter(o => o.status === 'BREAK');
        const onDutyEl = eligible.filter(o => o.status === 'ON_DUTY');
        if (onBreak.length > 0 && Math.random() < 0.6) {
          randomItem(onBreak).status = 'ON_DUTY';
        } else if (onDutyEl.length > 1) {
          randomItem(onDutyEl).status = 'BREAK';
        }
        return updated;
      });
    }, 90000);
    return () => clearInterval(interval);
  }, []);

  const bcpOfficers = roster.filter(o => o.bcpId === selectedBCP);
  const onDuty      = bcpOfficers.filter(o => o.status === 'ON_DUTY').length;
  const byType      = bcpOfficers.reduce((acc, o) => { acc[o.type] = (acc[o.type] || 0) + 1; return acc; }, {} as Record<string, number>);
  const commandOfficers = roster.filter(o => o.segment === 'COMMAND');

  // Inline officer card
  const OfficerCard = ({ o }: { o: Officer }) => (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg bg-[#0D1219] border border-slate-800/40 transition-opacity ${o.status === 'OFF_DUTY' ? 'opacity-40' : ''}`}>
      <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${statusDot[o.status]}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-semibold text-slate-200 truncate">{o.name}</span>
          <span className={`text-[8px] font-black px-1 py-0.5 rounded border shrink-0 ${typeStyle[o.type]}`}>{typeAbbr[o.type]}</span>
        </div>
        <div className="text-[9px] text-slate-400 font-medium mt-0.5 truncate">{o.rank}</div>
        <div className="text-[8px] font-mono text-slate-600 mt-0.5">{o.badge}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[9px] text-slate-500 truncate">{roleLabel[o.role] ?? o.role}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[8px] font-bold ${statusLabelColor[o.status]}`}>{statusLabel[o.status]}</span>
          <span className="text-slate-800">·</span>
          {o.lang.map(l => <span key={l} className="text-[7px] bg-slate-800/80 text-slate-500 px-1 py-0.5 rounded border border-slate-700/50">{l}</span>)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col gap-5 overflow-y-auto custom-scrollbar">
      {/* Scenario selector */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{{ EN: 'Deployment Mode:', RO: 'Mod de Desfășurare:', FR: 'Mode de Déploiement:', RU: 'Режим Развёртывания:' }[lang]}</span>
        <div className="flex gap-1">
          {([
            { id: 'NORMAL' as const, label: { EN: 'Normal', RO: 'Normal', FR: 'Normal', RU: 'Обычный' }[lang], color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
            { id: 'PEAK'   as const, label: { EN: 'Peak',   RO: 'Vârf',   FR: 'Pointe', RU: 'Пиковый' }[lang], color: 'bg-amber-500/20 text-amber-300 border-amber-500/40'   },
            { id: 'RISK'   as const, label: { EN: 'Risk',   RO: 'Risc',   FR: 'Risque', RU: 'Угроза'  }[lang], color: 'bg-red-500/20 text-red-300 border-red-500/40'         },
          ] as const).map(s => (
            <button key={s.id} onClick={() => setScenario(s.id)}
              className={`px-2.5 py-1 text-[9px] font-bold uppercase rounded border transition-all ${scenario === s.id ? s.color : 'text-slate-600 border-slate-700 hover:text-slate-400'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      {scenario !== 'NORMAL' && (
        <div className={`mb-3 px-3 py-2 rounded-lg border text-[9px] leading-relaxed ${scenario === 'PEAK' ? 'bg-amber-500/5 border-amber-500/20 text-amber-300' : 'bg-red-500/5 border-red-500/20 text-red-300'}`}>
          {scenario === 'PEAK' ? (
            { EN: '⚡ PEAK MODE: All posts doubled. Extra lanes open. BP officers cover cars and coaches. Customs inspectors add secondary check team. Average processing time may increase.', RO: '⚡ MOD VÂRF: Toate posturile dublate. Benzi suplimentare deschise. Ofițeri PF acoperă mașini și autocare. Inspectorii vamali adaugă o echipă secundară. Timpul mediu de procesare poate crește.', FR: '⚡ MODE POINTE: Tous les postes doublés. Voies supplémentaires ouvertes. Agents PF couvrent voitures et autocars. Inspecteurs douaniers ajoutent une équipe de contrôle secondaire. Temps de traitement moyen peut augmenter.', RU: '⚡ ПИКОВЫЙ РЕЖИМ: Все посты удвоены. Открыты дополнительные полосы. Офицеры ПФ охватывают автомобили и автобусы. Таможенные инспекторы добавляют вторичную команду. Среднее время обработки может увеличиться.' }[lang]
          ) : (
            { EN: '🚨 RISK MODE: Multi-line deployment. First line: ID & document check. Second line: full biometric + secondary inspection. Intelligence officer embedded at each post. All trucks to mandatory X-ray scan.', RO: '🚨 MOD RISC: Desfășurare pe mai multe linii. Linia 1: verificare ID & documente. Linia 2: biometrie completă + inspecție secundară. Ofițer informații inclus la fiecare post. Toate camioanele la scanare X-ray obligatorie.', FR: '🚨 MODE RISQUE: Déploiement multi-lignes. Ligne 1: contrôle ID & documents. Ligne 2: biométrie complète + inspection secondaire. Agent du renseignement intégré à chaque poste. Tous les camions en scan X-ray obligatoire.', RU: '🚨 РЕЖИМ УГРОЗЫ: Многоуровневое развёртывание. Линия 1: проверка ID и документов. Линия 2: полная биометрия + вторичный досмотр. Офицер разведки на каждом посту. Все грузовики на обязательном рентгеновском сканировании.' }[lang]
          )}
        </div>
      )}
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: { EN: 'Officers on Duty', RO: 'Ofițeri în Serviciu', FR: 'Agents en Service',      RU: 'Сотрудников на Службе'    }[lang], value: onDuty,                                                    color: 'text-emerald-400' },
          { label: { EN: 'Border Police',    RO: 'Poliție de Frontieră', FR: 'Police des Frontières', RU: 'Пограничная Полиция'      }[lang], value: byType['BORDER_GUARD'] || 0,                              color: 'text-blue-400'    },
          { label: { EN: 'Customs Officers', RO: 'Ofițeri Vamali',       FR: 'Agents Douaniers',      RU: 'Таможенные Инспекторы'    }[lang], value: byType['CUSTOMS'] || 0,                                   color: 'text-emerald-400' },
          { label: { EN: 'Command & Intel',  RO: 'Comandă & Informații', FR: 'Commandement & Rens.',  RU: 'Командование & Разведка'  }[lang], value: (byType['INTELLIGENCE']||0) + (byType['MANAGEMENT']||0), color: 'text-violet-400'  },
        ].map(s => (
          <div key={s.label} className="bg-[#111623] border border-slate-800/60 rounded-xl p-4">
            <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-2xl font-light ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Command Unit */}
      <div className="bg-[#111623] border border-violet-900/30 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-800/60 bg-violet-950/20 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          <span className="text-xs font-bold uppercase tracking-wide text-violet-300">{{ EN: 'Joint Command Unit — DMO & Border Guard · Shift ALPHA', RO: 'Unitate de Comandă Comună — DMO & Unitatea de Gardă · Schimb ALPHA', FR: 'Unité de Commandement Conjoint — DMO & Garde-Frontière · Quart ALPHA', RU: 'Совместное Командование — УПМ & Погранотряд · Смена ALPHA' }[lang]}</span>
        </div>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {commandOfficers.map(o => <OfficerCard key={o.id} o={o} />)}
        </div>
      </div>

      {/* Selected BCP — full officer roster card */}
      <div className="grid grid-cols-1 gap-4">
        {BCPS.filter(bcp => bcp.id === selectedBCP).map(bcp => {
          const bcpOfficers = roster.filter(o => o.bcpId === bcp.id);
          if (bcpOfficers.length === 0) return null;
          const entryOfficers = bcpOfficers.filter(o => o.segment === 'ENTRY');
          const exitOfficers  = bcpOfficers.filter(o => o.segment === 'EXIT');
          const activeCnt = bcpOfficers.filter(o => o.status === 'ON_DUTY').length;
          return (
            <div key={bcp.id} className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
              {/* BCP header */}
              <div className="px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${activeCnt === bcpOfficers.length ? 'bg-emerald-500' : activeCnt > 0 ? 'bg-amber-500' : 'bg-slate-600'}`} />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-100">{bcp.name.split(' (')[0]}</span>
                </div>
                <span className="text-[9px] text-slate-500">{activeCnt}/{bcpOfficers.length} {{ EN: 'on duty', RO: 'în serviciu', FR: 'en service', RU: 'на службе' }[lang]}</span>
              </div>
              {/* Entry / Exit columns */}
              <div className="grid grid-cols-2 divide-x divide-slate-800/50">
                {/* ENTRY */}
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500">{{ EN: 'Entry', RO: 'Intrare', FR: 'Entrée', RU: 'Въезд' }[lang]}</span>
                    <span className="text-[8px] text-slate-600 ml-auto">{entryOfficers.length} {{ EN: 'officers', RO: 'ofițeri', FR: 'agents', RU: 'офицеров' }[lang]}</span>
                  </div>
                  <div className="space-y-1.5">
                    {entryOfficers.length === 0
                      ? <div className="text-[9px] text-slate-700 italic py-1">{{ EN: 'No officers assigned', RO: 'Niciun ofițer repartizat', FR: 'Aucun agent affecté', RU: 'Нет назначенных сотрудников' }[lang]}</div>
                      : entryOfficers.map(o => <OfficerCard key={o.id} o={o} />)
                    }
                  </div>
                </div>
                {/* EXIT */}
                <div className="p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">{{ EN: 'Exit', RO: 'Ieșire', FR: 'Sortie', RU: 'Выезд' }[lang]}</span>
                    <span className="text-[8px] text-slate-600 ml-auto">{exitOfficers.length} {{ EN: 'officers', RO: 'ofițeri', FR: 'agents', RU: 'офицеров' }[lang]}</span>
                  </div>
                  <div className="space-y-1.5">
                    {exitOfficers.length === 0
                      ? <div className="text-[9px] text-slate-700 italic py-1">{{ EN: 'No officers assigned', RO: 'Niciun ofițer repartizat', FR: 'Aucun agent affecté', RU: 'Нет назначенных сотрудников' }[lang]}</div>
                      : exitOfficers.map(o => <OfficerCard key={o.id} o={o} />)
                    }
                  </div>
                </div>
              </div>
              {/* Staffing schema — BCP-specific per BCP_STAFFING_PROFILE */}
              <div className="px-4 py-2.5 border-t border-slate-800/40 bg-slate-900/20">
                {(() => {
                  const sp = BCP_STAFFING_PROFILE[bcp.id] ?? DEFAULT_STAFFING;
                  const mult = scenario === 'PEAK' ? 2 : 1;
                  const bpTotal = (sp.bp.entryCars + sp.bp.entryTrucks + sp.bp.exitCars + sp.bp.exitTrucks) * mult;
                  const csTotal = (sp.cs.entryCars + sp.cs.entryTrucks + sp.cs.exitCars + sp.cs.exitTrucks) * mult;
                  const slotLabel = (n: number) => n === 0 ? <span className="text-slate-700">—</span> : <span className="font-bold">{n * mult}</span>;
                  return (
                    <>
                      <div className="text-[8px] text-slate-600 uppercase font-bold mb-2 flex items-center gap-2">
                        <span>{{ EN: 'Staffing Schema', RO: 'Schema Efectivelor', FR: 'Schéma des Effectifs', RU: 'Схема Личного Состава' }[lang]}</span>
                        <span className="text-slate-700">·</span>
                        <span className="text-blue-500/60">BP: {bpTotal}</span>
                        <span className="text-slate-700">·</span>
                        <span className="text-emerald-500/60">CS: {csTotal}</span>
                      </div>
                      {/* 4-column balanced grid */}
                      <div className="grid grid-cols-4 gap-1.5 text-[7px] mb-2">
                        {([
                          { dir: "Entry", icon: "→", cars: sp.bp.entryCars, trucks: sp.bp.entryTrucks, color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/15", label: "BP" },
                          { dir: "Entry", icon: "→", cars: sp.cs.entryCars, trucks: sp.cs.entryTrucks, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/15", label: "CS" },
                          { dir: "Exit",  icon: "←", cars: sp.bp.exitCars,  trucks: sp.bp.exitTrucks,  color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/15", label: "BP" },
                          { dir: "Exit",  icon: "←", cars: sp.cs.exitCars,  trucks: sp.cs.exitTrucks,  color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/15", label: "CS" },
                        ] as const).map((slot) => (
                          <div key={slot.label+slot.dir} className={`rounded p-1.5 border ${slot.bg} ${slot.border}`}>
                            <div className={`font-bold uppercase mb-1 flex items-center gap-1 ${slot.color}`}>
                              <span className="text-slate-600">{slot.icon}</span>
                              <span>{slot.dir}</span>
                              <span className="ml-auto">{slot.label}</span>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400"><span>🚗</span>{slotLabel(slot.cars)}</div>
                            <div className="flex items-center gap-1 text-slate-500"><span>🚛</span>{slotLabel(slot.trucks)}</div>
                          </div>
                        ))}
                      </div>
                      {scenario === 'RISK' && (
                        <div className="mt-1 bg-red-500/5 rounded p-1.5 border border-red-500/20 text-[8px] text-red-300">
                          🚨 {{ EN: 'Risk Protocol: Line 1 BP (ID+Doc) · Line 2 CS (Bio+Cargo) · INT embedded', RO: 'Protocol Risc: Linia 1 PF (ID+Doc) · Linia 2 CS (Bio+Marfă) · INT integrat', FR: 'Protocole Risque: Ligne 1 PF (ID+Doc) · Ligne 2 CS (Bio+Cargo) · INT intégré', RU: 'Протокол Угрозы: Линия 1 ПФ (ID+Документы) · Линия 2 CS (Био+Груз) · INT на месте' }[lang]}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Network Staffing Overview — all BCPs comparison */}
      <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30 flex items-center justify-between">
          <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Network Staffing Overview', RO: 'Sumar Efectiv — Rețea BCP', FR: 'Effectifs Réseau BCP', RU: 'Личный Состав — Сеть КПП' }[lang]}</h3>
          <span className="text-[9px] text-slate-500">{BCPS.length} {{ EN: 'checkpoints', RO: 'puncte de trecere', FR: 'points de passage', RU: 'КПП' }[lang]}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="text-[10px] uppercase text-slate-500 border-b border-slate-800 bg-slate-900/50">
              <th className="p-3">{{ EN: 'Checkpoint', RO: 'Punct de Trecere', FR: 'Point de Passage', RU: 'КПП' }[lang]}</th>
              <th className="p-3 text-right">{{ EN: 'Total', RO: 'Total', FR: 'Total', RU: 'Всего' }[lang]}</th>
              <th className="p-3 text-right">{{ EN: 'On Duty', RO: 'Serviciu', FR: 'Service', RU: 'На Службе' }[lang]}</th>
              <th className="p-3 text-right">BP</th>
              <th className="p-3 text-right">CS</th>
              <th className="p-3 text-right">{{ EN: 'Status', RO: 'Stare', FR: 'État', RU: 'Состояние' }[lang]}</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-800/50">
              {BCPS.map(b => {
                const offs   = roster.filter(o => o.bcpId === b.id);
                if (offs.length === 0) return null;
                const active = offs.filter(o => o.status === 'ON_DUTY').length;
                const bp     = offs.filter(o => o.type === 'BORDER_GUARD').length;
                const cs     = offs.filter(o => o.type === 'CUSTOMS').length;
                const isSel  = b.id === selectedBCP;
                return (
                  <tr key={b.id} className={`text-xs transition-colors ${isSel ? 'bg-blue-500/5 border-l-2 border-l-blue-500' : 'hover:bg-slate-800/20'}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {isSel && <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse shrink-0" />}
                        <span className={`font-medium ${isSel ? 'text-blue-300' : 'text-slate-300'}`}>{b.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-right font-mono text-slate-400">{offs.length}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">{active}</td>
                    <td className="p-3 text-right font-mono text-blue-400">{bp}</td>
                    <td className="p-3 text-right font-mono text-emerald-400">{cs}</td>
                    <td className="p-3 text-right">
                      <div className={`w-2 h-2 rounded-full ml-auto ${active === offs.length ? 'bg-emerald-500' : active > 0 ? 'bg-amber-500' : 'bg-slate-600'}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Partner Institutions */}
      <div className="bg-[#111623] border border-slate-800/60 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/30">
          <h3 className="text-slate-100 font-medium text-sm uppercase tracking-wide">{{ EN: 'Partner Institutions', RO: 'Instituții Partenere', FR: 'Institutions Partenaires', RU: 'Партнёрские Учреждения' }[lang]}</h3>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {INSTITUTIONS.map(inst => {
            const t = institutionLabel[inst.id];
            return (
              <div key={inst.id} className={`rounded-lg p-3 border ${inst.cls}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-black">{inst.acronym}</span>
                </div>
                <div className="text-xs font-semibold text-slate-200 mb-1">{t?.name ?? inst.name}</div>
                <div className="text-[10px] text-slate-400 leading-tight mb-2">{t?.role ?? inst.role}</div>
                <div className="text-[9px] font-mono text-slate-600">{inst.contact}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Login Screen ─────────────────────────────────────────────────────────────
// React.memo prevents re-renders triggered by App's simulation intervals.
// Uncontrolled refs (defaultValue + ref) let the browser own input DOM values
// so React reconciliation can never reset what the user typed mid-keystroke.
const LoginScreen = React.memo(function LoginScreen({ onLogin, lang, onLangChange }: {
  onLogin: (o: LoggedOfficer) => void;
  lang: Language;
  onLangChange: (l: Language) => void;
}) {
  // ── Step 1: form refs (uncontrolled — immune to any re-renders) ──────────────
  const nameRef    = useRef<HTMLInputElement>(null);
  const surnameRef = useRef<HTMLInputElement>(null);
  const badgeRef   = useRef<HTMLInputElement>(null);
  const phoneRef   = useRef<HTMLInputElement>(null);
  const pwdRef     = useRef<HTMLInputElement>(null);
  const otpRef     = useRef<HTMLInputElement>(null);

  // ── Step 1 controlled state (drives render: institution → rank list) ─────────
  const [institution, setInstitution] = useState<LoggedOfficer['institution']>('BORDER_POLICE');
  const [rank,    setRank]    = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // ── Auth method: phone OTP or direct password ────────────────────────────────
  const [authMethod, setAuthMethod] = useState<'phone' | 'password'>('phone');

  // ── Two-step state ───────────────────────────────────────────────────────────
  type Step = 'form' | 'otp';
  const [step,      setStep]     = useState<Step>('form');
  const [sentPhone, setSentPhone] = useState('');
  const [pendingOfficer, setPendingOfficer] = useState<LoggedOfficer | null>(null);
  const [demoCode,  setDemoCode]  = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const recaptchaRef    = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  // Initialise invisible reCAPTCHA once Firebase is configured
  useEffect(() => {
    if (!_fbAuth) return;
    recaptchaRef.current = new RecaptchaVerifier(_fbAuth, 'recaptcha-container', { size: 'invisible' });
    return () => { recaptchaRef.current?.clear(); recaptchaRef.current = null; };
  }, []);

  // ── Shared UI state ──────────────────────────────────────────────────────────
  const [error,    setError]   = useState('');
  const [loading,  setLoading] = useState(false);

  // ── OTP countdown (300 s = 5 min) ────────────────────────────────────────────
  const [countdown,  setCountdown]  = useState(300);
  const [resendLeft, setResendLeft] = useState(60);  // 60 s before resend allowed
  useEffect(() => {
    if (step !== 'otp') return;
    const t = setInterval(() => {
      setCountdown(s => Math.max(0, s - 1));
      setResendLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const L        = LOGIN_L[lang];
  const rankList = institution === 'BORDER_POLICE' ? BP_RANKS : CS_RANKS;

  const fmtSecs = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  // ── Password-only login ───────────────────────────────────────────────────────
  const loginWithPassword = () => {
    const name    = nameRef.current?.value.trim()    ?? '';
    const surname = surnameRef.current?.value.trim() ?? '';
    const badge   = badgeRef.current?.value.trim()   ?? '';
    const pwd     = pwdRef.current?.value.trim()     ?? '';
    if (!name || !surname || !badge || !rank) { setError(L.errorFields); return; }
    if (!pwd || pwd !== SYSTEM_PASSWORD) { setError(L.errorPwd); return; }
    setError('');
    onLogin({ name, surname, badge, institution, rank });
  };

  // ── Phone validation: Romanian (+407XXXXXXXX) or Moldovan (+373XXXXXXXX) ─────
  const normalisePhone = (p: string) => { const s = p.replace(/\s/g,''); return s.startsWith('+') ? s : `+${s}`; };
  const isValidPhone = (p: string) => /^\+407\d{8}$|^\+373\d{8}$/.test(normalisePhone(p));

  const activateDemoMode = (phone: string, officer: LoggedOfficer) => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setDemoCode(code); setIsDemoMode(true);
    setPendingOfficer(officer); setSentPhone(phone);
    setCountdown(300); setResendLeft(60); setStep('otp');
  };

  const sendOtp = async () => {
    const name    = nameRef.current?.value.trim()    ?? '';
    const surname = surnameRef.current?.value.trim() ?? '';
    const badge   = badgeRef.current?.value.trim()   ?? '';
    const phone   = phoneRef.current?.value.trim()   ?? '';
    if (!name || !surname || !badge || !rank || !phone) { setError(L.error); return; }
    if (!isValidPhone(phone)) {
      setError({ EN: 'Enter a valid Romanian (+407XXXXXXXX) or Moldovan (+373XXXXXXXX) mobile number.', RO: 'Introduceți un număr mobil român (+407XXXXXXXX) sau moldovean (+373XXXXXXXX) valid.', FR: 'Entrez un numéro mobile roumain (+407XXXXXXXX) ou moldave (+373XXXXXXXX) valide.', RU: 'Введите действительный румынский (+407XXXXXXXX) или молдавский (+373XXXXXXXX) мобильный номер.' }[lang]);
      return;
    }
    const normPhone = normalisePhone(phone);
    const officer = { name, surname, badge, institution, rank };
    setLoading(true); setError('');
    // ── Firebase path (real SMS to any number) ───────────────────────────────────
    if (_fbAuth && recaptchaRef.current) {
      try {
        confirmationRef.current = await signInWithPhoneNumber(_fbAuth, normPhone, recaptchaRef.current);
        setIsDemoMode(false); setDemoCode('');
        setPendingOfficer(officer); setSentPhone(normPhone);
        setCountdown(300); setResendLeft(60); setStep('otp');
      } catch (err: any) {
        setError({ EN: `Could not send SMS: ${err.message ?? 'try again'}.`, RO: `Eroare SMS: ${err.message ?? 'reîncercați'}.`, FR: `Erreur SMS: ${err.message ?? 'réessayez'}.`, RU: `Ошибка SMS: ${err.message ?? 'попробуйте снова'}.` }[lang]);
      } finally { setLoading(false); }
      return;
    }
    // ── Demo fallback (Firebase not yet configured) ───────────────────────────────
    activateDemoMode(normPhone, officer);
    setLoading(false);
  };

  const verifyOtp = async () => {
    const code = otpRef.current?.value.trim() ?? '';
    if (code.length !== 6) { setError('Enter the 6-digit code.'); return; }
    if (isDemoMode) {
      if (code !== demoCode) { setError({ EN: 'Invalid code. Check the code shown below.', RO: 'Cod invalid. Verificați codul afișat mai jos.', FR: 'Code invalide. Vérifiez le code affiché ci-dessous.', RU: 'Неверный код. Проверьте код ниже.' }[lang]); return; }
      onLogin(pendingOfficer!); return;
    }
    if (!confirmationRef.current) { setError('Session expired — go back and resend.'); return; }
    setLoading(true); setError('');
    try {
      await confirmationRef.current.confirm(code);
      onLogin(pendingOfficer!);
    } catch {
      setError({ EN: 'Invalid code. Check your SMS and try again.', RO: 'Cod invalid. Verificați SMS-ul și reîncercați.', FR: 'Code invalide. Vérifiez votre SMS et réessayez.', RU: 'Неверный код. Проверьте SMS и повторите попытку.' }[lang]);
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    if (resendLeft > 0) return;
    if (isDemoMode) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setDemoCode(code); setCountdown(300); setResendLeft(60);
      if (otpRef.current) otpRef.current.value = '';
      return;
    }
    if (_fbAuth && recaptchaRef.current) {
      setLoading(true);
      try {
        confirmationRef.current = await signInWithPhoneNumber(_fbAuth, sentPhone, recaptchaRef.current);
        setCountdown(300); setResendLeft(60);
        if (otpRef.current) otpRef.current.value = '';
      } catch { /* silent */ } finally { setLoading(false); }
    }
  };

  const inputCls = 'w-full bg-[#0D1219] border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 placeholder-slate-700';
  const labelCls = 'text-[9px] font-bold uppercase tracking-widest text-slate-500 block mb-1';

  return (
    /* Outer: fixed full-screen, scrollable so the card is always reachable on short viewports */
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#06080F]">
      {/* Invisible reCAPTCHA container required by Firebase Phone Auth */}
      <div id="recaptcha-container" />
      {/* Subtle grid background — pointer-events-none so it never intercepts clicks */}
      <div className="fixed inset-0 opacity-[0.025] pointer-events-none" style={{ backgroundImage: 'linear-gradient(#334155 1px,transparent 1px),linear-gradient(90deg,#334155 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
      {/* Centering wrapper — min-h-full + py-8 keeps card centered on tall screens, scrollable on short ones */}
      <div className="flex min-h-full items-center justify-center py-8 px-4">
      {/* Login card — relative so the language selector inside can be absolutely positioned */}
      <div className="relative w-full max-w-md bg-[#0B0F17] border border-slate-800 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden">
        {/* Language selector — top-right corner of the card */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
          {(Object.keys(LANG_NAMES) as Language[]).map(l => (
            <button key={l} onClick={() => onLangChange(l)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all border ${lang === l ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'border-transparent text-slate-600 hover:text-slate-400'}`}>
              {l}
            </button>
          ))}
        </div>
        {/* Card header */}
        <div className="px-8 py-6 bg-gradient-to-b from-slate-900/60 to-transparent border-b border-slate-800/60 text-center">
          {/* Both institution emblems */}
          <div className="flex items-end justify-center gap-6 mb-4">
            <div className="flex flex-col items-center gap-1">
              <img src={`${import.meta.env.BASE_URL}logo-border-police.png`} alt="Poliția de Frontieră"
                className="h-16 w-auto object-contain drop-shadow-lg" />
              <span className="text-[8px] font-bold text-blue-400/80 leading-none">Poliția de Frontieră</span>
              <span className="text-[7px] text-slate-600 leading-none">a Republicii Moldova</span>
            </div>
            <div className="w-px h-12 bg-slate-700/40 shrink-0 mb-3" />
            <div className="flex flex-col items-center gap-1">
              <img src={`${import.meta.env.BASE_URL}logo-customs-service.png`} alt="Serviciul Vamal"
                className="h-16 w-auto object-contain drop-shadow-lg" />
              <span className="text-[8px] font-bold text-orange-400/80 leading-none">Serviciul Vamal</span>
              <span className="text-[7px] text-slate-600 leading-none">al Republicii Moldova</span>
            </div>
          </div>
          <div className="text-[9px] font-bold uppercase tracking-[0.3em] text-rose-500/80 mb-1.5">{L.classif}</div>
          <h1 className="text-base font-black text-slate-100 uppercase tracking-wide leading-tight">{L.title}</h1>
          <p className="text-[10px] text-slate-500 mt-1.5 tracking-wide">{L.subtitle}</p>
        </div>
        {/* ── STEP 1: Credentials form ─────────────────────────────────────── */}
        {step === 'form' && (
        <div className="px-8 py-6 space-y-4">
          {/* Auth method toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-900/60 rounded-xl border border-slate-800">
            {(['phone', 'password'] as const).map(m => (
              <button key={m} type="button"
                onClick={() => { setAuthMethod(m); setError(''); }}
                className={`py-2 rounded-lg text-[11px] font-bold tracking-wide transition-all ${authMethod === m ? 'bg-blue-600/20 border border-blue-500/40 text-blue-300 shadow' : 'text-slate-500 hover:text-slate-400 border border-transparent'}`}>
                {m === 'phone' ? L.methodPhone : L.methodPassword}
              </button>
            ))}
          </div>
          {/* Name + Surname */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{L.name}</label>
              <input ref={nameRef} type="text" defaultValue=""
                onKeyDown={e => e.key === 'Enter' && (authMethod === 'phone' ? sendOtp() : loginWithPassword())}
                className={inputCls} placeholder="—" autoComplete="off" />
            </div>
            <div>
              <label className={labelCls}>{L.surname}</label>
              <input ref={surnameRef} type="text" defaultValue=""
                onKeyDown={e => e.key === 'Enter' && (authMethod === 'phone' ? sendOtp() : loginWithPassword())}
                className={inputCls} placeholder="—" autoComplete="off" />
            </div>
          </div>
          {/* Badge */}
          <div>
            <label className={labelCls}>{L.badge}</label>
            <input ref={badgeRef} type="text" defaultValue=""
              onKeyDown={e => e.key === 'Enter' && (authMethod === 'phone' ? sendOtp() : loginWithPassword())}
              className={`${inputCls} font-mono uppercase`} placeholder="BP-0000 / CS-0000" autoComplete="off" />
          </div>
          {/* Institution */}
          <div>
            <label className={labelCls}>{L.institution}</label>
            <div className="grid grid-cols-2 gap-2">
              {(['BORDER_POLICE', 'CUSTOMS_SERVICE'] as const).map(inst => (
                <button key={inst} type="button" onClick={() => { setInstitution(inst); setRank(''); setError(''); }}
                  className={`px-3 py-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all leading-tight text-center ${institution === inst ? (inst === 'BORDER_POLICE' ? 'bg-blue-500/10 border-blue-500/40 text-blue-300' : 'bg-orange-500/10 border-orange-500/40 text-orange-300') : 'border-slate-800 text-slate-600 hover:border-slate-700 hover:text-slate-500'}`}>
                  {inst === 'BORDER_POLICE' ? L.bp : L.cs}
                </button>
              ))}
            </div>
          </div>
          {/* Rank */}
          <div>
            <label className={labelCls}>{L.rank}</label>
            <select value={rank} onChange={e => { setRank(e.target.value); setError(''); }} className={`${inputCls} cursor-pointer`}>
              <option value="" className="bg-slate-900 text-slate-500">{L.selectRank}</option>
              {institution === 'BORDER_POLICE' ? (
                <>
                  <optgroup label={{ EN: '— Non-Commissioned Officers —', RO: '— Corp Subofițeri —', FR: '— Sous-Officiers —', RU: '— Сержантский состав —' }[lang]}>
                    {BP_RANKS.slice(0, 6).map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                  </optgroup>
                  <optgroup label={{ EN: '— Officer Corps —', RO: '— Corp Ofițeri —', FR: '— Corps des Officiers —', RU: '— Офицерский состав —' }[lang]}>
                    {BP_RANKS.slice(6).map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                  </optgroup>
                </>
              ) : (
                <>
                  <optgroup label={{ EN: '— NCO Grades —', RO: '— Grade Subofițeri —', FR: '— Grades Sous-Off. —', RU: '— Сержантские звания —' }[lang]}>
                    {CS_RANKS.slice(0, 6).map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                  </optgroup>
                  <optgroup label={{ EN: '— Officer Grades —', RO: '— Grade Ofițeri —', FR: '— Grades Officiers —', RU: '— Офицерские звания —' }[lang]}>
                    {CS_RANKS.slice(6).map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                  </optgroup>
                </>
              )}
            </select>
          </div>
          {/* Phone — shown only when phone method is selected */}
          {authMethod === 'phone' && (
          <div>
            <label className={labelCls}>{L.phone}</label>
            <input ref={phoneRef} type="tel" defaultValue="+373"
              onKeyDown={e => e.key === 'Enter' && sendOtp()}
              className={`${inputCls} font-mono`} placeholder="+373XXXXXXXX / +407XXXXXXXX" autoComplete="tel" />
          </div>
          )}
          {/* Password — only for the direct-password tab */}
          {authMethod === 'password' && <div>
            <label className={labelCls}>{L.password}</label>
            <div className="relative">
              <input ref={pwdRef} type={showPwd ? 'text' : 'password'} defaultValue=""
                onKeyDown={e => e.key === 'Enter' && loginWithPassword()}
                className={`${inputCls} pr-10 font-mono tracking-widest`} placeholder="••••••••" autoComplete="new-password" />
              <button onClick={() => setShowPwd(s => !s)} type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 p-0.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {showPwd
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
            </div>
          </div>}
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/50 border border-red-800/60">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <span className="text-[10px] font-medium text-red-400">{error}</span>
            </div>
          )}
          {/* Submit — label + action change based on method */}
          {authMethod === 'phone' ? (
            <button onClick={sendOtp} disabled={loading} type="button"
              className="w-full py-3 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-300 font-black text-sm uppercase tracking-[0.2em] hover:bg-blue-600/30 hover:border-blue-400/60 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-wait">
              {loading ? L.sending : L.sendCode}
            </button>
          ) : (
            <button onClick={loginWithPassword} disabled={loading} type="button"
              className="w-full py-3 rounded-xl bg-slate-600/20 border border-slate-500/40 text-slate-300 font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-600/30 hover:border-slate-400/60 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
              {L.submit}
            </button>
          )}
        </div>
        )}

        {/* ── STEP 2: OTP verification ─────────────────────────────────────── */}
        {step === 'otp' && (
        <div className="px-8 py-6 space-y-5">
          {/* Mode banner */}
          {isDemoMode ? (
            <div className="rounded-xl border border-amber-600/40 bg-amber-950/30 overflow-hidden">
              {/* header */}
              <div className="flex items-center justify-between px-4 py-2 bg-amber-900/30 border-b border-amber-700/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                    {{ EN: 'Demo Mode — No SMS sent', RO: 'Mod Demo — SMS netrimis', FR: 'Mode Démo — SMS non envoyé', RU: 'Демо-режим — SMS не отправлен' }[lang]}
                  </span>
                </div>
                <span className="text-[8px] text-amber-700 font-mono">{sentPhone}</span>
              </div>
              {/* SMS bubble */}
              <div className="px-4 py-3 space-y-2">
                <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-1">
                  {{ EN: 'Simulated SMS message:', RO: 'Mesaj SMS simulat:', FR: 'Message SMS simulé :', RU: 'Смоделированное SMS:' }[lang]}
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-700/60 border border-slate-600/40 px-4 py-3">
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {{ EN: 'BP·CS Joint Console — your access code is:', RO: 'BP·CS Console — codul dvs. de acces este:', FR: 'BP·CS Console — votre code d\'accès est :', RU: 'BP·CS Консоль — ваш код доступа:' }[lang]}
                    </p>
                    <p className="font-mono text-3xl font-black tracking-[0.35em] text-amber-300 mt-1 text-center">{demoCode}</p>
                    <p className="text-[9px] text-slate-500 mt-1">
                      {{ EN: 'Valid 5 min. Do not share.', RO: 'Valabil 5 min. Nu distribuiți.', FR: 'Valable 5 min. Ne pas partager.', RU: 'Действителен 5 мин. Не сообщайте никому.' }[lang]}
                    </p>
                  </div>
                </div>
                <p className="text-[8px] text-slate-600 text-center pt-1">
                  {{ EN: 'Enter the code above into the field below', RO: 'Introduceți codul de mai sus în câmpul de mai jos', FR: 'Saisissez le code ci-dessus dans le champ ci-dessous', RU: 'Введите код выше в поле ниже' }[lang]}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-950/40 border border-emerald-800/50">
              <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3h1.5" />
              </svg>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">{L.otpSentTo}</div>
                <div className="text-sm font-bold text-emerald-300 font-mono">{sentPhone}</div>
              </div>
            </div>
          )}
          {/* Countdown */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500 uppercase tracking-wider">{L.otpExpires}</span>
            <span className={`font-mono font-bold ${countdown < 60 ? 'text-red-400' : 'text-slate-300'}`}>{fmtSecs(countdown)}</span>
          </div>
          {/* Code input */}
          <div>
            <label className={labelCls}>{L.otpCode}</label>
            <input ref={otpRef} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              defaultValue=""
              onKeyDown={e => e.key === 'Enter' && verifyOtp()}
              className={`${inputCls} font-mono text-center text-2xl tracking-[0.5em] py-3`}
              placeholder="——————" autoComplete="one-time-code" />
          </div>
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-950/50 border border-red-800/60">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse" />
              <span className="text-[10px] font-medium text-red-400">{error}</span>
            </div>
          )}
          {/* Verify button */}
          <button onClick={verifyOtp} disabled={loading || countdown === 0}
            className="w-full py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-black text-sm uppercase tracking-[0.15em] hover:bg-emerald-600/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-wait">
            {loading ? '…' : L.otpVerify}
          </button>
          {/* Resend + back row */}
          <div className="flex items-center justify-between text-[10px]">
            <button onClick={() => { setStep('form'); setError(''); }} className="text-slate-600 hover:text-slate-400 transition-colors">
              {L.otpBack}
            </button>
            <button onClick={resendOtp} disabled={resendLeft > 0 || loading}
              className="text-slate-600 hover:text-blue-400 disabled:opacity-40 disabled:cursor-default transition-colors">
              {resendLeft > 0 ? `${L.otpResendIn} ${resendLeft}s` : L.otpResend}
            </button>
          </div>
        </div>
        )}
      </div>
      </div>
    </div>
  );
});

// ─── Exhibition Welcome Overlay ──────────────────────────────────────────────
const ExhibitionWelcome: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080F]/95 backdrop-blur-sm cursor-pointer"
    onClick={onDismiss}
  >
    <div className="max-w-2xl w-full mx-6 text-center space-y-8 select-none">
      {/* Official emblems — both institutions */}
      <div className="flex items-end justify-center gap-12 sm:gap-20">
        <div className="flex flex-col items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}logo-border-police.png`} alt="Poliția de Frontieră a Republicii Moldova"
            className="h-28 sm:h-36 w-auto object-contain drop-shadow-2xl" />
          <div className="text-center leading-tight">
            <div className="text-sm font-bold text-slate-200">Poliția de Frontieră</div>
            <div className="text-xs text-slate-400">a Republicii Moldova</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}logo-customs-service.png`} alt="Serviciul Vamal al Republicii Moldova"
            className="h-28 sm:h-36 w-auto object-contain drop-shadow-2xl" />
          <div className="text-center leading-tight">
            <div className="text-sm font-bold text-blue-300">Serviciul Vamal</div>
            <div className="text-xs text-slate-400">al Republicii Moldova</div>
          </div>
        </div>
      </div>
      {/* Title */}
      <div className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-slate-600">Live Governance Operations Experience</div>
        <h1 className="text-4xl font-black text-slate-100 tracking-tight leading-tight">
          Poliția de Frontieră &amp; Serviciul Vamal<br />
          <span className="text-rose-400">Consola Operațională Comună</span>
        </h1>
      </div>
      {/* Scenario brief */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl px-8 py-6 text-left space-y-4 max-w-xl mx-auto">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Situația Operativă — 20.05.2026</div>
        <p className="text-sm text-slate-300 leading-relaxed">
          Rețeaua funcționează la intensitate ridicată. Astăzi: <strong className="text-slate-100">11.738 mijloace de transport</strong> și <strong className="text-slate-100">53.861 persoane</strong> procesate la nivel național. BQS activ la toate PTF-urile. Preluați comanda — fiecare decizie se reflectă în timp real.
        </p>
        {/* 24h stats strip */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-950/30 border border-blue-900/40 rounded-xl p-3 space-y-2">
            <div className="text-[8px] font-bold text-blue-400 uppercase tracking-widest">Poliția de Frontieră · 24h</div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div><div className="text-xl font-light text-slate-100">11.738</div><div className="text-[7px] text-slate-600 uppercase">Mijloace transport</div></div>
              <div><div className="text-xl font-light text-slate-100">53.861</div><div className="text-[7px] text-slate-600 uppercase">Persoane</div></div>
              <div><div className="text-lg font-light text-amber-400">28</div><div className="text-[7px] text-slate-600 uppercase">Încălcări</div></div>
              <div><div className="text-lg font-light text-red-400">10</div><div className="text-[7px] text-slate-600 uppercase">Inadmisi</div></div>
            </div>
          </div>
          <div className="bg-orange-950/20 border border-orange-900/30 rounded-xl p-3 space-y-2">
            <div className="text-[8px] font-bold text-orange-400 uppercase tracking-widest">Serviciul Vamal · 24h</div>
            <div className="grid grid-cols-2 gap-1.5 text-center">
              <div><div className="text-xl font-light text-slate-100">2.111</div><div className="text-[7px] text-slate-600 uppercase">Camioane</div></div>
              <div><div className="text-xl font-light text-slate-100">7.878</div><div className="text-[7px] text-slate-600 uppercase">Autoturisme</div></div>
              <div><div className="text-lg font-light text-slate-300">470</div><div className="text-[7px] text-slate-600 uppercase">Autobuze</div></div>
              <div><div className="text-lg font-light text-amber-400">26</div><div className="text-[7px] text-slate-600 uppercase">Încălcări vamale</div></div>
            </div>
          </div>
        </div>
        {/* Unit identities */}
        <div className="space-y-2 pt-1 border-t border-slate-800">
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
            <div>
              <span className="text-[11px] font-bold text-blue-300">Direcția Management Operațional</span>
              <span className="text-[10px] text-slate-600"> · str. Petricani 19, Chișinău</span>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Organizează, coordonează și monitorizează dispozitivele de patrulare și intervenție,
                gestionând în timp real situația operativă la frontieră.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0 mt-1.5" />
            <div>
              <span className="text-[11px] font-bold text-orange-300">Unitatea de Gardă</span>
              <span className="text-[10px] text-slate-600"> · str. N. Starostenco 30, Chișinău</span>
              <p className="text-[10px] text-slate-500 leading-snug mt-0.5">
                Serviciu operativ non-stop — monitorizarea permanentă a situației operative,
                recepționarea incidentelor, alertelor și informațiilor de urgență apărute
                în zona de competență a biroului vamal. Intervenție și raportare rapidă.
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Joint identity badge */}
      <div className="flex justify-center">
        <div className="flex items-center gap-3 px-5 py-2.5 rounded-xl border border-slate-700/50 bg-slate-900/50">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">DMO</span>
          </div>
          <span className="text-slate-700 text-sm font-light">·</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">Unitatea de Gardă</span>
          </div>
          <span className="text-slate-700 text-sm font-light">·</span>
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Joint Operational Command</span>
        </div>
      </div>
      {/* CTA */}
      <div className="space-y-2">
        <div className="text-base font-semibold text-slate-300">Press anywhere to begin</div>
        <div className="flex justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-rose-500/60 flex items-center justify-center animate-pulse">
            <div className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─── Operational Status Banner ───────────────────────────────────────────────
const OpsStatusBanner: React.FC<{
  status: OperationalStatus;
  queueLen: number;
  avgWait: number;
  highRiskCount: number;
  incidentCount: number;
  stressIndex: number | null;
  lang: Language;
}> = ({ status, queueLen, avgWait, highRiskCount, incidentCount, stressIndex, lang }) => {
  const cfg: Record<OperationalStatus, { bar: string; dot: string; text: string; ring: string }> = {
    STABLE:     { bar: 'border-emerald-900/50 bg-emerald-950/25', dot: 'bg-emerald-500', text: 'text-emerald-400', ring: '' },
    CONGESTED:  { bar: 'border-amber-800/60 bg-amber-950/30',     dot: 'bg-amber-400',   text: 'text-amber-300',  ring: '' },
    CRITICAL:   { bar: 'border-red-800/70 bg-red-950/40',         dot: 'bg-red-500',     text: 'text-red-400',    ring: '' },
    ESCALATION: { bar: 'border-red-600/90 bg-red-950/60',         dot: 'bg-red-400',     text: 'text-red-200',    ring: 'shadow-[0_0_24px_rgba(239,68,68,0.25)]' },
  };
  const c = cfg[status];
  const metrics = [
    { lbl: 'Queue',      val: `${queueLen}`,               unit: 'veh', hi: queueLen > 12 },
    { lbl: 'Avg Wait',   val: `${Math.round(avgWait)}`,    unit: 's',   hi: avgWait > 90 },
    { lbl: 'High-Risk',  val: `${highRiskCount}`,          unit: '',    hi: highRiskCount > 3 },
    { lbl: 'Incidents',  val: `${incidentCount}`,          unit: '',    hi: incidentCount > 0 },
    ...(stressIndex !== null ? [{ lbl: 'Stress', val: `${stressIndex}`, unit: '%', hi: stressIndex > 60 }] : []),
  ];
  return (
    <div className={`flex items-center gap-5 px-5 py-3 rounded-xl border mb-3 shrink-0 transition-all duration-700 ${c.bar} ${c.ring}`}>
      {/* Status — large, readable from 5 metres */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
          {status === 'ESCALATION' && <div className="absolute w-4 h-4 rounded-full bg-red-500/40 animate-ping" />}
          <div className={`w-2.5 h-2.5 rounded-full relative ${c.dot} ${status === 'CRITICAL' ? 'animate-pulse' : ''}`} />
        </div>
        <span className={`text-xl font-black uppercase tracking-[0.2em] ${c.text}`}>{STATUS_T[lang][status]}</span>
      </div>
      <div className="h-8 w-px bg-slate-700/50 shrink-0" />
      {/* Live metrics */}
      <div className="flex items-center gap-6 flex-1 flex-wrap">
        {metrics.map(m => (
          <div key={m.lbl} className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-slate-600 leading-none mb-0.5">{m.lbl}</span>
            <div className="flex items-baseline gap-0.5">
              <span className={`text-lg font-black font-mono tabular-nums leading-none ${m.hi ? 'text-red-400' : 'text-slate-200'}`}>{m.val}</span>
              {m.unit && <span className={`text-[10px] font-medium ${m.hi ? 'text-red-500/70' : 'text-slate-600'}`}>{m.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      {/* LIVE badge + clock */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-950/60 border border-red-800/60">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-red-400">Live</span>
        </div>
        <div className="h-6 w-px bg-slate-700/50" />
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500">BP·CS JOC</span>
          <span className="text-[9px] font-mono text-slate-700 tabular-nums">{new Date().toLocaleTimeString('en-GB')}</span>
        </div>
      </div>
    </div>
  );
};

// ─── Consequence Ticker ───────────────────────────────────────────────────────
const ConsequenceTicker: React.FC<{ events: ConsequenceEvent[] }> = ({ events }) => {
  if (events.length === 0) return null;
  const latest = events[0];
  const colorMap: Record<ConsequenceEvent['type'], string> = { ACTION: 'text-blue-300', EVENT: 'text-slate-400', ALERT: 'text-amber-300', ESCALATION: 'text-red-300' };
  const dotMap:   Record<ConsequenceEvent['type'], string> = { ACTION: 'bg-blue-500',   EVENT: 'bg-slate-600',   ALERT: 'bg-amber-500',   ESCALATION: 'bg-red-500'   };
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#07090E]/97 border-t border-slate-800/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 px-6 py-1.5">
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600">Command Log</span>
        </div>
        <div className="w-px h-3 bg-slate-800 shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${dotMap[latest.type]}`} />
          <span className={`text-[10px] font-medium truncate ${colorMap[latest.type]}`}>{latest.msg}</span>
          <span className="text-[9px] text-slate-700 shrink-0 ml-2">{new Date(latest.ts).toLocaleTimeString()}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {events.slice(1, 5).map((e, i) => (
            <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${dotMap[e.type]}`} style={{ opacity: 0.5 - i * 0.1 }} />
          ))}
        </div>
        <span className="text-[9px] text-slate-700 shrink-0">{events.length} events</span>
      </div>
    </div>
  );
};



// ─── BQS — Booking Queue System (truck slot management, all BCPs) ─────────────
interface BqsSlot {
  id: string;
  plate: string;
  company: string;
  scheduledTime: string;
  lane: number;
  status: 'SCHEDULED' | 'ARRIVED' | 'PROCESSING' | 'DONE' | 'MISSED' | 'CANCELLED';
  goodsType: string;
  countryCode: string;
}

const BQS_DATA: Record<string, BqsSlot[]> = {
  BCP_LEUSENI: [
    { id:'L01', plate:'B 412 TRR', company:'Trans-Ro Logistics SRL', scheduledTime:'06:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'L02', plate:'GL 33 DFG', company:'AgroExport Moldova',      scheduledTime:'06:30', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'L03', plate:'CJ 07 VNT', company:'VentCargo SRL',           scheduledTime:'07:00', lane:2, status:'DONE',       goodsType:'Piese auto',           countryCode:'RO' },
    { id:'L04', plate:'IS 54 KLM', company:'Moldtrans SA',            scheduledTime:'07:30', lane:1, status:'PROCESSING', goodsType:'Textile',              countryCode:'MD' },
    { id:'L05', plate:'TM 18 AAB', company:'TimTrans SRL',            scheduledTime:'08:00', lane:2, status:'ARRIVED',    goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'L06', plate:'B 991 XYZ', company:'EuroLogis SA',            scheduledTime:'08:30', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'EU' },
    { id:'L07', plate:'SV 22 FRG', company:'NordCargo SRL',           scheduledTime:'09:00', lane:2, status:'SCHEDULED',  goodsType:'Utilaje',              countryCode:'RO' },
    { id:'L08', plate:'NT 45 PLC', company:'PlasCom SA',              scheduledTime:'09:30', lane:1, status:'SCHEDULED',  goodsType:'Plastic ambalaj',      countryCode:'MD' },
    { id:'L09', plate:'MM 67 QRT', company:'Marmara Freight',         scheduledTime:'10:00', lane:2, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'TR' },
    { id:'L10', plate:'B 320 LMN', company:'RoTrans Grup',            scheduledTime:'10:30', lane:1, status:'SCHEDULED',  goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'L11', plate:'CT 88 WEZ', company:'Black Sea Export',        scheduledTime:'11:00', lane:2, status:'SCHEDULED',  goodsType:'Produse lactate',      countryCode:'MD' },
    { id:'L12', plate:'IF 12 RST', company:'Bucur Logistic',          scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Textile',              countryCode:'RO' },
    { id:'L13', plate:'BT 56 DYN', company:'DinamoTrans SRL',         scheduledTime:'12:00', lane:2, status:'MISSED',     goodsType:'Electrocasnice',       countryCode:'UA' },
    { id:'L14', plate:'VL 74 FRT', company:'Fortuna Cargo',           scheduledTime:'12:30', lane:1, status:'SCHEDULED',  goodsType:'Mobilier',             countryCode:'MD' },
    { id:'L15', plate:'OT 39 PLR', company:'Olt Premium Freight',     scheduledTime:'13:00', lane:2, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'L16', plate:'GR 83 CMX', company:'Cargo Max SRL',           scheduledTime:'13:30', lane:1, status:'SCHEDULED',  goodsType:'Produse cosmetice',    countryCode:'MD' },
    { id:'L17', plate:'AB 11 NVX', company:'Nova Express',            scheduledTime:'14:00', lane:2, status:'SCHEDULED',  goodsType:'Echipament IT',        countryCode:'DE' },
    { id:'L18', plate:'DJ 66 TRS', company:'TranSud SA',              scheduledTime:'14:30', lane:1, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'RO' },
  ],
  BCP_SCULENI: [
    { id:'S01', plate:'IA 03 AGR', company:'AgroMoldova SRL',         scheduledTime:'06:00', lane:1, status:'DONE',       goodsType:'Fructe si legume',     countryCode:'MD' },
    { id:'S02', plate:'VS 77 TRM', company:'Vaslui Transport',        scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'RO' },
    { id:'S03', plate:'IS 21 FRT', company:'Iasi Freight SRL',        scheduledTime:'08:00', lane:1, status:'ARRIVED',    goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'S04', plate:'BC 44 LOG', company:'Bacau Logistics',         scheduledTime:'09:00', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'MD' },
    { id:'S05', plate:'B 731 MNP', company:'MNP Cargo',              scheduledTime:'10:00', lane:1, status:'SCHEDULED',  goodsType:'Textile',              countryCode:'TR' },
    { id:'S06', plate:'NT 58 KRG', company:'Neamt Cargo SRL',         scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Mobilier',             countryCode:'RO' },
    { id:'S07', plate:'SV 90 DLT', company:'Delta Trans SRL',         scheduledTime:'12:00', lane:1, status:'MISSED',     goodsType:'Utilaje',              countryCode:'MD' },
    { id:'S08', plate:'VS 14 PRT', company:'PartnerTrans',            scheduledTime:'13:00', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'RO' },
    { id:'S09', plate:'IA 62 BRT', company:'BriTrans SA',             scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Piese auto',           countryCode:'MD' },
    { id:'S10', plate:'GL 19 NRT', company:'NordRo Freight',          scheduledTime:'15:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'RO' },
    { id:'S11', plate:'B 253 VXZ', company:'VX Logistics SRL',        scheduledTime:'16:00', lane:1, status:'SCHEDULED',  goodsType:'Plastic ambalaj',      countryCode:'EU' },
    { id:'S12', plate:'IS 84 CTR', company:'CentroTrans SA',          scheduledTime:'17:00', lane:1, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'RO' },
  ],
  BCP_PALANCA: [
    { id:'P01', plate:'OD 12 SGT', company:'Odessa Grup Trans',       scheduledTime:'06:30', lane:1, status:'DONE',       goodsType:'Materiale constructii', countryCode:'UA' },
    { id:'P02', plate:'XA 77 FRT', company:'MoldExport SRL',          scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'P03', plate:'B 540 CRG', company:'Cargo Sud SRL',           scheduledTime:'07:30', lane:1, status:'PROCESSING', goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'P04', plate:'UA 33 TRK', company:'UkrTrans LLC',            scheduledTime:'08:00', lane:2, status:'ARRIVED',    goodsType:'Metal',                countryCode:'UA' },
    { id:'P05', plate:'OD 55 PLN', company:'Plan-B Freight',          scheduledTime:'08:30', lane:1, status:'SCHEDULED',  goodsType:'Textile',              countryCode:'MD' },
    { id:'P06', plate:'B 190 LGS', company:'LogiSud SA',              scheduledTime:'09:00', lane:2, status:'SCHEDULED',  goodsType:'Electronice',          countryCode:'EU' },
    { id:'P07', plate:'MK 44 DRT', company:'MarkerTrans SRL',         scheduledTime:'09:30', lane:1, status:'SCHEDULED',  goodsType:'Piese auto',           countryCode:'MD' },
    { id:'P08', plate:'XA 18 GRN', company:'Green Cargo UA',          scheduledTime:'10:00', lane:2, status:'SCHEDULED',  goodsType:'Fructe si legume',     countryCode:'UA' },
    { id:'P09', plate:'B 662 MNT', company:'Mont Freight',            scheduledTime:'10:30', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'RO' },
    { id:'P10', plate:'OD 91 XPR', company:'XpressTrans LLC',         scheduledTime:'11:00', lane:2, status:'MISSED',     goodsType:'Bauturi',              countryCode:'UA' },
  ],
  BCP_GIURGIULESTI1: [
    { id:'G1A', plate:'TU 01 DAN', company:'Danube Freight',          scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Produse petroliere',   countryCode:'MD' },
    { id:'G1B', plate:'B 448 RVR', company:'River Logistics',         scheduledTime:'08:00', lane:1, status:'PROCESSING', goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'G1C', plate:'OD 30 PTR', company:'PetroTrans UA',           scheduledTime:'09:00', lane:1, status:'ARRIVED',    goodsType:'Produse chimice',      countryCode:'UA' },
    { id:'G1D', plate:'B 712 DFR', company:'DeltaFreight SRL',        scheduledTime:'10:00', lane:1, status:'SCHEDULED',  goodsType:'Cereale',              countryCode:'RO' },
    { id:'G1E', plate:'GA 56 TRS', company:'GalatiTrans SA',          scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'RO' },
    { id:'G1F', plate:'BR 22 CNT', company:'ContainerSud SRL',        scheduledTime:'12:00', lane:1, status:'SCHEDULED',  goodsType:'Container mixt',       countryCode:'EU' },
    { id:'G1G', plate:'TU 88 SPD', company:'Speed Cargo',             scheduledTime:'13:00', lane:1, status:'MISSED',     goodsType:'Electronice',          countryCode:'MD' },
    { id:'G1H', plate:'B 153 MNF', company:'ManuFrance SRL',          scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Utilaje',              countryCode:'FR' },
  ],
  BCP_GIURGIULESTI2: [
    { id:'G2A', plate:'TU 07 CRG', company:'CargoDelta SRL',          scheduledTime:'07:30', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'G2B', plate:'B 282 TDX', company:'TradexSA',                scheduledTime:'09:00', lane:1, status:'ARRIVED',    goodsType:'Textile',              countryCode:'EU' },
    { id:'G2C', plate:'GA 41 FLX', company:'Flex Cargo',              scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Mobilier',             countryCode:'RO' },
    { id:'G2D', plate:'BR 93 MRN', company:'Marin Trans SRL',         scheduledTime:'13:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'MD' },
    { id:'G2E', plate:'TU 55 BLK', company:'Black Sea Lines',         scheduledTime:'15:00', lane:1, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'UA' },
    { id:'G2F', plate:'B 711 PRM', company:'Premium Freight',         scheduledTime:'17:00', lane:1, status:'CANCELLED',  goodsType:'Produse cosmetice',    countryCode:'FR' },
  ],
  BCP_CAHUL: [
    { id:'C01', plate:'B 334 SDB', company:'Sud-Basarabia Cargo',     scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'C02', plate:'GL 62 AGR', company:'AgroSud SRL',             scheduledTime:'09:00', lane:1, status:'PROCESSING', goodsType:'Fructe si legume',     countryCode:'MD' },
    { id:'C03', plate:'B 519 TRA', company:'Traian Cargo',            scheduledTime:'10:30', lane:1, status:'ARRIVED',    goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'C04', plate:'GA 77 MNT', company:'MontTrans SRL',           scheduledTime:'12:00', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'C05', plate:'B 426 LGT', company:'LogiTrans SA',            scheduledTime:'13:30', lane:1, status:'SCHEDULED',  goodsType:'Utilaje',              countryCode:'EU' },
    { id:'C06', plate:'TU 14 FRT', company:'FreightCahul SRL',        scheduledTime:'15:00', lane:1, status:'SCHEDULED',  goodsType:'Textile',              countryCode:'TR' },
    { id:'C07', plate:'B 788 NGR', company:'NordGreen Cargo',         scheduledTime:'16:30', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'MD' },
  ],
  BCP_COSTESTI: [
    { id:'K01', plate:'B 112 TRS', company:'TransPrim SRL',           scheduledTime:'05:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'K02', plate:'AG 88 CRG', company:'ArgesCargo SA',           scheduledTime:'05:30', lane:2, status:'DONE',       goodsType:'Cereale',              countryCode:'RO' },
    { id:'K03', plate:'B 223 VNX', company:'VanEx SRL',               scheduledTime:'06:00', lane:1, status:'DONE',       goodsType:'Bauturi',              countryCode:'MD' },
    { id:'K04', plate:'PH 47 FRT', company:'PrahTrans SA',            scheduledTime:'06:30', lane:2, status:'DONE',       goodsType:'Textile',              countryCode:'RO' },
    { id:'K05', plate:'B 558 KMX', company:'KomaxTrans',              scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Piese auto',           countryCode:'DE' },
    { id:'K06', plate:'DB 19 LOG', company:'DambLog SRL',             scheduledTime:'07:00', lane:2, status:'DONE',       goodsType:'Electrocasnice',       countryCode:'EU' },
    { id:'K07', plate:'B 670 MSQ', company:'MoldSilqua',              scheduledTime:'07:30', lane:1, status:'DONE',       goodsType:'Produse chimice',      countryCode:'MD' },
    { id:'K08', plate:'CL 33 TRX', company:'Calarasi Freight',        scheduledTime:'07:30', lane:2, status:'DONE',       goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'K09', plate:'GR 54 NVA', company:'Nova Cargo SRL',          scheduledTime:'08:00', lane:1, status:'PROCESSING', goodsType:'Mobilier',             countryCode:'MD' },
    { id:'K10', plate:'B 331 PLX', company:'PoliTrans SA',            scheduledTime:'08:00', lane:2, status:'ARRIVED',    goodsType:'Plastic ambalaj',      countryCode:'RO' },
    { id:'K11', plate:'IL 72 FRX', company:'FrexIle SRL',             scheduledTime:'08:30', lane:1, status:'ARRIVED',    goodsType:'Marfa generala',       countryCode:'EU' },
    { id:'K12', plate:'OT 55 DRC', company:'Draco Logistics',         scheduledTime:'08:30', lane:2, status:'SCHEDULED',  goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'K13', plate:'B 447 STL', company:'StelaTrans',              scheduledTime:'09:00', lane:1, status:'SCHEDULED',  goodsType:'Cereale',              countryCode:'MD' },
    { id:'K14', plate:'MH 28 CRG', company:'Mehedinti Cargo',         scheduledTime:'09:00', lane:2, status:'SCHEDULED',  goodsType:'Fructe si legume',     countryCode:'RO' },
    { id:'K15', plate:'B 783 NTX', company:'NetaTrans SRL',           scheduledTime:'09:30', lane:1, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'MD' },
    { id:'K16', plate:'GJ 11 TMS', company:'GorjTrans SA',            scheduledTime:'09:30', lane:2, status:'SCHEDULED',  goodsType:'Utilaje',              countryCode:'RO' },
    { id:'K17', plate:'B 516 XPT', company:'Xpert Cargo',             scheduledTime:'10:00', lane:1, status:'SCHEDULED',  goodsType:'Electronice',          countryCode:'DE' },
    { id:'K18', plate:'VL 44 FLT', company:'Valcea Fleet',            scheduledTime:'10:00', lane:2, status:'SCHEDULED',  goodsType:'Textile',              countryCode:'RO' },
    { id:'K19', plate:'B 229 DKR', company:'Daker SRL',               scheduledTime:'10:30', lane:1, status:'SCHEDULED',  goodsType:'Produse cosmetice',    countryCode:'FR' },
    { id:'K20', plate:'CS 67 TRV', company:'TransVara SRL',           scheduledTime:'10:30', lane:2, status:'SCHEDULED',  goodsType:'Metal',                countryCode:'MD' },
    { id:'K21', plate:'B 893 MNF', company:'ManiFresh Cargo',         scheduledTime:'11:00', lane:1, status:'MISSED',     goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'K22', plate:'HD 38 LGS', company:'HuneLog SA',              scheduledTime:'11:00', lane:2, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'EU' },
    { id:'K23', plate:'B 764 MPH', company:'MoldPharm SRL',           scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Produse farmaceutice',  countryCode:'MD' },
    { id:'K24', plate:'TR 22 STC', company:'SteaCargo SA',            scheduledTime:'11:30', lane:2, status:'SCHEDULED',  goodsType:'Piese auto',           countryCode:'RO' },
    { id:'K25', plate:'B 455 XLG', company:'XL Logistics SRL',        scheduledTime:'12:00', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'MD' },
    { id:'K26', plate:'IF 91 TRP', company:'TripTrans SA',            scheduledTime:'12:00', lane:2, status:'SCHEDULED',  goodsType:'Mobilier',             countryCode:'RO' },
    { id:'K27', plate:'B 107 GLD', company:'GoldCargo SRL',           scheduledTime:'12:30', lane:1, status:'SCHEDULED',  goodsType:'Bijuterii',            countryCode:'EU' },
    { id:'K28', plate:'AR 63 FLX', company:'FlexArad SA',             scheduledTime:'12:30', lane:2, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'RO' },
  ],
  BCP_LIPCANI: [
    { id:'LI01', plate:'HO 11 TRS', company:'HotinTrans SRL',         scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'UA' },
    { id:'LI02', plate:'B 344 LPC', company:'Lipcani Freight',        scheduledTime:'08:30', lane:1, status:'PROCESSING', goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'LI03', plate:'UA 28 NRD', company:'NordUkr LLC',            scheduledTime:'10:00', lane:1, status:'ARRIVED',    goodsType:'Metal',                countryCode:'UA' },
    { id:'LI04', plate:'B 592 TRT', company:'TeraTrans SRL',          scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'LI05', plate:'HO 77 CRG', company:'Cargo Hotin',            scheduledTime:'13:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'UA' },
    { id:'LI06', plate:'B 213 VLT', company:'VoltTrans SA',           scheduledTime:'14:30', lane:1, status:'SCHEDULED',  goodsType:'Utilaje',              countryCode:'MD' },
    { id:'LI07', plate:'UA 64 FRT', company:'FreightUA SRL',          scheduledTime:'16:00', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'UA' },
    { id:'LI08', plate:'B 881 MXN', company:'MixNord Cargo',          scheduledTime:'17:30', lane:1, status:'CANCELLED',  goodsType:'Textile',              countryCode:'MD' },
  ],
  BCP_OTACI: [
    { id:'O01', plate:'SG 22 CRG', company:'Soroca Cargo',            scheduledTime:'07:00', lane:1, status:'DONE',       goodsType:'Fructe si legume',     countryCode:'MD' },
    { id:'O02', plate:'UA 51 TRS', company:'UkrSud Trans',            scheduledTime:'08:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'UA' },
    { id:'O03', plate:'B 430 OTC', company:'OtaciFreight SRL',        scheduledTime:'09:00', lane:1, status:'ARRIVED',    goodsType:'Metal',                countryCode:'MD' },
    { id:'O04', plate:'SG 74 TRN', company:'TransSoroca SA',          scheduledTime:'10:00', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'O05', plate:'UA 83 DRP', company:'DniprTrans LLC',          scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'UA' },
    { id:'O06', plate:'B 617 SRC', company:'SorcaTrans SRL',          scheduledTime:'12:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'MD' },
    { id:'O07', plate:'UA 29 FRT', company:'FortUA Cargo',            scheduledTime:'13:00', lane:1, status:'MISSED',     goodsType:'Piese auto',           countryCode:'UA' },
    { id:'O08', plate:'B 752 NTR', company:'NordTrans SRL',           scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'MD' },
    { id:'O09', plate:'SG 46 EXP', company:'ExpressSoroca',           scheduledTime:'15:00', lane:1, status:'SCHEDULED',  goodsType:'Produse alimentare',   countryCode:'RO' },
  ],
  BCP_BRICENI: [
    { id:'BR01', plate:'B 174 BRC', company:'BriceniTrans SRL',       scheduledTime:'08:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'BR02', plate:'UA 36 NRB', company:'NordBorder UA',          scheduledTime:'09:30', lane:1, status:'PROCESSING', goodsType:'Metal',                countryCode:'UA' },
    { id:'BR03', plate:'B 592 PLM', company:'PalmCargo SA',           scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Produse alimentare',   countryCode:'RO' },
    { id:'BR04', plate:'UA 71 TRS', company:'TransUkr Nord',          scheduledTime:'12:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'UA' },
    { id:'BR05', plate:'B 348 CRG', company:'CargoBriceni',           scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'MD' },
    { id:'BR06', plate:'UA 88 FLX', company:'FlexNord LLC',           scheduledTime:'15:30', lane:1, status:'CANCELLED',  goodsType:'Textile',              countryCode:'UA' },
  ],
  BCP_BASARABEASCA: [
    { id:'BA01', plate:'B 211 BSB', company:'BasarabTrans SRL',       scheduledTime:'08:00', lane:1, status:'DONE',       goodsType:'Fructe si legume',     countryCode:'MD' },
    { id:'BA02', plate:'OD 44 TRS', company:'Trans-Odessa',           scheduledTime:'10:00', lane:1, status:'ARRIVED',    goodsType:'Produse alimentare',   countryCode:'UA' },
    { id:'BA03', plate:'B 673 NVC', company:'NovaCargo SRL',          scheduledTime:'12:00', lane:1, status:'SCHEDULED',  goodsType:'Metal',                countryCode:'MD' },
    { id:'BA04', plate:'OD 12 EXP', company:'ExportOd LLC',           scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Cereale',              countryCode:'UA' },
    { id:'BA05', plate:'B 445 MNX', company:'MinexTrans SA',          scheduledTime:'16:00', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
  ],
  BCP_CEADARLUGA1: [
    { id:'CL1A', plate:'B 301 CLG', company:'CeadarTrans SRL',        scheduledTime:'08:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'CL1B', plate:'TR 55 FRT', company:'TiraspTrans SA',         scheduledTime:'09:30', lane:1, status:'ARRIVED',    goodsType:'Metal',                countryCode:'MD' },
    { id:'CL1C', plate:'B 748 AGT', company:'AgatCargo SRL',          scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Textile',              countryCode:'EU' },
    { id:'CL1D', plate:'OD 31 MNF', company:'MoldNord Freight',       scheduledTime:'12:30', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'UA' },
    { id:'CL1E', plate:'B 562 TRM', company:'TrimCargo',              scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Produse chimice',      countryCode:'MD' },
    { id:'CL1F', plate:'OD 88 NVA', company:'NovaUkr LLC',            scheduledTime:'15:30', lane:1, status:'MISSED',     goodsType:'Fructe si legume',     countryCode:'UA' },
    { id:'CL1G', plate:'B 177 QRS', company:'QRS Trans SRL',          scheduledTime:'17:00', lane:1, status:'SCHEDULED',  goodsType:'Bauturi',              countryCode:'RO' },
  ],
  BCP_CEADARLUGA2: [
    { id:'CL2A', plate:'B 425 CLT', company:'CeadarLogis SRL',        scheduledTime:'07:30', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'CL2B', plate:'OD 17 XPT', company:'XportOdessa',            scheduledTime:'09:30', lane:1, status:'PROCESSING', goodsType:'Cereale',              countryCode:'UA' },
    { id:'CL2C', plate:'B 644 RMN', company:'RomaNord SRL',           scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
    { id:'CL2D', plate:'OD 73 TRS', company:'Trans Steppe LLC',       scheduledTime:'13:30', lane:1, status:'SCHEDULED',  goodsType:'Metal',                countryCode:'UA' },
    { id:'CL2E', plate:'B 211 PFX', company:'ProfixTrans SA',         scheduledTime:'15:30', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'MD' },
  ],
  BCP_LEOVA: [
    { id:'LV01', plate:'B 338 LVA', company:'LeoTrans SRL',           scheduledTime:'08:30', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'LV02', plate:'GL 22 FRT', company:'SudGalati Freight',      scheduledTime:'10:30', lane:1, status:'ARRIVED',    goodsType:'Fructe si legume',     countryCode:'RO' },
    { id:'LV03', plate:'B 571 TRX', company:'TransLeova SA',          scheduledTime:'12:30', lane:1, status:'SCHEDULED',  goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'LV04', plate:'GL 68 NVT', company:'NovatTrans SRL',         scheduledTime:'14:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
  ],
  BCP_GRIMANCAUTI: [
    { id:'GR01', plate:'B 451 GRM', company:'GrimCargo SRL',          scheduledTime:'09:00', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'GR02', plate:'UA 33 TRG', company:'TransGrim UA',           scheduledTime:'11:00', lane:1, status:'SCHEDULED',  goodsType:'Metal',                countryCode:'UA' },
    { id:'GR03', plate:'B 782 PRM', company:'PrimaVera Cargo',        scheduledTime:'13:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'RO' },
    { id:'GR04', plate:'UA 64 FRX', company:'FraxUA LLC',             scheduledTime:'15:00', lane:1, status:'MISSED',     goodsType:'Produse chimice',      countryCode:'UA' },
  ],
  BCP_UNGURI: [
    { id:'UN01', plate:'B 222 UNG', company:'UnguriTrans SRL',        scheduledTime:'08:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'UN02', plate:'UA 41 NRF', company:'NordFreight UA',         scheduledTime:'10:30', lane:1, status:'PROCESSING', goodsType:'Cereale',              countryCode:'UA' },
    { id:'UN03', plate:'B 563 TRU', company:'TrusTrans SA',           scheduledTime:'13:00', lane:1, status:'SCHEDULED',  goodsType:'Metal',                countryCode:'MD' },
    { id:'UN04', plate:'UA 79 GLB', company:'GlobaTrans LLC',         scheduledTime:'15:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'UA' },
  ],
  BCP_CRIVA: [
    { id:'CR01', plate:'B 317 CRV', company:'CrivaTrans SRL',         scheduledTime:'07:30', lane:1, status:'DONE',       goodsType:'Cereale',              countryCode:'MD' },
    { id:'CR02', plate:'UA 52 FRT', company:'FreightNordUA',          scheduledTime:'09:30', lane:1, status:'ARRIVED',    goodsType:'Fructe si legume',     countryCode:'UA' },
    { id:'CR03', plate:'B 688 MNT', company:'MontCriva SA',           scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'MD' },
    { id:'CR04', plate:'UA 23 PLT', company:'PlaTrans UA LLC',        scheduledTime:'13:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'UA' },
    { id:'CR05', plate:'B 441 XPD', company:'XpedCargo SRL',          scheduledTime:'15:30', lane:1, status:'MISSED',     goodsType:'Metal',                countryCode:'RO' },
  ],
  BCP_TUDORA: [
    { id:'TD01', plate:'B 152 TDR', company:'TudoraTrans SRL',        scheduledTime:'09:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'TD02', plate:'OD 44 CRG', company:'CargOdessa SRL',         scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Cereale',              countryCode:'UA' },
    { id:'TD03', plate:'B 573 NRT', company:'NordRoTrans SA',         scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Marfa generala',       countryCode:'RO' },
  ],
  BCP_SAITI: [
    { id:'ST01', plate:'B 264 STI', company:'SaitiCargo SRL',         scheduledTime:'08:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'ST02', plate:'OD 58 TRS', company:'TransSaiti LLC',         scheduledTime:'10:30', lane:1, status:'ARRIVED',    goodsType:'Metal',                countryCode:'UA' },
    { id:'ST03', plate:'B 714 MNS', company:'MinSud Freight',         scheduledTime:'13:00', lane:1, status:'SCHEDULED',  goodsType:'Cereale',              countryCode:'MD' },
    { id:'ST04', plate:'OD 33 FLX', company:'FlexUkr LLC',            scheduledTime:'15:30', lane:1, status:'CANCELLED',  goodsType:'Textile',              countryCode:'UA' },
  ],
  BCP_MIRNOE: [
    { id:'MR01', plate:'B 381 MRN', company:'MirnoeTrans SRL',        scheduledTime:'09:00', lane:1, status:'DONE',       goodsType:'Produse alimentare',   countryCode:'MD' },
    { id:'MR02', plate:'OD 27 CRG', company:'CargoDelta UA',          scheduledTime:'11:30', lane:1, status:'SCHEDULED',  goodsType:'Metal',                countryCode:'UA' },
    { id:'MR03', plate:'B 554 FRT', company:'FreightMirn SA',         scheduledTime:'14:00', lane:1, status:'SCHEDULED',  goodsType:'Cereale',              countryCode:'MD' },
  ],
  BCP_CISMICHIOI: [
    { id:'CI01', plate:'B 193 CSM', company:'CismTrans SRL',          scheduledTime:'08:30', lane:1, status:'DONE',       goodsType:'Fructe si legume',     countryCode:'MD' },
    { id:'CI02', plate:'OD 61 TRS', company:'TransSud UA',            scheduledTime:'11:00', lane:1, status:'ARRIVED',    goodsType:'Produse alimentare',   countryCode:'UA' },
    { id:'CI03', plate:'B 737 MNC', company:'MinCargo SRL',           scheduledTime:'13:30', lane:1, status:'SCHEDULED',  goodsType:'Materiale constructii', countryCode:'RO' },
  ],
};


// ─── Inter-Agency Chat System ─────────────────────────────────────────────────
// IGPF OCC: str. Petricani 19, Chisinau
// SV  OCC: str. N. Starostenco 30, Chisinau
// Sef de tura PF + SV at each BCP — connected via TETRA + this console
type ChatSenderRole = 'OCC-IGPF' | 'OCC-SV' | 'SEF-TURA-BP' | 'SEF-TURA-SV' | 'OFFICER';
interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ChatSenderRole;
  institution: 'BP' | 'SV';
  location: string;
  bcpId: string | null;
  text: string;
  timestamp: number;
  priority: 'NORMAL' | 'URGENT' | 'INFO';
  channel: string;  // 'GENERAL' | bcpId
}

interface ChatParticipant {
  id: string;
  name: string;
  role: ChatSenderRole;
  institution: 'BP' | 'SV';
  location: string;
  bcpId: string | null;
  isOnline: boolean;
}

const CHAT_PARTICIPANTS: ChatParticipant[] = [
  // HQ — Operational Coordination Centers
  { id:'OCC-BP',  name:'DMO — Petricani 19',       role:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chisinau',    bcpId:null,               isOnline:true  },
  { id:'OCC-SV',  name:'Unitatea de Garda — Starostenco 30', role:'OCC-SV', institution:'SV', location:'str. N. Starostenco 30, Chisinau', bcpId:null,         isOnline:true  },
  // BCP Shift Chiefs — Border Police
  { id:'ST-BP-LEU', name:'Ion Botnaru',  role:'SEF-TURA-BP', institution:'BP', location:'PTF Leuseni',       bcpId:'BCP_LEUSENI',       isOnline:true  },
  { id:'ST-BP-SCU', name:'Bogdan Scutari',role:'SEF-TURA-BP', institution:'BP', location:'PTF Sculeni',       bcpId:'BCP_SCULENI',       isOnline:true  },
  { id:'ST-BP-PAL', name:'Serghei Vatamanu', role:'SEF-TURA-BP', institution:'BP', location:'PTF Palanca',  bcpId:'BCP_PALANCA',       isOnline:true  },
  { id:'ST-BP-GI1', name:'Olga Frunze',  role:'SEF-TURA-BP', institution:'BP', location:'PTF Giurgiulesti 1',bcpId:'BCP_GIURGIULESTI1', isOnline:false },
  { id:'ST-BP-GI2', name:'Aureliu Cojocar',role:'SEF-TURA-BP',institution:'BP', location:'PTF Giurgiulesti 2',bcpId:'BCP_GIURGIULESTI2', isOnline:true  },
  { id:'ST-BP-CAH', name:'Cristian Pantelei',role:'SEF-TURA-BP',institution:'BP', location:'PTF Cahul',    bcpId:'BCP_CAHUL',         isOnline:true  },
  { id:'ST-BP-COS', name:'Victor Cucu',  role:'SEF-TURA-BP', institution:'BP', location:'PTF Costesti',      bcpId:'BCP_COSTESTI',      isOnline:true  },
  { id:'ST-BP-LIP', name:'Catalin Tomescu',role:'SEF-TURA-BP',institution:'BP', location:'PTF Lipcani',    bcpId:'BCP_LIPCANI',       isOnline:true  },
  { id:'ST-BP-OTA', name:'Razvan Pascaru',role:'SEF-TURA-BP', institution:'BP', location:'PTF Otaci',        bcpId:'BCP_OTACI',         isOnline:false },
  { id:'ST-BP-BRI', name:'Marius Sandu', role:'SEF-TURA-BP', institution:'BP', location:'PTF Briceni',       bcpId:'BCP_BRICENI',       isOnline:true  },
  // BCP Shift Chiefs — Customs Service
  { id:'ST-SV-LEU', name:'Mirela Sava',  role:'SEF-TURA-SV', institution:'SV', location:'PTF Leuseni',       bcpId:'BCP_LEUSENI',       isOnline:true  },
  { id:'ST-SV-SCU', name:'Livia Chiriac',role:'SEF-TURA-SV', institution:'SV', location:'PTF Sculeni',       bcpId:'BCP_SCULENI',       isOnline:true  },
  { id:'ST-SV-PAL', name:'Florin Negru', role:'SEF-TURA-SV', institution:'SV', location:'PTF Palanca',       bcpId:'BCP_PALANCA',       isOnline:true  },
  { id:'ST-SV-GI1', name:'Tatiana Croitor',role:'SEF-TURA-SV',institution:'SV', location:'PTF Giurgiulesti 1',bcpId:'BCP_GIURGIULESTI1', isOnline:true  },
  { id:'ST-SV-CAH', name:'Angela Birsan',role:'SEF-TURA-SV', institution:'SV', location:'PTF Cahul',         bcpId:'BCP_CAHUL',         isOnline:true  },
  { id:'ST-SV-COS', name:'George Munteanu',role:'SEF-TURA-SV',institution:'SV',location:'PTF Costesti',     bcpId:'BCP_COSTESTI',      isOnline:true  },
  { id:'ST-SV-LIP', name:'Ana Lazarev',  role:'SEF-TURA-SV', institution:'SV', location:'PTF Lipcani',       bcpId:'BCP_LIPCANI',       isOnline:false },
  { id:'ST-SV-OTA', name:'Petru Bandalac',role:'SEF-TURA-SV',institution:'SV', location:'PTF Otaci',         bcpId:'BCP_OTACI',         isOnline:true  },
  { id:'ST-SV-BRI', name:'Dumitru Bostan',role:'SEF-TURA-SV',institution:'SV', location:'PTF Briceni',       bcpId:'BCP_BRICENI',       isOnline:true  },
];

// Seed messages — realistic 24h operational communications based on live data
// (timestamps relative to session start, injected at init)
const CHAT_SEED_FN = (base: number): ChatMessage[] => [
  { id:'cm001', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Bună ziua. OCC-IGPF preia tura 14:00–00:00. Trafic curent: moderat pe BCP Leuseni și Sculeni, redus pe celelalte. 4 benzi operative Leuseni, 2 Sculeni. Toate echipele pe poziții!',
    timestamp: base - 7200000, priority:'INFO', channel:'GENERAL' },
  { id:'cm002', senderId:'OCC-SV',   senderName:'Unitatea de Pază — Starostenco 30',  senderRole:'OCC-SV',      institution:'SV', location:'str. N. Starostenco 30, Chișinău', bcpId:null,
    text:'SV-OCC în tură. 2 tomografe operative: Leuseni + Sculeni. Briceni — tomograf în mentenanță până mâine 08:00. Atenție: NCTS maintenance 16:00–17:30, lucrăm cu back-up PDF în acea fereastră.',
    timestamp: base - 7080000, priority:'INFO', channel:'GENERAL' },
  { id:'cm003', senderId:'ST-BP-LEU', senderName:'Maior Grigoriu — Şef Tură PF Leuseni',  senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Leuseni', bcpId:'BCP_LEUSENI',
    text:'Leuseni PF raportează: 4 benzi operative, 18 ofițieri de gardă. Coadă: ~22 min auto, ~8 min pietoni. Niciun incident la preluarea turei.',
    timestamp: base - 6900000, priority:'NORMAL', channel:'BCP_LEUSENI' },
  { id:'cm004', senderId:'ST-BP-LEU', senderName:'Maior Grigoriu — Şef Tură PF Leuseni',  senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Leuseni', bcpId:'BCP_LEUSENI',
    text:'OCC, întrebare procedură: cetățean UE (CZ) cu paşaport expirat cu 11 zile. Declară că se întoarce acasă, nu a știut. Permitem ieșirea pe CI sau refuzăm? Confirmți temeiul legal.',
    timestamp: base - 5400000, priority:'NORMAL', channel:'BCP_LEUSENI' },
  { id:'cm005', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Leuseni: Art. 7 alin.(3) OUG 194/2002 + Reg. UE 2016/399 (Codul Frontierelor Schengen) — cetățean UE poate utiliza CI valid ca document de călătorie. Dacă posedă CI valid — permiteți ieșirea. Dacă are doar pașaport expirat fără CI — refuzați și trimiteți la consulat.',
    timestamp: base - 5280000, priority:'NORMAL', channel:'BCP_LEUSENI' },
  { id:'cm006', senderId:'ST-BP-LEU', senderName:'Maior Grigoriu — Şef Tură PF Leuseni',  senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Leuseni', bcpId:'BCP_LEUSENI',
    text:'Confirmat, mulțumesc. Cetățeanul CZ posedă CI valid — permis să plece. Situație rezolvată.',
    timestamp: base - 5100000, priority:'NORMAL', channel:'BCP_LEUSENI' },
  { id:'cm007', senderId:'OCC-SV',   senderName:'Unitatea de Pază — Starostenco 30',  senderRole:'OCC-SV',      institution:'SV', location:'str. N. Starostenco 30, Chișinău', bcpId:null,
    text:'Briceni SV: TIR UA-36-NRB (slot K07, “echipamente industriale” declarate) — tomograful indică anomalie densitate în spațiul dintre cabină și remorcă. Reținut pentru inspectie fizică completă.',
    timestamp: base - 4500000, priority:'URGENT', channel:'GENERAL' },
  { id:'cm008', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Briceni: PF — ofițeri alertați, se asigură perimetru în jurul TIR-ului pe durata inspecției. Şoferul nu părăsește zona BCP până la finalizarea controlului.',
    timestamp: base - 4320000, priority:'URGENT', channel:'BCP_BRICENI' },
  { id:'cm009', senderId:'ST-BP-SCU', senderName:'Cpt. Munteanu — Şef Tură PF Sculeni', senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Sculeni', bcpId:'BCP_SCULENI',
    text:'Sculeni: Autocar MD-03-GAL (Gal Trans SRL, ruta Chișinău→Bucureşti, 47 pasageri) — la controlul paşapoartelor: cetățean Toshmatov Muzaffar, UZ, n. 14.04.1987. Intrat RM: 14.08.2025, termen legal expirat 11.11.2025. Depăşire: 195 zile. În curs de reținere.',
    timestamp: base - 3600000, priority:'URGENT', channel:'BCP_SCULENI' },
  { id:'cm010', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Sculeni: Confirmat reținere. Autocarul se eliberează după descărcarea pasagerului. Deschideți dosar BMA/2026/183. Art. 54-56 Legea 200/2010 — amendă 9.000 MDL + interdicție intrare 3 ani + transfer BMA Sculeni. Notificați ambasada UZ.',
    timestamp: base - 3480000, priority:'URGENT', channel:'BCP_SCULENI' },
  { id:'cm011', senderId:'ST-SV-SCU', senderName:'Insp. Ciobanu — Şef Tură SV Sculeni',  senderRole:'SEF-TURA-SV', institution:'SV', location:'BCP Sculeni', bcpId:'BCP_SCULENI',
    text:'Sculeni SV: autocarul controlat vamal — curat. Eliberat după 14 min. Pasagerul UZ predat PF. Totul OK din partea vamală.',
    timestamp: base - 3420000, priority:'NORMAL', channel:'BCP_SCULENI' },
  { id:'cm012', senderId:'ST-BP-LEU', senderName:'Maior Grigoriu — Şef Tură PF Leuseni',  senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Leuseni', bcpId:'BCP_LEUSENI',
    text:'URGENT: vehicul B-47-AXW (Renault Mégane alb, 3 persoane — 2 bărbați + 1 femeie, direcție Paris). La inspecția UV a CI Românesc al bărbatului nr.1: lipseşte firul de securitate, microprint incorect pe față, checksum MRZ invalid. Document confiscat. Toate 3 persoane reținute.',
    timestamp: base - 2700000, priority:'URGENT', channel:'BCP_LEUSENI' },
  { id:'cm013', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Leuseni CONFIRMAT. Deschideți dosar PF/2026/05/LEU-0847 — Art. 362 CP RM. Pași obligatorii: 1) Audieri separate imediat; 2) Interogare SIS II; 3) Amprentare + I-24/7; 4) Document la Laborator IDT-PF; 5) Consulatul RO Chișinău: +373-22-320-930. Nu eliberați vehiculul pana la verificare completa.',
    timestamp: base - 2580000, priority:'URGENT', channel:'BCP_LEUSENI' },
  { id:'cm014', senderId:'ST-BP-LEU', senderName:'Maior Grigoriu — Şef Tură PF Leuseni',  senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Leuseni', bcpId:'BCP_LEUSENI',
    text:'SIS II — negativ inițial. I-24/7 — în aşteptare (est. 8-12 min). Audiere în curs: bărbatul nr.1 neagă falsul, susține că a cumpărat CI „de pe internet‟. Bărbatul nr.2 și femeia nu par implicați — audieri separate finalizate.',
    timestamp: base - 2400000, priority:'NORMAL', channel:'BCP_LEUSENI' },
  { id:'cm015', senderId:'ST-BP-CAH', senderName:'Cpt. Botnaru — Şef Tură PF Cahul',   senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Cahul', bcpId:'BCP_CAHUL',
    text:'URGENT Cahul: BMW X5 negru IT-843-YK, 1 cetățean MD, direcție Chișinău. Query EUCARIS — răspuns pozitiv: proprietar Giovanni Rossi, Milano IT, furat 03.09.2025. VIN uşă față şi bloc motor nu corespund. OBD confirmă mismatch VIN-ECU. Valoare declarată: 3.200 EUR, EUROTAX: 47.000 EUR. Şofer reținut.',
    timestamp: base - 1500000, priority:'URGENT', channel:'BCP_CAHUL' },
  { id:'cm016', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Cahul CONFIRMAT: 1) Imobilizați BMW imediat — cheile la PF; 2) Dosar Art.186 CP RM (furt) + Art.195-196 (falsificare VIN); 3) Notificare INTERPOL I-24/7 / VSCI; 4) Expertiză criminalistică VIN — solicitați IPN Chișinău; 5) Anunțați OCC-SV pentru sechestrul vamal.',
    timestamp: base - 1320000, priority:'URGENT', channel:'BCP_CAHUL' },
  { id:'cm017', senderId:'OCC-SV',   senderName:'Unitatea de Pază — Starostenco 30',  senderRole:'OCC-SV',      institution:'SV', location:'str. N. Starostenco 30, Chișinău', bcpId:null,
    text:'Cahul SV: declarație vamală IT-843-YK ANULATĂ. Vehicul sechestrat — fraudă vamală (subevaluare masivă: -93%). Dosar Art. 248 CV RM deschis. Şful SV Cahul primesție protocolul de predare către PF.',
    timestamp: base - 1200000, priority:'URGENT', channel:'BCP_CAHUL' },
  { id:'cm018', senderId:'ST-BP-LEU', senderName:'Maior Grigoriu — Şef Tură PF Leuseni',  senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Leuseni', bcpId:'BCP_LEUSENI',
    text:'I-24/7 confirmat: identitate reală = Rusu Valeriu Ion, RM, n.12.03.1989. Expulzat anterior spațiu Schengen (2023, IT). Alertă SIS II Art.24 confirmată retroactiv. SIRENE RO notificat via canal securizat. Celelalte 2 persoane eliberate — nicio legătură. Persoana principală: arest preventiv 24h, DGT Leuseni.',
    timestamp: base - 900000, priority:'URGENT', channel:'BCP_LEUSENI' },
  { id:'cm019', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Leuseni: Excelent! Dosar penal Art.362 CP RM confirmat. SIRENE RO transmis. Vehicul eliberat după control complet (curat). Raport de incident PF/2026/05/LEU-0847 — finalizați până la 20:00.',
    timestamp: base - 720000, priority:'NORMAL', channel:'BCP_LEUSENI' },
  { id:'cm020', senderId:'OCC-BP',   senderName:'DMO — Petricani 19',                 senderRole:'OCC-IGPF',    institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    text:'Reminder toți şefii de tură: raportul de situație la 18:00 strict pe canal GENERAL. Format: BCP / Situație curentă / Incidente active / Resurse. Dosarele LEU-0847, BMA/183, CAH-0312 se raportează separat cu statut actual.',
    timestamp: base - 300000, priority:'INFO', channel:'GENERAL' },
];

const CHAT_AUTO_MESSAGES: { delay: number; msg: Omit<ChatMessage, 'id'|'timestamp'> }[] = [
  { delay: 40000, msg: { senderId:'ST-SV-BRI', senderName:'Insp. Damaschin — Şef Tură SV Briceni', senderRole:'SEF-TURA-SV', institution:'SV', location:'BCP Briceni', bcpId:'BCP_BRICENI',
    priority:'URGENT', channel:'BCP_BRICENI', text:'Briceni SV: inspecție fizică TIR UA-36-NRB finalizată. CONFIRMAT: 380 kg țigări (Marlboro + Rothmans) fără timbru fiscal RM, ascunse în pereții dubli ai carcasei pneumatice. Şofer reținut. Marfă sechestrată. Dosar Art.248 CV + Art.260 CP RM.' } },
  { delay: 100000, msg: { senderId:'OCC-BP', senderName:'DMO — Petricani 19', senderRole:'OCC-IGPF', institution:'BP', location:'str. Petricani 19, Chișinău', bcpId:null,
    priority:'INFO', channel:'GENERAL', text:'Info procedură: pentru cetățenii UZ, TJ, KZ verificați suplimentar în baza MAI-MD MIGRANT (terminal PF-MIGRANT). Formular de verificare actualizat în MIRAS din 23.05.2026. Protocol: PF-INT-2026-007.' } },
  { delay: 190000, msg: { senderId:'ST-BP-CAH', senderName:'Cpt. Botnaru — Şef Tură PF Cahul', senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Cahul', bcpId:'BCP_CAHUL',
    priority:'NORMAL', channel:'BCP_CAHUL', text:'Cahul update BMW X5: IPN Chișinău confirmă telefonic — VIN original şlefuit, reştampilat cu secvență diferită. Şoferul recunoaşte parțial: „cumpărat la un târg, n-am śtiut că-i furat‟. Dosar penal Art.186 înaintat procurorului de serviciu.' } },
  { delay: 280000, msg: { senderId:'ST-SV-BRI', senderName:'Insp. Damaschin — Şef Tură SV Briceni', senderRole:'SEF-TURA-SV', institution:'SV', location:'BCP Briceni', bcpId:'BCP_BRICENI',
    priority:'NORMAL', channel:'BCP_BRICENI', text:'Briceni: firma expeditoare (Odesa, str. Portovaya 14) notificată prin fax. Şoferul neagă cunośtința despre marfă. Ancheta continuă. Coordonăm cu referentul OLAF — corob. cu sesizarea din 12.05.' } },
  { delay: 370000, msg: { senderId:'OCC-SV', senderName:'Unitatea de Pază — Starostenco 30', senderRole:'OCC-SV', institution:'SV', location:'str. N. Starostenco 30, Chișinău', bcpId:null,
    priority:'INFO', channel:'GENERAL', text:'Info toți: ASYCUDA World — modulul de raportare statistică în maintenance 20:00–21:00 astăzi. Declarațiile se procesează normal. Numai exportul XLS/CSV este suspendat în acea fereastră.' } },
  { delay: 470000, msg: { senderId:'ST-BP-SCU', senderName:'Cpt. Munteanu — Şef Tură PF Sculeni', senderRole:'SEF-TURA-BP', institution:'BP', location:'BCP Sculeni', bcpId:'BCP_SCULENI',
    priority:'NORMAL', channel:'BCP_SCULENI', text:'Sculeni update BMA/183: Toshmatov Muzaffar transferat la BMA. Amendă 9.000 MDL achitată. Interdicție 3 ani înregistrată în MIRAS. Ambasada UZ Chișinău notificată. Documentație completă transmisă BMA Sculeni. Caz închis PF.' } },
];

interface BpActiveCase {
  id: string; bcpId: string; bcpName: string;
  severity: 'CRITICAL'|'HIGH'|'MEDIUM';
  caseType: 'FALSE_DOC'|'OVERSTAY'|'STOLEN_VEHICLE'|'SMUGGLING'|'WATCHLIST';
  status: 'OPEN'|'DETAINED'|'PROCESSING'|'TRANSFERRED'|'RESOLVED';
  openedMinsAgo: number;
  vehicle: { emoji: string; type: string; plate: string; make: string; color: string; operator?: string; route: string; };
  persons: { count: number; nationalities: string; detained: number; };
  title: { EN: string; RO: string; FR: string; RU: string; };
  summary: { EN: string; RO: string; };
  finding: { EN: string; RO: string; };
  actions: { RO: string[]; };
  legislation: string;
  officerOnCase: string;
  caseRef: string;
}

const BP_ACTIVE_CASES: BpActiveCase[] = [
  /* ── CASE 1: False Romanian ID, Leuseni ─────────────────────────────────── */
  {
    id: 'CASE-LEU-0847', bcpId: 'BCP_LEUSENI', bcpName: 'Leuseni',
    severity: 'HIGH', caseType: 'FALSE_DOC', status: 'DETAINED', openedMinsAgo: 45,
    vehicle: { emoji: '🚗', type: 'autoturism', plate: 'B-47-AXW', make: 'Renault Mégane', color: 'alb', route: 'Chișinău → Paris (FR)' },
    persons: { count: 3, nationalities: 'RO / MD / BG', detained: 3 },
    title: { EN: 'Counterfeit Romanian ID — 3 Persons Detained', RO: 'CI Românesc Fals — 3 Persoane Reținute',
             FR: 'Fausse CI Roumaine — 3 Personnes Détenues', RU: 'Поддельное УДРумынии — 3 Задержанных' },
    summary: {
      EN: 'Vehicle B-47-AXW (Renault Mégane, 3 occupants) en route to Paris. UV inspection of Romanian ID presented by person 1 revealed: missing security thread, incorrect microprint on front face, invalid MRZ checksum. Document confiscated. All 3 detained for separate interviews.',
      RO: 'Vehicul B-47-AXW (Renault Mégane, 3 ocupanți) în drum spre Paris. Inspecția UV a CI Românesc al pers.1 a relevat: lipsă fir de securitate, microprint incorect pe față, checksum MRZ invalid. Document confiscat. Toate 3 persoane reținute pentru audieri separate.',
    },
    finding: {
      EN: 'UV: no security thread present. Microprint incorrect. MRZ checksum fails on DOB field. I-24/7 fingerprint match: real identity = Rusu Valeriu Ion, MD, DOB 12.03.1989. Prior Schengen expulsion (2023, IT). SIS II Art.24 alert confirmed.',
      RO: 'UV: fir securitate absent. Microprint — incorect. Checksum MRZ eśuat la câmpul datei naśterii. Amprente I-24/7: identitate reală = Rusu Valeriu Ion, RM, n.12.03.1989. Expulzat anterior Schengen (2023, IT). Alertă SIS II Art.24 confirmată.',
    },
    actions: { RO: [
      'Audieri separate — finalizate',
      'SIS II query — alertă Art.24 confirmată retroactiv',
      'Amprente I-24/7 — confirmat identitate reală Rusu Valeriu Ion',
      'Document înaintat Laborator IDT-PF pentru expertiză criminalistică',
      'SIRENE RO notificat via canal securizat',
      'Celelate 2 persoane eliberate — nicio implicație demonstrată',
      'Persoana principală: arest preventiv 24h, DGT Leuseni',
      'Dosar penal Art.362 CP RM — deschis, înaintat procurorului',
    ] },
    legislation: 'Art. 361–362 Cod Penal RM · Reg. UE 2019/1157 · SIS II Art.24 · Protocol SIRENE',
    officerOnCase: 'Maior Grigoriu, Şef Tură PF Leuseni',
    caseRef: 'PF/2026/05/LEU-0847',
  },
  /* ── CASE 2: Gal Trans coach — Uzbek overstay, Sculeni ──────────────────── */
  {
    id: 'CASE-SCU-BMA183', bcpId: 'BCP_SCULENI', bcpName: 'Sculeni',
    severity: 'HIGH', caseType: 'OVERSTAY', status: 'TRANSFERRED', openedMinsAgo: 62,
    vehicle: { emoji: '🚌', type: 'autocar', plate: 'MD-03-GAL', make: 'Neoplan Tourliner', color: 'alb/portocaliu', operator: 'Gal Trans SRL', route: 'Chișinău → Bucureşti' },
    persons: { count: 47, nationalities: 'MD / RO / UA / UZ / PL', detained: 1 },
    title: { EN: 'Illegal Overstay +195 Days — Uzbek Citizen (Gal Trans Coach)', RO: 'Şedere Ilegală +195 Zile — Cetățean Uzbek (Autocar Gal Trans)',
             FR: 'Séjour Illégal +195 Jours — Citoyen Ouzbek (Car Gal Trans)', RU: 'Незаконное Пребывание +195 Дней — Гражд. Узбекистана (Gal Trans)' },
    summary: {
      EN: 'Coach MD-03-GAL (Gal Trans SRL, Chișinău–Bucharest, 47 passengers) at exit passport control. Citizen Toshmatov Muzaffar, UZ, DOB 14.04.1987: entered RM 14.08.2025, legal stay 90 days expired 11.11.2025. Overstay: 195 days at time of detection. No employment contract in ANOFM. No asylum application on file. Coach released after 14 minutes.',
      RO: 'Autocar MD-03-GAL (Gal Trans SRL, Chișinău–Bucureşti, 47 pasageri) la controlul de ieşire. Cetățean Toshmatov Muzaffar, UZ, n.14.04.1987: intrat RM 14.08.2025, termen legal 90 zile expirat 11.11.2025. Depăşire: 195 zile la momentul depistat. Niciun contract ANOFM. Nicio cerere de azil. Autocarul eliberat după 14 min.',
    },
    finding: {
      EN: 'Stamp-based entry verification: entered 14.08.2025. 90-day term expired 11.11.2025. Detection date: 25.05.2026. Overstay = 195 days. No work/study permit found in BMA or ANOFM databases. No asylum claim registered.',
      RO: 'Verificare tampile paşaport: intrare 14.08.2025. Termen 90 zile expirat 11.11.2025. Data depistat: 25.05.2026. Depăşire = 195 zile. Niciun permis muncă/studii în BMA / ANOFM. Nicio cerere de azil înregistrată.',
    },
    actions: { RO: [
      'Cetățeanul UZ coborat din autocar — autocarul eliberat (14 min)',
      'Audiere condusă cu translator — situația necontestată',
      'Verificare ANOFM — niciun contract de muncă',
      'Amendă aplicată: 9.000 MDL conform Art.54 Legea 200/2010',
      'Interdicție intrare 3 ani înregistrată în MIRAS',
      'Transferat la BMA Sculeni — proceduri de returnare inițiate',
      'Ambasada Uzbekistan Chișinău notificată',
      'Documentație completă transmisă BMA',
    ] },
    legislation: 'Art. 54–56 Legea nr.200/2010 privind regimul străinilor în RM · Art.74 Cod Contravențional RM · Acord RM–UZ privind readmisia',
    officerOnCase: 'Cpt. Munteanu, Şef Tură PF Sculeni',
    caseRef: 'BMA/2026/183',
  },
  /* ── CASE 3: Stolen BMW X5, Cahul ───────────────────────────────────────── */
  {
    id: 'CASE-CAH-0312', bcpId: 'BCP_CAHUL', bcpName: 'Cahul',
    severity: 'CRITICAL', caseType: 'STOLEN_VEHICLE', status: 'DETAINED', openedMinsAgo: 18,
    vehicle: { emoji: '🚗', type: 'autoturism', plate: 'IT-843-YK', make: 'BMW X5 (G05)', color: 'negru metalic', route: 'Galați (RO) → Cahul → Chișinău' },
    persons: { count: 1, nationalities: 'MD', detained: 1 },
    title: { EN: 'Stolen Vehicle + Tampered VIN — BMW X5 (Milano, IT)', RO: 'Autovehicul Furat + VIN Modificat — BMW X5 (Milano, IT)',
             FR: 'Véhicule Volé + NIN Falsifié — BMW X5 (Milan, IT)', RU: 'Угнанный BMW X5 + Поддельный VIN (Милан)' },
    summary: {
      EN: 'BMW X5 IT-843-YK entering from Galati RO with 1 MD national. EUCARIS query: registered owner Giovanni Rossi, Milano IT, vehicle reported stolen 03.09.2025. VIN on door frame and engine block do not match dashboard plate. OBD/ECU VIN mismatch confirmed. Declared customs value 3,200 EUR vs EUROTAX valuation 47,000 EUR.',
      RO: 'BMW X5 IT-843-YK intră din Galați RO cu 1 cetățean MD. Query EUCARIS: proprietar Giovanni Rossi, Milano IT, furat 03.09.2025. VIN pe uşa față şi bloc motor nu corespund plăcuței de pe tabloul de bord. Mismatch VIN-ECU/OBD confirmat. Valoare declarată 3.200 EUR vs EUROTAX 47.000 EUR.',
    },
    finding: {
      EN: 'EUCARIS: stolen since 03.09.2025, owner: G. Rossi, Milano. Door frame VIN: ground and re-stamped (visible tooling marks). Engine block VIN: different sequence. OBD/ECU: third VIN sequence (original chassis ID). INTERPOL VSCI: confirmed on stolen vehicle register. Paint codes pre-date manufacturer year.',
      RO: 'EUCARIS: furat din 03.09.2025, proprietar G. Rossi, Milano. VIN uşă față: şlefuit + reştampilat (urme vizibile unelte). VIN bloc motor: secvență diferită. OBD/ECU: a 3-a secvență (VIN original al şasiului). INTERPOL VSCI: confirmat în registrul vehicule furate. Coduri vopsea anterioare anului de fabricație.',
    },
    actions: { RO: [
      'BMW imobilizat — cheile păstrate la PF Cahul',
      'Dosar penal Art.186 CP RM (furt) + Art.195–196 (falsificare VIN) deschis',
      'Notificare INTERPOL via I-24/7 / VSCI transmisă',
      'Expertiză criminalistică VIN comandată — IPN Chișinău (termen: 48h)',
      'Declarație vamală anulată — vehicul sechestrat de SV Cahul (dosar Art.248 CV RM)',
      'Consulatul Italian Chișinău notificat — proprietar G. Rossi informat',
      'Dosar înaintat procurorului de serviciu',
    ] },
    legislation: 'Art. 186 CP RM (furt, până la 15 ani) · Art. 195–196 CP RM (falsificare VIN/doc.) · Art. 248 CV RM · EUCARIS Conv. 2000 · INTERPOL VSCI I-24/7',
    officerOnCase: 'Cpt. Botnaru, Şef Tură PF Cahul',
    caseRef: 'PF/2026/05/CAH-0312',
  },
];

interface SvActiveCase {
  id: string; bcpId: string; bcpName: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  caseType: 'PRECIOUS_METALS' | 'TA_EXPIRED' | 'HS_FRAUD' | 'EXCISE_SMUGGLING' | 'UNDERVALUATION' | 'PROHIBITED_GOODS';
  status: 'OPEN' | 'SEIZED' | 'PROCESSING' | 'REFERRED' | 'CLOSED';
  openedMinsAgo: number;
  vehicle: { emoji: string; type: string; plate: string; make: string; color: string; operator?: string; route: string; };
  goods: { description: string; declaredValue: string; actualValue?: string; quantity?: string; };
  title: { EN: string; RO: string; FR: string; RU: string; };
  summary: { EN: string; RO: string; };
  finding: { EN: string; RO: string; };
  actions: { RO: string[]; };
  legislation: string;
  officerOnCase: string;
  caseRef: string;
}

const SV_ACTIVE_CASES: SvActiveCase[] = [
  {
    id: 'SV-LEU-2026-0091', bcpId: 'BCP_LEUSENI', bcpName: 'Leuseni',
    severity: 'HIGH', caseType: 'PRECIOUS_METALS', status: 'SEIZED', openedMinsAgo: 47,
    vehicle: { emoji: '🚗', type: 'autoturism', plate: 'MD-47-TXQ', make: 'Toyota Camry (XV70)', color: 'gri perla', route: 'Istanbul (TR) → Leuseni → Chișinău' },
    goods: { description: 'Aur brut + bijuterii nedeclarate', declaredValue: '0 MDL (lipsă declarație)', actualValue: 'cca. EUR 21.400', quantity: '317g aur brut + 8 piese bijuterii' },
    title: {
      EN: 'Undeclared Gold & Jewelry — Concealed in Food Containers',
      RO: 'Aur & Bijuterii Nedeclarate — Ascunse în Recipiente Alimentare',
      FR: "Or & bijoux non déclarés — dissimulés dans des récipients alimentaires",
      RU: 'Незадекларированное золото и украшения — скрытые в пищевых контейнерах',
    },
    summary: { EN: '317g raw gold + 8 jewelry items found concealed in 4 food containers (yogurt jars, canned food) inside vehicle. Passenger declared "no goods above threshold". Total estimated value EUR 21,400 — exceeds legal EUR 10,000 threshold requiring customs declaration.',
               RO: '317g aur brut + 8 piese bijuterii găsite ascunse în 4 recipiente alimentare (borcane iaurt, conserve) în vehicul. Pasagerul a declarat "fără bunuri peste prag". Valoare estimată totală EUR 21.400 — depășește pragul legal EUR 10.000.' },
    finding: { EN: 'Physical inspection triggered by ANPR risk profile (route Istanbul + nationality pattern). Metal detector scan positive → manual container search confirmed gold. XRF analysis: 22K gold purity.',
               RO: 'Inspecție fizică declanșată de profil risc ANPR (traseu Istanbul + pattern naționalitate). Scanare detector metale pozitivă → căutare manuală recipiente a confirmat aurul. Analiză XRF: puritate aur 22K.' },
    actions: { RO: [
      'Aur și bijuterii sechestrate — Dosar SV/2026/LEU-0091 deschis',
      'Declarație vamală de import întocmită retroactiv — taxe calculate: MDL 68.400',
      'Amendă Art.268 CV RM aplicată: MDL 12.000',
      'Dosar Art.249 CP RM transmis Procuraturii Anticorupție',
      'Bunuri transferate Casa de Amanet a Statului — evaluare oficială în curs',
    ] },
    legislation: 'Art. 268–269 CV RM (nedeclarare) · Art. 249 CP RM (contrabandă) · Reg. CE 1889/2005 (aplicat prin acord AEO) · Decizia SV Nr.118/2024',
    officerOnCase: 'Insp. Principal Rodica Butnaru, BCP Leuseni — SV',
    caseRef: 'SV/2026/05/LEU-0091',
  },
  {
    id: 'SV-PAL-2026-0047', bcpId: 'BCP_PALANCA', bcpName: 'Palanca',
    severity: 'HIGH', caseType: 'TA_EXPIRED', status: 'SEIZED', openedMinsAgo: 134,
    vehicle: { emoji: '🚗', type: 'autoturism', plate: 'O 924 KM', make: 'BMW 530d (G30)', color: 'negru', route: 'Odessa (UA) → Palanca → Chișinău' },
    goods: { description: 'Autovehicul în regim TA expirat', declaredValue: 'EUR 24.800 (declarație TA inițială)', actualValue: 'EUR 31.200 (EUROTAX actual)', quantity: '1 autoturism' },
    title: {
      EN: 'Temporary Admission Expired — BMW 530d, 214 Days in RM, RU Plate',
      RO: 'Admitere Temporară Expirată — BMW 530d, 214 Zile în RM, Placă RU',
      FR: "Admission temporaire expirée — BMW 530d, 214 jours en RM, plaque RU",
      RU: 'Истёкший временный ввоз — BMW 530d, 214 дней в РМ, номер RU',
    },
    summary: { EN: 'BMW 530d with Russian plate O 924 KM detected at Palanca exit. ASYCUDA query shows temporary admission granted on 2025-10-15 — valid 180 days until 2026-04-13. Vehicle still in RM on 2026-06-05 = 214 days, 34 days overdue. Owner: Sergei Mihailov, RU citizen, RM residence address found in municipal database.',
               RO: 'BMW 530d cu placă rusă O 924 KM detectat la ieșire Palanca. Query ASYCUDA arată AT acordat la 15.10.2025 — valabil 180 zile până la 13.04.2026. Vehiculul încă în RM la 05.06.2026 = 214 zile, depășire 34 zile. Proprietar: Sergei Mihailov, cetățean RU, adresă reședință RM găsită în baza municipală.' },
    finding: { EN: 'ANPR flagged plate at Palanca entry gate → ASYCUDA TA lookup → expiry 2026-04-13 confirmed → physical stop. Owner claims "forgot" and shows RM lease contract (signed 2025-11), proving de facto residence. Customs exposure: full import duties 15% + VAT 20% on EUROTAX EUR 31,200.',
               RO: 'ANPR a semnalat plăca la poarta de intrare Palanca → interogare TA ASYCUDA → expirare 13.04.2026 confirmată → oprire fizică. Proprietarul susține "a uitat" și prezintă contract chirie RM (semnat nov. 2025), dovedind rezidență de facto. Expunere vamală: taxe import 15% + TVA 20% pe EUROTAX EUR 31.200.' },
    actions: { RO: [
      'Vehicul reținut la BCP Palanca — cheile și documentele ridicate',
      'Calcul taxe import: EUR 31.200 × 35% = EUR 10.920 + penalități de întârziere',
      'Amendă Art.287 CV RM: MDL 8.000 (depășire TA)',
      'Notificare FISC RM — verificare obligații TVA pentru utilizare comercială potențială',
      'Dosar înaintat Direcției Admitere Temporară — SV Central pentru decizie finală',
    ] },
    legislation: 'Art. 287 CV RM (depășire TA) · Convenția Istanbul Anexa C · Decizia SV Nr.088/2022 · Art. 5 Legea 1163/1997 (import neautorizat)',
    officerOnCase: 'Insp. Gheorghe Rotaru, BCP Palanca — SV',
    caseRef: 'SV/2026/06/PAL-0047',
  },
  {
    id: 'SV-LEU-2026-0103', bcpId: 'BCP_LEUSENI', bcpName: 'Leuseni',
    severity: 'CRITICAL', caseType: 'HS_FRAUD', status: 'PROCESSING', openedMinsAgo: 23,
    vehicle: { emoji: '🚛', type: 'TIR / semiremorcă', plate: 'TR 34 KHZ 8821', make: 'Mercedes Actros (TIR)', color: 'alb/gri', operator: 'KHZ Logistics Srl, Istanbul', route: 'Istanbul (TR) → Leuseni → Chișinău → UE tranzit' },
    goods: { description: 'HS 8431 "componente utilaj" — real: laptopuri + smartphone', declaredValue: 'EUR 18.400 (componente industriale)', actualValue: 'EUR 127.000 (electronice consum)', quantity: '1.240 unități electronice mixte' },
    title: {
      EN: 'HS Code Fraud — 1,240 Electronics Units Declared as Industrial Components',
      RO: 'Fraudă Cod HS — 1.240 Unități Electronice Declarate ca Componente Industriale',
      FR: "Fraude code SH — 1 240 unités électroniques déclarées comme composants industriels",
      RU: 'Мошенничество с кодом ТН ВЭД — 1240 единиц электроники как промышленные компоненты',
    },
    summary: { EN: 'TIR from Istanbul with manifest "Hydraulic machine components" (HS 8431) — weight inconsistency flagged by X-ray (density pattern matches consumer electronics, not metal parts). Physical inspection: 1,240 mixed units — laptops (Apple, Dell, Lenovo), smartphones (Samsung, Xiaomi) and tablets in industrial wrap. Declared EUR 18,400; TARIC real value EUR 127,000. Duty gap: EUR 13,100 + VAT.',
               RO: 'TIR din Istanbul cu manifest "Componente hidraulice mașini" (HS 8431) — inconsistență greutate semnalată de tomograf (densitate corespunde electronicelor de consum, nu pieselor metalice). Inspecție fizică: 1.240 unități mixte — laptopuri (Apple, Dell, Lenovo), smartphone (Samsung, Xiaomi) și tablete în ambalaj industrial. Declarat EUR 18.400; valoare reală TARIC EUR 127.000. Gap taxe: EUR 13.100 + TVA.' },
    finding: { EN: 'X-ray density anomaly → full physical unload. Goods match consumer electronics (HS 8517/8471). Operator provided falsified pro-forma invoice. OLAF liaison notified (cross-border operation suspected — same pattern as RAR-SV-2026-025).',
               RO: 'Anomalie densitate tomograf → descărcare fizică completă. Mărfuri corespund electronicelor de consum (HS 8517/8471). Operatorul a furnizat factură pro-forma falsificată. Legătură OLAF notificată (operațiune transfrontalieră suspectată — același pattern ca RAR-SV-2026-025).' },
    actions: { RO: [
      'TIR imobilizat la BCP Leuseni — sigilii vamale aplicate pe marfă',
      'Reclasificare HS: 8431 → 8517/8471 — calcul taxe diferențiale în curs',
      'Dosar Art.270 CV RM (clasificare frauduloasă) + Art.248 CV RM (contrabandă)',
      'Notificare OLAF și autorități vamale TR via TAXUD pentru investigație coordonată',
      'Carantinare marfă — evaluare oficială comandată în 24h',
    ] },
    legislation: 'Art. 270 CV RM (clasificare frauduloasă) · Art. 248 CV RM (contrabandă) · Reg. UE 952/2013 CDU Art.77 (aplicat în tranzit) · TARIC HS 8517/8471 · Acord OLAF–SV RM 2024',
    officerOnCase: 'Insp. Principal Natalia Ciobanu, BCP Leuseni — SV',
    caseRef: 'SV/2026/06/LEU-0103',
  },
];

interface RiskReport {
  id: string;
  title: { EN: string; RO: string; };
  category: 'SMUGGLING'|'FRAUD'|'MIGRATION'|'VEHICLE_CRIME'|'DRUGS'|'TERRORISM';
  bcpScope: 'ALL' | string[];
  severity: 'CRITICAL'|'HIGH'|'MEDIUM';
  uploadedBy: string;
  unit: string;
  uploadedAtMsAgo: number;
  validUntil: string;
  classification: 'RESTRICTED'|'CONFIDENTIAL';
  summary: { EN: string; RO: string; };
  indicators: string[];
  recommendations: { RO: string[]; };
  isRead: boolean;
  institution: 'BP' | 'CS' | 'JOINT';
}

const RISK_ANALYST_REPORTS: RiskReport[] = [
  {
    id: 'RAR-2026-054',
    title: { EN: 'CRITICAL: Stolen Premium Vehicles via RO Border — Linked to CAH-0312',
             RO: 'CRITIC: Vehicule Premium Furate prin Frontiera RO — Corelat cu CAH-0312' },
    category: 'VEHICLE_CRIME', bcpScope: ['BCP_CAHUL','BCP_PALANCA','BCP_GIURGIULESTI1'],
    severity: 'CRITICAL', uploadedBy: 'Maior Petru Cojocaru',
    unit: 'Unitatea de Analiză a Riscurilor — IGPF',
    uploadedAtMsAgo: 1 * 3600 * 1000, validUntil: '10.06.2026', classification: 'CONFIDENTIAL',
    summary: {
      EN: 'Spike of stolen premium vehicles (BMW, Mercedes, Audi, Porsche) entering MD from RO at southern BCPs. Origin: IT, DE, AT. VINs systematically re-stamped. Active case CAH-0312 (BMW X5, Milano) confirms the pattern. Estimated 8–12 vehicles/month. Network involves MD-based receivers in Chișinău and Tiraspol.',
      RO: 'Creștere accentuată a vehiculelor premium furate (BMW, Mercedes, Audi, Porsche) intrând în RM din RO la BCPs sudice. Origine: IT, DE, AT. VIN-uri re-ștampilate sistematic. Cazul activ CAH-0312 (BMW X5, Milano) confirmă pattern-ul. Estimat 8–12 vehicule/lună. Rețea implică receptori MD la Chișinău și Tiraspol.',
    },
    indicators: [
      'Brand premium (BMW/Mercedes/Audi/Porsche) cu numere non-UE',
      'Valoare declarată vamală << EUROTAX (subevaluare >50%)',
      'Ocupant singular, cetățean MD, 25–45 ani',
      'Intrare din zonele Galați, Brăila, Constanța',
      'Corec­turi vizibile pe pașaportul tehnic',
      'VIN plăcuță vs VIN bloc motor vs VIN OBD — toate diferite',
    ],
    recommendations: { RO: [
      'EUCARIS obligatoriu pentru TOATE vehiculele premium la intrare',
      'Comparație valoare declarată vs EUROTAX pentru orice vehicul >10.000 EUR',
      'Procedură VIN 4 puncte + OBD + inspecție UV vopsea la Cahul, Palanca, Giurgiulești',
      'Orice hit EUCARIS → dosar Art.186 CP RM + notificare INTERPOL VSCI',
      'Coordonare cu IGPF Cahul referitor la rețelele locale de primire',
    ] },
    isRead: false,
    institution: 'BP',
  },
  {
    id: 'RAR-2026-047',
    title: { EN: 'OLAF Intel: Cigarette Smuggling Concealed in Refrigerated Agri TIRs',
             RO: 'Intel OLAF: Contrabandă Țigări Ascunse în TIR-uri Frigorifice Agri' },
    category: 'SMUGGLING', bcpScope: ['BCP_BRICENI','BCP_SCULENI','BCP_LEUSENI','BCP_OTACI'],
    severity: 'HIGH', uploadedBy: 'Inspector Vasile Moraru',
    unit: 'Unitatea de Analiză a Riscurilor — IGPF',
    uploadedAtMsAgo: 2 * 3600 * 1000, validUntil: '15.06.2026', classification: 'CONFIDENTIAL',
    summary: {
      EN: 'OLAF has flagged increased smuggling of untaxed cigarettes via agri TIRs on the UA-MD-RO corridor. Preferred concealment: double-wall construction in refrigerated units, declared as seasonal vegetables. Active case BRI (UA-36-NRB, 380 kg) matches this pattern. Origins: Odesa, Kherson, Mykolaiv oblasts.',
      RO: 'OLAF a semnalat creșterea contrabandei cu țigări netimbrate prin TIR-uri agri pe coridorul UA-MD-RO. Ascundere preferată: pereți dubli în unități frigorifice, declarate ca legume sezoniere. Cazul activ BRI (UA-36-NRB, 380 kg) corespunde pattern-ului. Origini: oblastele Odesa, Kherson, Mykolaiv.',
    },
    indicators: [
      'TIR frigorific UA declarat "produse agricole / legume / fructe"',
      'Greutate declarată inconsistentă cu tipul produsului',
      'Expeditor/destinatar fără istoric comerț agri verificabil',
      'Origine: Odesa, Kherson, Mykolaiv oblast (UA)',
      'Șofer evasiv privind adresa de livrare',
      'Anomalie densitate în zona cabinei sau pereților laterali (tomograf)',
    ],
    recommendations: { RO: [
      'Tomograf obligatoriu pentru TIR-uri frigorifice UA cu produse agri',
      'Verificare greutate declarată vs capacitate nominală compartiment',
      'Prioritizare canale ROȘU/GALBEN pentru HS 07xx / 08xx din UA',
      'Inspecție fizică direcționată: pereți laterali + spațiu cabină-remorcă',
      'Corob. cu referentul OLAF — raport BRI NRB transmis la 12.05.2026',
    ] },
    isRead: true,
    institution: 'BP',
  },
  {
    id: 'RAR-2026-051',
    title: { EN: 'SIS II Update: 23 Wanted Persons Expected on MD-RO Corridor (24–28 May)',
             RO: 'SIS II Update: 23 Persoane Urmărite pe Coridorul MD-RO (24–28 Mai)' },
    category: 'DRUGS', bcpScope: ['BCP_LEUSENI','BCP_SCULENI'],
    severity: 'HIGH', uploadedBy: 'Comisar Andrei Popescu',
    unit: 'Direcția Cooperare Internațională — IGPF',
    uploadedAtMsAgo: 5 * 3600 * 1000, validUntil: '30.05.2026', classification: 'RESTRICTED',
    summary: {
      EN: 'Europol/SIS II update: 23 newly-entered wanted persons (drug trafficking network BE-NL-MD) expected to attempt MD-EU crossing 24–28 May 2026. Alert level HIGH. Enhanced biometric verification and mandatory I-24/7 queries for all single-traveller MD nationals aged 20–42.',
      RO: 'Update Europol/SIS II: 23 persoane noi urmărite (rețea trafic droguri BE-NL-MD) estimate să tenteze trecerea MD-UE 24–28 mai 2026. Nivel alertă RIDICAT. Verificare biometrică sporită și interogare I-24/7 obligatorie pentru toți cetățenii MD solitari 20–42 ani.',
    },
    indicators: [
      'MD național, bărbat 20–42 ani, călătorie solitară',
      'Rută: Chișinău → Iași → București → UE occidentală',
      'Posibilă utilizare a identităților false/modificate',
      'Poate călători în grupuri mici pentru a evita detectarea',
      'Nu are bilet de întoarcere sau adresă fixă în destinație',
    ],
    recommendations: { RO: [
      'Biometrie obligatorie pentru toți cetățenii MD la Leuseni / Sculeni 24–28 mai',
      'Interogare I-24/7 pentru bărbați MD/UA singuri 20–42 ani',
      'Coordonare cu NSIS România pentru alertele SIS II active',
      'Orice match → raportare imediată la OCC-IGPF + blocare ieșire',
    ] },
    isRead: false,
    institution: 'BP',
  },
  {
    id: 'RAR-2026-049',
    title: { EN: 'Overstay Trend: CIS Nationals +90 Days, +340% YoY — BMA Alert',
             RO: 'Trend Depășire Ședere: Cetățeni CSI +90 Zile, +340% vs 2025 — Alertă BMA' },
    category: 'MIGRATION', bcpScope: 'ALL',
    severity: 'MEDIUM', uploadedBy: 'Insp. Elena Tcaci',
    unit: 'Direcția Migrație Ilegală — IGPF / BMA',
    uploadedAtMsAgo: 12 * 3600 * 1000, validUntil: '30.06.2026', classification: 'RESTRICTED',
    summary: {
      EN: 'Significant increase in UZ/KZ/TJ nationals detected overstaying at exit BCPs (+340% vs Jan–May 2025). Entry pattern: Chișinău International Airport (AIR), then overstay 90–365 days, then exit attempt via road BCPs on coaches/minibuses. Linked to grey labour market in construction/agriculture. Case BMA/2026/183 (Sculeni) is a typical example.',
      RO: 'Creștere semnificativă a cetățenilor UZ/KZ/TJ depistaț cu depășire ședere la BCPs de ieșire (+340% vs ian–mai 2025). Pattern intrare: Aeroportul Internațional Chișinău (AIR), urmată de ședere ilegală 90–365 zile, tentativă ieșire via BCPs rutiere cu autocare/microbuze. Corelat cu piața muncii neoficiale (construcții/agricultură). Cazul BMA/2026/183 (Sculeni) este un exemplu tipic.',
    },
    indicators: [
      'Pașaport UZ / KZ / TJ, bărbat 20–45 ani',
      'Ștampilă intrare: Aeroportul Chișinău (AIR)',
      'Niciun permis valabil în MIRAS',
      'Niciun contract ANOFM',
      'Tentativă ieșire via autocar / microbuz curse internaționale',
      'Evasiv privind angajatorul și adresa de ședere',
    ],
    recommendations: { RO: [
      'Verificare obligatorie MIRAS + ANOFM pentru toți cetățenii UZ/KZ/TJ la ieșire',
      'Alertă sporită la autocare și microbuze pe rute internaționale',
      'Raportare lunară cazuri BMA pentru statistici de migrație',
      'Procedura: amendă Art.54 + interdicție 3 ani + transfer BMA',
    ] },
    isRead: true,
    institution: 'BP',
  },

  /* ── CS (Customs Service) Risk Analysis Reports ──────────────────────────── */
  {
    id: 'RAR-SV-2026-018',
    title: { EN: 'Precious Metals & Undeclared Gold — Threshold Violations at Entry BCPs',
             RO: 'Metale Prețioase & Aur Nedeclarat — Depășiri Prag la BCPs de Intrare' },
    category: 'FRAUD', bcpScope: ['BCP_LEUSENI','BCP_PALANCA','BCP_SCULENI','BCP_CAHUL'],
    severity: 'HIGH', uploadedBy: 'Insp. Principal Rodica Butnaru',
    unit: 'Direcția Analiză Risc Vamal — Serviciul Vamal RM',
    uploadedAtMsAgo: 3 * 3600 * 1000, validUntil: '30.06.2026', classification: 'CONFIDENTIAL',
    summary: {
      EN: '11 cases of undeclared gold/jewelry seizure detected Jan–May 2026. Threshold: 100g gold or EUR 10,000 jewelry exempt without declaration. Detected patterns: jewelry concealed in food containers, gold bars in car engine compartments, watches distributed among all passengers to stay under individual threshold. EUCARIS queries did not flag the vehicles — risk is passenger-borne.',
      RO: '11 cazuri de aur/bijuterii nedeclarate sechestrate ian–mai 2026. Prag legal: 100g aur sau EUR 10.000 bijuterii scutite fără declarație. Modele detectate: bijuterii ascunse în containere alimentare, lingouri în compartimentul motorului, ceasuri distribuite între toți pasagerii. Query-urile EUCARIS nu au semnalat vehiculele — riscul este la pasager.',
    },
    indicators: [
      'Pasageri cu cantități mici de aur distribuite în grup',
      'Declarație vamală lipsă pentru bunuri >EUR 10.000 / >100g aur',
      'Bijuterii ascunse în container alimente / haine / pantofi',
      'Lingouri în compartiment motor / valiză cu fund dublu',
      'Traseu: Dubai / Istanbul / Moscova → RM',
      'Comportament evasiv la întrebări despre bijuterii/cadouri',
    ],
    recommendations: { RO: [
      'Inspecție manuală pasageri cu destinație anterior Dubai/Istanbul/Moscova',
      'Interogare declarativă activă: „Transportați aur, bijuterii, valori >EUR 10.000?"',
      'Utilizare detector metale pentru bagaje la Leuseni/Palanca/Sculeni',
      'Procedură: confiscare + amendă conform Art.268-269 CV RM + dosar penal Art.249 CP',
      'Raportare lunară către CNA pentru cazuri >EUR 50.000 (suspiciune spălare bani)',
    ] },
    isRead: false,
    institution: 'CS',
  },
  {
    id: 'RAR-SV-2026-021',
    title: { EN: 'Temporary Admission Violations — Foreign Plated Vehicles >180 Days in RM',
             RO: 'Depășiri Admitere Temporară — Autovehicule Plăci Străine >180 Zile în RM' },
    category: 'FRAUD', bcpScope: 'ALL',
    severity: 'HIGH', uploadedBy: 'Insp. Gheorghe Rotaru',
    unit: 'Direcția Admitere Temporară — Serviciul Vamal RM',
    uploadedAtMsAgo: 6 * 3600 * 1000, validUntil: '31.07.2026', classification: 'RESTRICTED',
    summary: {
      EN: 'Significant increase in vehicles registered in RU/BY/UA remaining in RM beyond the 180-day temporary admission limit (Istanbul Convention Annex C). Jan–May 2026: 47 violations detected vs 12 in same period 2025 (+292%). RU plates: 61%, BY: 23%. Vehicles used commercially or for personal residence without re-registration. Customs exposure: full import duties + VAT on EUROTAX vehicle value.',
      RO: 'Creștere semnificativă a vehiculelor înmatriculate în RU/BY/UA ce depășesc limita de 180 zile AT (Convenția Istanbul Anexa C). Ian–mai 2026: 47 violări vs 12 în 2025 (+292%). Plăci RU: 61%, BY: 23%. Vehiculele utilizate comercial sau rezidențial fără reînmatriculare. Expunere vamală: taxe import integrale + TVA pe valoarea EUROTAX.',
    },
    indicators: [
      'Plăci RU / BY / UA, mașina în RM continuu >180 zile',
      'Prezentare la BCP fără documente TA valide sau cu TA expirat',
      'Șofer/proprietar cu rezidență în RM (contract chirie, muncă)',
      'Vehiculul utilizat în activitate comercială (taxi, transport marfă)',
      'Lipsa ștampilei de ieșire obligatorii la 180 zile',
      'Tentativă de migrare prin BCPs diferite pentru a reseta termenul',
    ],
    recommendations: { RO: [
      'Obligatoriu ASYCUDA query TA pentru TOATE vehiculele RU/BY/UA la intrare',
      'Dacă TA expirat: reținere vehicul + calcul taxe import + dosar Art.287 CV RM',
      'Alertă coordonată cu PF pentru verificare rezidență proprietar',
      'Notificare Administrația Fiscală pentru cazuri cu utilizare comercială (TVA)',
      'Raportare bilunară statistici TA la Direcția Generală Vamală',
    ] },
    isRead: false,
    institution: 'CS',
  },
  {
    id: 'RAR-SV-2026-025',
    title: { EN: 'HS Code Fraud & Undervaluation — Electronics Declared as Industrial Parts',
             RO: 'Fraudă Cod HS & Subevaluare — Electronice Declarate ca Piese Industriale' },
    category: 'FRAUD', bcpScope: ['BCP_LEUSENI','BCP_SCULENI','BCP_PALANCA'],
    severity: 'CRITICAL', uploadedBy: 'Insp. Principal Natalia Ciobanu',
    unit: 'Direcția Antifraudă Vamală — Serviciul Vamal RM / OLAF Liaison',
    uploadedAtMsAgo: 8 * 3600 * 1000, validUntil: '20.06.2026', classification: 'CONFIDENTIAL',
    summary: {
      EN: 'OLAF + SV joint investigation: systematic HS misclassification — consumer electronics (smartphones, laptops — HS 8517/8471) declared as "industrial spare parts" (HS 8409) to avoid 12% import duty. Jan–May 2026: 23 TIRs detected, estimated EUR 340,000 duty gap. Typical shipment declared "machine components" but physical inspection reveals consumer electronics in industrial wrap.',
      RO: 'Investigație comună OLAF + SV: clasificare eronată sistematică — electronice consum (smartphone, laptop — HS 8517/8471) declarate ca "piese schimb industriale" (HS 8409) pentru a evita taxa import 12%. Ian–mai 2026: 23 TIR-uri detectate, gap taxe estimat EUR 340.000. Transport tipic declarat "componente utilaj" dar inspecție fizică relevă electronice de consum.',
    },
    indicators: [
      'Declarație HS 8409/8431 cu descriere vagă "componente / piese utilaj"',
      'Greutate și volum inconsistente cu piesele industriale declarate',
      'Destinatar: persoane fizice sau firme fără profil tehnic/industrial',
      'Expeditor: China (CN), Dubai (UAE), Turcia (TR)',
      'Valoare declarată << valori TARIC/market pentru HS real',
      'Ambalaj industrial (plastic rezistent, tăiere uniformă) pentru mărfuri individuale',
    ],
    recommendations: { RO: [
      'Tomograf obligatoriu pentru TIR-uri cu HS 8409/8431 din CN/UAE/TR',
      'Inspecție fizică + reclasificare HS dacă mărfuri electronice detectate',
      'Calcul taxe pe baza HS real + amendă Art.270 CV RM + dosar OLAF dacă >EUR 50k',
      'Coordonare cu Unitatea Antifraudă FISC pentru TVA neachitat',
      'Alertare autorităților vamale la BCPs destinatare (RO, UA, UE)',
    ] },
    isRead: false,
    institution: 'CS',
  },
  {
    id: 'RAR-SV-2026-029',
    title: { EN: 'Excise Goods Smuggling — Bulk Alcohol in Modified Tanker Compartments',
             RO: 'Contrabandă Accize — Alcool en Gros în Cisterne Modificate' },
    category: 'SMUGGLING', bcpScope: ['BCP_GIURGIULESTI1','BCP_CAHUL','BCP_PALANCA','BCP_LEUSENI'],
    severity: 'HIGH', uploadedBy: 'Insp. Vasile Toma',
    unit: 'Direcția Accize și Produse Speciale — Serviciul Vamal RM',
    uploadedAtMsAgo: 14 * 3600 * 1000, validUntil: '15.06.2026', classification: 'CONFIDENTIAL',
    summary: {
      EN: 'Bulk alcohol smuggling pattern using tanker trucks with concealed secondary chambers. Declared: industrial solvents (HS 2909) or mineral water. Actual: ethyl alcohol 95%+ (HS 2207) for illegal spirits production in RM. Detected at Giurgiulesti and Cahul. Financial impact per load: EUR 4,200–18,000 in evaded excise + VAT.',
      RO: 'Pattern contrabandă alcool en gros prin cisterne cu camere secundare ascunse. Declarat: solvenți industriali (HS 2909) sau apă minerală. Real: alcool etilic 95%+ (HS 2207) pentru producție ilegală băuturi spirtoase. Detectat la Giurgiulești și Cahul. Impact financiar per transport: EUR 4.200–18.000 accize + TVA neachitate.',
    },
    indicators: [
      'Cisternă cu declarație HS 2909 (solvenți) sau apă minerală',
      'Densitate compartiment inconsistentă cu produsul declarat (tomograf)',
      'Miros de alcool la inspecția robinetelor / ventilelor',
      'Expeditor fără licență de producție solvenți verificabilă',
      'Rută: UA sau RO (zona Galați/Brăila) cu destinație "depozit privat"',
      'Modificări neautorizate cisternă (suduri recente, clapete ascunse)',
    ],
    recommendations: { RO: [
      'Tomograf + probă chimică (densimetru + test ardere) pentru toate cisternele HS 2909',
      'Verificare licență expeditor producție/export solvenți industriali',
      'Inspecție fizică valve și compartimente la Giurgiulești + Cahul',
      'Confiscare + dosar Art.248 CV RM + Art.251 CP RM (contrabandă accize)',
      'Notificare ANSA pentru alcool necomestibil detectat + risc sănătate publică',
    ] },
    isRead: true,
    institution: 'CS',
  },
];


interface TradeIntelEntry {
  id: string;
  bcpId: string;
  bcpName: string;
  plate: string;
  vehicleType: string;
  flow: 'IMPORT' | 'EXPORT' | 'TRANSIT';
  traderName: string;
  hsCode: string;
  goodsDesc: { EN: string; RO: string; };
  declaredValue: number;
  currency: string;
  outcome: 'CLEARED' | 'SEIZED' | 'FINE_ISSUED' | 'REFERRED_POLICE' | 'DETAINED';
  channel: 'GREEN' | 'YELLOW' | 'RED';
  riskScore: number;
  bpFindings: { bio: boolean; doc: boolean; wl: boolean; notes: string; };
  svFindings: { duties: number; dutyGap?: number; notes: string; };
  officerBP: string;
  officerSV: string;
  recordedAtMsAgo: number;
  linkedReportId?: string;
  linkedCaseRef?: string;
}

const TRADE_INTEL_ARCHIVE: TradeIntelEntry[] = [
  {
    id: 'TIA-001', bcpId: 'PTF_BRICENI', bcpName: 'PTF Briceni',
    plate: 'UA-36-NRB', vehicleType: 'truck', flow: 'IMPORT',
    traderName: 'Agro-Trans UA SRL', hsCode: '2402.20',
    goodsDesc: { EN: 'Cigarettes hidden in refrigerated agri TIR', RO: 'Tigarete disimulate in TIR frigorific agricol' },
    declaredValue: 4200, currency: 'EUR', outcome: 'SEIZED', channel: 'RED', riskScore: 94,
    bpFindings: { bio: false, doc: true, wl: true, notes: 'Driver on SIS II art.36 watch list; CMR tampered' },
    svFindings: { duties: 0, dutyGap: 87400, notes: '380 kg cigarettes hidden under frozen vegetables; OLAF profile match' },
    officerBP: 'Sublt. Colesnic M.', officerSV: 'Inspector Moraru V.',
    recordedAtMsAgo: 10800000, linkedReportId: 'RAR-2026-047',
  },
  {
    id: 'TIA-002', bcpId: 'PTF_CAHUL', bcpName: 'PTF Cahul',
    plate: 'IT-843-YK', vehicleType: 'car', flow: 'IMPORT',
    traderName: 'Giovanni Rossi (privat)', hsCode: '8703.24',
    goodsDesc: { EN: 'BMW X5 G05 - declared used personal, reported stolen Milano', RO: 'BMW X5 G05 - declarat uzat personal, raportat furat Milano' },
    declaredValue: 3200, currency: 'EUR', outcome: 'SEIZED', channel: 'RED', riskScore: 98,
    bpFindings: { bio: false, doc: true, wl: true, notes: 'EUCARIS: stolen Milano; VIN ground+restamped; ECU/OBD mismatch' },
    svFindings: { duties: 0, dutyGap: 14300, notes: 'Declared EUR 3,200 vs EUROTAX EUR 47,000; Art.186+195-196 CP RM' },
    officerBP: 'Lt. Botnaru A.', officerSV: 'Inspector Cojocaru P.',
    recordedAtMsAgo: 5400000, linkedReportId: 'RAR-2026-054', linkedCaseRef: 'CASE-CAH-0312',
  },
  {
    id: 'TIA-003', bcpId: 'PTF_SCULENI', bcpName: 'PTF Sculeni',
    plate: 'MD-03-GAL', vehicleType: 'bus', flow: 'TRANSIT',
    traderName: 'Gal Trans SRL', hsCode: 'PASAGERI',
    goodsDesc: { EN: 'Coach Chisinau-Bucharest - UZ national overstay +195 days', RO: 'Autocar Chisinau-Bucuresti - cetatean UZ depasire sedere +195 zile' },
    declaredValue: 0, currency: 'MDL', outcome: 'FINE_ISSUED', channel: 'YELLOW', riskScore: 72,
    bpFindings: { bio: true, doc: false, wl: false, notes: 'BIO mismatch pax seat 14; BMA/2026/183 - fine 9000 MDL + interdictie 3 ani' },
    svFindings: { duties: 0, notes: 'Transit declaration compliant; BMA notified' },
    officerBP: 'Serg. Lupascu D.', officerSV: 'Inspector Tcaci E.',
    recordedAtMsAgo: 9000000, linkedCaseRef: 'CASE-SCU-BMA183',
  },
  {
    id: 'TIA-004', bcpId: 'PTF_LEUSENI', bcpName: 'PTF Leuseni',
    plate: 'B-47-AXW', vehicleType: 'car', flow: 'IMPORT',
    traderName: 'Privat - 3 persoane', hsCode: 'N/A',
    goodsDesc: { EN: 'Personal car - 3 persons Paris direction; counterfeit Romanian ID detected', RO: 'Autoturism - 3 persoane directia Paris; ID romanesc contrafacut detectat' },
    declaredValue: 0, currency: 'EUR', outcome: 'REFERRED_POLICE', channel: 'RED', riskScore: 91,
    bpFindings: { bio: false, doc: true, wl: true, notes: 'UV: lipsa fir securitate; I-24/7 match Rusu Valeriu Ion; SIS II Art.24' },
    svFindings: { duties: 0, notes: 'No commercial goods; case referred IP Leuseni per Art.361-362 CP RM' },
    officerBP: 'Lt. maj. Stratan I.', officerSV: 'Inspector Botnaru V.',
    recordedAtMsAgo: 14400000, linkedCaseRef: 'CASE-LEU-0847',
  },
  {
    id: 'TIA-005', bcpId: 'PTF_LEUSENI', bcpName: 'PTF Leuseni',
    plate: 'CZ-9821-BK', vehicleType: 'truck', flow: 'TRANSIT',
    traderName: 'Bohemia Freight s.r.o.', hsCode: '8471.30',
    goodsDesc: { EN: 'Laptops + peripherals - T1 transit CZ-MD-KZ', RO: 'Laptopuri + periferice - tranzit T1 CZ-MD-KZ' },
    declaredValue: 128000, currency: 'EUR', outcome: 'CLEARED', channel: 'YELLOW', riskScore: 48,
    bpFindings: { bio: false, doc: false, wl: false, notes: 'Driver docs OK; AEO-F status; NCTS T1 verified' },
    svFindings: { duties: 0, notes: 'Transit bond active; NCTS movement ref 21MD0044817623' },
    officerBP: 'Serg. Harea C.', officerSV: 'Inspector Luca M.',
    recordedAtMsAgo: 21600000,
  },
  {
    id: 'TIA-006', bcpId: 'PTF_PALANCA', bcpName: 'PTF Palanca',
    plate: 'OD-04-KBW', vehicleType: 'truck', flow: 'EXPORT',
    traderName: 'AgriExport-MD SRL', hsCode: '0702.00',
    goodsDesc: { EN: 'Tomatoes - EXPORT, phytosanitary certificate verified', RO: 'Rosii - EXPORT, certificat fitosanitar verificat' },
    declaredValue: 18500, currency: 'EUR', outcome: 'CLEARED', channel: 'GREEN', riskScore: 12,
    bpFindings: { bio: false, doc: false, wl: false, notes: 'Routine check - all OK' },
    svFindings: { duties: 0, notes: 'ASYCUDA export declaration valid; weight match 22.4t' },
    officerBP: 'Serg. Oprea R.', officerSV: 'Inspector Vrabie T.',
    recordedAtMsAgo: 28800000,
  },
];


// ─── Operational Information Management Layer ─────────────────────────────────
const OpsInfoLayer: React.FC<{
  vehicles: Vehicle[];
  declarations: Declaration[];
  alerts: Alert[];
  lang: Language;
  selectedBCP: string;
}> = ({ vehicles, declarations, alerts, lang, selectedBCP }) => {
  const now = Date.now();
  const bcpAlerts    = alerts.filter(a => a.bcpId === selectedBCP && a.severity === 'HIGH');
  const allHighAlerts = alerts.filter(a => a.severity === 'HIGH');
  const bcpVeh       = vehicles.filter(v => v.bcpId === selectedBCP);
  const inControl    = bcpVeh.filter(v => v.status === 'in_customs').length;
  const waiting      = bcpVeh.filter(v => v.status === 'waiting_customs').length;
  const cleared      = bcpVeh.filter(v => v.status === 'cleared').length;
  const bcpDecls     = declarations.filter(d => {
    const lv = vehicles.find(v => v.id === d.linkedVehicleId || v.plate === d.vehiclePlate);
    return lv ? lv.bcpId === selectedBCP : false;
  });
  const redCh   = bcpDecls.filter(d => d.channel === 'RED').length;
  const yelCh   = bcpDecls.filter(d => d.channel === 'YELLOW').length;
  const grnCh   = bcpDecls.filter(d => d.channel === 'GREEN').length;
  const total   = redCh + yelCh + grnCh || 1;

  const KPI_ITEMS = [
    { label: { EN: 'Incidents', RO: 'Incidente', FR: 'Incidents', RU: 'Инциденты' }[lang],           val: bcpAlerts.length,     cls: 'red',     icon: '⚠️' },
    { label: { EN: 'In Control', RO: 'În Control', FR: 'En Contrôle', RU: 'На Контроле' }[lang],     val: inControl,            cls: 'amber',   icon: '🔍' },
    { label: { EN: 'Waiting', RO: 'Așteptare', FR: 'En Attente', RU: 'В Очереди' }[lang],           val: waiting,              cls: 'blue',    icon: '⏳' },
    { label: { EN: 'RED Channel', RO: 'Canal ROȘU', FR: 'Canal ROUGE', RU: 'Красный Кан.' }[lang],   val: redCh,                cls: 'red',     icon: '🚨' },
    { label: { EN: 'Cleared', RO: 'Eliberate', FR: 'Dédouanées', RU: 'Оформлено' }[lang],           val: cleared,              cls: 'emerald', icon: '✓' },
    { label: { EN: 'Net. Alerts', RO: 'Alerte Rețea', FR: 'Alertes Réseau', RU: 'Сет. Тревоги' }[lang], val: allHighAlerts.length, cls: 'orange',  icon: '📡' },
  ];

  const EVENTS = [
    { time: '2m',  icon: '🔍', text: { EN: 'Physical inspection started — IT-843-YK', RO: 'Inspecție fizică pornită — IT-843-YK', FR: 'Inspection physique démarrée — IT-843-YK', RU: 'Физический досмотр — IT-843-YK' }[lang] },
    { time: '8m',  icon: '🚨', text: { EN: 'SIS II alert triggered — B-47-AXW', RO: 'Alertă SIS II — B-47-AXW', FR: 'Alerte SIS II déclenchée — B-47-AXW', RU: 'Тревога SIS II — B-47-AXW' }[lang] },
    { time: '15m', icon: '📋', text: { EN: 'RED channel declaration — 3 trucks queued', RO: 'Declarație canal ROȘU — 3 camioane în coadă', FR: 'Déclaration canal ROUGE — 3 camions', RU: 'Декларация красного канала — 3 грузовика' }[lang] },
    { time: '22m', icon: '✓',  text: { EN: 'Mission M-2026-047 activated — Leuseni', RO: 'Misiunea M-2026-047 activată — Leuseni', FR: 'Mission M-2026-047 activée — Leuseni', RU: 'Миссия M-2026-047 активирована' }[lang] },
    { time: '31m', icon: '📡', text: { EN: 'INTERPOL query — VSCI match confirmed', RO: 'Interogare INTERPOL — potrivire VSCI confirmată', FR: 'Requête INTERPOL — correspondance VSCI', RU: 'Запрос ИНТЕРПОЛ — совпадение VSCI подтверждено' }[lang] },
  ];

  const NOTIFS = [
    { type: 'URGENT', text: { EN: 'INTERPOL: stolen BMW IT-843-YK confirmed at Cahul', RO: 'INTERPOL: BMW furat IT-843-YK confirmat la Cahul', FR: 'INTERPOL: BMW volé IT-843-YK confirmé à Cahul', RU: 'ИНТЕРПОЛ: угнанный BMW IT-843-YK подтверждён в Кагул' }[lang], time: '5m' },
    { type: 'INFO',   text: { EN: 'BMA notified — overstay case BMA/2026/183', RO: 'BMA notificat — caz depășire BMA/2026/183', FR: 'BMA notifié — dépassement BMA/2026/183', RU: 'БМА уведомлён — дело BMA/2026/183' }[lang], time: '18m' },
    { type: 'WARN',   text: { EN: 'Scanner offline — PTF Briceni lane 2', RO: 'Scanner offline — PTF Briceni banda 2', FR: 'Scanner hors ligne — PTF Briceni voie 2', RU: 'Сканер офлайн — PTF Briceni полоса 2' }[lang], time: '32m' },
    { type: 'INFO',   text: { EN: 'Shift handover 18:00 — all BCPs', RO: 'Predare tură 18:00 — toate BCPs', FR: 'Passation quart 18h00 — tous les PdP', RU: 'Сдача смены 18:00 — все КПП' }[lang], time: '1h' },
  ];

  const FIELD_INTEL = [
    { priority: 'HIGH',   src: { EN: 'Officer Leuseni', RO: 'Ofițer Leuseni', FR: 'Officier Leuseni', RU: 'Офицер Леушены' }[lang], time: '12m', text: { EN: 'Convoy of 4 unmarked vans — BE plates — requesting docs simultaneously, unusual behavior', RO: 'Convoi 4 dube fără marcaje — plăci BE — solicită documente simultan, comportament neobișnuit', FR: 'Convoi 4 fourgons non marqués — plaques BE — demandent docs simultanément', RU: 'Колонна 4 микроавтобусов без маркировки — BE номера — запрашивают документы одновременно' }[lang] },
    { priority: 'HIGH',   src: { EN: 'OCC IGPF Intel', RO: 'Intel OCC IGPF', FR: 'Rens. OCC IGPF', RU: 'Разведка ОКЦ ИГПФ' }[lang], time: '2h', text: { EN: 'Organized group using cloned EU plates for vehicle smuggling — active on Cahul/Palanca axis', RO: 'Grup organizat cu plăci EU clonate pentru contrabandă vehicule — axa Cahul/Palanca', FR: 'Groupe organisé utilisant plaques UE clonées — axe Cahul/Palanca', RU: 'Организованная группа с клонированными EU номерами — ось Кагул/Паланка' }[lang] },
    { priority: 'MEDIUM', src: { EN: 'Agent Sculeni', RO: 'Agent Sculeni', FR: 'Agent Sculeni', RU: 'Агент Скулень' }[lang], time: '27m', text: { EN: 'Coach driver Gal Trans shows stress signs, refused to answer re: passenger seat 14', RO: 'Șoferul Gal Trans prezintă semne de stres, refuză să răspundă despre pax scaun 14', FR: 'Chauffeur Gal Trans stressé, refuse répondre concernant passager siège 14', RU: 'Водитель Gal Trans под стрессом, отказывается отвечать о пассажире 14' }[lang] },
    { priority: 'LOW',    src: { EN: 'Agent Cahul', RO: 'Agent Cahul', FR: 'Agent Cahul', RU: 'Агент Кагул' }[lang], time: '1h', text: { EN: 'Increased IT vehicles — expected olive harvest export season peak', RO: 'Vehicule IT în creștere — vârf sezon export recoltă măsline', FR: 'Hausse véhicules IT — pic export saison récolte olives', RU: 'Рост IT транспорта — ожидаемый пик сезона экспорта оливок' }[lang] },
  ];

  const SYNC = [
    { label: 'IGPF OCC',       status: 'SYNC',    color: 'emerald' },
    { label: 'Serviciul Vamal', status: 'SYNC',    color: 'emerald' },
    { label: 'BMA',             status: 'SYNC',    color: 'emerald' },
    { label: 'ASYCUDA',         status: 'SYNC',    color: 'emerald' },
    { label: 'I-24/7',          status: 'SYNC',    color: 'emerald' },
    { label: 'SIS II',          status: 'DELAYED', color: 'amber'   },
  ];

  const priCls = (p: string) =>
    p === 'HIGH'   ? 'border-orange-500/30 bg-orange-950/10 text-orange-400' :
    p === 'MEDIUM' ? 'border-amber-500/25  bg-amber-950/5  text-amber-400'   :
                     'border-slate-700/30  bg-slate-900/20 text-slate-500';

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider">
          {{ EN: 'Operational Information Management', RO: 'Gestionare Informații Operaționale', FR: 'Gestion Informations Opérationnelles', RU: 'Управление Оперативной Информацией' }[lang]}
        </h2>
        <span className="text-[8px] text-slate-600 ml-auto font-mono uppercase tracking-wider hidden xl:block">
          {{ EN: 'Central Operational Layer', RO: 'Strat Operațional Central', FR: 'Couche Opérationnelle Centrale', RU: 'Центральный Операт. Уровень' }[lang]}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-2">
        {KPI_ITEMS.map(k => (
          <div key={k.label} className={`p-2.5 rounded-lg border bg-${k.cls}-500/5 border-${k.cls}-500/20`}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-[10px] shrink-0">{k.icon}</span>
              <span className={`text-[7px] text-${k.cls}-400 font-bold uppercase tracking-wide truncate`}>{k.label}</span>
            </div>
            <span className={`text-2xl font-black text-${k.cls}-300`}>{k.val}</span>
          </div>
        ))}
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* ── Col 1: Incidents + Events ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className="text-[9px] font-bold text-red-300 uppercase tracking-wider">
              {{ EN: 'Active Incidents', RO: 'Incidente Active', FR: 'Incidents Actifs', RU: 'Активные Инциденты' }[lang]}
            </span>
            <span className="text-[7px] text-slate-600 ml-auto font-mono">{bcpAlerts.length}</span>
          </div>
          <div className="space-y-1.5">
            {bcpAlerts.length === 0 ? (
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-center">
                <span className="text-[9px] text-emerald-400">✓ {{ EN: 'No active incidents at this BCP', RO: 'Niciun incident activ la acest BCP', FR: 'Aucun incident actif à ce PdP', RU: 'Нет активных инцидентов на этом КПП' }[lang]}</span>
              </div>
            ) : bcpAlerts.slice(0, 4).map(a => (
              <div key={a.id} className="p-2 rounded-lg border border-red-500/30 bg-red-950/20">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[8px] font-bold text-red-300 truncate">{a.title}</span>
                  <span className="text-[7px] text-red-500 shrink-0 ml-1 font-mono">{Math.floor((now - a.timestamp) / 60000)}m</span>
                </div>
                <p className="text-[7px] text-slate-500 line-clamp-2">{a.message}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/30">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
            <span className="text-[9px] font-bold text-amber-300 uppercase tracking-wider">
              {{ EN: 'Operational Events', RO: 'Evenimente Operaționale', FR: 'Événements Opérationnels', RU: 'Оперативные События' }[lang]}
            </span>
          </div>
          <div className="space-y-1.5">
            {EVENTS.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-[7px]">
                <span className="text-slate-600 font-mono w-6 shrink-0 text-right">{ev.time}</span>
                <span className="shrink-0">{ev.icon}</span>
                <span className="text-slate-400 leading-tight">{ev.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 2: Flows + Sync ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
            <span className="text-[9px] font-bold text-blue-300 uppercase tracking-wider">
              {{ EN: 'Active Flows & Traffic', RO: 'Fluxuri Active & Trafic', FR: 'Flux Actifs & Trafic', RU: 'Активные Потоки & Трафик' }[lang]}
            </span>
          </div>
          <div className="p-3 rounded-lg border border-slate-700/40 bg-slate-900/30 space-y-2">
            <div className="flex items-center justify-between text-[8px] font-bold text-slate-400 uppercase tracking-wide">
              <span>{{ EN: 'Channel Distribution', RO: 'Distribuție Canale', FR: 'Répartition Canaux', RU: 'Распределение Каналов' }[lang]}</span>
              <span className="font-mono text-slate-600">{bcpDecls.length} decl.</span>
            </div>
            {[
              { label: 'RED',    count: redCh,  bar: 'bg-red-500',     txt: 'text-red-400'     },
              { label: 'YELLOW', count: yelCh,  bar: 'bg-amber-400',   txt: 'text-amber-400'   },
              { label: 'GREEN',  count: grnCh,  bar: 'bg-emerald-500', txt: 'text-emerald-400' },
            ].map(ch => (
              <div key={ch.label} className="flex items-center gap-2">
                <span className={`text-[7px] font-bold w-12 shrink-0 ${ch.txt}`}>{ch.label}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full ${ch.bar} rounded-full`} style={{ width: `${(ch.count / total) * 100}%` }} />
                </div>
                <span className={`text-[8px] font-bold w-4 text-right ${ch.txt}`}>{ch.count}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/30">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
            <span className="text-[9px] font-bold text-violet-300 uppercase tracking-wider">
              {{ EN: 'BCP-Unit Sync', RO: 'Sincronizare BCP-Unitate', FR: 'Synchro PdP-Unité', RU: 'Синхронизация КПП-Единица' }[lang]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {SYNC.map(s => (
              <div key={s.label} className={`flex items-center gap-1.5 p-1.5 rounded border bg-${s.color}-500/5 border-${s.color}-500/20`}>
                <div className={`w-1.5 h-1.5 rounded-full bg-${s.color}-400 ${s.status === 'SYNC' ? 'animate-pulse' : ''} shrink-0`} />
                <span className="text-[7px] text-slate-400 truncate">{s.label}</span>
                <span className={`text-[6px] font-bold text-${s.color}-400 ml-auto shrink-0`}>{s.status}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/30">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
            <span className="text-[9px] font-bold text-teal-300 uppercase tracking-wider">
              {{ EN: 'Notifications', RO: 'Notificări', FR: 'Notifications', RU: 'Уведомления' }[lang]}
            </span>
          </div>
          <div className="space-y-1.5">
            {NOTIFS.map((n, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded border text-[7px] ${
                n.type === 'URGENT' ? 'border-red-500/30 bg-red-950/15' :
                n.type === 'WARN'   ? 'border-amber-500/25 bg-amber-950/10' :
                'border-slate-700/30 bg-slate-900/20'
              }`}>
                <span className={`font-bold shrink-0 ${n.type === 'URGENT' ? 'text-red-400' : n.type === 'WARN' ? 'text-amber-400' : 'text-slate-500'}`}>{n.type}</span>
                <span className="text-slate-400 leading-tight flex-1">{n.text}</span>
                <span className="text-slate-600 font-mono shrink-0">{n.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Col 3: Field Intel ── */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
            <span className="text-[9px] font-bold text-green-300 uppercase tracking-wider">
              {{ EN: 'Field Intelligence', RO: 'Informații din Teren', FR: 'Renseignements Terrain', RU: 'Полевая Разведка' }[lang]}
            </span>
          </div>
          <div className="space-y-2">
            {FIELD_INTEL.map((item, i) => (
              <div key={i} className={`p-2.5 rounded-lg border ${priCls(item.priority)}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[6px] font-bold px-1 py-0.5 rounded border ${priCls(item.priority)}`}>{item.priority}</span>
                    <span className="text-[7px] text-slate-500">{item.src}</span>
                  </div>
                  <span className="text-[6px] text-slate-600 font-mono">{item.time}</span>
                </div>
                <p className="text-[7px] text-slate-400 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


// ─── Mission Planning Layer ───────────────────────────────────────────────────
const MissionLayer: React.FC<{
  vehicles: Vehicle[];
  declarations: Declaration[];
  lang: Language;
  selectedBCP: string;
}> = ({ vehicles, declarations, lang, selectedBCP }) => {

  type MStatus = 'ACTIVE' | 'STANDBY' | 'PLANNING' | 'COMPLETED';
  type MType   = 'JOINT' | 'BP' | 'SV';
  type TPrio   = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  type TStatus = 'TODO' | 'ACTIVE' | 'DONE';

  interface Mission {
    id: string; type: MType; bcp: string; status: MStatus;
    startTime: string; teams: string; priority: 'HIGH' | 'MEDIUM' | 'CRITICAL';
    officerIC: string;
    objective: { EN: string; RO: string; FR: string; RU: string; };
  }
  interface Task {
    id: string; assignee: string; priority: TPrio; status: TStatus;
    text: { EN: string; RO: string; FR: string; RU: string; };
  }

  const MISSIONS: Mission[] = [
    { id: 'M-2026-047', type: 'JOINT', bcp: 'PTF_LEUSENI', status: 'ACTIVE',    startTime: '08:30', teams: 'BP-T3, SV-T2', priority: 'HIGH',     officerIC: 'Maior Ionescu V.', objective: { EN: 'Selective tobacco control — RED channel trucks (OLAF profile active)', RO: 'Control selectiv tutun — camioane canal ROȘU (profil OLAF activ)', FR: 'Contrôle sélectif tabac — camions canal ROUGE (profil OLAF actif)', RU: 'Выборочный контроль табака — грузовики красного канала (профиль ОЛАФ)' } },
    { id: 'M-2026-048', type: 'BP',    bcp: 'PTF_SCULENI', status: 'ACTIVE',    startTime: '09:15', teams: 'BP-T1',         priority: 'HIGH',     officerIC: 'Cpt. Moraru A.',   objective: { EN: 'Enhanced passenger screening — coach bus inspection (overstay risk)', RO: 'Screening pasageri intensificat — inspecție autocar (risc depășire)', FR: 'Contrôle renforcé passagers — inspection autocar (risque dépassement)', RU: 'Усиленный контроль пассажиров — проверка автобуса (риск просрочки)' } },
    { id: 'M-2026-049', type: 'JOINT', bcp: 'PTF_CAHUL',   status: 'STANDBY',   startTime: '11:00', teams: 'BP-T4, SV-T3', priority: 'MEDIUM',   officerIC: 'Lt. Botnaru D.',   objective: { EN: 'Vehicle documentation check — EU plates, EUCARIS cross-reference', RO: 'Verificare documente vehicule — plăci EU, cross-referință EUCARIS', FR: 'Vérification docs véhicules — plaques UE, recoupement EUCARIS', RU: 'Проверка документов — EU номера, перекрестная ссылка EUCARIS' } },
    { id: 'M-2026-050', type: 'SV',    bcp: 'PTF_PALANCA', status: 'PLANNING',  startTime: '13:00', teams: 'SV-T1',         priority: 'HIGH',     officerIC: 'Insp. Luca T.',    objective: { EN: 'OLAF-coordinated bulk goods verification — agricultural TIRs', RO: 'Verificare mărfuri vrac coordonată OLAF — TIR-uri agricole', FR: 'Vérification marchandises vrac coordonnée OLAF — TIR agricoles', RU: 'Проверка навалочных грузов в координации с ОЛАФ — с/х TIR' } },
  ];

  const TASKS: Task[] = [
    { id: 'T-01', assignee: 'SV-T2',    priority: 'HIGH',     status: 'TODO',   text: { EN: 'Physical check TIR UA-36-NRB at Briceni — cigarette concealment', RO: 'Control fizic TIR UA-36-NRB la Briceni — disimulare țigări', FR: 'Contrôle physique TIR UA-36-NRB à Briceni — dissimulation cigarettes', RU: 'Физический контроль TIR UA-36-NRB в Бричень — сокрытие сигарет' } },
    { id: 'T-02', assignee: 'BP-T1',    priority: 'MEDIUM',   status: 'TODO',   text: { EN: 'Notify BMA — overstay case BMA/2026/183 Sculeni', RO: 'Notificare BMA — caz depășire BMA/2026/183 Sculeni', FR: 'Notifier BMA — cas dépassement BMA/2026/183 Sculeni', RU: 'Уведомить БМА — дело BMA/2026/183 Скулень' } },
    { id: 'T-03', assignee: 'OCC',      priority: 'LOW',      status: 'TODO',   text: { EN: 'Daily report — Coordination Unit by 17:00', RO: 'Raport zilnic — Unitate de Coordonare până la 17:00', FR: 'Rapport journalier — Unité Coordination avant 17h00', RU: 'Ежедневный отчёт — Координационная Единица до 17:00' } },
    { id: 'T-04', assignee: 'BP-T4',    priority: 'CRITICAL', status: 'ACTIVE', text: { EN: 'Physical inspection BMW IT-843-YK at Cahul — stolen vehicle', RO: 'Inspecție fizică BMW IT-843-YK la Cahul — vehicul furat', FR: 'Inspection physique BMW IT-843-YK à Cahul — véhicule volé', RU: 'Физический досмотр BMW IT-843-YK в Кагул — угнанный автомобиль' } },
    { id: 'T-05', assignee: 'SV-T3',    priority: 'HIGH',     status: 'ACTIVE', text: { EN: 'EUCARIS validation + VIN expert request — IT-843-YK', RO: 'Validare EUCARIS + solicitare expert VIN — IT-843-YK', FR: 'Validation EUCARIS + expertise VIN requise — IT-843-YK', RU: 'Проверка EUCARIS + запрос эксперта VIN — IT-843-YK' } },
    { id: 'T-06', assignee: 'OCC-IGPF', priority: 'HIGH',     status: 'DONE',   text: { EN: 'I-24/7 query — Rusu Valeriu Ion (SIS II Art.24)', RO: 'Interogare I-24/7 — Rusu Valeriu Ion (SIS II Art.24)', FR: 'Requête I-24/7 — Rusu Valeriu Ion (SIS II Art.24)', RU: 'Запрос I-24/7 — Русу Валериу Ион (SIS II ст.24)' } },
    { id: 'T-07', assignee: 'BP-T1',    priority: 'MEDIUM',   status: 'DONE',   text: { EN: 'BMA notification — Toshmatov overstay +195 days', RO: 'Notificare BMA — Toshmatov depășire +195 zile', FR: 'Notification BMA — Toshmatov dépassement +195 jours', RU: 'Уведомление БМА — Тошматов просрочка +195 дней' } },
    { id: 'T-08', assignee: 'SV-T1',    priority: 'LOW',      status: 'DONE',   text: { EN: 'NCTS T1 verification — Bohemia Freight CZ-9821-BK', RO: 'Verificare NCTS T1 — Bohemia Freight CZ-9821-BK', FR: 'Vérification NCTS T1 — Bohemia Freight CZ-9821-BK', RU: 'Проверка NCTS T1 — Bohemia Freight CZ-9821-BK' } },
  ];

  const statusCls: Record<MStatus, string> = {
    ACTIVE:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    STANDBY:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    PLANNING:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
    COMPLETED: 'bg-slate-700/30 text-slate-500 border-slate-700/40',
  };
  const typeCls: Record<MType, string> = {
    JOINT: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    BP:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
    SV:    'bg-orange-500/15 text-orange-400 border-orange-500/30',
  };
  const prioCls: Record<string, string> = {
    CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
    HIGH:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
    MEDIUM:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    LOW:      'bg-slate-700/25 text-slate-500 border-slate-700/35',
  };
  const taskCols: { id: TStatus; label: { EN: string; RO: string; FR: string; RU: string }; dot: string }[] = [
    { id: 'TODO',   label: { EN: 'To Do', RO: 'De Făcut', FR: 'À Faire', RU: 'К Выполнению' }, dot: 'bg-slate-500' },
    { id: 'ACTIVE', label: { EN: 'Active', RO: 'Activ', FR: 'Actif', RU: 'Активно' },          dot: 'bg-amber-400' },
    { id: 'DONE',   label: { EN: 'Done', RO: 'Finalizat', FR: 'Terminé', RU: 'Выполнено' },     dot: 'bg-emerald-400' },
  ];

  const activeMissions = MISSIONS.filter(m => m.bcp === selectedBCP || m.bcp === 'ALL');
  const allMissions = MISSIONS;
  const bcpVeh = vehicles.filter(v => v.bcpId === selectedBCP);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse shrink-0" />
        <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider">
          {{ EN: 'Mission Planning & Control Coordination', RO: 'Planificare Misiuni & Coordonare Control', FR: 'Planification Missions & Coordination', RU: 'Планирование Миссий & Координация' }[lang]}
        </h2>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">{MISSIONS.filter(m => m.status === 'ACTIVE').length} {{ EN: 'ACTIVE', RO: 'ACTIVE', FR: 'ACTIVES', RU: 'АКТИВНО' }[lang]}</span>
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-400">{MISSIONS.filter(m => m.status === 'STANDBY').length} {{ EN: 'STANDBY', RO: 'STANDBY', FR: 'VEILLE', RU: 'В ГОТОВНОСТИ' }[lang]}</span>
        </div>
      </div>

      {/* Active missions grid */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
          <span className="text-[9px] font-bold text-teal-300 uppercase tracking-wider">
            {{ EN: 'Active & Planned Missions', RO: 'Misiuni Active & Planificate', FR: 'Missions Actives & Planifiées', RU: 'Активные & Запланированные Миссии' }[lang]}
          </span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {allMissions.map(m => {
            const isBCP = m.bcp === selectedBCP;
            return (
              <div key={m.id} className={`p-3 rounded-xl border transition-all ${isBCP ? 'border-teal-500/40 bg-teal-950/15' : 'border-slate-700/40 bg-slate-900/25'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${typeCls[m.type]}`}>{m.type}</span>
                    <span className="text-[8px] font-bold text-slate-200 font-mono">{m.id}</span>
                    {isBCP && <span className="text-[6px] font-bold text-teal-400 bg-teal-500/10 px-1 rounded border border-teal-500/20">THIS BCP</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`text-[6px] font-bold px-1 py-0.5 rounded border ${prioCls[m.priority]}`}>{m.priority}</span>
                    <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${statusCls[m.status]}`}>{m.status}</span>
                  </div>
                </div>
                <p className="text-[8px] text-slate-300 leading-snug mb-2">{m.objective[lang as 'EN' | 'RO' | 'FR' | 'RU'] ?? m.objective.EN}</p>
                <div className="flex items-center gap-3 text-[7px] text-slate-500">
                  <span>🕐 {m.startTime}</span>
                  <span>👥 {m.teams}</span>
                  <span className="ml-auto font-bold text-slate-400">{m.officerIC}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task board */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
          <span className="text-[9px] font-bold text-violet-300 uppercase tracking-wider">
            {{ EN: 'Task Assignment Board', RO: 'Tablou Sarcini', FR: 'Tableau Assignation Tâches', RU: 'Доска Задач' }[lang]}
          </span>
          <span className="text-[7px] text-slate-600 ml-auto">{TASKS.filter(t => t.status === 'ACTIVE').length} {{ EN: 'in progress', RO: 'în desfășurare', FR: 'en cours', RU: 'в процессе' }[lang]}</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          {taskCols.map(col => {
            const colTasks = TASKS.filter(t => t.status === col.id);
            return (
              <div key={col.id} className="space-y-1.5">
                <div className="flex items-center gap-1.5 px-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${col.dot} shrink-0`} />
                  <span className="text-[8px] font-bold text-slate-400 uppercase">{col.label[lang as 'EN' | 'RO' | 'FR' | 'RU'] ?? col.label.EN}</span>
                  <span className="text-[7px] text-slate-600 ml-auto">{colTasks.length}</span>
                </div>
                {colTasks.map(t => (
                  <div key={t.id} className={`p-2 rounded-lg border text-[7px] ${
                    col.id === 'ACTIVE' ? 'border-amber-500/25 bg-amber-950/5' :
                    col.id === 'DONE'   ? 'border-slate-700/30 bg-slate-900/15 opacity-70' :
                    'border-slate-700/35 bg-slate-900/20'
                  }`}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`font-bold px-1 py-0.5 rounded border ${prioCls[t.priority]}`}>{t.priority}</span>
                      <span className="text-slate-500 font-mono">{t.assignee}</span>
                    </div>
                    <p className={`leading-tight ${col.id === 'DONE' ? 'line-through text-slate-600' : 'text-slate-400'}`}>
                      {t.text[lang as 'EN' | 'RO' | 'FR' | 'RU'] ?? t.text.EN}
                    </p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Resource summary */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
          <span className="text-[9px] font-bold text-orange-300 uppercase tracking-wider">
            {{ EN: 'Resource & Team Status', RO: 'Resurse & Status Echipe', FR: 'Ressources & Statut Équipes', RU: 'Ресурсы & Статус Групп' }[lang]}
          </span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {[
            { team: 'BP-T1', post: 'PTF Sculeni', status: 'DEPLOYED', task: 'M-2026-048' },
            { team: 'BP-T3', post: 'PTF Leuseni', status: 'DEPLOYED', task: 'M-2026-047' },
            { team: 'BP-T4', post: 'PTF Cahul',   status: 'DEPLOYED', task: 'M-2026-049' },
            { team: 'SV-T1', post: 'PTF Palanca', status: 'STANDBY',  task: 'M-2026-050' },
            { team: 'SV-T2', post: 'PTF Leuseni', status: 'DEPLOYED', task: 'M-2026-047' },
            { team: 'SV-T3', post: 'PTF Cahul',   status: 'DEPLOYED', task: 'T-05' },
            { team: 'BP-T2', post: 'PTF Briceni', status: 'AVAILABLE', task: '—' },
            { team: 'SV-T4', post: 'Base',        status: 'RESERVE',  task: '—' },
          ].map(r => (
            <div key={r.team} className={`p-2 rounded-lg border text-[7px] ${
              r.status === 'DEPLOYED'  ? 'border-teal-500/25 bg-teal-950/8' :
              r.status === 'STANDBY'   ? 'border-amber-500/20 bg-amber-950/5' :
              r.status === 'AVAILABLE' ? 'border-emerald-500/20 bg-emerald-950/5' :
              'border-slate-700/30 bg-slate-900/15'
            }`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-black text-slate-200">{r.team}</span>
                <span className={`font-bold ${
                  r.status === 'DEPLOYED'  ? 'text-teal-400' :
                  r.status === 'STANDBY'   ? 'text-amber-400' :
                  r.status === 'AVAILABLE' ? 'text-emerald-400' :
                  'text-slate-600'
                }`}>{r.status}</span>
              </div>
              <div className="text-slate-500 truncate">{r.post}</div>
              {r.task !== '—' && <div className="text-teal-500 font-mono truncate">{r.task}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


// ─── Operational Cooperation Layer ───────────────────────────────────────────
const CoopLayer: React.FC<{ lang: Language; selectedBCP: string }> = ({ lang, selectedBCP }) => {

  type ConnStatus = 'ONLINE' | 'DELAYED' | 'OFFLINE' | 'RESTRICTED';
  type ReqStatus  = 'RESPONDED' | 'PENDING' | 'IN REVIEW' | 'CLOSED';

  interface Partner {
    id: string; name: string; shortName: string;
    type: 'GLOBAL' | 'EU' | 'REGIONAL' | 'BILATERAL' | 'NATIONAL';
    status: ConnStatus; lastSync: string; openRequests: number;
    color: string; flag: string;
    desc: { EN: string; RO: string; FR: string; RU: string; };
  }
  interface CoopRequest {
    id: string; from: string; subject: { EN: string; RO: string; FR: string; RU: string; };
    status: ReqStatus; time: string; ref?: string; priority: 'URGENT' | 'NORMAL';
  }

  const PARTNERS: Partner[] = [
    { id: 'INTERPOL',   name: 'INTERPOL I-24/7',       shortName: 'INTERPOL',   type: 'GLOBAL',     status: 'ONLINE',      lastSync: '2m',   openRequests: 3, color: 'red',     flag: '🌐', desc: { EN: 'Stolen vehicles (VSCI), wanted persons, criminal databases', RO: 'Vehicule furate (VSCI), persoane urmărite, baze de date criminale', FR: 'Véhicules volés (VSCI), personnes recherchées, bases criminelles', RU: 'Угнанные авто (VSCI), разыскиваемые лица, криминальные БД' } },
    { id: 'EUROPOL',    name: 'EUROPOL SIENA',          shortName: 'EUROPOL',    type: 'EU',         status: 'ONLINE',      lastSync: '5m',   openRequests: 1, color: 'blue',    flag: '🇪🇺', desc: { EN: 'Organized crime, terrorism, drug trafficking, cybercrime', RO: 'Crimă organizată, terorism, trafic droguri, cybercriminalitate', FR: 'Crime organisé, terrorisme, trafic drogues, cybercriminalité', RU: 'Организованная преступность, терроризм, наркотики, киберпреступность' } },
    { id: 'FRONTEX',    name: 'FRONTEX JORA',           shortName: 'FRONTEX',    type: 'EU',         status: 'ONLINE',      lastSync: '12m',  openRequests: 0, color: 'sky',     flag: '🇪🇺', desc: { EN: 'Border surveillance, risk analysis, operational coordination EU', RO: 'Supraveghere frontiară, analiză risc, coordonare operațională UE', FR: 'Surveillance frontières, analyse risques, coordination opérationnelle UE', RU: 'Пограничный надзор, анализ рисков, оперативная координация ЕС' } },
    { id: 'OLAF',       name: 'OLAF AFIS',              shortName: 'OLAF',       type: 'EU',         status: 'ONLINE',      lastSync: '1h',   openRequests: 2, color: 'amber',   flag: '🇪🇺', desc: { EN: 'Anti-fraud, customs smuggling profiles, financial investigations', RO: 'Anti-fraudă, profiluri contrabandă vamală, investigații financiare', FR: 'Anti-fraude, profils contrebande douanière, enquêtes financières', RU: 'Антимошенничество, профили таможенной контрабанды, фин. расследования' } },
    { id: 'SELEC',      name: 'SELEC Bucharest',        shortName: 'SELEC',      type: 'REGIONAL',   status: 'ONLINE',      lastSync: '30m',  openRequests: 1, color: 'emerald', flag: '🌍', desc: { EN: 'SE Europe law enforcement, cross-border crime, joint operations', RO: 'Aplicarea legii SE Europa, criminalitate transfrontalieră, operații comune', FR: 'Application loi SE Europe, criminalité transfrontalière, opérations conjointes', RU: 'Правопорядок ЮВ Европы, трансграничная преступность, совместные операции' } },
    { id: 'POLITIA_RO', name: 'Poliția Română — IGPR',  shortName: 'IGPR',       type: 'BILATERAL',  status: 'ONLINE',      lastSync: '8m',   openRequests: 0, color: 'indigo',  flag: '🇷🇴', desc: { EN: 'Cross-border incident notification, joint patrols', RO: 'Notificare incidente transfrontaliere, patrulare comună', FR: 'Notification incidents transfrontaliers, patrouilles conjointes', RU: 'Уведомление о трансграничных инцидентах, совместные патрули' } },
    { id: 'POLITIA_UA', name: 'Поліція України',        shortName: 'NP Ukraine', type: 'BILATERAL',  status: 'DELAYED',     lastSync: '45m',  openRequests: 0, color: 'yellow',  flag: '🇺🇦', desc: { EN: 'Northern border cooperation, Palanca / Briceni axis', RO: 'Cooperare frontieră nordică, axa Palanca / Briceni', FR: 'Coopération frontière nord, axe Palanca / Briceni', RU: 'Сотрудничество на северной границе, ось Паланка / Бричень' } },
    { id: 'MAI_MD',     name: 'MAI Moldova — BMA + IP', shortName: 'MAI',        type: 'NATIONAL',   status: 'ONLINE',      lastSync: '1m',   openRequests: 5, color: 'teal',    flag: '🇲🇩', desc: { EN: 'BMA overstay cases, national police, SIS/ADIS databases', RO: 'Cazuri depășire BMA, poliția națională, baze de date SIS/ADIS', FR: 'Cas dépassement BMA, police nationale, bases SIS/ADIS', RU: 'Дела просрочки БМА, национальная полиция, базы SIS/ADIS' } },
    { id: 'PROC_MD',    name: 'Procuratura Gen. MD',    shortName: 'PGC',        type: 'NATIONAL',   status: 'ONLINE',      lastSync: '15m',  openRequests: 2, color: 'orange',  flag: '🇲🇩', desc: { EN: 'Criminal referrals, prosecution liaison, evidence chain', RO: 'Sesizări penale, legătură parchet, lanț de custodie probe', FR: 'Saisines pénales, liaison parquet, chaîne de custody preuves', RU: 'Уголовные дела, связь с прокуратурой, цепочка доказательств' } },
  ];

  const REQUESTS: CoopRequest[] = [
    { id: 'REQ-0892', from: 'INTERPOL I-24/7', status: 'RESPONDED', time: '14m', priority: 'URGENT', ref: 'TIA-002', subject: { EN: 'VSCI query — IT-843-YK confirmed stolen, reported Milano 03/2025', RO: 'Interogare VSCI — IT-843-YK confirmat furat, raportat Milano 03/2025', FR: 'Requête VSCI — IT-843-YK confirmé volé, signalé Milan 03/2025', RU: 'Запрос VSCI — IT-843-YK подтверждён угнанным, заявлен Милан 03/2025' } },
    { id: 'REQ-0891', from: 'EUROPOL SIENA',   status: 'PENDING',   time: '1h',  priority: 'NORMAL', ref: 'CASE-LEU-0847', subject: { EN: 'Watch alert update — profile Rusu Valeriu Ion, counterfeit docs', RO: 'Actualizare alertă supraveghere — profil Rusu Valeriu Ion, docs contrafăcute', FR: 'Mise à jour alerte surveillance — profil Rusu Valeriu Ion, docs contrefaits', RU: 'Обновление предупреждения — профиль Русу Валериу Ион, поддельные документы' } },
    { id: 'REQ-0889', from: 'OLAF AFIS',       status: 'RESPONDED', time: '2h',  priority: 'NORMAL', ref: 'RAR-2026-047', subject: { EN: 'Tobacco profile match — TIR UA-36-NRB, 380 kg cigarettes seized', RO: 'Potrivire profil tutun — TIR UA-36-NRB, 380 kg țigări sechestrate', FR: 'Correspondance profil tabac — TIR UA-36-NRB, 380 kg cigarettes saisies', RU: 'Совпадение профиля табака — TIR UA-36-NRB, 380 кг сигарет конфисковано' } },
    { id: 'REQ-0885', from: 'SELEC',           status: 'IN REVIEW', time: '6h',  priority: 'NORMAL', ref: 'RAR-2026-049', subject: { EN: 'Overstay pattern — UZ/KZ/TJ nationals Q2 2026, +340% vs baseline', RO: 'Tipar depășire — cetățeni UZ/KZ/TJ T2 2026, +340% față de baza', FR: 'Modèle dépassement — ressortissants UZ/KZ/TJ T2 2026, +340%', RU: 'Паттерн просрочки — граждане UZ/KZ/TJ Q2 2026, +340% к базовому' } },
    { id: 'REQ-0882', from: 'MAI Moldova',     status: 'CLOSED',    time: '8h',  priority: 'NORMAL', subject: { EN: 'BMA formal transfer — case BMA/2026/183 Sculeni (overstay)', RO: 'Transfer formal BMA — caz BMA/2026/183 Sculeni (depășire)', FR: 'Transfert formel BMA — dossier BMA/2026/183 Sculeni (dépassement)', RU: 'Формальная передача БМА — дело BMA/2026/183 Скулень' } },
  ];

  const statusColor: Record<ConnStatus, string> = {
    ONLINE:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    DELAYED:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
    OFFLINE:    'bg-red-500/15 text-red-400 border-red-500/30',
    RESTRICTED: 'bg-slate-700/30 text-slate-500 border-slate-700/40',
  };
  const reqStatusColor: Record<ReqStatus, string> = {
    'RESPONDED': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    'PENDING':   'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'IN REVIEW': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'CLOSED':    'bg-slate-700/25 text-slate-500 border-slate-700/35',
  };
  const typeColor: Record<string, string> = {
    GLOBAL: 'text-red-400', EU: 'text-blue-400', REGIONAL: 'text-emerald-400',
    BILATERAL: 'text-indigo-400', NATIONAL: 'text-teal-400',
  };

  const online = PARTNERS.filter(p => p.status === 'ONLINE').length;
  const totalReq = PARTNERS.reduce((s, p) => s + p.openRequests, 0);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse shrink-0" />
        <h2 className="text-sm font-black text-slate-100 uppercase tracking-wider">
          {{ EN: 'Operational Cooperation', RO: 'Cooperare Operațională', FR: 'Coopération Opérationnelle', RU: 'Оперативное Сотрудничество' }[lang]}
        </h2>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">{online}/9 {{ EN: 'online', RO: 'online', FR: 'en ligne', RU: 'онлайн' }[lang]}</span>
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-amber-400">{totalReq} {{ EN: 'open requests', RO: 'cereri deschise', FR: 'req. ouvertes', RU: 'открытых запросов' }[lang]}</span>
        </div>
      </div>

      {/* Partner grid */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
          <span className="text-[9px] font-bold text-sky-300 uppercase tracking-wider">
            {{ EN: 'Partner Agency Connections', RO: 'Conexiuni Agenții Partenere', FR: 'Connexions Agences Partenaires', RU: 'Подключения Партнёрских Агентств' }[lang]}
          </span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
          {PARTNERS.map(p => (
            <div key={p.id} className="p-3 rounded-xl border border-slate-700/40 bg-slate-900/25 hover:bg-slate-900/40 transition-colors">
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] shrink-0">{p.flag}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-slate-200 truncate">{p.name}</span>
                    </div>
                    <span className={`text-[7px] font-bold ${typeColor[p.type]}`}>{p.type}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${statusColor[p.status]}`}>{p.status}</span>
                  {p.openRequests > 0 && (
                    <span className="text-[6px] font-bold text-amber-400 bg-amber-500/10 px-1 rounded border border-amber-500/20">{p.openRequests} req</span>
                  )}
                </div>
              </div>
              <p className="text-[7px] text-slate-500 leading-tight line-clamp-2">{p.desc[lang as 'EN' | 'RO' | 'FR' | 'RU'] ?? p.desc.EN}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[6px] text-slate-600 font-mono">sync {p.lastSync}</span>
                <div className={`w-1.5 h-1.5 rounded-full ${p.status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : p.status === 'DELAYED' ? 'bg-amber-400' : 'bg-red-400'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active requests */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
          <span className="text-[9px] font-bold text-violet-300 uppercase tracking-wider">
            {{ EN: 'Active International Requests', RO: 'Cereri Internaționale Active', FR: 'Demandes Internationales Actives', RU: 'Активные Международные Запросы' }[lang]}
          </span>
        </div>
        <div className="space-y-2">
          {REQUESTS.map(r => (
            <div key={r.id} className={`p-3 rounded-lg border ${r.priority === 'URGENT' ? 'border-red-500/30 bg-red-950/10' : 'border-slate-700/35 bg-slate-900/20'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[7px] font-mono font-bold text-slate-400">{r.id}</span>
                  <span className="text-[8px] font-bold text-slate-300">{r.from}</span>
                  {r.priority === 'URGENT' && <span className="text-[6px] font-bold text-red-400 bg-red-500/10 px-1 rounded border border-red-500/20">URGENT</span>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded border ${reqStatusColor[r.status]}`}>{r.status}</span>
                  <span className="text-[6px] text-slate-600 font-mono">{r.time}</span>
                </div>
              </div>
              <p className="text-[8px] text-slate-400">{r.subject[lang as 'EN' | 'RO' | 'FR' | 'RU'] ?? r.subject.EN}</p>
              {r.ref && <span className="text-[6px] text-teal-500 font-mono mt-0.5 block">→ {r.ref}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* International framework */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
          <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">
            {{ EN: 'Interoperability Framework', RO: 'Cadru de Interoperabilitate', FR: "Cadre d'Interopérabilité", RU: 'Рамки Интероперабельности' }[lang]}
          </span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
          {[
            { name: 'Prüm Convention', scope: { EN: 'DNA / fingerprint / VIN exchange', RO: 'Schimb ADN / amprente / VIN', FR: 'Échange ADN / empreintes / VIN', RU: 'Обмен ДНК / отпечатки / VIN' }[lang], active: true },
            { name: 'SIS II Art. 24/36', scope: { EN: 'Wanted persons & stolen goods', RO: 'Persoane urmărite & bunuri furate', FR: 'Personnes recherchées & biens volés', RU: 'Разыскиваемые лица & похищенное' }[lang], active: true },
            { name: 'CITES Protocol',   scope: { EN: 'Endangered species trafficking', RO: 'Trafic specii pe cale de dispariție', FR: 'Trafic espèces menacées', RU: 'Торговля исчезающими видами' }[lang], active: true },
            { name: 'UN Resolution 1267', scope: { EN: 'Terrorism financing monitoring', RO: 'Monitorizare finanțare terorism', FR: 'Surveillance financement terrorisme', RU: 'Мониторинг финансирования терроризма' }[lang], active: true },
            { name: 'EU-MD Association', scope: { EN: 'Customs cooperation + DCFTA', RO: 'Cooperare vamală + DCFTA', FR: 'Coopération douanière + DCFTA', RU: 'Таможенное сотрудничество + DCFTA' }[lang], active: true },
            { name: 'Budapest Convention', scope: { EN: 'Cybercrime cooperation', RO: 'Cooperare în criminalitate cibernetică', FR: 'Coopération criminalité informatique', RU: 'Сотрудничество в киберпреступности' }[lang], active: false },
          ].map(f => (
            <div key={f.name} className={`p-2 rounded-lg border text-[7px] ${f.active ? 'border-indigo-500/20 bg-indigo-950/8' : 'border-slate-700/30 bg-slate-900/15 opacity-60'}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.active ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                <span className="font-bold text-slate-300 truncate">{f.name}</span>
              </div>
              <span className="text-slate-500 leading-tight block">{f.scope}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Demo Engine ─────────────────────────────────────────────────────────────
type DemoRole = 'bp' | 'customs' | 'coordinator';

interface DemoDecision {
  id: string;
  label: Record<Language, string>;
  outcome: Record<Language, string>;
}
interface DemoScenarioEvent {
  id: string;
  type: 'traffic' | 'anpr' | 'cargo' | 'congestion' | 'resource' | 'cooperation';
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  module: LayerType;
  title: Record<Language, string>;
  brief: Record<Language, string>;
  live: Record<Language, string>;
  vehiclesInject: number;
  alertsInject: number;
  decisions: Record<DemoRole, DemoDecision[]>;
}

const DEMO_BCP_ID = 'BCP_LEUSENI';

const DEMO_VEHICLES_POOL: Vehicle[] = [
  { id:'DV-001', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'GL 47 XRT', vehicleType:'truck', subType:'TIR',          goodsType:'General cargo',        companyName:'TransEuro SRL',    origin:'Turkey',  destination:'Germany', watchlistHit:false, docAnomaly:false, bioMismatch:false, routeRisk:0.30, risk:'Low',    riskScore:28, status:'waiting_border',  arrivalTime:Date.now()-300000, docStatus:'Ready',    biometrics:{face:{status:'Verified',confidence:94},iris:{status:'Verified',confidence:91},fingerprints:{status:'Verified',confidence:96}} },
  { id:'DV-002', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'IF 88 PKG', vehicleType:'truck', subType:'TIR',          goodsType:'Food & beverages',     companyName:'Aliment-Trans SA', origin:'Romania', destination:'Moldova', watchlistHit:false, docAnomaly:false, bioMismatch:false, routeRisk:0.20, risk:'Low',    riskScore:19, status:'waiting_border',  arrivalTime:Date.now()-240000, docStatus:'Ready',    biometrics:{face:{status:'Verified',confidence:92},iris:{status:'Verified',confidence:89},fingerprints:{status:'Verified',confidence:95}} },
  { id:'DV-003', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'B 112 STR', vehicleType:'car',   subType:'Sedan',        goodsType:'',                     companyName:'Private',          origin:'Romania', destination:'Moldova', watchlistHit:false, docAnomaly:false, bioMismatch:false, routeRisk:0.10, risk:'Low',    riskScore:12, status:'waiting_border',  arrivalTime:Date.now()-180000, docStatus:'Ready',    biometrics:{face:{status:'Verified',confidence:97},iris:{status:'Verified',confidence:93},fingerprints:{status:'Verified',confidence:98}} },
  { id:'DV-004', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'BH 17 MNK', vehicleType:'car',   subType:'SUV',          goodsType:'',                     companyName:'Private',          origin:'Ukraine', destination:'Portugal',watchlistHit:true,  docAnomaly:true,  bioMismatch:false, routeRisk:0.78, risk:'High',   riskScore:89, status:'waiting_border',  arrivalTime:Date.now()-120000, docStatus:'Error',    biometrics:{face:{status:'Pending', confidence:45},iris:{status:'Pending', confidence:41},fingerprints:{status:'Pending', confidence:52}} },
  { id:'DV-005', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'MO 889 TMR',vehicleType:'truck', subType:'Refrigerated', goodsType:'Tobacco (HS 2402)',    companyName:'DeltaLog SRL',     origin:'Belarus', destination:'Spain',   watchlistHit:false, docAnomaly:true,  bioMismatch:false, routeRisk:0.81, risk:'High',   riskScore:91, status:'waiting_customs', arrivalTime:Date.now()-90000,  docStatus:'Error',    biometrics:{face:{status:'Verified',confidence:87},iris:{status:'Verified',confidence:84},fingerprints:{status:'Verified',confidence:91}} },
  { id:'DV-006', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'CT 55 ABX', vehicleType:'truck', subType:'Flatbed',      goodsType:'Machinery',            companyName:'TehnoTrans SA',    origin:'Moldova', destination:'Italy',   watchlistHit:false, docAnomaly:false, bioMismatch:false, routeRisk:0.35, risk:'Medium', riskScore:52, status:'waiting_customs', arrivalTime:Date.now()-60000,  docStatus:'Scanning', biometrics:{face:{status:'Verified',confidence:93},iris:{status:'Verified',confidence:90},fingerprints:{status:'Verified',confidence:94}} },
  { id:'DV-007', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'CS 92 QQM', vehicleType:'bus',   subType:'Coach',        goodsType:'',                     companyName:'OmniTrans',        origin:'Romania', destination:'Moldova', watchlistHit:false, docAnomaly:false, bioMismatch:true,  routeRisk:0.44, risk:'Medium', riskScore:61, status:'waiting_border',  arrivalTime:Date.now()-30000,  docStatus:'Ready',    biometrics:{face:{status:'Failed',  confidence:31},iris:{status:'Pending', confidence:55},fingerprints:{status:'Pending', confidence:48}} },
  { id:'DV-008', bcpId:DEMO_BCP_ID, laneId:'demo-lane', plate:'OT 14 ZZR', vehicleType:'truck', subType:'Tanker',       goodsType:'Chemical products',    companyName:'Chimex Ltd',       origin:'Moldova', destination:'Germany', watchlistHit:true,  docAnomaly:false, bioMismatch:false, routeRisk:0.72, risk:'High',   riskScore:85, status:'waiting_customs', arrivalTime:Date.now()-15000,  docStatus:'Ready',    biometrics:{face:{status:'Verified',confidence:96},iris:{status:'Verified',confidence:93},fingerprints:{status:'Verified',confidence:97}} },
];

const DEMO_ALERTS_POOL: Alert[] = [
  { id:'DA-001', timestamp:Date.now(), bcpId:DEMO_BCP_ID, type:'SECURITY', title:'ANPR Match — SIS II',              message:'Plate BH 17 MNK matched SIS II. Vehicle reported stolen UA-2026-4871. Driver identity unconfirmed.',       severity:'HIGH' },
  { id:'DA-002', timestamp:Date.now(), bcpId:DEMO_BCP_ID, type:'CUSTOMS',  title:'X-Ray Anomaly — MO 889 TMR',      message:'HS 2402 declared (tobacco). X-ray reveals concealed chassis compartment. Est. 3,200 carton equivalent.',   severity:'HIGH' },
  { id:'DA-003', timestamp:Date.now(), bcpId:DEMO_BCP_ID, type:'SYSTEM',   title:'Congestion — Wait Time Critical', message:'Avg wait 47 min at BCP Leușeni. All lanes at capacity. KPI threshold exceeded. Immediate action required.',  severity:'HIGH' },
  { id:'DA-004', timestamp:Date.now(), bcpId:DEMO_BCP_ID, type:'SECURITY', title:'Resource Shortage — Personnel',   message:'Only 2 inspection officers on duty. 14 vehicles pending RED channel. Reserve shift activation required.',       severity:'HIGH' },
  { id:'DA-005', timestamp:Date.now(), bcpId:undefined,   type:'SECURITY', title:'FRONTEX Cooperation Request',     message:'FRONTEX JORA requests real-time data share on RED vehicles at BCP Leușeni. Coordinator authorization required.',severity:'HIGH' },
];

const DEMO_SCENARIOS: DemoScenarioEvent[] = [
  { id:'S0', type:'traffic',     severity:'INFO',     module:'ops-info',
    title:{ EN:'Operational Baseline — BCP Leușeni', RO:'Situație de Bază — PTF Leușeni', FR:'Ligne de Base — BCP Leușeni', RU:'Исходное Состояние — КПП Леушень' },
    brief:{ EN:'All systems nominal. You are now live inside the NCE. Traffic within normal parameters. Monitor the dashboard and prepare — events are incoming.', RO:'Toate sistemele normale. Sunteți activ în MCN. Traficul în parametri normali. Monitorizați tabloul de bord — evenimentele urmează.', FR:'Tous systèmes nominaux. Vous êtes en direct dans le NCE. Surveillez le tableau de bord.', RU:'Все системы номинальны. Вы в NCE в реальном времени. Наблюдайте за дашбордом — события близятся.' },
    live:{ EN:'Queue: normal · Wait: 12 min · Alerts: 0 · KPI: GREEN', RO:'Coadă: normală · Așteptare: 12 min · Alerte: 0 · KPI: VERDE', FR:'File: normale · Attente: 12 min · Alertes: 0 · KPI: VERT', RU:'Очередь: норма · Ожидание: 12 мин · Аварии: 0 · KPI: ЗЕЛЁНЫЙ' },
    vehiclesInject:0, alertsInject:0,
    decisions:{
      bp:[         { id:'S0-bp-1',  label:{ EN:'Confirm shift handover',        RO:'Confirmați predarea turei',       FR:'Confirmer passation de service',     RU:'Подтвердить сдачу смены'          }, outcome:{ EN:'Shift log updated. Ready to operate.',              RO:'Jurnal actualizat. Sistem operațional.',          FR:'Journal mis à jour. Prêt à opérer.',              RU:'Журнал смены обновлён. Готов к работе.'           } }],
      customs:[    { id:'S0-cs-1',  label:{ EN:'Review declaration queue',      RO:'Revizuiți coada declarații',      FR:'Réviser file des déclarations',       RU:'Проверить очередь деклараций'     }, outcome:{ EN:'3 HIGH RISK declarations pending. Monitoring.',     RO:'3 declarații HIGH RISK în așteptare.',            FR:'3 déclarations HIGH RISK en attente.',             RU:'3 HIGH RISK декларации в ожидании.'               } }],
      coordinator:[{ id:'S0-co-1',  label:{ EN:'Activate coordination console', RO:'Activați consola de coordonare',  FR:'Activer console de coordination',    RU:'Активировать консоль координации' }, outcome:{ EN:'Console active. All 9 modules online. Monitoring.', RO:'Consolă activă. Toate 9 modulele online.',        FR:'Console active. Les 9 modules en ligne.',          RU:'Консоль активна. Все 9 модулей онлайн.'           } }],
    }
  },
  { id:'S1', type:'traffic',     severity:'WARNING',  module:'ops-info',
    title:{ EN:'Traffic Surge — Queue Alert', RO:'Creștere Trafic — Alertă Coadă', FR:'Pic de Trafic — Alerte File', RU:'Всплеск Трафика — Тревога Очереди' },
    brief:{ EN:'+6 vehicles entered queue in 8 min. Avg wait spiked to 31 min. Lane 2 (trucks) at 94% capacity. ML Engine flags congestion risk. DSS recommends: open emergency lane.', RO:'+6 vehicule au intrat în coadă în 8 min. Așteptarea a crescut la 31 min. Banda 2 la 94% capacitate. DSS recomandă: deschideți banda de urgență.', FR:'+6 véhicules en 8 min. Attente 31 min. Voie 2 à 94%. DSS recommande: ouvrir voie urgence.', RU:'+6 авт. за 8 мин. Ожидание 31 мин. Полоса 2 — 94%. DSS рекомендует: открыть аварийную полосу.' },
    live:{ EN:'Queue: +6 · Wait: 31 min ↑ · KPI: AMBER · Lane 2: 94%', RO:'Coadă: +6 · Așteptare: 31 min ↑ · KPI: GALBEN · Banda 2: 94%', FR:'File: +6 · Attente: 31 min ↑ · KPI: AMBRE · Voie 2: 94%', RU:'Очередь: +6 · Ожидание: 31 мин ↑ · KPI: ЖЁЛТЫЙ · Полоса 2: 94%' },
    vehiclesInject:3, alertsInject:0,
    decisions:{
      bp:[
        { id:'S1-bp-1', label:{ EN:'Open emergency lane (Lane 3)', RO:'Deschideți banda de urgență (Banda 3)', FR:'Ouvrir voie urgence (Voie 3)', RU:'Открыть аварийную полосу (Полоса 3)' }, outcome:{ EN:'Lane 3 open. Queue reducing. +1 officer required.', RO:'Banda 3 deschisă. Coada se reduce. +1 ofițer necesar.', FR:'Voie 3 ouverte. File réduite. +1 agent requis.', RU:'Полоса 3 открыта. Очередь убывает. +1 офицер требуется.' } },
        { id:'S1-bp-2', label:{ EN:'Monitor — no action yet',      RO:'Monitorizați — fără acțiune',          FR:'Surveiller — aucune action',          RU:'Наблюдать — без действий'                }, outcome:{ EN:'Wait continues rising. DSS flags escalation risk.', RO:'Așteptarea continuă să crească. DSS semnalează risc.', FR:'Attente continue. DSS signale risque escalade.', RU:'Ожидание растёт. DSS сигнализирует риск эскалации.' } },
      ],
      customs:[
        { id:'S1-cs-1', label:{ EN:'Pre-stage inspection team at gate', RO:'Pregătiți echipa la poartă',    FR:'Pré-positionner équipe inspection', RU:'Выдвинуть группу к воротам'     }, outcome:{ EN:'Team ready. Processing capacity +20%.', RO:'Echipă pregătită. Capacitate +20%.', FR:'Équipe prête. Capacité +20%.', RU:'Группа готова. Пропускная способность +20%.' } },
        { id:'S1-cs-2', label:{ EN:'Fast-track AEO vehicles',          RO:'Expediați rapid vehiculele AEO', FR:'Accélérer véhicules OEA',          RU:'Ускорить проход AEO транспорта'  }, outcome:{ EN:'AEO fast-tracked. Main queue unchanged.', RO:'AEO expediate. Coada principală neschimbată.', FR:'OEA accélérés. File principale inchangée.', RU:'AEO ускорен. Основная очередь без изменений.' } },
      ],
      coordinator:[
        { id:'S1-co-1', label:{ EN:'Request +2 officers from Sculeni',    RO:'Solicitați +2 ofițeri de la Sculeni', FR:'Demander +2 agents à Sculeni',   RU:'Запросить +2 офицера из Скулень' }, outcome:{ EN:'Redistribution confirmed. ETA 18 min.', RO:'Redistribuire confirmată. ETA 18 min.', FR:'Redistribution confirmée. ETA 18 min.', RU:'Перераспределение подтверждено. ETA 18 мин.' } },
        { id:'S1-co-2', label:{ EN:'Issue KPI alert to DMO command',      RO:'Emiteți alertă KPI la DMO',          FR:'Émettre alerte KPI au DMO',      RU:'Выдать KPI-тревогу в DMO'        }, outcome:{ EN:'Alert issued. DMO command acknowledged.', RO:'Alertă emisă. DMO a confirmat.', FR:'Alerte émise. DMO a confirmé.', RU:'Тревога выдана. DMO подтвердил.' } },
      ],
    }
  },
  { id:'S2', type:'anpr',        severity:'HIGH',     module:'interop',
    title:{ EN:'ANPR Alert — SIS II Match', RO:'Alertă ANPR — Corespondență SIS II', FR:'Alerte ANPR — Correspondance SIS II', RU:'Тревога ANPR — Совпадение SIS II' },
    brief:{ EN:'Plate BH 17 MNK triggered ANPR match in SIS II. Vehicle reported stolen Ukraine (Case UA-2026-4871). Document anomaly detected. Biometric verification PENDING. Risk score: 89/100.', RO:'Placa BH 17 MNK a declanșat corespondență SIS II. Vehicul furat Ucraina (Caz UA-2026-4871). Anomalie documente detectată. Verificare biometrică ÎN AȘTEPTARE. Scor risc: 89/100.', FR:'Plaque BH 17 MNK — correspondance SIS II. Véhicule volé Ukraine (Dossier UA-2026-4871). Anomalie documents. Biométrie EN ATTENTE. Score risque: 89/100.', RU:'Плата BH 17 MNK — совпадение SIS II. Авто угнан Украина (Дело UA-2026-4871). Аномалия документов. Биометрия ОЖИДАНИЕ. Риск: 89/100.' },
    live:{ EN:'ANPR: 1 HIT · SIS II: ACTIVE · Risk: 89 · Bio: PENDING · Alert: DA-001 LIVE', RO:'ANPR: 1 CORESPONDENȚĂ · SIS II: ACTIV · Risc: 89 · Bio: ÎN AȘTEPTARE · Alertă: DA-001 LIVE', FR:'ANPR: 1 CORRESPONDANCE · SIS II: ACTIF · Risque: 89 · Biom.: EN ATTENTE · Alerte: DA-001 LIVE', RU:'ANPR: 1 СОВПАДЕНИЕ · SIS II: АКТИВНО · Риск: 89 · Биом.: ОЖИДАНИЕ · Тревога: DA-001 LIVE' },
    vehiclesInject:4, alertsInject:1,
    decisions:{
      bp:[
        { id:'S2-bp-1', label:{ EN:'Issue STOP order — detain vehicle',   RO:'Emiteți STOP — rețineți vehiculul',      FR:'Ordre STOP — détenir véhicule',       RU:'Приказ СТОП — задержать авто'          }, outcome:{ EN:'Vehicle detained. Case REF: BP-2026-0091. Secondary screening active.', RO:'Vehicul reținut. REF: BP-2026-0091. Inspecție secundară activă.', FR:'Véhicule détenu. RÉF: BP-2026-0091. Inspection secondaire active.', RU:'Авто задержано. Дело BP-2026-0091. Вторичный досмотр активен.' } },
        { id:'S2-bp-2', label:{ EN:'Complete biometrics first',            RO:'Finalizați mai întâi biometria',         FR:"Compléter biométrie d'abord",         RU:'Сначала завершить биометрию'            }, outcome:{ EN:'Biometrics FAILED. Risk confirmed. Auto-escalated to coordinator.', RO:'Biometrie EȘUAT. Risc confirmat. Escaladare automată la coordonator.', FR:'Biométrie ÉCHOUÉE. Risque confirmé. Escalade auto vers coordinateur.', RU:'Биометрия ПРОВАЛ. Риск подтверждён. Автоэскалация к координатору.' } },
      ],
      customs:[
        { id:'S2-cs-1', label:{ EN:'Request joint inspection with BP',     RO:'Solicitați inspecție comună cu PF',       FR:'Demander inspection conjointe PF',     RU:'Запросить совместный досмотр с ПП'      }, outcome:{ EN:'Joint inspection initiated. BP+Customs team deployed gate 3.', RO:'Inspecție comună inițiată. Echipă BP+Vamă la poarta 3.', FR:'Inspection conjointe initiée. PF+Douane porte 3.', RU:'Совместный досмотр начат. ПП+Таможня у ворот 3.' } },
        { id:'S2-cs-2', label:{ EN:'Flag in NCTS — alert destination office',RO:'Marcați în NCTS — alertați biroul dest.', FR:'Signaler NCTS — alerter bureau dest.',  RU:'Отметить в NCTS — уведомить офис назн.' }, outcome:{ EN:'NCTS record created. Destination customs office alerted.', RO:'Înregistrare NCTS creată. Biroul vamal destinatar alertat.', FR:'Enregistrement NCTS créé. Bureau douane destinataire alerté.', RU:'Запись NCTS создана. Таможня назначения оповещена.' } },
      ],
      coordinator:[
        { id:'S2-co-1', label:{ EN:'Alert intel liaison — activate SIS II', RO:'Alertați ofițerul legătură — activați SIS II', FR:'Alerter liaison renseignement SIS II', RU:'Уведомить офицера разведки — SIS II'    }, outcome:{ EN:'Intel liaison notified. SIS II response ETA 4 min. Cross-BCP alert sent.', RO:'Ofițer legătură notificat. Răspuns SIS II ETA 4 min. Alertă cross-BCP trimisă.', FR:'Liaison notifiée. Réponse SIS II ETA 4 min. Alerte cross-PCP envoyée.', RU:'Офицер разведки уведомлён. SIS II ETA 4 мин. Кросс-КПП тревога отправлена.' } },
        { id:'S2-co-2', label:{ EN:'Notify IGPR Moldova — dispatch unit',   RO:'Notificați IGPR Moldova — mobilizați',        FR:'Notifier IGPR Moldova — dépêcher',    RU:'Уведомить IGPR Молдова — выслать наряд' }, outcome:{ EN:'IGPR notified. Unit dispatched. Coordination channel open.', RO:'IGPR notificat. Unitate mobilizată. Canal de coordonare deschis.', FR:'IGPR notifié. Unité dépêchée. Canal coordination ouvert.', RU:'IGPR уведомлён. Наряд выслан. Канал координации открыт.' } },
      ],
    }
  },
  { id:'S3', type:'cargo',       severity:'HIGH',     module:'ai-risk',
    title:{ EN:'Suspicious Cargo — X-Ray Anomaly', RO:'Marfă Suspectă — Anomalie X-Ray', FR:'Cargaison Suspecte — Anomalie Rayons X', RU:'Подозрительный Груз — Аномалия Рентгена' },
    brief:{ EN:'Truck MO 889 TMR (Belarus→Spain, HS 2402 tobacco). X-ray: concealed chassis compartment. ML Engine: 91/100. Est. 3,200 undeclared cartons. Duty gap ~€48,000. DSS: "Physical inspection mandatory."', RO:'Camion MO 889 TMR (Belarus→Spania, HS 2402 tutun). X-ray: compartiment ascuns în șasiu. Motor ML: 91/100. ~3.200 cartușe nedeclarate. Gap taxe ~€48.000. DSS: "Inspecție fizică obligatorie."', FR:'Camion MO 889 TMR (Biélorussie→Espagne, HS 2402 tabac). Rayons X: compartiment caché châssis. ML: 91/100. ~3.200 cartouches non déclarées. Écart ~€48.000. DSS: "Inspection physique obligatoire."', RU:'Грузовик MO 889 TMR (Беларусь→Испания, HS 2402). Рентген: скрытый отсек. ML: 91/100. ~3200 пачек. Разрыв пошлин ~€48.000. DSS: "Физический досмотр обязателен."' },
    live:{ EN:'X-Ray: ANOMALY · ML: 91 · HS 2402 flagged · DSS: inspection req · Alert: DA-002 LIVE', RO:'X-Ray: ANOMALIE · ML: 91 · HS 2402 marcat · DSS: inspecție req · Alertă: DA-002 LIVE', FR:'Rayons X: ANOMALIE · ML: 91 · HS 2402 signalé · DSS: inspection req · Alerte: DA-002 LIVE', RU:'Рентген: АНОМАЛИЯ · ML: 91 · HS 2402 · DSS: досмотр обязателен · Тревога: DA-002 LIVE' },
    vehiclesInject:5, alertsInject:2,
    decisions:{
      bp:[
        { id:'S3-bp-1', label:{ EN:'Request customs: open physical inspection', RO:'Solicitați vamei inspecția fizică',      FR:'Demander à la douane inspection physique', RU:'Запросить таможню на физический досмотр' }, outcome:{ EN:'Physical inspection authorized. Joint team at cargo bay 2.', RO:'Inspecție fizică autorizată. Echipă la rampa 2.', FR:'Inspection autorisée. Équipe conjointe rampe 2.', RU:'Физический досмотр разрешён. Группа на доке 2.' } },
        { id:'S3-bp-2', label:{ EN:'Escort vehicle to secondary facility',      RO:'Escortați vehiculul la facilitatea sec.', FR:'Escorter véhicule vers installation sec.',  RU:'Сопроводить авто на вторичный объект'    }, outcome:{ EN:'Vehicle escorted. Evidence chain of custody initiated.', RO:'Vehicul escortat. Lanț de custodie inițiat.', FR:'Véhicule escorté. Chaîne de garde initiée.', RU:'Авто сопровождено. Цепочка хранения начата.' } },
      ],
      customs:[
        { id:'S3-cs-1', label:{ EN:'Issue seizure order',          RO:'Emiteți ordin de confiscare',     FR:'Émettre ordre de saisie',            RU:'Выдать ордер на изъятие'           }, outcome:{ EN:'Seizure order issued. REF: SZ-LEU-2026-047. Prosecution notified.', RO:'Ordin emis. REF: SZ-LEU-2026-047. Parchetul notificat.', FR:'Ordre émis. RÉF: SZ-LEU-2026-047. Parquet notifié.', RU:'Ордер выдан. REF: SZ-LEU-2026-047. Прокуратура уведомлена.' } },
        { id:'S3-cs-2', label:{ EN:'Hold declaration — request manifest', RO:'Suspendați declarația',          FR:'Bloquer déclaration — demander manifeste', RU:'Задержать декларацию'              }, outcome:{ EN:'Declaration held. Trader notified. 2h compliance window open.', RO:'Declarație suspendată. Trader notificat. Fereastră 2h deschisă.', FR:'Déclaration bloquée. Négociant notifié. Fenêtre 2h ouverte.', RU:'Декларация задержана. Трейдер уведомлён. Окно 2ч открыто.' } },
      ],
      coordinator:[
        { id:'S3-co-1', label:{ EN:'Notify OLAF anti-fraud channel',   RO:'Notificați canalul OLAF anti-fraudă',  FR:'Notifier canal anti-fraude OLAF',      RU:'Уведомить канал OLAF по борьбе с мошенничеством' }, outcome:{ EN:'OLAF AFIS notified. Cross-border intelligence request sent.', RO:'OLAF AFIS notificat. Solicitare informații transfrontaliere trimisă.', FR:'OLAF AFIS notifié. Demande renseignement transfrontalier envoyée.', RU:'OLAF AFIS уведомлён. Запрос трансграничной разведки отправлен.' } },
        { id:'S3-co-2', label:{ EN:'Activate multi-agency protocol',   RO:'Activați protocolul multi-agenție',    FR:'Activer protocole multi-agences',       RU:'Активировать многоагентурный протокол'           }, outcome:{ EN:'Multi-agency protocol active. BP+Customs+IGPR coordinating.', RO:'Protocol multi-agenție activ. BP+Vamă+IGPR coordonează.', FR:'Protocole multi-agences actif. PF+Douane+IGPR coordonnent.', RU:'Протокол мульти-агентств активирован. ПП+Таможня+IGPR координируют.' } },
      ],
    }
  },
  { id:'S4', type:'congestion',  severity:'CRITICAL', module:'kpi',
    title:{ EN:'Congestion Critical — KPI Red Zone', RO:'Congestionare Critică — KPI Zonă Roșie', FR:'Congestion Critique — Zone KPI Rouge', RU:'Критический Затор — Красная Зона KPI' },
    brief:{ EN:'Cumulative: 7 vehicles in queue, wait 47 min, clearance 23/hr (target 45/hr). KPI RED. 6 vehicles RED channel. Governance policy BCP-OPS-2024-07 triggered. All support modules (ML, DSS, Regression) flagging critical.', RO:'Cumulativ: 7 vehicule în coadă, așteptare 47 min, eliberare 23/oră (țintă 45/oră). KPI ROȘU. 6 vehicule canal ROȘU. Politica BCP-OPS-2024-07 declanșată.', FR:'Cumulé: 7 véhicules, attente 47 min, traitement 23/h (cible 45/h). KPI ROUGE. 6 véhicules canal ROUGE. Politique BCP-OPS-2024-07 déclenchée.', RU:'Накопленный: 7 авт., ожидание 47 мин, обработка 23/ч (цель 45/ч). KPI КРАСНЫЙ. 6 авт. КРАСНОГО канала. Политика BCP-OPS-2024-07 сработала.' },
    live:{ EN:'Wait: 47 min ↑↑ · Clearance: 23/hr ↓ · RED ch.: 6 · KPI: RED · Policy POL-007 triggered', RO:'Așteptare: 47 min ↑↑ · Eliberare: 23/oră ↓ · ROȘU: 6 · KPI: ROȘU · POL-007 activat', FR:'Attente: 47 min ↑↑ · Traitement: 23/h ↓ · ROUGE: 6 · KPI: ROUGE · POL-007 déclenché', RU:'Ожидание: 47 мин ↑↑ · Обработка: 23/ч ↓ · КРАСНЫЙ: 6 · KPI: КРАСНЫЙ · POL-007 сработала' },
    vehiclesInject:7, alertsInject:3,
    decisions:{
      bp:[
        { id:'S4-bp-1', label:{ EN:'Open emergency lane — RED channel priority', RO:'Bandă urgență — prioritate canal ROȘU', FR:'Voie urgence — priorité canal ROUGE',  RU:'Аварийная полоса — КРАСНЫЙ приоритет'  }, outcome:{ EN:'Emergency lane open. RED vehicles redirected. Wait: -14 min.', RO:'Bandă urgență deschisă. Vehicule ROȘU redirecționate. Așteptare: -14 min.', FR:'Voie urgence ouverte. Canal ROUGE redirigé. Attente: -14 min.', RU:'Аварийная полоса открыта. КРАСНЫЙ перенаправлен. Ожидание: -14 мин.' } },
        { id:'S4-bp-2', label:{ EN:'Escalate to DMO shift supervisor',          RO:'Escaladați la supervizorul DMO',        FR:'Escalader au superviseur DMO',         RU:'Эскалировать к дежурному DMO'          }, outcome:{ EN:'DMO supervisor notified. Authorizing resource mobilization.', RO:'Supervizor DMO notificat. Autorizează mobilizarea resurselor.', FR:'Superviseur DMO notifié. Mobilisation ressources autorisée.', RU:'Дежурный DMO уведомлён. Мобилизация ресурсов разрешена.' } },
      ],
      customs:[
        { id:'S4-cs-1', label:{ EN:'Fast-track GREEN channel + AEO',       RO:'Expediați rapid VERDE + AEO',          FR:'Accélérer canal VERT + OEA',           RU:'Ускорить ЗЕЛЁНЫЙ + AEO'                }, outcome:{ EN:'GREEN/AEO fast-tracked. Capacity +18%. RED queue unchanged.', RO:'VERDE/AEO expediate. Capacitate +18%. Coada ROȘU neschimbată.', FR:'VERT/OEA accélérés. Capacité +18%. File ROUGE inchangée.', RU:'ЗЕЛЁНЫЙ/AEO ускорены. Пропускная способность +18%.' } },
        { id:'S4-cs-2', label:{ EN:'Suspend non-critical declarations 1h', RO:'Suspendați declarațiile necritice 1h', FR:'Suspendre déclarations non-critiques 1h',RU:'Приостановить некритические декларации 1ч'}, outcome:{ EN:'12 declarations deferred. Team refocused on RED channel.', RO:'12 declarații amânate. Echipa refocusată pe canalul ROȘU.', FR:'12 déclarations reportées. Équipe refocalisée canal ROUGE.', RU:'12 деклараций отложены. Группа переключена на КРАСНЫЙ канал.' } },
      ],
      coordinator:[
        { id:'S4-co-1', label:{ EN:'Activate Level 2 response via DMO',    RO:'Activați răspuns Nivel 2 prin DMO',    FR:'Activer réponse Niveau 2 via DMO',     RU:'Активировать Уровень 2 через DMO'       }, outcome:{ EN:'Level 2 active. Cross-BCP resources mobilized. ETA 22 min.', RO:'Nivel 2 activ. Resurse cross-BCP mobilizate. ETA 22 min.', FR:'Niveau 2 actif. Ressources cross-PCP mobilisées. ETA 22 min.', RU:'Уровень 2 активирован. Ресурсы кросс-КПП мобилизованы. ETA 22 мин.' } },
        { id:'S4-co-2', label:{ EN:'Broadcast alert to all 20 BCPs',       RO:'Difuzați alerta la toate 20 BCP-uri',  FR:'Diffuser alerte aux 20 PCPs',          RU:'Транслировать тревогу на все 20 КПП'    }, outcome:{ EN:'Alert sent to all 20 BCPs. Network-wide coordination active.', RO:'Alertă trimisă la toate 20 BCP-uri. Coordonare rețea activă.', FR:'Alerte envoyée aux 20 PCPs. Coordination réseau active.', RU:'Оповещение на все 20 КПП. Координация по всей сети активна.' } },
      ],
    }
  },
  { id:'S5', type:'resource',    severity:'HIGH',     module:'mission',
    title:{ EN:'Resource Shortage — Personnel Critical', RO:'Deficit Resurse — Personal Critic', FR:'Pénurie Ressources — Personnel Critique', RU:'Нехватка Ресурсов — Критичный Персонал' },
    brief:{ EN:'2/8 inspection officers available. 14 vehicles pending RED channel. Mission Planning module: reserve shift STANDBY or cross-BCP reallocation from Sculeni (ETA 11 min). Decision required.', RO:'2/8 ofițeri de inspecție disponibili. 14 vehicule în așteptare canal ROȘU. Modul Planificare Misiuni: tură rezervă STANDBY sau realocare cross-BCP de la Sculeni (ETA 11 min).', FR:"2/8 agents d'inspection disponibles. 14 véhicules en attente canal ROUGE. Module Planification: quart réserve STANDBY ou réallocation depuis Sculeni (ETA 11 min).", RU:'2/8 инспекторов доступны. 14 авт. ожидают КРАСНЫЙ канал. Модуль миссий: резервная смена ОЖИДАНИЕ или перераспределение из Скулень (ETA 11 мин).' },
    live:{ EN:'Staff: 2/8 · RED queue: 14 veh · Reserve: STANDBY · Mission module: ACTIVE', RO:'Personal: 2/8 · Coadă ROȘU: 14 · Rezervă: STANDBY · Modul Misiune: ACTIV', FR:'Personnel: 2/8 · File ROUGE: 14 veh · Réserve: STANDBY · Module Mission: ACTIF', RU:'Персонал: 2/8 · КРАСНЫЙ: 14 авт · Резерв: ОЖИДАНИЕ · Модуль миссий: АКТИВЕН' },
    vehiclesInject:8, alertsInject:4,
    decisions:{
      bp:[
        { id:'S5-bp-1', label:{ EN:'Activate reserve shift immediately',   RO:'Activați tura de rezervă imediat',    FR:'Activer quart de réserve immédiatement', RU:'Активировать резервную смену немедленно' }, outcome:{ EN:'Reserve shift active. +4 officers ETA 15 min. Capacity restored 75%.', RO:'Tură rezervă activată. +4 ofițeri ETA 15 min. Capacitate restabilită 75%.', FR:'Quart réserve actif. +4 agents ETA 15 min. Capacité restaurée 75%.', RU:'Резервная смена активирована. +4 офицера ETA 15 мин. Мощность 75%.' } },
        { id:'S5-bp-2', label:{ EN:'Prioritize RED channel only',          RO:'Prioritizați doar canalul ROȘU',      FR:'Prioriser uniquement canal ROUGE',       RU:'Приоритет только КРАСНОГО канала'        }, outcome:{ EN:'GREEN/YELLOW deferred 45 min. RED throughput +35%. Trade flow impacted.', RO:'VERDE/GALBEN amânate 45 min. Debit ROȘU +35%. Flux comercial afectat.', FR:'VERT/JAUNE reportés 45 min. Débit ROUGE +35%. Flux commercial impacté.', RU:'ЗЕЛЁНЫЙ/ЖЁЛТЫЙ отложены 45 мин. Пропускная способность КРАСНОГО +35%.' } },
      ],
      customs:[
        { id:'S5-cs-1', label:{ EN:'Request K9 + mobile X-ray from Briceni', RO:'Solicitați K9 + X-ray mobil din Briceni', FR:'Demander K9 + rayon X mobile de Briceni', RU:'Запросить K9 + мобильный рентген из Бричень' }, outcome:{ EN:'K9 + mobile X-ray ETA 28 min. Detection capacity doubled.', RO:'K9 + X-ray mobil ETA 28 min. Capacitate detecție dublată.', FR:'K9 + rayon X mobile ETA 28 min. Capacité détection doublée.', RU:'K9 + мобильный рентген ETA 28 мин. Возможности удвоены.' } },
        { id:'S5-cs-2', label:{ EN:'Apply risk selectivity — skip GREEN',    RO:'Aplicați selectivitate — omiteți VERDE',  FR:'Appliquer sélectivité — ignorer VERT',    RU:'Применить риск-отбор — пропустить ЗЕЛЁНЫЙ' }, outcome:{ EN:'Selectivity applied. 31% load reduction. Focus HIGH/MEDIUM risk.', RO:'Selectivitate aplicată. Reducere 31% volum. Focus risc RIDICAT/MEDIU.', FR:'Sélectivité appliquée. Réduction charge 31%. Focus ÉLEVÉ/MOYEN.', RU:'Отбор применён. Нагрузка снижена 31%. Фокус ВЫСОКИЙ/СРЕДНИЙ риск.' } },
      ],
      coordinator:[
        { id:'S5-co-1', label:{ EN:'Cross-BCP reallocation from Sculeni', RO:'Realocare cross-BCP din Sculeni',       FR:'Réallocation cross-PCP depuis Sculeni', RU:'Перераспределение из Скулень'              }, outcome:{ EN:'3 officers reallocated. Sculeni at safe capacity. ETA 11 min.', RO:'3 ofițeri realocați. Sculeni la capacitate sigură. ETA 11 min.', FR:'3 agents réalloués. Sculeni en capacité sûre. ETA 11 min.', RU:'3 офицера перераспределены. Скулень в безопасной мощности. ETA 11 мин.' } },
        { id:'S5-co-2', label:{ EN:'Activate joint surge mission BP+Customs',RO:'Activați misiunea comună BP+Vamă',      FR:'Activer mission surge conjointe PF+Douane',RU:'Активировать совместную миссию ПП+Таможня' }, outcome:{ EN:'Joint surge mission ACTIVE. ID: MIS-LEU-2026-041. Live tracking.', RO:'Misiune comună ACTIVĂ. ID: MIS-LEU-2026-041. Urmărire live.', FR:'Mission surge ACTIVE. ID: MIS-LEU-2026-041. Suivi en direct.', RU:'Совместная миссия АКТИВНА. ID: MIS-LEU-2026-041. Отслеживание live.' } },
      ],
    }
  },
  { id:'S6', type:'cooperation', severity:'HIGH',     module:'cooperation',
    title:{ EN:'FRONTEX Cooperation Request', RO:'Solicitare Cooperare FRONTEX', FR:'Demande Coopération FRONTEX', RU:'Запрос FRONTEX о Сотрудничестве' },
    brief:{ EN:'FRONTEX JORA requests real-time data share on 3 RED channel vehicles at BCP Leușeni. Basis: EU Reg. 2019/1896 Art. 86. Authorization window: 10 min. Only the Joint Coordinator can authorize. This is the NCE architecture in action.', RO:'FRONTEX JORA solicită partajare date în timp real pentru 3 vehicule canal ROȘU la PTF Leușeni. Baza: Reg. UE 2019/1896 Art. 86. Ferestră autorizare: 10 min. Doar Operatorul de Coordonare poate autoriza. Aceasta este arhitectura MCN în acțiune.', FR:'FRONTEX JORA demande partage données en temps réel pour 3 véhicules canal ROUGE au PCP Leușeni. Base: Règl. UE 2019/1896 Art. 86. Fenêtre: 10 min. Seul le Coordinateur peut autoriser. Architecture NCE en action.', RU:'FRONTEX JORA запрашивает передачу данных по 3 авт. КРАСНОГО канала на КПП Леушень. Основание: EU 2019/1896 ст. 86. Окно: 10 мин. Только Координатор может авторизовать. Архитектура NCE в действии.' },
    live:{ EN:'FRONTEX: DATA REQUEST · Basis: EU 2019/1896 · Profiles: 3 · Auth window: 10 min · ALL MODULES ACTIVE', RO:'FRONTEX: CERERE DATE · Baza: UE 2019/1896 · Profile: 3 · Fereastră: 10 min · TOATE MODULELE ACTIVE', FR:'FRONTEX: DEMANDE DONNÉES · Base: UE 2019/1896 · Profils: 3 · Fenêtre: 10 min · TOUS MODULES ACTIFS', RU:'FRONTEX: ЗАПРОС ДАННЫХ · EU 2019/1896 · Профили: 3 · Окно: 10 мин · ВСЕ МОДУЛИ АКТИВНЫ' },
    vehiclesInject:8, alertsInject:5,
    decisions:{
      bp:[         { id:'S6-bp-1',  label:{ EN:'Hold tactical position',            RO:'Mențineți poziția tactică',          FR:'Maintenir position tactique',            RU:'Удержать тактическую позицию'         }, outcome:{ EN:'Position held. Vehicles secured. Coordination active.',         RO:'Poziție menținută. Vehicule securizate. Coordonare activă.',     FR:'Position maintenue. Véhicules sécurisés. Coordination active.',  RU:'Позиция удержана. Авто защищены. Координация активна.'    } }],
      customs:[    { id:'S6-cs-1',  label:{ EN:'Continue RED channel — no interruption', RO:'Continuați canalul ROȘU',       FR:'Continuer canal ROUGE sans interruption', RU:'Продолжить КРАСНЫЙ канал без остановки'}, outcome:{ EN:'RED channel processing continues. 4 declarations active.',       RO:'Procesare canal ROȘU continuă. 4 declarații active.',           FR:'Traitement canal ROUGE continue. 4 déclarations actives.',       RU:'Обработка КРАСНОГО канала продолжается. 4 декларации.'    } }],
      coordinator:[
        { id:'S6-co-1', label:{ EN:'Authorize FRONTEX data share',          RO:'Autorizați partajarea date FRONTEX',  FR:'Autoriser partage données FRONTEX',       RU:'Авторизовать передачу данных FRONTEX'  }, outcome:{ EN:'Authorization granted. FRONTEX JORA receiving. LOG: COOP-2026-0089. NCE architecture functioning as designed.', RO:'Autorizare acordată. FRONTEX JORA recepționează. LOG: COOP-2026-0089. Arhitectura MCN funcționează conform designului.', FR:'Autorisation accordée. FRONTEX JORA reçoit. LOG: COOP-2026-0089. Architecture NCE fonctionne comme prévu.', RU:'Авторизация выдана. FRONTEX JORA получает. LOG: COOP-2026-0089. Архитектура NCE работает как задумано.' } },
        { id:'S6-co-2', label:{ EN:'Decline — request official instrument', RO:'Refuzați — solicitați instrument oficial', FR:'Refuser — demander instrument officiel', RU:'Отказать — официальный инструмент'     }, outcome:{ EN:'Request declined. Official request submitted via SELEC.',        RO:'Solicitare refuzată. Cerere oficială prin SELEC trimisă.',       FR:'Demande refusée. Demande officielle via SELEC soumise.',         RU:'Запрос отклонён. Официальный запрос через SELEC направлен.' } },
      ],
    }
  },
];

// ─── Demo Role Selection ──────────────────────────────────────────────────────
const DemoRoleSelect: React.FC<{ lang: Language; onSelect: (r: DemoRole) => void; onCancel: () => void }> = ({ lang, onSelect, onCancel }) => {
  const ROLES: { id: DemoRole; icon: string; title: Record<Language,string>; sub: Record<Language,string>; color: string; border: string; dot: string; resp: Record<Language,string[]> }[] = [
    { id:'bp', icon:'🛡️',
      title:{ EN:'Border Police Officer', RO:'Ofițer Poliția de Frontieră', FR:'Officier Police des Frontières', RU:'Офицер Пограничной Полиции' },
      sub:  { EN:'IGPF — Entry/Exit Control',         RO:'IGPF — Control Intrare/Ieșire',           FR:'IGPF — Contrôle Entrée/Sortie',         RU:'ИГПФ — Контроль въезда/выезда'         },
      color:'text-blue-300', border:'border-blue-500/40 hover:border-blue-400/70 bg-blue-950/20', dot:'bg-blue-500',
      resp:{ EN:['ANPR & document verification','Biometric processing','Vehicle STOP orders','Lane management','SIS II cross-reference'], RO:['Verificare ANPR & documente','Procesare biometrică','Ordine STOP vehicule','Gestionare benzi','Cross-referință SIS II'], FR:['Vérification ANPR & docs','Traitement biométrique','Ordres STOP véhicules','Gestion des voies','Référencement croisé SIS II'], RU:['Верификация ANPR & документов','Биометрическая обработка','Приказы СТОП','Управление полосами','Перекрёстная проверка SIS II'] } },
    { id:'customs', icon:'⚖️',
      title:{ EN:'Customs Officer',        RO:'Ofițer Vamal',                  FR:'Agent des Douanes',                    RU:'Таможенный Офицер'                     },
      sub:  { EN:'Serviciul Vamal — Trade & Compliance', RO:'Serviciul Vamal — Comerț & Conformitate', FR:'Service des Douanes — Commerce & Conformité', RU:'Таможенная Служба — Торговля & Соответствие' },
      color:'text-emerald-300', border:'border-emerald-500/40 hover:border-emerald-400/70 bg-emerald-950/20', dot:'bg-emerald-500',
      resp:{ EN:['Declaration processing & risk scoring','Physical inspection orders','Seizure & detention authority','HS code verification','NCTS / ICS2 management'], RO:['Procesare declarații & scor risc','Ordine inspecție fizică','Autoritate confiscare & reținere','Verificare cod HS','Gestionare NCTS / ICS2'], FR:['Traitement déclarations & score risque','Ordres inspection physique','Autorité saisie & rétention','Vérification code HS','Gestion NCTS / ICS2'], RU:['Обработка деклараций & оценка риска','Приказы физического досмотра','Полномочия изъятия & задержания','Верификация кода HS','Управление NCTS / ICS2'] } },
    { id:'coordinator', icon:'🎯',
      title:{ EN:'Joint Coordination Operator', RO:'Operator Coordonare Comună', FR:'Opérateur Coordination Conjointe', RU:'Оператор Совместной Координации' },
      sub:  { EN:'DMO — National Coordination Environment', RO:'DMO — Mediu Național de Coordonare', FR:'DMO — Environnement National de Coordination', RU:'ДМО — Национальная Среда Координации' },
      color:'text-rose-300', border:'border-rose-500/40 hover:border-rose-400/70 bg-rose-950/20', dot:'bg-rose-500',
      resp:{ EN:['Cross-BCP resource coordination','Escalation to DMO command','International cooperation authorization','Mission planning & dispatch','Network-wide situational awareness'], RO:['Coordonare resurse cross-BCP','Escaladare la DMO Comandament','Autorizare cooperare internațională','Planificare & desfășurare misiuni','Conștientizare situațională rețea'], FR:['Coordination ressources cross-PCP','Escalade au commandement DMO','Autorisation coopération internationale','Planification & déploiement missions','Conscience situationnelle réseau'], RU:['Координация ресурсов кросс-КПП','Эскалация в командование DMO','Авторизация международного сотрудничества','Планирование миссий','Ситуационная осведомлённость'] } },
  ];
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/96 backdrop-blur-sm flex items-center justify-center p-6 overflow-auto">
      <div className="max-w-4xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="text-[9px] font-bold uppercase tracking-[0.35em] text-rose-400">NCE — Demonstration Mode</div>
          <h2 className="text-2xl font-black text-slate-100 uppercase tracking-tight">{{ EN:'Select Your Role', RO:'Selectați Rolul', FR:'Choisissez Votre Rôle', RU:'Выберите Роль' }[lang]}</h2>
          <p className="text-[11px] text-slate-500 max-w-xl mx-auto">{{ EN:'7 live operational scenarios. The entire NCE dashboard reacts in real time. Every decision has consequences visible across all modules.', RO:'7 scenarii operaționale live. Tabloul de bord MCN reacționează în timp real. Fiecare decizie are consecințe vizibile în toate modulele.', FR:'7 scénarios opérationnels en direct. Tout le tableau de bord NCE réagit en temps réel. Chaque décision a des conséquences sur tous les modules.', RU:'7 оперативных сценариев. Весь дашборд NCE реагирует в реальном времени. Каждое решение имеет последствия во всех модулях.' }[lang]}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ROLES.map(r => (
            <button key={r.id} onClick={() => onSelect(r.id)} className={`border ${r.border} rounded-xl p-5 text-left transition-all duration-200 hover:scale-[1.01] group`}>
              <div className="text-3xl mb-3">{r.icon}</div>
              <div className={`text-[12px] font-black uppercase tracking-wide ${r.color} mb-0.5`}>{r.title[lang]}</div>
              <div className="text-[9px] text-slate-500 mb-3">{r.sub[lang]}</div>
              <ul className="space-y-1">{r.resp[lang].map((item, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[9px] text-slate-400">
                  <div className={`w-1 h-1 rounded-full ${r.dot} shrink-0`} />{item}
                </li>
              ))}</ul>
            </button>
          ))}
        </div>
        <div className="text-center">
          <button onClick={onCancel} className="text-[10px] text-slate-600 hover:text-slate-400 uppercase tracking-widest transition-colors">{{ EN:'← Exit Demo', RO:'← Ieșiți din Demo', FR:'← Quitter Démo', RU:'← Выйти из демо' }[lang]}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Demo Scenario Panel ──────────────────────────────────────────────────────
const DemoPanel: React.FC<{ step: number; role: DemoRole; lang: Language; decisionsChosen: string[]; onNext: () => void; onPrev: () => void; onExit: () => void; onDecide: (id: string) => void }> = ({ step, role, lang, decisionsChosen, onNext, onPrev, onExit, onDecide }) => {
  const [collapsed, setCollapsed] = useState(false);
  const ev = DEMO_SCENARIOS[step];
  if (!ev) return null;
  const roleDecisions = ev.decisions[role];
  const sevCls = { INFO:'text-slate-300 bg-slate-800/60 border-slate-700', WARNING:'text-amber-300 bg-amber-900/20 border-amber-700/30', HIGH:'text-orange-300 bg-orange-900/20 border-orange-700/30', CRITICAL:'text-red-300 bg-red-900/20 border-red-700/30' }[ev.severity];
  const typeIcon = { traffic:'🚦', anpr:'📡', cargo:'📦', congestion:'⚠️', resource:'👥', cooperation:'🌐' }[ev.type] ?? '⚡';
  const rm = { bp:{ lbl:{ EN:'Border Police', RO:'Poliție Frontieră', FR:'Police Frontières', RU:'Погранполиция' }, clr:'text-blue-400', bg:'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20' }, customs:{ lbl:{ EN:'Customs Officer', RO:'Ofițer Vamal', FR:'Agent Douanes', RU:'Таможня' }, clr:'text-emerald-400', bg:'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20' }, coordinator:{ lbl:{ EN:'Coordinator', RO:'Coordonator', FR:'Coordinateur', RU:'Координатор' }, clr:'text-rose-400', bg:'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20' } }[role];
  return (
    <div className="fixed right-3 top-20 w-72 z-50 shadow-2xl select-none">
      <div className="bg-slate-900 border border-slate-700/80 rounded-t-xl px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-rose-400 bg-rose-950/40 border border-rose-900/50 px-1.5 py-0.5 rounded">DEMO</span>
          <span className={`text-[8px] font-bold uppercase ${rm.clr}`}>{rm.lbl[lang]}</span>
          <span className="text-[8px] text-slate-600">{step + 1}/{DEMO_SCENARIOS.length}</span>
        </div>
        <button onClick={() => setCollapsed(c => !c)} className="text-slate-600 hover:text-slate-300 shrink-0 text-xs">{collapsed ? '▲' : '▼'}</button>
      </div>
      {!collapsed && (
        <div className="bg-slate-950/98 border-x border-b border-slate-700/80 rounded-b-xl overflow-hidden">
          <div className={`px-3 py-2 border-b border-slate-800 flex items-start gap-2`}>
            <span className="text-lg shrink-0">{typeIcon}</span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-100 leading-tight">{ev.title[lang]}</div>
              <span className={`inline-flex text-[7px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded border mt-1 ${sevCls}`}>{ev.severity}</span>
            </div>
          </div>
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[9px] text-slate-400 leading-relaxed">{ev.brief[lang]}</p>
          </div>
          <div className="px-3 py-2 border-b border-slate-800 space-y-1.5">
            <div className="text-[7px] font-bold uppercase tracking-widest text-slate-600">{{ EN:'Your Decision', RO:'Decizia Ta', FR:'Votre Décision', RU:'Ваше Решение' }[lang]}</div>
            {roleDecisions.map(d => {
              const chosen = decisionsChosen.includes(d.id);
              return (
                <div key={d.id}>
                  <button onClick={() => !chosen && onDecide(d.id)} className={`w-full text-left text-[9px] px-2.5 py-1.5 rounded border transition-all duration-150 ${chosen ? 'bg-emerald-900/30 border-emerald-600/40 text-emerald-300 cursor-default' : `${rm.bg} border cursor-pointer`}`}>
                    {chosen ? '✓ ' : ''}{d.label[lang]}
                  </button>
                  {chosen && <div className="text-[8px] text-slate-500 px-2 pt-1 leading-relaxed italic">{d.outcome[lang]}</div>}
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 border-b border-slate-800">
            <div className="text-[7px] font-bold uppercase tracking-widest text-slate-700 mb-1">● LIVE — {{ EN:'others see', RO:'ceilalți văd', FR:'les autres voient', RU:'другие видят' }[lang]}</div>
            <p className="text-[8px] text-slate-600 leading-relaxed font-mono">{ev.live[lang]}</p>
          </div>
          <div className="px-3 py-2 flex items-center justify-between">
            <button onClick={onPrev} disabled={step === 0} className="text-[9px] text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">← Prev</button>
            <button onClick={onExit} className="text-[8px] text-slate-700 hover:text-red-400 transition-colors uppercase tracking-widest">Exit</button>
            <button onClick={onNext} disabled={step === DEMO_SCENARIOS.length - 1} className="text-[9px] text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
};


// ─── Main App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statsHistory, setStatsHistory] = useState<{ time: number, waiting: number, inControl: number }[]>([]);
  const [revenueHistory, setRevenueHistory] = useState<{time: number, amount: number}[]>([]);
  const [throughputHistory, setThroughputHistory] = useState<{time: number, entry: number, exit: number, entryByType?: Record<string, number>, exitByType?: Record<string, number>}[]>([]);
  // ── Per-BCP history (for dynamic KPI layer) ──────────────────────────────────
  const [bcpThroughputHistory, setBcpThroughputHistory] = useState<Record<string, {time: number; entry: number; exit: number; entryByType: Record<string,number>; exitByType: Record<string,number>}[]>>({});
  const [bcpRevenueHistory,    setBcpRevenueHistory]    = useState<Record<string, {time: number; amount: number}[]>>({});
  const [revenue, setRevenue] = useState({ duties: 0, vat: 0, excise: 0 });
  const [selectedBCP, setSelectedBCP] = useState<string>(BCPS[0].id);
  const [selectedDeclId, setSelectedDeclId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showDeclForm, setShowDeclForm] = useState(false);
  const [simulateBioIssues, setSimulateBioIssues] = useState(false);
  
  const [widgets, setWidgets] = useState({
      forecast: true,
      network: true,
      command: true,
      risk: true,
      entry: true,
      exit: true,
      declarations: true,
      inspection: true,
      analytics: true,
      alerts: true,
  });
  const [showWidgetMenu, setShowWidgetMenu] = useState(false);
  const [activeLayer, setActiveLayer] = useState<LayerType>('workflow');
  const [activeIncidents, setActiveIncidents] = useState<Partial<Record<IncidentType, ActiveIncident>>>({});
  const activeIncidentsRef = useRef<Partial<Record<IncidentType, ActiveIncident>>>({});
  const [manuallyClosedLanes, setManuallyClosedLanes] = useState<string[]>([]);
  const manuallyClosedLanesRef = useRef<string[]>([]);
  // ─── Live event feed state ────────────────────────────────────────────────────
  const [consequenceFeed, setConsequenceFeed] = useState<ConsequenceEvent[]>([]);
  const [prevOpStatus, setPrevOpStatus] = useState<OperationalStatus>('STABLE');
  const prevStatsRef = useRef({ waiting: 0, avgWait: 0 });
  const [showWelcome, setShowWelcome] = useState(false);
  const [lang, setLang] = useState<Language>('RO');
  const [loggedInOfficer, setLoggedInOfficer] = useState<LoggedOfficer | null>(null);
  const [minRiskFilter, setMinRiskFilter] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [onlyHighRiskDecls, setOnlyHighRiskDecls] = useState(false);
  const [sortByRisk, setSortByRisk] = useState(false);
  const [declFilters, setDeclFilters] = useState({ trader: '', hs: '', origin: '', destination: '', goods: '' });
  const [declVehicleTypeFilter, setDeclVehicleTypeFilter] = useState<'all' | VehicleType>('all');
  const [declTab, setDeclTab] = useState<'live' | 'history' | 'redwatch' | 'ncts_ics2'>('live');
  const [tradeExpandedVeh, setTradeExpandedVeh] = useState<string | null>(null);
  const [declPeriod, setDeclPeriod] = useState<'24h' | '7d' | '30d' | '90d' | '1y'>('24h');

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [chatOpen,     setChatOpen]     = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => CHAT_SEED_FN(Date.now()));
  const [chatInput,    setChatInput]    = useState('');
  const [chatChannel,  setChatChannel]  = useState<string>('GENERAL');
  const [chatUnread,   setChatUnread]   = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ── Demo Mode state ──────────────────────────────────────────────────────────
  const [demoActive,    setDemoActive]    = useState(false);
  const [demoRole,      setDemoRole]      = useState<DemoRole | null>(null);
  const [demoStep,      setDemoStep]      = useState(0);
  const [demoDecisions, setDemoDecisions] = useState<string[]>([]);

  const [bcpPerformance, setBcpPerformance] = useState<Record<string, { cleared: number, highRisk: number }>>({});
  
  // Stats accumulator ref to prevent update loops/stale closures
  const bcpStatsRef = useRef<Record<string, { cleared: number, highRisk: number }>>({});

  // Initialize Ref
  useEffect(() => {
      BCPS.forEach(b => {
          if (!bcpStatsRef.current[b.id]) bcpStatsRef.current[b.id] = { cleared: 0, highRisk: 0 };
      });
  }, []);

  // ── Demo cleanup effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!demoActive) {
      setVehicles(prev => prev.filter(v => !v.id.startsWith('DV-')));
      setAlerts(prev => prev.filter(a => !a.id.startsWith('DA-')));
      setDemoRole(null); setDemoStep(0); setDemoDecisions([]);
    }
  }, [demoActive]);

  // ── Demo step effect — inject vehicles/alerts & navigate module ──────────────
  useEffect(() => {
    if (!demoActive || demoRole === null) return;
    const ev = DEMO_SCENARIOS[demoStep];
    if (!ev) return;
    setSelectedBCP(DEMO_BCP_ID);
    setActiveLayer(ev.module);
    setVehicles(prev => [...prev.filter(v => !v.id.startsWith('DV-')), ...DEMO_VEHICLES_POOL.slice(0, ev.vehiclesInject)]);
    setAlerts(prev => [...prev.filter(a => !a.id.startsWith('DA-')), ...DEMO_ALERTS_POOL.slice(0, ev.alertsInject)]);
  }, [demoActive, demoRole, demoStep]);

  const lanesForSelected = useMemo(() => LANES.filter((l) => l.bcpId === selectedBCP), [selectedBCP]);
  const vehiclesForSelected = useMemo(() => vehicles.filter((v) => v.bcpId === selectedBCP), [vehicles, selectedBCP]);
  
  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === selectedVehicleId), [vehicles, selectedVehicleId]);
  const selectedDeclaration = useMemo(() => {
    if (!selectedVehicle) return undefined;
    return declarations.find(d => d.linkedVehicleId === selectedVehicle.id || d.vehiclePlate === selectedVehicle.plate);
  }, [selectedVehicle, declarations]);

  const now = Date.now();
  const toggleWidget = (key: keyof typeof widgets) => setWidgets(prev => ({ ...prev, [key]: !prev[key] }));

  const handleAddDeclaration = (decl: Declaration) => {
      setDeclarations(prev => [decl, ...prev]);
      setShowDeclForm(false);
  };

  const handleUpdateVehicleBiometric = (type: 'face' | 'iris' | 'fingerprints', detail: BiometricDetail) => {
      if (!selectedVehicleId) return;
      setVehicles(prev => prev.map(v => v.id === selectedVehicleId ? {
          ...v,
          biometrics: { ...v.biometrics, [type]: detail },
          // Recalculate bioMismatch flag
          bioMismatch: (detail.status === 'Failed' || 
                       (type !== 'face' && v.biometrics.face.status === 'Failed') || 
                       (type !== 'iris' && v.biometrics.iris.status === 'Failed') || 
                       (type !== 'fingerprints' && v.biometrics.fingerprints.status === 'Failed'))
      } : v));
  };
  
  useEffect(() => {
    if (!loggedInOfficer) return; // pause simulation while login screen is shown
    const interval = setInterval(() => {
      const currentTime = Date.now();
      const newAlerts: Alert[] = [];

      // 1. GLOBAL TRAFFIC GENERATION (All Lanes, All BCPs)
      const inc = activeIncidentsRef.current;

      // Suspicious cargo: inject a HIGH-risk vehicle at the selected BCP every ~4s
      if (inc.suspiciousCargo && Math.random() < 0.25) {
        const sbcp = BCPS.find(b => b.id === selectedBCP)!;
        const sLanes = LANES.filter(l => l.bcpId === selectedBCP && l.isOpen && !manuallyClosedLanesRef.current.includes(l.id));
        if (sLanes.length > 0) {
          const sl = randomItem(sLanes);
          const sv = generateVehicle(sl, sbcp, true);
          sv.watchlistHit = true; sv.docAnomaly = true; sv.risk = 'High'; sv.riskScore = 82 + Math.random() * 18;
          setVehicles(prev => [...prev, sv]);
          bcpStatsRef.current[selectedBCP].highRisk++;
          const sd = generateDeclaration(sv); sd.channel = 'RED'; sd.riskBand = 'High';
          setDeclarations(prev => [...prev, sd]);
          newAlerts.push({ id: `INC_SC_${Date.now()}`, timestamp: Date.now(), bcpId: sv.bcpId, type: 'CUSTOMS', title: 'Suspicious Cargo', message: `Vehicle ${sv.plate}: intelligence-flagged cargo — RED channel, physical inspection mandatory.`, severity: 'HIGH' });
        }
      }

      LANES.forEach((lane) => {
        if (!lane.isOpen || manuallyClosedLanesRef.current.includes(lane.id)) return;
        const arrivalProb = inc.migrationSurge ? 0.30 : 0.15;
        if (Math.random() < arrivalProb) {
          const bcp = BCPS.find(b => b.id === lane.bcpId)!;
          const forceBio = simulateBioIssues || !!inc.bioSlowdown;
          const v = generateVehicle(lane, bcp, forceBio);
          if (inc.scannerMalfunction && Math.random() < 0.35) v.docAnomaly = true;
          
          // Immediately register new vehicle
          setVehicles(prev => [...prev, v]);
          
          // Track risk immediately
          if (v.risk === 'High') {
              bcpStatsRef.current[lane.bcpId].highRisk++;
          }

          // --- BORDER SECURITY ALERTS ---
          if (v.docAnomaly) {
             const borderIssues = [
                 "False Passport: MRZ Checksum Failure",
                 "False Identity Card: UV Hologram missing",
                 "Counterfeit Driving License detected",
                 "Imposter detected: Facial biometrics mismatch",
                 "Forged Visa / Residence Permit"
             ];
             newAlerts.push({ id: `ALT_${Date.now()}_${Math.random()}`, timestamp: Date.now(), bcpId: lane.bcpId, type: 'SECURITY', title: 'Document Verification Alert', message: `Vehicle ${v.plate} (${lane.bcpId.split('_')[1]}): ${randomItem(borderIssues)}`, severity: 'HIGH' });
          }
          else if (v.watchlistHit) {
             newAlerts.push({ id: `ALT_${Date.now()}_${Math.random()}`, timestamp: Date.now(), bcpId: lane.bcpId, type: 'SECURITY', title: 'Intelligence Hit', message: `Vehicle ${v.plate}: Person/Vehicle flagged in INTERPOL/Europol DB.`, severity: 'HIGH' });
          }
          
          // --- CUSTOMS ALERTS & Declarations ---
          // Trucks always have declarations (simulated). 
          // Personal vehicles (cars/buses) occasionally have declarations or smuggling alerts.
          
          if (lane.vehicleType === 'truck') {
               if (Math.random() < 0.85) { // High probability for trucks
                   const d = generateDeclaration(v);
                   setDeclarations(prev => [...prev, d]);
               }
          } else {
               // Personal Vehicles (Car/Bus)
               // Occasional Personal Declaration (Tax Refund, High Value Items, Cash Declaration)
               if (Math.random() < 0.10) {
                   const d = generateDeclaration(v);
                   setDeclarations(prev => [...prev, d]);
               }
               
               // Smuggling Logic
               if ((v.risk === 'High' || v.risk === 'Medium') && Math.random() < 0.4) {
                  const customsIssues = [
                      { title: "Smuggling / Excise Goods", msg: "Concealed Cigarettes (>50 cartons) found in chassis." },
                      { title: "Smuggling / Excise Goods", msg: "Undeclared Alcohol (>50L) found in luggage." },
                      { title: "Cash Control", msg: "Undeclared Cash > 10,000 EUR detected by K9 unit." },
                      { title: "Commercial Fraud", msg: "Undeclared commercial electronics (phones/laptops)." }
                  ];
                  const issue = randomItem(customsIssues);
                  newAlerts.push({ id: `ALT_${Date.now()}_${Math.random()}`, timestamp: Date.now(), bcpId: lane.bcpId, type: 'CUSTOMS', title: issue.title, message: `Vehicle ${v.plate}: ${issue.msg}`, severity: v.risk === 'High' ? 'HIGH' : 'MEDIUM' });
              }
          }
        }
      });

      // Random standalone declaration injection (Pre-lodged but vehicle not arrived yet or decoupled)
      if (Math.random() < 0.05) {
        const d = generateDeclaration();
        setDeclarations(prev => [...prev, d]);
        if (d.riskBand === 'High') newAlerts.push({ id: `ALT_${Date.now()}_${Math.random()}`, timestamp: Date.now(), type: 'CUSTOMS', title: 'High Risk Cargo', message: `MRN ${d.mrn}: ${d.riskReasons.join(', ')}`, severity: 'MEDIUM' });
      }

      if (newAlerts.length > 0) {
          setAlerts(prev => [...newAlerts, ...prev].slice(0, 50));
      }

      // 2. GLOBAL TRAFFIC PROCESSING (All Lanes)
      let revenueTick = 0;
      let entryClearedTick = 0;
      let exitClearedTick = 0;
      const entryByType: Record<string, number> = { car: 0, bus: 0, truck: 0 };
      const exitByType:  Record<string, number> = { car: 0, bus: 0, truck: 0 };
      // Per-BCP accumulators
      const bcpRevTick:   Record<string, number> = {};
      const bcpEntryTick: Record<string, number> = {};
      const bcpExitTick:  Record<string, number> = {};
      const bcpEntByType: Record<string, Record<string,number>> = {};
      const bcpExtByType: Record<string, Record<string,number>> = {};

      setVehicles((prev) => {
        const updated = [...prev];
        let waitingCountSelected = 0;
        let inControlCountSelected = 0;

        LANES.forEach((lane) => {
          if (manuallyClosedLanesRef.current.includes(lane.id)) return;
          const laneVehicles = updated.filter(v => v.laneId === lane.id && v.status !== 'cleared');
          
          // Tracking stats for selected BCP only for the graph
          if (lane.bcpId === selectedBCP) {
               const w = laneVehicles.filter(v => v.status.startsWith('waiting')).length;
               const c = laneVehicles.filter(v => v.status.startsWith('in_')).length;
               waitingCountSelected += w;
               inControlCountSelected += c;
          }

          const inCustoms = laneVehicles.find(v => v.status === 'in_customs');
          if (inCustoms && inCustoms.startCustomsTime) {
              const rawDuration = inCustoms.assignedCustomsDuration || lane.customsServiceTime;
              const duration = rawDuration * (activeIncidentsRef.current.customsBacklog ? 2.5 : 1);
              if ((currentTime - inCustoms.startCustomsTime) / 1000 >= duration) {
                  inCustoms.status = 'cleared';
                  // Track clearance — global
                  bcpStatsRef.current[lane.bcpId].cleared++;
                  if (lane.direction === 'entry') { entryClearedTick++; entryByType[inCustoms.vehicleType] = (entryByType[inCustoms.vehicleType] ?? 0) + 1; }
                  else                            { exitClearedTick++;  exitByType[inCustoms.vehicleType]  = (exitByType[inCustoms.vehicleType]  ?? 0) + 1; }

                  // Track clearance — per BCP
                  const bid = lane.bcpId;
                  if (!bcpEntByType[bid]) { bcpEntByType[bid] = {car:0,bus:0,truck:0}; bcpExtByType[bid] = {car:0,bus:0,truck:0}; }
                  if (lane.direction === 'entry') { bcpEntryTick[bid] = (bcpEntryTick[bid]??0)+1; bcpEntByType[bid][inCustoms.vehicleType]++; }
                  else                            { bcpExitTick[bid]  = (bcpExitTick[bid] ??0)+1; bcpExtByType[bid][inCustoms.vehicleType]++; }

                  // Simulate Revenue Collection for Truck/High Value
                  const vRev = inCustoms.vehicleType === 'truck'
                    ? Math.floor(Math.random() * 4500) + 200
                    : (inCustoms.vehicleType === 'car' && Math.random() < 0.1 ? Math.floor(Math.random() * 500) : 0);
                  revenueTick += vRev;
                  bcpRevTick[bid] = (bcpRevTick[bid] ?? 0) + vRev;
              }
          } else if (!inCustoms) {
              const queue = laneVehicles.filter(v => v.status === 'waiting_customs');
              const nextForCustoms = queue.sort((a,b) => a.arrivalTime - b.arrivalTime)[0];
              if (nextForCustoms) {
                  nextForCustoms.status = 'in_customs';
                  nextForCustoms.startCustomsTime = currentTime;
                  nextForCustoms.assignedCustomsDuration = calculateDynamicServiceTime(lane.customsServiceTime, nextForCustoms.risk, queue.length);
              }
          }
          const inBorder = laneVehicles.find(v => v.status === 'in_border');
          if (inBorder && inBorder.startBorderTime) {
              const duration = inBorder.assignedBorderDuration || lane.borderServiceTime;
              if ((currentTime - inBorder.startBorderTime) / 1000 >= duration) {
                  inBorder.status = 'waiting_customs';
                  inBorder.startBorderTime = undefined;
              }
          } else if (!inBorder) {
              const queue = laneVehicles.filter(v => v.status === 'waiting_border');
              const nextForBorder = queue.sort((a,b) => a.arrivalTime - b.arrivalTime)[0];
              if (nextForBorder) {
                  nextForBorder.status = 'in_border';
                  nextForBorder.startBorderTime = currentTime;
                  nextForBorder.assignedBorderDuration = calculateDynamicServiceTime(lane.borderServiceTime, nextForBorder.risk, queue.length);
              }
          }
        });

        // Sync Ref to State for rendering
        setBcpPerformance({...bcpStatsRef.current});
        
        // Update graph stats for selected
        setStatsHistory(h => [...h, { time: currentTime, waiting: waitingCountSelected, inControl: inControlCountSelected }].slice(-60));
        
        const keepThreshold = currentTime - 15000; 
        return updated.filter(v => v.status !== "cleared" || (v.startCustomsTime && v.startCustomsTime > keepThreshold));
      });
      
      // Update Revenue/Throughput Graphs — global
      setRevenueHistory(prev => {
          const last = prev[prev.length - 1];
          const total = (last?.amount || 0) + revenueTick;
          return [...prev, { time: currentTime, amount: total }].slice(-60);
      });
      setThroughputHistory(prev => [...prev, { time: currentTime, entry: entryClearedTick, exit: exitClearedTick, entryByType: {...entryByType}, exitByType: {...exitByType} }].slice(-60));

      // Update per-BCP history
      setBcpThroughputHistory(prev => {
        const next: typeof prev = {};
        BCPS.forEach(b => {
          const hist = prev[b.id] ?? [];
          next[b.id] = [...hist, {
            time: currentTime,
            entry: bcpEntryTick[b.id] ?? 0,
            exit:  bcpExitTick[b.id]  ?? 0,
            entryByType: bcpEntByType[b.id] ?? {car:0,bus:0,truck:0},
            exitByType:  bcpExtByType[b.id] ?? {car:0,bus:0,truck:0},
          }].slice(-60);
        });
        return next;
      });
      setBcpRevenueHistory(prev => {
        const next: typeof prev = {};
        BCPS.forEach(b => {
          const hist = prev[b.id] ?? [];
          const last = hist[hist.length - 1];
          next[b.id] = [...hist, { time: currentTime, amount: (last?.amount ?? 0) + (bcpRevTick[b.id] ?? 0) }].slice(-60);
        });
        return next;
      });

    }, 1000);
    return () => clearInterval(interval);
  }, [selectedBCP, simulateBioIssues, loggedInOfficer]);

  // Keep incident/lane refs in sync with state (so the 1-s interval reads current values)
  useEffect(() => { activeIncidentsRef.current = activeIncidents; }, [activeIncidents]);
  useEffect(() => { manuallyClosedLanesRef.current = manuallyClosedLanes; }, [manuallyClosedLanes]);

  // Auto-recovery: expire incidents after their duration
  useEffect(() => {
    if (!loggedInOfficer) return; // pause while login screen is shown
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveIncidents(prev => {
        const next = { ...prev };
        let changed = false;
        (Object.keys(next) as IncidentType[]).forEach(k => {
          if (now > next[k]!.startTime + next[k]!.duration * 1000) {
            delete next[k];
            changed = true;
            if (k === 'laneClosure') setManuallyClosedLanes([]);
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loggedInOfficer]);

  const activateIncident = (type: IncidentType) => {
    // Toggle off if already active
    if (activeIncidentsRef.current[type]) {
      setActiveIncidents(prev => { const n = { ...prev }; delete n[type]; return n; });
      if (type === 'laneClosure') setManuallyClosedLanes([]);
      return;
    }
    const def = INCIDENT_DEFS.find(d => d.id === type)!;
    setActiveIncidents(prev => ({ ...prev, [type]: { startTime: Date.now(), duration: def.duration } }));
    if (type === 'laneClosure') {
      const open = LANES.filter(l => l.bcpId === selectedBCP && l.isOpen && !manuallyClosedLanesRef.current.includes(l.id));
      if (open.length > 2) setManuallyClosedLanes(prev => [...prev, randomItem(open).id]);
    }
    const alertMap: Record<IncidentType, { aType: string; title: string; msg: string }> = {
      suspiciousCargo:    { aType: 'CUSTOMS',     title: 'INCIDENT: Suspicious Cargo',             msg: 'Intelligence report: potential contraband convoy en route. Enhanced physical inspection activated.' },
      bioSlowdown:        { aType: 'SECURITY',    title: 'INCIDENT: Biometric System Degraded',    msg: 'Biometric verification infrastructure reporting elevated failure rates. Manual identification fallback active.' },
      customsBacklog:     { aType: 'CUSTOMS',     title: 'INCIDENT: Customs Processing Backlog',   msg: 'Customs clearance pipeline congested. Processing times estimated at 2.5× normal. Supervisor notified.' },
      laneClosure:        { aType: 'OPERATIONAL', title: 'INCIDENT: Lane Closure',                 msg: `Emergency lane closure at ${BCPS.find(b => b.id === selectedBCP)?.name}. Activate adjacent lanes.` },
      migrationSurge:     { aType: 'OPERATIONAL', title: 'INCIDENT: Migration Surge Detected',     msg: 'Elevated vehicle arrival rate detected. Surge protocol activated. Reinforce queuing area.' },
      scannerMalfunction: { aType: 'SECURITY',    title: 'INCIDENT: Document Scanner Malfunction', msg: 'Primary document scanners reporting calibration fault. Elevated anomaly rate. Manual verification required.' },
    };
    const a = alertMap[type];
    setAlerts(prev => [{ id: `INC_${Date.now()}_${type}`, timestamp: Date.now(), type: a.aType as Alert['type'], title: a.title, message: a.msg, severity: 'HIGH' as const }, ...prev].slice(0, 50));
    setConsequenceFeed(prev => [{ id: `inc-${Date.now()}`, msg: `INCIDENT ACTIVATED — ${a.title}`, ts: Date.now(), type: 'ALERT' as const }, ...prev].slice(0, 30));
  };

  // Declaration status auto-progression: SUBMITTED → INSPECTION → RELEASED / HELD / SEIZED
  useEffect(() => {
    if (!loggedInOfficer) return; // pause while login screen is shown
    const interval = setInterval(() => {
      setDeclarations(prev => {
        const updated = prev.map(d => ({ ...d }));
        const submitted = updated.filter(d => d.status === 'SUBMITTED');
        const toInspect = submitted.slice(0, Math.max(1, Math.ceil(submitted.length * 0.12)));
        toInspect.forEach(d => { d.status = 'INSPECTION'; });
        const inspecting = updated.filter(d => d.status === 'INSPECTION');
        const toResolve = inspecting.slice(0, Math.max(1, Math.ceil(inspecting.length * 0.18)));
        toResolve.forEach(d => {
          if (d.channel === 'RED' && d.riskBand === 'High' && Math.random() < 0.25) {
            d.status = 'SEIZED';
          } else if (d.channel === 'YELLOW' && Math.random() < 0.15) {
            d.status = 'HELD';
          } else {
            d.status = 'RELEASED';
          }
        });
        return updated;
      });
    }, 6000);
    return () => clearInterval(interval);
  }, [loggedInOfficer]);

  // ── Auto-simulated incoming chat messages ────────────────────────────────────
  useEffect(() => {
    if (!loggedInOfficer) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    CHAT_AUTO_MESSAGES.forEach(({ delay, msg }) => {
      const t = setTimeout(() => {
        const newMsg: ChatMessage = { ...msg, id: `auto-${Date.now()}-${Math.random()}`, timestamp: Date.now() };
        setChatMessages(prev => [...prev, newMsg]);
        setChatUnread(prev => prev + 1);
      }, delay);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [loggedInOfficer]);

  const stats = useMemo(() => {
    const waiting = vehiclesForSelected.filter(v => v.status === "waiting_border" || v.status === "waiting_customs");
    const inControl = vehiclesForSelected.filter(v => v.status === "in_border" || v.status === "in_customs");
    const avgWaitSec = waiting.length > 0 ? waiting.reduce((acc, v) => acc + (now - v.arrivalTime), 0) / waiting.length / 1000 : 0;
    const riskCounts = { Low: 0, Medium: 0, High: 0 };
    vehiclesForSelected.forEach(v => riskCounts[v.risk]++);
    return { waiting, inControl, avgWaitSec, riskCounts };
  }, [vehiclesForSelected, now]);

  const predictions = useMemo((): Predictions | null => {
    const queueData = statsHistory.map(h => h.waiting);
    if (queueData.length < 5) return null;
    const lastQ = Math.max(1, queueData[queueData.length - 1]);
    const waitData = statsHistory.map(h =>
      h.waiting > 0 ? stats.avgWaitSec * (h.waiting / lastQ) : 0
    );
    const queueReg = linearRegression(queueData);
    const waitReg  = linearRegression(waitData);
    const n = queueData.length;
    const queueNow  = queueData[n - 1];
    const waitNow   = stats.avgWaitSec;
    const queue2m   = regPredict(queueReg, n + 10);
    const queue5m   = regPredict(queueReg, n + 25);
    const queue10m  = regPredict(queueReg, n + 50);
    const wait2m    = Math.max(0, regPredict(waitReg, n + 10));
    const wait5m    = Math.max(0, regPredict(waitReg, n + 25));
    const wait10m   = Math.max(0, regPredict(waitReg, n + 50));
    const maxQ = 20;
    const maxW = 180;
    const qSat = Math.min(1, queueNow / maxQ);
    const wSat = Math.min(1, waitNow / maxW);
    const growthPenalty = Math.max(0, Math.min(1, queueReg.slope * 5));
    const stressIndex = Math.round(qSat * 40 + wSat * 40 + growthPenalty * 20);
    const saturation: Predictions['saturation'] =
      stressIndex >= 80 ? 'CRITICAL' : stressIndex >= 55 ? 'HIGH' : stressIndex >= 30 ? 'MEDIUM' : 'LOW';
    const trend: Predictions['trend'] =
      queueReg.slope > 0.5
        ? (stressIndex >= 70 ? 'CRITICAL' : 'DETERIORATING')
        : queueReg.slope < -0.3
        ? 'IMPROVING'
        : 'STABLE';
    const r2 = queueReg.r2;
    const confidence = Math.round(Math.min(99, 50 + r2 * 49));
    return {
      queueNow, queue2m, queue5m, queue10m,
      waitNow, wait2m, wait5m, wait10m,
      stressIndex, saturation, trend,
      r2, confidence, slope: queueReg.slope,
      waitReg, queueReg,
      queueHistory: queueData, waitHistory: waitData,
    };
  }, [statsHistory, stats.avgWaitSec]);

  const operationalStatus = useMemo((): OperationalStatus => {
    const stress   = predictions?.stressIndex ?? 0;
    const incCount = Object.keys(activeIncidents).length;
    const highRisk = vehicles.filter(v => v.risk === 'High').length;
    if (stress >= 80 || incCount >= 3 || (highRisk >= 5 && incCount >= 1)) return 'ESCALATION';
    if (stress >= 60 || incCount >= 2 || stats.avgWaitSec > 120)           return 'CRITICAL';
    if (stress >= 30 || incCount >= 1 || stats.avgWaitSec > 50)            return 'CONGESTED';
    return 'STABLE';
  }, [predictions, activeIncidents, vehicles, stats.avgWaitSec]);

  // ── Operational status transition → consequence feed ────────────────────────
  useEffect(() => {
    if (operationalStatus === prevOpStatus) return;
    const levels: OperationalStatus[] = ['STABLE', 'CONGESTED', 'CRITICAL', 'ESCALATION'];
    const escalating = levels.indexOf(operationalStatus) > levels.indexOf(prevOpStatus);
    const ev: ConsequenceEvent = { id: `status-${Date.now()}`, msg: escalating ? `STATUS ESCALATED: ${prevOpStatus} → ${operationalStatus}` : `Situation improving: ${prevOpStatus} → ${operationalStatus}`, ts: Date.now(), type: 'ESCALATION' };
    setConsequenceFeed(prev => [ev, ...prev].slice(0, 30));
    setPrevOpStatus(operationalStatus);
  }, [operationalStatus]); // eslint-disable-line

  // ── Auto threshold events ────────────────────────────────────────────────────
  useEffect(() => {
    const waiting = stats.waiting.length;
    const avgWait = stats.avgWaitSec;
    const p = prevStatsRef.current;
    const push = (id: string, msg: string, type: ConsequenceEvent['type']) =>
      setConsequenceFeed(f => [{ id, msg, ts: Date.now(), type } as ConsequenceEvent, ...f].slice(0, 30));
    if      (waiting >= 15 && p.waiting < 15)  push(`q15-${Date.now()}`, `Queue crossed 15 vehicles — operational threshold breached`, 'ALERT');
    else if (waiting >= 10 && p.waiting < 10)  push(`q10-${Date.now()}`, `Queue at ${waiting} vehicles — congestion building`,          'EVENT');
    else if (waiting < 6  && p.waiting >= 10)  push(`qok-${Date.now()}`, `Queue cleared to ${waiting} vehicles — congestion easing`,     'EVENT');
    if (avgWait >= 120 && p.avgWait < 120)     push(`w120-${Date.now()}`, `Average wait exceeded 2 min — service level critical`,        'ALERT');
    prevStatsRef.current = { waiting, avgWait };
  }, [stats.waiting.length, Math.round(stats.avgWaitSec / 5)]); // eslint-disable-line

  const checkRiskVisibility = (risk: RiskLevel) => {
      if (minRiskFilter === 'Low') return true;
      if (minRiskFilter === 'Medium') return risk === 'Medium' || risk === 'High';
      if (minRiskFilter === 'High') return risk === 'High';
      return true;
  };

  // BCP-scoped declaration predicate: matches declarations linked to a vehicle at selectedBCP,
  // or standalone pre-lodged declarations (no linked vehicle — BCP unknown → shown everywhere)
  const isDeclAtBCP = (d: Declaration) => {
    if (!d.linkedVehicleId && !d.vehiclePlate) return true;
    const lv = vehicles.find(v => v.id === d.linkedVehicleId || v.plate === d.vehiclePlate);
    return lv ? lv.bcpId === selectedBCP : true;
  };
  const activeDeclarations = declarations.filter(d => (d.status === 'SUBMITTED' || d.status === 'INSPECTION') && isDeclAtBCP(d));
  const displayedDeclarations = activeDeclarations.filter(d => {
      const matchesRisk = checkRiskVisibility(d.riskBand);
      const matchesHighRiskToggle = onlyHighRiskDecls ? d.channel === 'RED' : true;
      const matchesTrader = d.traderName.toLowerCase().includes(declFilters.trader.toLowerCase());
      const matchesOrigin = d.originCountry.toLowerCase().includes(declFilters.origin.toLowerCase()); 
      const matchesDestination = d.destinationCountry.toLowerCase().includes(declFilters.destination.toLowerCase());
      const matchesHS = d.hsCode.includes(declFilters.hs);
      const matchesGoods = d.goodsDesc.toLowerCase().includes(declFilters.goods.toLowerCase());
      const matchesVehicleType = declVehicleTypeFilter === 'all' || d.vehicleType === declVehicleTypeFilter;
      return matchesRisk && matchesHighRiskToggle && matchesTrader && matchesVehicleType && matchesOrigin && matchesGoods && matchesDestination && matchesHS;
  }).sort((a, b) => sortByRisk ? b.riskScore - a.riskScore : 0);

  const declRiskStats = { Low: 0, Medium: 0, High: 0 };
  displayedDeclarations.forEach(d => declRiskStats[d.riskBand]++);
  const totalDecls = displayedDeclarations.length || 1;

  // Trade Intelligence derived data
  const periodCutoffMs: Record<typeof declPeriod, number> = {
    '24h': 86_400_000,
    '7d':  7  * 86_400_000,
    '30d': 30 * 86_400_000,
    '90d': 90 * 86_400_000,
    '1y':  365 * 86_400_000,
  };
  const past24Decls = declarations.filter(d => now - d.arrivalTime < periodCutoffMs[declPeriod] && isDeclAtBCP(d));
  const past24Released = past24Decls.filter(d => d.status === 'RELEASED');
  const past24Held     = past24Decls.filter(d => d.status === 'HELD');
  const past24Seized   = past24Decls.filter(d => d.status === 'SEIZED');
  const past24Revenue  = past24Released.reduce((acc, d) => ({ duties: acc.duties + d.duties, vat: acc.vat + d.vat, excise: acc.excise + d.excise }), { duties: 0, vat: 0, excise: 0 });
  const past24Chan     = { RED: 0, YELLOW: 0, GREEN: 0 } as Record<'RED'|'YELLOW'|'GREEN', number>;
  past24Decls.forEach(d => { if (d.channel in past24Chan) past24Chan[d.channel]++; });
  const liveDecls      = [...activeDeclarations].sort((a, b) => b.riskScore - a.riskScore);
  const redWatchDecls  = activeDeclarations.filter(d => d.channel === 'RED').sort((a, b) => b.riskScore - a.riskScore);
  const escalationDecls = activeDeclarations.filter(d => d.channel === 'YELLOW' && d.riskScore >= 65).sort((a, b) => b.riskScore - a.riskScore);

  // ── Real-time vehicles in system (enriched with linked declaration channel) ──
  const liveVehiclesInSystem = useMemo(() => {
    return vehicles
      .filter(v => (v.status === 'waiting_customs' || v.status === 'in_customs') && v.bcpId === selectedBCP)
      .map(v => {
        const decl = declarations.find(d => d.linkedVehicleId === v.id || d.vehiclePlate === v.plate);
        return { v, decl, channel: decl?.channel ?? null };
      })
      .sort((a, b) => {
        const prio = (ch: string | null) => ch === 'RED' ? 0 : ch === 'YELLOW' ? 1 : 2;
        const p = prio(a.channel) - prio(b.channel);
        if (p !== 0) return p;
        // trucks first within same channel tier
        const ta = a.v.vehicleType === 'truck' ? 0 : a.v.vehicleType === 'bus' ? 1 : 2;
        const tb = b.v.vehicleType === 'truck' ? 0 : b.v.vehicleType === 'bus' ? 1 : 2;
        if (ta !== tb) return ta - tb;
        return b.v.riskScore - a.v.riskScore;
      });
  }, [vehicles, declarations, selectedBCP]);

  // Trucks with RED/YELLOW channel — auto-flag in live feed
  const redYellowTrucks = liveVehiclesInSystem.filter(e => e.v.vehicleType === 'truck' && (e.channel === 'RED' || e.channel === 'YELLOW'));
  const redTrucks       = liveVehiclesInSystem.filter(e => e.v.vehicleType === 'truck' && e.channel === 'RED');

  const leftActive = widgets.forecast || widgets.command || widgets.risk || widgets.alerts || widgets.network;
  const rightActive = widgets.declarations;
  const centerColSpan = (leftActive && rightActive) ? "col-span-12 xl:col-span-6" : (leftActive || rightActive) ? "col-span-12 xl:col-span-9" : "col-span-12";

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-300 font-sans selection:bg-blue-500/30">
      {!loggedInOfficer ? (
        <LoginScreen onLogin={setLoggedInOfficer} lang={lang} onLangChange={setLang} />
      ) : (
      <div className="p-4 md:p-6 flex flex-col pb-8 min-h-screen">
        {showWelcome && <ExhibitionWelcome onDismiss={() => setShowWelcome(false)} />}
        {showDeclForm && <DeclarationForm onClose={() => setShowDeclForm(false)} onSubmit={handleAddDeclaration} />}
      <OpsStatusBanner
        status={operationalStatus}
        queueLen={stats.waiting.length}
        avgWait={stats.avgWaitSec}
        highRiskCount={vehicles.filter(v => v.risk === 'High').length}
        incidentCount={Object.keys(activeIncidents).length}
        stressIndex={predictions?.stressIndex ?? null}
        lang={lang}
      />
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 shrink-0 relative">
        <div className="flex items-center gap-4">
          {/* Official institution emblems */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex flex-col items-center gap-0.5">
              <img src={`${import.meta.env.BASE_URL}logo-border-police.png`} alt="Poliția de Frontieră"
                className="h-11 w-auto object-contain drop-shadow-lg" />
              <span className="text-[7px] font-bold text-blue-400/70 uppercase tracking-wider leading-none hidden sm:block">Poliția de Frontieră</span>
            </div>
            <div className="w-px h-10 bg-slate-700/50 shrink-0" />
            <div className="flex flex-col items-center gap-0.5">
              <img src={`${import.meta.env.BASE_URL}logo-customs-service.png`} alt="Serviciul Vamal"
                className="h-11 w-auto object-contain drop-shadow-lg" />
              <span className="text-[7px] font-bold text-orange-400/70 uppercase tracking-wider leading-none hidden sm:block">Serviciul Vamal</span>
            </div>
          </div>
          {/* Identity */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-black text-slate-100 tracking-tight uppercase leading-tight">{{ EN: 'Border Police · Customs Service · Intelligence', RO: 'Poliția de Frontieră · Serviciul Vamal · Informații', FR: 'Police des Frontières · Service des Douanes · Renseignement', RU: 'Погранполиция · Таможня · Разведка' }[lang]}</h1>
              <div className="h-4 w-px bg-slate-700 hidden sm:block" />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400 bg-rose-950/50 border border-rose-900/60 px-2 py-0.5 rounded">{{ EN: 'NCE Platform', RO: 'Platformă NCE', FR: 'Plateforme NCE', RU: 'Платформа NCE' }[lang]}</span>
              {!demoActive && (
                <button onClick={() => setDemoActive(true)}
                  className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-500/70 bg-amber-950/30 border border-amber-900/50 hover:border-amber-500/60 hover:text-amber-400 px-2 py-0.5 rounded transition-all duration-200 flex items-center gap-1">
                  ▶ DEMO
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium tracking-wide mt-0.5">{SUBTITLE_T[lang]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Language selector */}
            <div className="flex items-center gap-0.5 bg-[#0D1219] border border-slate-800 rounded-lg p-1">
              {(Object.keys(LANG_NAMES) as Language[]).map(l => (
                <button key={l} onClick={() => setLang(l)}
                  className={`px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-all border ${lang === l ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'border-transparent text-slate-600 hover:text-slate-400'}`}>
                  {l}
                </button>
              ))}
            </div>
            {/* Logged-in officer chip */}
            {loggedInOfficer && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                <div className={`w-1.5 h-1.5 rounded-full ${loggedInOfficer.institution === 'BORDER_POLICE' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-200 leading-none">{loggedInOfficer.surname} {loggedInOfficer.name}</span>
                  <span className="text-[8px] text-slate-500 leading-none mt-0.5">{loggedInOfficer.rank} · {loggedInOfficer.badge}</span>
                </div>
                <button onClick={() => { setLoggedInOfficer(null); setShowWelcome(false); }}
                  className="ml-1 text-slate-700 hover:text-slate-400 transition-colors p-0.5" title="Log out">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </div>
            )}
            {/* Simulation Controls Toggle */}
            <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${simulateBioIssues ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>High-Tempo</span>
                <button 
                    onClick={() => setSimulateBioIssues(!simulateBioIssues)}
                    className={`relative w-11 h-6 transition-all duration-300 rounded-full border border-slate-700 p-1 flex items-center ${simulateBioIssues ? 'bg-red-600/20' : 'bg-slate-900'}`}
                    title="Simulate High Biometric Failure Rate"
                >
                    <div className={`w-4 h-4 rounded-full transition-all duration-300 shadow-sm flex items-center justify-center ${simulateBioIssues ? 'translate-x-5 bg-red-500' : 'translate-x-0 bg-slate-600'}`}>
                         <svg className={`w-2.5 h-2.5 text-slate-900 ${simulateBioIssues ? 'block' : 'hidden'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                </button>
            </div>

            <button onClick={() => setShowWidgetMenu(!showWidgetMenu)} className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200">
                 Layout
            </button>
            {showWidgetMenu && (
                <div className="absolute right-20 top-12 w-56 bg-slate-800 border border-slate-700 shadow-xl rounded-lg z-50 p-2">
                    {Object.entries(widgets).map(([key, active]) => (
                        <button key={key} onClick={() => toggleWidget(key as keyof typeof widgets)} className="w-full flex items-center justify-between px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-700/50 rounded">
                            <span className="capitalize">{key}</span>
                            <div className={`w-2 h-2 rounded-full ${active ? 'bg-blue-500' : 'bg-slate-600'}`} />
                        </button>
                    ))}
                </div>
            )}
            <select value={selectedBCP} onChange={e => setSelectedBCP(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-md px-3 py-1.5">
                {BCPS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
        </div>
      </header>

      <LayerNav active={activeLayer} onChange={setActiveLayer} lang={lang} />
      <IncidentPanel activeIncidents={activeIncidents} onActivate={activateIncident} now={now} lang={lang} />

      {activeLayer === 'governance' && <GovernanceLayer alerts={alerts} vehicles={vehicles} declarations={declarations} lang={lang} selectedBCP={selectedBCP} />}
      {activeLayer === 'kpi' && <KPILayer stats={stats} revenue={revenue} bcpPerformance={bcpPerformance} declarations={declarations} vehicles={vehicles} throughputHistory={throughputHistory} revenueHistory={revenueHistory} bcpThroughputHistory={bcpThroughputHistory} bcpRevenueHistory={bcpRevenueHistory} selectedBCP={selectedBCP} lang={lang} />}
      {activeLayer === 'interop' && <InteropLayer vehicles={vehicles} declarations={declarations} lang={lang} selectedBCP={selectedBCP} />}
      {activeLayer === 'ai-risk' && <AIRiskLayer vehicles={vehicles} declarations={declarations} pred={predictions} lang={lang} selectedBCP={selectedBCP} />}
      {activeLayer === 'decision' && <DecisionSupportLayer stats={stats} vehicles={vehicles} declarations={declarations} alerts={alerts} bcpPerformance={bcpPerformance} pred={predictions} lang={lang} selectedBCP={selectedBCP} />}
      {/* HumanLayer retired — officers data integrated into OpsInfoLayer */}

      {activeLayer === 'ops-info' && <OpsInfoLayer vehicles={vehicles} declarations={declarations} alerts={alerts} lang={lang} selectedBCP={selectedBCP} />}
      {activeLayer === 'mission' && <MissionLayer vehicles={vehicles} declarations={declarations} lang={lang} selectedBCP={selectedBCP} />}
      {activeLayer === 'cooperation' && <CoopLayer lang={lang} selectedBCP={selectedBCP} />}

      {/* ── Demo Mode overlays ───────────────────────────────────────────────── */}
      {demoActive && !demoRole && (
        <DemoRoleSelect lang={lang} onSelect={(r) => { setDemoRole(r); setDemoStep(0); setDemoDecisions([]); }} onCancel={() => setDemoActive(false)} />
      )}
      {demoActive && demoRole && (
        <DemoPanel step={demoStep} role={demoRole} lang={lang} decisionsChosen={demoDecisions}
          onNext={() => { setDemoStep(s => Math.min(s + 1, DEMO_SCENARIOS.length - 1)); setDemoDecisions([]); }}
          onPrev={() => { setDemoStep(s => Math.max(s - 1, 0)); setDemoDecisions([]); }}
          onExit={() => setDemoActive(false)}
          onDecide={(id) => setDemoDecisions(prev => prev.includes(id) ? prev : [...prev, id])} />
      )}

      {activeLayer === 'workflow' && <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        {leftActive && (
            <div className="col-span-12 xl:col-span-3 flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar pr-1">
                <DashboardWidget title={{ EN: 'Operational Forecast', RO: 'Prognoză Operațională', FR: 'Prévision Opérationnelle', RU: 'Операционный Прогноз' }[lang]} isVisible={widgets.forecast} onClose={() => toggleWidget('forecast')}>
                    <PredictiveOverlay pred={predictions} lang={lang} />
                </DashboardWidget>
                <DashboardWidget title={{ EN: 'Network Performance', RO: 'Performanță Rețea', FR: 'Performance Réseau', RU: 'Производительность Сети' }[lang]} isVisible={widgets.network} onClose={() => toggleWidget('network')}>
                    <NetworkPerformanceWidget
                        bcps={BCPS}
                        bcpStats={bcpPerformance}
                        vehicles={vehicles}
                        onSelectBcp={setSelectedBCP}
                        selectedBcpId={selectedBCP}
                        lang={lang}
                    />
                </DashboardWidget>

                <DashboardWidget title={{ EN: 'Command: Active BCP Status', RO: 'Comandă: Status BCP Activ', FR: 'Commandement: Statut PdP Actif', RU: 'Командование: Статус КПП' }[lang]} isVisible={widgets.command} onClose={() => toggleWidget('command')}>
                    <div className="space-y-4">
                        <details className="mb-3">
                          <summary className="text-[9px] text-slate-600 cursor-pointer hover:text-slate-400 select-none">
                            {{ EN: '▸ What is this?', RO: '▸ Ce este aceasta?', FR: "▸ Qu'est-ce que c'est ?", RU: '▸ Что это?' }[lang]}
                          </summary>
                          <p className="text-[9px] text-slate-500 mt-1 leading-relaxed">{{ EN: 'Real-time operational dashboard for the selected BCP. Shows pending vehicle interventions, average control processing time, a timeline graph of vehicle flow, and a live tactical map of active lanes.', RO: 'Tablou de bord operațional în timp real pentru BCP-ul selectat. Arată intervențiile vehicule în așteptare, timpul mediu de procesare a controlului, un grafic temporal al fluxului de vehicule și o hartă tactică live a benzilor active.', FR: 'Tableau de bord opérationnel en temps réel pour le PdP sélectionné. Montre les interventions véhicules en attente, le temps moyen de traitement, un graphique temporel du flux de véhicules et une carte tactique en direct.', RU: 'Операционная панель в реальном времени для выбранного КПП. Показывает ожидающие вмешательства, среднее время обработки контроля, временной график потока ТС и живую тактическую карту активных полос.' }[lang]}</p>
                        </details>
                        <div className="grid grid-cols-2 gap-2">
                             <div className="bg-slate-900/30 p-2 rounded border border-slate-800/50">
                                <div className="text-[9px] text-slate-500 uppercase mb-1">{{ EN: 'Pending Interventions', RO: 'Intervenții în Așteptare', FR: 'Interventions en Attente', RU: 'Ожидающие Вмешательства' }[lang]}</div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-xl font-light text-slate-200">{stats.waiting.length}</span>
                                    <span className="text-[9px] text-slate-500">{{ EN: 'Units', RO: 'Unități', FR: 'Unités', RU: 'Единиц' }[lang]}</span>
                                </div>
                            </div>
                             <div className="bg-slate-900/30 p-2 rounded border border-slate-800/50">
                                <div className="text-[9px] text-slate-500 uppercase mb-1">{{ EN: 'Control Latency', RO: 'Latență Control', FR: 'Latence Contrôle', RU: 'Задержка Контроля' }[lang]}</div>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-xl font-light ${stats.avgWaitSec > 120 ? 'text-red-400' : 'text-emerald-400'}`}>{stats.avgWaitSec.toFixed(0)}</span>
                                    <span className="text-[9px] text-slate-500">{{ EN: 'sec', RO: 'sec', FR: 'sec', RU: 'с' }[lang]}</span>
                                </div>
                            </div>
                        </div>
                        <div className="pt-1">
                             <div className="text-[9px] text-slate-500 uppercase mb-2 font-bold tracking-wider">{{ EN: 'Enforcement Timeline', RO: 'Cronologie Control', FR: 'Chronologie Contrôle', RU: 'Хронология Контроля' }[lang]}</div>
                             <TrafficGraph history={statsHistory} />
                        </div>
                        <div className="pt-2 border-t border-slate-800/60">
                            <details>
                              <summary className="text-[9px] text-slate-500 uppercase font-bold tracking-wider cursor-pointer hover:text-slate-300 select-none mb-2">
                                {{ EN: 'Tactical Map ▸', RO: 'Hartă Tactică ▸', FR: 'Carte Tactique ▸', RU: 'Тактическая Карта ▸' }[lang]}
                              </summary>
                              <p className="text-[9px] text-slate-600 mb-2 leading-relaxed">{{ EN: "Live bird's-eye view of active lanes at the selected BCP. Green = open lane, Red = closed. Vehicle dots move as they progress through border and customs checks.", RO: 'Vizualizare live de sus a benzilor active la BCP-ul selectat. Verde = bandă deschisă, Roșu = închisă. Punctele vehicule se mișcă pe măsură ce avansează prin controlul de frontieră și vamal.', FR: 'Vue aérienne en direct des voies actives au PdP sélectionné. Vert = voie ouverte, Rouge = fermée. Les points véhicules se déplacent au fur et à mesure des contrôles.', RU: 'Живой вид сверху активных полос на выбранном КПП. Зелёный = открытая полоса, Красный = закрыта. Точки ТС движутся по мере прохождения пограничного и таможенного контроля.' }[lang]}</p>
                            </details>
                            <LaneMiniMap lanes={lanesForSelected} vehicles={vehiclesForSelected} />
                        </div>
                    </div>
                </DashboardWidget>

                <DashboardWidget title={{ EN: 'Network Radar — All 21 BCPs', RO: 'Radar Rețea — Toate 21 BCPs', FR: 'Radar Réseau — 21 PdP', RU: 'Радар Сети — Все 21 КПП' }[lang]} isVisible={widgets.risk} onClose={() => toggleWidget('risk')}>
                    {(() => {
                        const netVs  = vehicles.filter(v => v.status !== 'cleared');
                        const netHi  = netVs.filter(v => v.risk === 'High').length;
                        const netWL  = netVs.filter(v => v.watchlistHit).length;
                        return (
                            <div className="space-y-2">
                                <details className="mb-2">
                                  <summary className="text-[8px] text-slate-600 cursor-pointer hover:text-slate-400 select-none">{{ EN: '▸ Purpose — how is this different from Critical Alerts and Operational Log?', RO: '▸ Scop — cum diferă de Alerte Critice și Jurnalul Operațional?', FR: '▸ Objectif — en quoi diffère-t-il des Alertes Critiques et du Journal?', RU: '▸ Назначение — чем отличается от Критических Тревог и Журнала?' }[lang]}</summary>
                                  <div className="mt-1 text-[8px] text-slate-600 leading-relaxed space-y-0.5">
                                    <p><span className="text-blue-400 font-bold">{{ EN: 'This widget', RO: 'Acest widget', FR: 'Ce widget', RU: 'Этот виджет' }[lang]}</span> — {{ EN: 'STRATEGIC view. Shows threat LEVEL (CRITICAL / HIGH / MEDIUM / CLEAR) for each of the 21 BCPs — not individual events or vehicles. Use to spot which crossing is under pressure and decide where to send reinforcements.', RO: 'vedere STRATEGICĂ. Afișează NIVELUL de amenințare (CRITIC / RIDICAT / MEDIU / CLAR) pentru fiecare din cele 21 BCP-uri — nu evenimente individuale. Folosiți pentru a identifica ce punct de trecere este sub presiune și a decide unde trimiteți întăriri.', FR: "vue STRATÉGIQUE. Affiche le NIVEAU de menace (CRITIQUE / ÉLEVÉ / MOYEN / CLAIR) pour chacun des 21 PdP — pas d'événements individuels. Utiliser pour repérer quel passage est sous pression.", RU: 'СТРАТЕГИЧЕСКИЙ обзор. Показывает УРОВЕНЬ угрозы (КРИТИЧЕСКИЙ / ВЫСОКИЙ / СРЕДНИЙ / ЧИСТО) по каждому из 21 КПП — не отдельные события. Для выявления КПП под давлением и принятия решения об усилении.' }[lang]}</p>
                                    <p><span className="text-red-400 font-bold">{{ EN: 'Critical Alerts', RO: 'Alerte Critice', FR: 'Alertes Critiques', RU: 'Критические Тревоги' }[lang]}</span> — {{ EN: 'individual HIGH events for THIS BCP requiring your decision now → Workflow layer.', RO: 'evenimente HIGH individuale pentru ACEST BCP ce necesită decizia dvs. acum → stratul Workflow.', FR: 'événements HIGH individuels pour CE PdP nécessitant votre décision → couche Workflow.', RU: 'индивидуальные HIGH-события ЭТОГО КПП, требующие вашего решения → слой Workflow.' }[lang]}</p>
                                    <p><span className="text-amber-400 font-bold">{{ EN: 'Operational Log', RO: 'Jurnalul Operațional', FR: 'Journal Opérationnel', RU: 'Оперативный Журнал' }[lang]}</span> — {{ EN: 'full incident audit trail, all severities, filterable — widget below.', RO: 'jurnal complet al incidentelor, toate severitățile, filtrabil — widget de mai jos.', FR: 'journal complet des incidents, toutes sévérités, filtrable — widget ci-dessous.', RU: 'полный журнал инцидентов, все уровни, фильтруемый — виджет ниже.' }[lang]}</p>
                                  </div>
                                </details>
                                <div className="grid grid-cols-3 gap-1 mb-1">
                                  <div className="bg-red-500/5 border border-red-500/20 rounded px-1.5 py-1 text-center">
                                    <div className="text-lg font-light text-red-400">{netHi}</div>
                                    <div className="text-[7px] text-red-400/80 uppercase font-bold">HIGH NET</div>
                                  </div>
                                  <div className="bg-slate-800/30 border border-slate-700/30 rounded px-1.5 py-1 text-center">
                                    <div className="text-lg font-light text-slate-300">{netVs.length}</div>
                                    <div className="text-[7px] text-slate-500 uppercase font-bold">ACTIVE</div>
                                  </div>
                                  <div className="bg-red-500/5 border border-red-500/20 rounded px-1.5 py-1 text-center">
                                    <div className="text-lg font-light text-red-300">{netWL}</div>
                                    <div className="text-[7px] text-red-300/80 uppercase font-bold">WL HITS</div>
                                  </div>
                                </div>
                                <div className="text-[7px] text-slate-600 uppercase font-bold mb-1 tracking-wide">{{ EN: 'Per-BCP Threat Status', RO: 'Status Amenințări per BCP', FR: 'Statut Menaces par PdP', RU: 'Статус Угроз по КПП' }[lang]}</div>
                                <div className="space-y-0.5 max-h-64 overflow-y-auto custom-scrollbar">
                                  {BCPS.map(bcp => {
                                    const bv  = netVs.filter(v => v.bcpId === bcp.id);
                                    const h   = bv.filter(v => v.risk === 'High').length;
                                    const wl  = bv.filter(v => v.watchlistHit).length;
                                    const isSel  = bcp.id === selectedBCP;
                                    const lvl    = h > 3 ? 'CRITICAL' : h > 1 ? 'HIGH' : h === 1 ? 'MEDIUM' : 'CLEAR';
                                    const rowCls = isSel ? 'bg-violet-500/10 border-violet-500/30' : h > 2 ? 'bg-red-500/5 border-red-500/20' : 'bg-transparent border-slate-800/30';
                                    const lvlCls = lvl === 'CRITICAL' ? 'text-red-400' : lvl === 'HIGH' ? 'text-amber-400' : lvl === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400/60';
                                    const dotCls = lvl === 'CRITICAL' ? 'bg-red-500 animate-pulse' : lvl === 'HIGH' ? 'bg-amber-500' : lvl === 'MEDIUM' ? 'bg-yellow-500' : 'bg-emerald-500/30';
                                    return (
                                      <div key={bcp.id} className={`flex items-center gap-1.5 px-2 py-1 rounded border ${rowCls}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls}`} />
                                        <span className="text-[8px] text-slate-400 flex-1 min-w-0 truncate">{bcp.name.split(' (')[0]}</span>
                                        {isSel && <span className="text-[7px] text-violet-400 font-bold shrink-0">◀</span>}
                                        <span className={`text-[7px] font-bold shrink-0 w-14 text-right ${lvlCls}`}>{lvl}</span>
                                        <span className="text-[8px] font-mono text-slate-500 w-4 text-right shrink-0">{h > 0 ? h : '–'}</span>
                                        {wl > 0 && <span className="text-[7px] font-bold text-red-400 shrink-0">WL</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="text-[7px] text-slate-700 mt-1">{{ EN: '◀ selected BCP · col: threat level / high-risk count / WL = watchlist hit', RO: '◀ BCP selectat · col: nivel amenințare / vehicule risc ridicat / WL = lista urmărire', FR: '◀ PdP sélect. · col: niveau menace / vh haut risque / WL = surveillance', RU: '◀ выбранный КПП · кол: уровень угрозы / кол-во высокого риска / WL = список наблюдения' }[lang]}</div>
                            </div>
                        );
                    })()}
                </DashboardWidget>

                <DashboardWidget title={{ EN: 'Operational Log — Full Audit', RO: 'Jurnal Operațional — Audit Complet', FR: 'Journal Opérationnel — Audit Complet', RU: 'Оперативный Журнал — Полный Аудит' }[lang]} isVisible={widgets.alerts} onClose={() => toggleWidget('alerts')} className="max-h-[300px]">
                    <AlertFeed alerts={alerts} selectedBCP={selectedBCP} />
                </DashboardWidget>

                <DashboardWidget title={{ EN: 'BQS — Truck Booking Queue', RO: 'BQS — Coadă Rezervare Camioane', FR: 'BQS — File Réservation Camions', RU: 'BQS — Очередь Бронирования Грузовиков' }[lang]} isVisible={true} onClose={() => {}}>
                  {(() => {
                    const slots = BQS_DATA[selectedBCP] ?? [];
                    const done      = slots.filter(s => s.status === 'DONE').length;
                    const processing= slots.filter(s => s.status === 'PROCESSING').length;
                    const arrived   = slots.filter(s => s.status === 'ARRIVED').length;
                    const scheduled = slots.filter(s => s.status === 'SCHEDULED').length;
                    const missed    = slots.filter(s => s.status === 'MISSED' || s.status === 'CANCELLED').length;
                    const statusColor: Record<BqsSlot['status'], string> = {
                      DONE:       'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                      PROCESSING: 'bg-blue-500/15 text-blue-300 border-blue-500/30 animate-pulse',
                      ARRIVED:    'bg-amber-500/15 text-amber-300 border-amber-500/30',
                      SCHEDULED:  'bg-slate-700/30 text-slate-400 border-slate-600/30',
                      MISSED:     'bg-red-500/10 text-red-400 border-red-500/20',
                      CANCELLED:  'bg-slate-800/20 text-slate-600 border-slate-700/20',
                    };
                    const statusLabel: Record<BqsSlot['status'], string> = {
                      DONE:       { EN: 'DONE',       RO: 'FINALIZAT', FR: 'TERMINÉ',   RU: 'ГОТОВО'     }[lang],
                      PROCESSING: { EN: 'IN PROC.',   RO: 'PROCESARE', FR: 'EN COURS',  RU: 'ОБРАБОТКА'  }[lang],
                      ARRIVED:    { EN: 'ARRIVED',    RO: 'SOSIT',     FR: 'ARRIVÉ',    RU: 'ПРИБЫЛ'     }[lang],
                      SCHEDULED:  { EN: 'SCHED.',     RO: 'PROGR.',    FR: 'PRÉVU',     RU: 'ЗАПЛ.'      }[lang],
                      MISSED:     { EN: 'MISSED',     RO: 'ABSENT',    FR: 'MANQUÉ',    RU: 'ПРОПУЩЕН'   }[lang],
                      CANCELLED:  { EN: 'CANCEL.',    RO: 'ANULAT',    FR: 'ANNULÉ',    RU: 'ОТМЕНЁН'    }[lang],
                    };
                    return (
                      <div className="space-y-2">
                        {/* Summary bar */}
                        <div className="grid grid-cols-5 gap-1 text-center">
                          {[
                            { label: { EN: 'Done', RO: 'OK', FR: 'OK', RU: 'OK' }[lang],        val: done,       cls: 'text-emerald-400' },
                            { label: { EN: 'In proc.', RO: 'Proc.', FR: 'Cours', RU: 'Обр.' }[lang], val: processing, cls: 'text-blue-400' },
                            { label: { EN: 'Arrived', RO: 'Sosit', FR: 'Arr.', RU: 'Приб.' }[lang],  val: arrived,    cls: 'text-amber-400' },
                            { label: { EN: 'Sched.', RO: 'Progr.', FR: 'Prévu', RU: 'Запл.' }[lang], val: scheduled,  cls: 'text-slate-400' },
                            { label: { EN: 'Missed', RO: 'Abs.', FR: 'Manq.', RU: 'Пр.' }[lang],    val: missed,     cls: 'text-red-400' },
                          ].map(s => (
                            <div key={s.label} className="bg-slate-900/40 rounded p-1 border border-slate-800/40">
                              <div className={`text-sm font-bold ${s.cls}`}>{s.val}</div>
                              <div className="text-[7px] text-slate-600 uppercase">{s.label}</div>
                            </div>
                          ))}
                        </div>
                        {slots.length === 0 ? (
                          <div className="text-[9px] text-slate-600 text-center py-3">{{ EN: 'No BQS slots for this BCP', RO: 'Nicio rezervare BQS pentru acest BCP', FR: 'Aucun créneau BQS pour ce PdP', RU: 'Нет слотов BQS для этого КПП' }[lang]}</div>
                        ) : (
                          <div className="space-y-0.5 max-h-52 overflow-y-auto custom-scrollbar">
                            {slots.map(slot => (
                              <div key={slot.id} className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[9px] ${statusColor[slot.status]}`}>
                                <span className="font-mono font-bold w-11 shrink-0 text-[8px]">{slot.scheduledTime}</span>
                                <span className="font-bold w-6 shrink-0 text-center text-[7px] bg-slate-900/30 rounded px-0.5">L{slot.lane}</span>
                                <span className="font-mono font-bold shrink-0 tracking-wide">{slot.plate}</span>
                                <span className="truncate flex-1 text-slate-500 text-[8px]">{slot.company}</span>
                                <span className="shrink-0 text-[7px] font-bold uppercase tracking-wide w-16 text-right">{statusLabel[slot.status]}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="text-[7px] text-slate-700 pt-1 border-t border-slate-800/40">
                          BQS · {{ EN: 'Booking Queue System — truck slot pre-registration via eCustoms portal', RO: 'Sistem Rezervare Coadă — preînregistrare slot camion prin portalul eVamă', FR: 'Système File Réservation — pré-enregistrement créneaux via portail eDouane', RU: 'Система Очереди Бронирования — предрегистрация слотов через портал eТаможни' }[lang]}
                        </div>
                      </div>
                    );
                  })()}
                </DashboardWidget>
            </div>
        )}

        <div className={`${centerColSpan} flex flex-col gap-4 h-full overflow-y-auto pr-1 custom-scrollbar`}>
             <DashboardWidget title={`${BCPS.find(b=>b.id===selectedBCP)?.name ?? selectedBCP} — ${{ EN: 'Entry Lanes', RO: 'Benzi Intrare', FR: 'Voies Entrée', RU: 'Полосы Въезда' }[lang]}`} isVisible={widgets.entry} onClose={() => toggleWidget('entry')}>
                <div className="space-y-1">
                    {lanesForSelected.filter(l => l.direction === "entry").map(lane => (
                        <LaneVisual key={lane.id} lane={lane} vehicles={vehiclesForSelected.filter(v => v.laneId === lane.id && v.status !== 'cleared')} onVehicleSelect={setSelectedVehicleId} selectedVehicleId={selectedVehicleId} />
                    ))}
                </div>
            </DashboardWidget>
            <DashboardWidget title={`${BCPS.find(b=>b.id===selectedBCP)?.name ?? selectedBCP} — ${{ EN: 'Exit Lanes', RO: 'Benzi Ieșire', FR: 'Voies Sortie', RU: 'Полосы Выезда' }[lang]}`} isVisible={widgets.exit} onClose={() => toggleWidget('exit')}>
                <div className="space-y-1">
                    {lanesForSelected.filter(l => l.direction === "exit").map(lane => (
                        <LaneVisual key={lane.id} lane={lane} vehicles={vehiclesForSelected.filter(v => v.laneId === lane.id && v.status !== 'cleared')} onVehicleSelect={setSelectedVehicleId} selectedVehicleId={selectedVehicleId} />
                    ))}
                </div>
            </DashboardWidget>
            <DashboardWidget title="Live Inspection & Enforcement Log" isVisible={widgets.inspection} onClose={() => toggleWidget('inspection')} className="h-[600px] shrink-0" contentClassName="overflow-hidden flex flex-col">
                <div className="flex-1 overflow-hidden">
                    <VehicleHistoryPanel 
                        vehicle={selectedVehicle} 
                        declaration={selectedDeclaration} 
                        alerts={alerts} 
                        onUpdateBiometric={handleUpdateVehicleBiometric}
                    />
                </div>
             </DashboardWidget>
             <DashboardWidget title={{ EN: 'Agency Performance', RO: 'Performanță Agenție', FR: 'Performance Agence', RU: 'Показатели Агентства' }[lang]} isVisible={widgets.analytics} onClose={() => toggleWidget('analytics')}>
                <div className="flex items-center gap-2 mb-2 px-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse shrink-0" />
                    <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wide truncate">{BCPS.find(b=>b.id===selectedBCP)?.name ?? selectedBCP}</span>
                    <span className="text-[8px] text-slate-600 ml-auto shrink-0">{{ EN: 'BCP performance', RO: 'performanță BCP', FR: 'performance PdP', RU: 'показатели КПП' }[lang]}</span>
                </div>
                <MetricsWidget revenueHistory={bcpRevenueHistory[selectedBCP] ?? revenueHistory} throughputHistory={bcpThroughputHistory[selectedBCP] ?? throughputHistory} lang={lang} />
                {(() => {
                    const netRevLast = revenueHistory.length > 0 ? revenueHistory[revenueHistory.length-1].amount : 0;
                    const bcpRevArr  = bcpRevenueHistory[selectedBCP] ?? [];
                    const bcpRevVal  = bcpRevArr.length > 0 ? bcpRevArr[bcpRevArr.length-1].amount : 0;
                    const bcpShare   = netRevLast > 0 ? (bcpRevVal / netRevLast) * 100 : 0;
                    const netCleared = BCPS.reduce((s,b) => s + (bcpPerformance[b.id]?.cleared ?? 0), 0);
                    const bcpCleared = bcpPerformance[selectedBCP]?.cleared ?? 0;
                    return (
                        <div className="mt-3 pt-3 border-t border-slate-800/50">
                            <div className="text-[8px] text-slate-600 uppercase font-bold tracking-wider mb-2">
                                {{ EN: 'BCP vs. Network', RO: 'BCP vs. Rețea', FR: 'PdP vs. Réseau', RU: 'КПП vs. Сеть' }[lang]}
                            </div>
                            <div className="space-y-2">
                                <div>
                                    <div className="flex items-center justify-between text-[8px] mb-0.5">
                                        <span className="text-slate-500">{{ EN: 'Revenue share', RO: 'Cotă venituri', FR: 'Part recettes', RU: 'Доля доходов' }[lang]}</span>
                                        <span className="text-indigo-400 font-mono">{bcpShare.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${Math.min(bcpShare, 100)}%` }} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[8px]">
                                    <div className="bg-slate-900/30 rounded p-1.5 border border-slate-800/40">
                                        <div className="text-slate-600 mb-0.5">{{ EN: 'BCP Revenue', RO: 'Venituri BCP', FR: 'Recettes PdP', RU: 'Доходы КПП' }[lang]}</div>
                                        <div className="text-indigo-400 font-mono font-bold">€{(bcpRevVal/1000).toFixed(1)}k</div>
                                        <div className="text-slate-700 text-[7px]">{{ EN: 'net', RO: 'rețea', FR: 'rés.', RU: 'сеть' }[lang]}: €{(netRevLast/1000).toFixed(1)}k</div>
                                    </div>
                                    <div className="bg-slate-900/30 rounded p-1.5 border border-slate-800/40">
                                        <div className="text-slate-600 mb-0.5">{{ EN: 'BCP Cleared', RO: 'BCP Procesate', FR: 'PdP Traités', RU: 'КПП Пройдено' }[lang]}</div>
                                        <div className="text-emerald-400 font-mono font-bold">{bcpCleared}</div>
                                        <div className="text-slate-700 text-[7px]">{{ EN: 'net', RO: 'rețea', FR: 'rés.', RU: 'сеть' }[lang]}: {netCleared}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}
             </DashboardWidget>
        </div>

        {rightActive && (
            <div className="col-span-12 xl:col-span-3 flex flex-col gap-4 h-full overflow-hidden">
                 <DashboardWidget
                    title={{ EN: 'Trade Intelligence', RO: 'Informații Comerciale', FR: 'Intelligence Commerciale', RU: 'Торговая Разведка' }[lang]}
                    isVisible={widgets.declarations}
                    onClose={() => toggleWidget('declarations')}
                    className="flex-1 min-h-[300px]"
                    contentClassName="overflow-hidden flex flex-col"
                >
                    {/* ── BCP scope indicator ── */}
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900/50 border-b border-slate-800/30 shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="text-[8px] font-bold text-emerald-300/80 uppercase tracking-wide truncate flex-1">
                            {BCPS.find(b => b.id === selectedBCP)?.name.split(' (')[0] ?? selectedBCP}
                        </span>
                        <span className="text-[7px] text-slate-600 shrink-0">declarații • domeniu BCP</span>
                    </div>
                    {/* ── Tab bar ── */}
                    <div className="flex shrink-0 border-b border-slate-800/50 bg-slate-900/30">
                        {([
                            { id: 'live'      as const, label: { EN: 'LIVE',          RO: 'LIVE',           FR: 'EN DIRECT',      RU: 'ЖИВЫЕ'       }[lang], badge: liveDecls.length, dot: 'bg-green-400', active: 'text-green-400' },
                            { id: 'history'   as const, label: { EN: 'REGISTERED',    RO: 'ÎNREGISTRATE',   FR: 'ENREGISTRÉES',   RU: 'ЗАРЕГИСТР.'  }[lang], badge: past24Decls.length, dot: 'bg-blue-400', active: 'text-blue-400' },
                            { id: 'redwatch'  as const, label: { EN: 'RISK & HOLDS',  RO: 'RISC & REȚINUTE',FR: 'RISQUE & RETEN.', RU: 'РИСК & ЗАДЕРЖ.'}[lang], badge: declarations.filter(d => (d.status === 'HELD' || d.status === 'SEIZED') && isDeclAtBCP(d)).length, dot: 'bg-orange-400', active: 'text-orange-400' },
                            { id: 'ncts_ics2' as const, label: 'NCTS / ICS2', badge: activeDeclarations.filter(d => d.nctsRef || d.ics2Ref).length, dot: 'bg-sky-400', active: 'text-sky-400' },
                        ]).map(tab => (
                            <button key={tab.id} onClick={() => setDeclTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-all border-b-2 ${
                                    declTab === tab.id ? `${tab.active} border-current bg-slate-900/50` : 'text-slate-500 border-transparent hover:text-slate-300'
                                }`}>
                                {declTab === tab.id && <div className={`w-1.5 h-1.5 rounded-full ${tab.dot} animate-pulse shrink-0`} />}
                                {tab.label}
                                {tab.badge > 0 && <span className={`text-[9px] font-bold px-1 rounded ${declTab === tab.id ? 'bg-current/20' : 'bg-slate-700 text-slate-400'}`}>{tab.badge}</span>}
                            </button>
                        ))}
                    </div>

                    {/* ── LIVE tab: active declarations sorted by risk ── */}
                    {declTab === 'live' && (
                        <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">


                            {/* Canal Roșu summary bar */}
                            {redWatchDecls.length > 0 && (
                                <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-red-500/40 bg-red-950/30">
                                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">{{ EN: 'RED Channel', RO: 'Canal ROȘU', FR: 'Canal ROUGE', RU: 'Красный Канал' }[lang]}</span>
                                    <span className="text-[9px] text-red-300 font-mono font-bold">{redWatchDecls.length}</span>
                                    <span className="text-[9px] text-red-400/70">{{ EN: 'active — physical inspection required', RO: 'active — inspecție fizică necesară', FR: 'actives — inspection physique requise', RU: 'активных — требуется физический досмотр' }[lang]}</span>
                                    {escalationDecls.length > 0 && (
                                        <span className="ml-auto text-[8px] text-amber-400 font-bold">+{escalationDecls.length} {{ EN: 'escalation risk', RO: 'risc escaladare', FR: 'risque escalade', RU: 'риск эскалации' }[lang]}</span>
                                    )}
                                </div>
                            )}

                            {/* Declarations divider */}
                            <div className="flex items-center gap-2 pt-0.5">
                                <div className="flex-1 h-px bg-slate-800/50" />
                                <span className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">{{ EN: 'Declarations', RO: 'Declarații', FR: 'Déclarations', RU: 'Декларации' }[lang]} ({liveDecls.length})</span>
                                <div className="flex-1 h-px bg-slate-800/50" />
                            </div>

                            {liveDecls.length === 0 && (
                                <div className="py-6 text-center text-slate-600 text-xs">
                                    {{ EN: 'No active declarations', RO: 'Nicio declarație activă', FR: 'Aucune déclaration active', RU: 'Нет активных деклараций' }[lang]}
                                </div>
                            )}
                            {liveDecls.map(d => {
                                const minsAgo = Math.max(0, Math.floor((now - d.arrivalTime) / 60000));
                                const linkedV = vehicles.find(v => v.id === d.linkedVehicleId);
                                return (
                                    <div key={d.id} onClick={() => setSelectedDeclId(d.id === selectedDeclId ? null : d.id)}
                                        className={`p-2.5 rounded-lg border cursor-pointer transition-all duration-200 ${
                                            d.id === selectedDeclId ? 'border-blue-500/60 bg-blue-900/20 shadow-[0_0_12px_rgba(59,130,246,0.15)]' :
                                            d.channel === 'RED'    ? 'border-red-500/50 bg-red-950/30 hover:bg-red-900/20' :
                                            d.channel === 'YELLOW' ? 'border-amber-500/40 bg-amber-950/20 hover:bg-amber-900/20' :
                                            'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50'
                                        }`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase border ${
                                                    d.channel === 'RED'    ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                                    d.channel === 'YELLOW' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                                                    'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                                }`}>{d.channel}</span>
                                                <span className="font-mono text-[10px] text-slate-300">{d.mrn}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-slate-500">{minsAgo < 1 ? { EN: 'just now', RO: 'acum', FR: 'à l\'instant', RU: 'сейчас' }[lang] : `${minsAgo}m`}</span>
                                                <span className={`text-[10px] font-bold ${d.riskBand === 'High' ? 'text-red-400' : d.riskBand === 'Medium' ? 'text-amber-400' : 'text-emerald-400'}`}>{d.riskScore.toFixed(0)}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-200 font-medium truncate mb-0.5">{d.traderName}</div>
                                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-1">
                                            <span className="font-mono">{d.originCountry.substring(0,3).toUpperCase()} → {d.destinationCountry.substring(0,3).toUpperCase()}</span>
                                            <span>{d.flow} · HS {d.hsCode}</span>
                                        </div>
                                        <div className="text-[9px] text-slate-400 truncate mb-1">{d.goodsDesc}</div>
                                        {d.riskReasons.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {d.riskReasons.slice(0, 3).map(r => (
                                                    <span key={r} className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded border border-slate-700/60">{r}</span>
                                                ))}
                                            </div>
                                        )}
                                        {linkedV && (
                                            <div className="mt-1 text-[8px] text-slate-600 font-mono">{linkedV.plate} · {linkedV.subType}</div>
                                        )}
                                        {(d.flow === 'TRANSIT' && d.nctsRef) && (
                                            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                                <span className="text-[8px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded">NCTS</span>
                                                <span className="text-[8px] font-bold text-slate-500">{d.nctsOperation}</span>
                                                <span className="text-[8px] font-mono text-slate-600 truncate max-w-[90px]">{d.nctsRef}</span>
                                                <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${d.nctsStatus === 'NOT_RELEASED' ? 'text-red-400 bg-red-500/10' : d.nctsStatus === 'ARRIVED' ? 'text-amber-400' : d.nctsStatus === 'DISCHARGED' ? 'text-slate-500' : 'text-emerald-400'}`}>{d.nctsStatus}</span>
                                            </div>
                                        )}
                                        {(d.flow === 'IMPORT' && d.ics2Ref) && (
                                            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                                                <span className="text-[8px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded">ICS2</span>
                                                <span className="text-[8px] font-mono text-slate-600 truncate max-w-[100px]">{d.ics2Ref}</span>
                                                <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${d.ics2Status === 'DO_NOT_LOAD' ? 'text-red-400 bg-red-500/10' : d.ics2Status === 'RISK_ASSESSED' || d.ics2Status === 'AMENDMENT_REQUESTED' ? 'text-amber-400' : d.ics2Status === 'ACCEPTED' ? 'text-emerald-400' : 'text-sky-400'}`}>{d.ics2Status}</span>
                                            </div>
                                        )}
                                        {d.id === selectedDeclId && (
                                            <div className="mt-2 pt-2 border-t border-slate-700/40 space-y-1.5">
                                                <div className="text-[8px] text-slate-600 uppercase font-bold tracking-wider">Declaration Details</div>
                                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                                    {([['MRN', d.mrn], ['AEO', d.aeo], ['Value', `€${d.value.toLocaleString()}`], ['Weight', `${d.weight} kg`], ['Duties', `€${d.duties.toLocaleString()}`], ['VAT', `€${d.vat.toLocaleString()}`], ...(d.excise > 0 ? [['Excise', `€${d.excise.toLocaleString()}`]] : [])]).map(([k, v]) => (
                                                        <div key={k} className="flex justify-between gap-1"><span className="text-slate-600">{k}</span><span className="font-mono text-slate-400">{v}</span></div>
                                                    ))}
                                                </div>
                                                {d.flow === 'TRANSIT' && d.nctsRef && (
                                                    <div className="pt-1 mt-0.5 border-t border-sky-900/40">
                                                        <div className="flex items-center gap-1 mb-1.5"><span className="text-[8px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded">NCTS</span><span className="text-[8px] text-slate-500 font-bold uppercase tracking-wide">Transit Declaration</span></div>
                                                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                                            {([['Operation', d.nctsOperation], ['Movement Ref.', d.nctsRef], ['Office Dest.', d.nctsOfficeDestination], ['Guarantee', ({'0':'Exempt','1':'Comprehensive','2':'Individual','4':'Flat Rate','9':'Specific Use'} as Record<string,string>)[d.nctsGuaranteeType!] ?? d.nctsGuaranteeType], ['Status', d.nctsStatus]] as [string,string|undefined][]).filter(([,v])=>v).map(([k, v]) => (
                                                                <div key={k} className="flex justify-between gap-1"><span className="text-slate-600">{k}</span><span className="font-mono text-slate-400">{v}</span></div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {d.flow === 'IMPORT' && d.ics2Ref && (
                                                    <div className="pt-1 mt-0.5 border-t border-violet-900/40">
                                                        <div className="flex items-center gap-1 mb-1.5"><span className="text-[8px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded">ICS2</span><span className="text-[8px] text-slate-500 font-bold uppercase tracking-wide">Entry Summary Decl.</span></div>
                                                        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[9px]">
                                                            {([['ENS Ref.', d.ics2Ref], ['UCR', d.ics2UCR], ['Entry Office', d.ics2EntryOffice], ['Status', d.ics2Status]] as [string,string|undefined][]).filter(([,v])=>v).map(([k, v]) => (
                                                                <div key={k} className="flex justify-between gap-1"><span className="text-slate-600">{k}</span><span className="font-mono text-slate-400">{v}</span></div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── 24H tab: stats + history ── */}
                    {declTab === 'history' && (
                        <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                            {/* Period selector */}
                            <div className="flex gap-1 mb-3">
                                {(['24h', '7d', '30d', '90d', '1y'] as const).map(p => (
                                    <button key={p} onClick={() => setDeclPeriod(p)}
                                        className={`flex-1 py-1 text-[9px] font-bold uppercase rounded border transition-all ${
                                            declPeriod === p
                                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                                : 'bg-slate-800/40 text-slate-500 border-slate-700/40 hover:text-slate-300 hover:border-slate-600'
                                        }`}>
                                        {p === '24h' ? '24H' : p === '7d' ? '7D' : p === '30d' ? '1M' : p === '90d' ? 'QTR' : '1Y'}
                                    </button>
                                ))}
                            </div>
                            {/* Status counts */}
                            <div className="grid grid-cols-3 gap-2 mb-3">
                                {[
                                    { label: { EN: 'Released', RO: 'Eliberate',  FR: 'Libérées',  RU: 'Выпущено'   }[lang], val: past24Released.length, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                                    { label: { EN: 'Held',     RO: 'Reținute',   FR: 'Retenues',  RU: 'Задержано'  }[lang], val: past24Held.length,     color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20'   },
                                    { label: { EN: 'Seized',   RO: 'Confiscate', FR: 'Saisies',   RU: 'Изъято'     }[lang], val: past24Seized.length,   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20'       },
                                ].map(s => (
                                    <div key={s.label} className={`rounded-lg border ${s.bg} p-2 text-center`}>
                                        <div className={`text-xl font-light ${s.color}`}>{s.val}</div>
                                        <div className="text-[9px] text-slate-500 uppercase">{s.label}</div>
                                    </div>
                                ))}
                            </div>
                            {/* Revenue */}
                            <div className="bg-slate-900/30 rounded-lg border border-slate-800/50 p-2 mb-3">
                                <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider flex items-center justify-between">
                                    <span>{{ EN: 'Revenue Collected', RO: 'Venituri Colectate', FR: 'Recettes Collectées', RU: 'Собрано Доходов' }[lang]}</span>
                                    <span className="text-blue-400">({declPeriod === '24h' ? '24H' : declPeriod === '7d' ? '7 Days' : declPeriod === '30d' ? '1 Month' : declPeriod === '90d' ? 'Quarter' : '1 Year'})</span>
                                </div>
                                <div className="space-y-1">
                                    {[
                                        { label: { EN: 'Duties', RO: 'Taxe Vamale', FR: 'Droits',  RU: 'Пошлины' }[lang], val: past24Revenue.duties  },
                                        { label: { EN: 'VAT',    RO: 'TVA',         FR: 'TVA',     RU: 'НДС'     }[lang], val: past24Revenue.vat     },
                                        { label: { EN: 'Excise', RO: 'Accize',      FR: 'Accises', RU: 'Акцизы'  }[lang], val: past24Revenue.excise  },
                                    ].map(r => (
                                        <div key={r.label} className="flex items-center justify-between text-[10px]">
                                            <span className="text-slate-400">{r.label}</span>
                                            <span className="font-mono font-bold text-slate-200">€{r.val.toLocaleString()}</span>
                                        </div>
                                    ))}
                                    <div className="border-t border-slate-700/50 pt-1 flex items-center justify-between text-[10px]">
                                        <span className="text-slate-300 font-bold">{{ EN: 'Total', RO: 'Total', FR: 'Total', RU: 'Итого' }[lang]}</span>
                                        <span className="font-mono font-bold text-blue-300">€{(past24Revenue.duties + past24Revenue.vat + past24Revenue.excise).toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                            {/* Channel distribution */}
                            <div className="bg-slate-900/30 rounded-lg border border-slate-800/50 p-2 mb-3">
                                <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">{{ EN: 'Channel Distribution', RO: 'Distribuție Canale', FR: 'Distribution des Canaux', RU: 'Распределение по Каналам' }[lang]}</div>
                                {(['RED', 'YELLOW', 'GREEN'] as const).map(ch => {
                                    const val = past24Chan[ch];
                                    const bar   = ch === 'RED' ? 'bg-red-500' : ch === 'YELLOW' ? 'bg-amber-500' : 'bg-emerald-500';
                                    const text  = ch === 'RED' ? 'text-red-400' : ch === 'YELLOW' ? 'text-amber-400' : 'text-emerald-400';
                                    return (
                                        <div key={ch} className="flex items-center gap-2 mb-1">
                                            <span className={`text-[9px] font-bold w-14 ${text}`}>{ch}</span>
                                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                <div className={`h-full ${bar} transition-all duration-500`} style={{ width: `${past24Decls.length > 0 ? (val / past24Decls.length) * 100 : 0}%` }} />
                                            </div>
                                            <span className={`font-mono text-xs font-bold w-5 text-right ${text}`}>{val}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Recently processed list */}
                            <div className="text-[9px] text-slate-500 uppercase font-bold mb-2 tracking-wider">{{ EN: 'Recently Processed', RO: 'Procesate Recent', FR: 'Traitées Récemment', RU: 'Недавно Обработанные' }[lang]}</div>
                            <div className="space-y-1.5">
                                {past24Decls.filter(d => d.status !== 'SUBMITTED' && d.status !== 'INSPECTION').slice(0, 10).map(d => (
                                    <div key={d.id} className="flex items-center justify-between text-[10px] py-1.5 px-2 rounded border border-slate-800/40 bg-slate-900/20">
                                        <span className="font-mono text-slate-400 shrink-0">{d.mrn}</span>
                                        <span className="text-slate-500 truncate mx-2">{d.traderName}</span>
                                        <span className={`font-bold text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${
                                            d.status === 'RELEASED' ? 'bg-emerald-500/10 text-emerald-400' :
                                            d.status === 'HELD'     ? 'bg-amber-500/10 text-amber-400'   :
                                            d.status === 'SEIZED'   ? 'bg-red-500/10 text-red-400'       :
                                            'bg-slate-700 text-slate-400'
                                        }`}>{d.status}</span>
                                    </div>
                                ))}
                                {past24Decls.filter(d => d.status !== 'SUBMITTED' && d.status !== 'INSPECTION').length === 0 && (
                                    <div className="text-slate-600 text-[10px] py-3 text-center">{{ EN: 'No processed declarations in 24h', RO: 'Nicio declarație procesată în 24h', FR: 'Aucune déclaration traitée en 24h', RU: 'Обработанных деклараций нет (24ч)' }[lang]}</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── RED WATCH tab: active RED + escalation risk ── */}
                    {declTab === 'redwatch' && (
                        <div className="overflow-y-auto flex-1 p-2 custom-scrollbar space-y-2">
                            {/* ── HOLDS / SEIZED section — distinct from AIRiskLayer RED Channel ── */}
                            <div className="flex items-center gap-2 px-1 mb-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                                <span className="text-[9px] text-orange-400 uppercase font-bold tracking-wider">{{ EN: 'Enforcement Holds & Seizures', RO: 'Rețineri și Confiscări', FR: 'Retenues & Saisies', RU: 'Задержания и Изъятия' }[lang]}</span>
                            </div>
                            <p className="text-[8px] text-slate-600 px-1 mb-1 leading-snug">{{ EN: 'Declarations physically stopped by officers (HELD = pending investigation · SEIZED = confirmed violation). Distinct from the RED channel in AI-Risk layer which shows active channel assignments.', RO: 'Declarații oprite fizic de ofițeri (REȚINUT = investigație în curs · CONFISCAT = încălcare confirmată). Diferit de canalul ROȘU din stratul AI-Risc care arată atribuirile active de canal.', FR: 'Déclarations physiquement arrêtées par les agents (RETENUE = enquête en cours · SAISIE = infraction confirmée). Distinct du canal ROUGE dans la couche IA-Risque qui indique les attributions de canal actives.', RU: 'Декларации, физически остановленные офицерами (ЗАДЕРЖАНО = расследование · ИЗЪЯТО = подтверждённое нарушение). Отличается от КРАСНОГО канала в слое ИИ-Риска.' }[lang]}</p>
                            {(() => {
                                const heldDecls = declarations.filter(d => (d.status === 'HELD' || d.status === 'SEIZED') && isDeclAtBCP(d)).sort((a, b) => b.riskScore - a.riskScore);
                                if (heldDecls.length === 0) return <div className="text-slate-600 text-[10px] py-4 text-center">{{ EN: 'No held or seized declarations at this BCP', RO: 'Nicio declarație reținută sau confiscată la acest BCP', FR: 'Aucune déclaration retenue ou saisie à ce PdP', RU: 'Нет задержанных или изъятых деклараций на этом КПП' }[lang]}</div>;
                                return heldDecls.map(d => (
                                    <div key={d.id} className={`p-2.5 rounded-lg border ${ d.status === 'SEIZED' ? 'border-red-600/50 bg-red-950/30' : 'border-orange-500/30 bg-orange-950/20' }`}>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-mono text-[10px] font-bold text-slate-300">{d.mrn}</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ d.status === 'SEIZED' ? 'bg-red-500/20 text-red-300' : 'bg-orange-500/15 text-orange-300' }`}>{d.status}</span>
                                                <span className="text-[10px] font-bold text-slate-400">{d.riskScore.toFixed(0)}</span>
                                            </div>
                                        </div>
                                        <div className="text-xs text-slate-300 truncate mb-0.5">{d.traderName}</div>
                                        <div className="text-[9px] text-slate-500 truncate mb-1">{d.goodsDesc} · HS {d.hsCode}</div>
                                        <div className="flex flex-wrap gap-1">
                                            {d.riskReasons.map(r => <span key={r} className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0.5 rounded border border-slate-700/30">{r}</span>)}
                                        </div>
                                    </div>
                                ));
                            })()}
                            {/* ── escalation risk (YELLOW high-score) still useful here ── */}
                            {escalationDecls.length > 0 && (
                                <>
                                    <div className="flex items-center gap-2 px-1 pt-1">
                                        <svg className="w-3 h-3 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                                        <span className="text-[9px] text-amber-400 uppercase font-bold tracking-wider">{{ EN: 'Escalation Risk (YELLOW → RED)', RO: 'Risc Escaladare (GALBEN → ROȘU)', FR: "Risque d'Escalade (JAUNE → ROUGE)", RU: 'Риск Эскалации (ЖЁЛТЫЙ → КРАСНЫЙ)' }[lang]} ({escalationDecls.length})</span>
                                    </div>
                                    {escalationDecls.map(d => (
                                        <div key={d.id} onClick={() => setSelectedDeclId(d.id === selectedDeclId ? null : d.id)}
                                            className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                                                d.id === selectedDeclId ? 'border-blue-500/60 bg-blue-900/20' : 'border-amber-500/30 bg-amber-950/20 hover:bg-amber-900/15'
                                            }`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-mono text-[10px] text-amber-200">{d.mrn}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20">YELLOW</span>
                                                    <span className="text-[10px] font-bold text-amber-400">{d.riskScore.toFixed(0)}</span>
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-300 truncate mb-0.5">{d.traderName}</div>
                                            <div className="text-[9px] text-slate-500 truncate">{d.goodsDesc} · HS {d.hsCode}</div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── NCTS / ICS2 tab ── */}
                    {declTab === 'ncts_ics2' && (
                        <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                            <div className="flex items-center gap-2 px-1 mb-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                                <span className="text-[9px] text-sky-400 uppercase font-bold tracking-wider">NCTS Transit / ICS2 Pre-Arrival</span>
                                <span className="text-[8px] text-slate-600 ml-auto">{activeDeclarations.filter(d => d.nctsRef || d.ics2Ref).length} active</span>
                            </div>
                            {activeDeclarations.filter(d => d.nctsRef || d.ics2Ref).length === 0 ? (
                                <div className="text-center py-8 text-slate-600 text-xs">No active NCTS/ICS2 declarations at this BCP</div>
                            ) : (
                                <div className="space-y-1.5">
                                    {activeDeclarations.filter(d => d.nctsRef || d.ics2Ref).map(d => (
                                        <div key={d.id} className="p-2.5 rounded-lg border border-sky-500/20 bg-sky-950/15">
                                            <div className="flex items-center gap-1.5 mb-1">
                                                {d.nctsRef && <span className="text-[8px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded">NCTS</span>}
                                                {d.ics2Ref && <span className="text-[8px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25 px-1.5 py-0.5 rounded">ICS2</span>}
                                                <span className="font-mono text-[9px] text-slate-300">{d.mrn}</span>
                                                <span className={`ml-auto text-[8px] font-bold px-1.5 py-0.5 rounded ${
                                                    d.riskBand === 'High' ? 'text-red-400 bg-red-500/10' : d.riskBand === 'Medium' ? 'text-amber-400 bg-amber-500/10' : 'text-emerald-400 bg-emerald-500/10'
                                                }`}>{d.riskBand}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-300 truncate">{d.traderName}</div>
                                            <div className="text-[8px] text-slate-500 truncate">{d.goodsDesc}</div>
                                            {d.nctsRef && <div className="text-[7px] text-slate-600 mt-0.5">NCTS {d.nctsStatus} · {d.nctsOperation ?? 'TRANSIT'}</div>}
                                            {d.ics2Ref && <div className="text-[7px] text-slate-600 mt-0.5">ICS2 {d.ics2Status}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* NETWORK and INTEL tabs removed — content merged into dedicated modules */}
                    {(false as boolean) && (
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            {/* Network header */}
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/40 bg-slate-900/40 shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0" />
                                <span className="text-[8px] text-violet-300 uppercase font-bold tracking-wider">Network Trade Overview — All BCPs</span>
                                <span className="text-[7px] text-slate-600 ml-auto">{BCPS.length} checkpoints</span>
                            </div>
                            <div className="p-2 space-y-1.5">
                                {(() => {
                                    const summaries = BCPS.map(bcp => {
                                        const bcpVeh = vehicles.filter(v => v.bcpId === bcp.id && v.status !== 'cleared');
                                        const bcpDecls = declarations.filter(d => {
                                            if (d.status !== 'SUBMITTED' && d.status !== 'INSPECTION') return false;
                                            const lv = vehicles.find(v => v.id === d.linkedVehicleId || v.plate === d.vehiclePlate);
                                            return lv ? lv.bcpId === bcp.id : false;
                                        });
                                        const red    = bcpDecls.filter(d => d.channel === 'RED').length;
                                        const yellow = bcpDecls.filter(d => d.channel === 'YELLOW').length;
                                        const green  = bcpDecls.filter(d => d.channel === 'GREEN').length;
                                        const highAlerts = alerts.filter(a => a.bcpId === bcp.id && a.severity === 'HIGH').length;
                                        return { bcp, veh: bcpVeh.length, decls: bcpDecls.length, red, yellow, green, highAlerts };
                                    }).sort((a, b) => b.decls - a.decls || b.veh - a.veh);
                                    return summaries.map(({ bcp, veh, decls, red, yellow, green, highAlerts }) => {
                                        const isSel = bcp.id === selectedBCP;
                                        return (
                                            <div key={bcp.id} className={`p-2 rounded-lg border transition-all ${
                                                isSel ? 'border-violet-500/40 bg-violet-950/20' : veh === 0 ? 'border-slate-800/30 bg-slate-900/20 opacity-50' : 'border-slate-700/40 bg-slate-900/30 hover:bg-slate-900/50'
                                            }`}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        {isSel && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse shrink-0" />}
                                                        <span className={`text-[9px] font-bold truncate ${ isSel ? 'text-violet-300' : veh > 0 ? 'text-slate-300' : 'text-slate-600' }`}>
                                                            {bcp.name.split(' (')[0]}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0 ml-1">
                                                        <span className="text-[7px] text-slate-600 font-mono">{veh}v</span>
                                                        {red > 0 && <span className="text-[7px] font-bold text-red-400 bg-red-500/10 px-1 rounded">R:{red}</span>}
                                                        {yellow > 0 && <span className="text-[7px] font-bold text-amber-400 bg-amber-500/10 px-1 rounded">Y:{yellow}</span>}
                                                        {green > 0 && <span className="text-[7px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded">G:{green}</span>}
                                                        {highAlerts > 0 && <span className="text-[7px] font-bold text-orange-400">⚠{highAlerts}</span>}
                                                    </div>
                                                </div>
                                                {decls > 0 && (
                                                    <div className="flex items-center gap-1">
                                                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                            <div className="h-full flex">
                                                                <div className="bg-red-500 h-full" style={{ width: `${(red/decls)*100}%` }} />
                                                                <div className="bg-amber-500 h-full" style={{ width: `${(yellow/decls)*100}%` }} />
                                                                <div className="bg-emerald-600 h-full" style={{ width: `${(green/decls)*100}%` }} />
                                                            </div>
                                                        </div>
                                                        <span className="text-[7px] text-slate-600 font-mono w-5 text-right">{decls}</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    )}

                    {/* INTEL tab removed — declarations archive merged into ÎNREGISTRATE tab */}
                    {(false as boolean) && (
                        <div className="overflow-y-auto flex-1 custom-scrollbar">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/40 bg-slate-900/40 shrink-0">
                                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse shrink-0" />
                                <span className="text-[8px] text-teal-300 uppercase font-bold tracking-wider">{{ EN: 'Trade Intelligence Archive', RO: 'Arhivă Comercială', FR: 'Archive Commerce', RU: 'Торговый Архив' }[lang]}</span>
                                <span className="text-[7px] text-slate-600 ml-auto">{TRADE_INTEL_ARCHIVE.length} entries</span>
                            </div>
                            <div className="px-3 py-1 border-b border-slate-800/30 bg-slate-900/20 flex items-center gap-2">
                                <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider">{{ EN: 'Recorded Outcomes', RO: 'Rezultate Înregistrate', FR: 'Résultats Enregistrés', RU: 'Зафиксированные Исходы' }[lang]}</span>
                                <span className="text-[6px] text-teal-500 bg-teal-500/10 px-1 rounded border border-teal-500/20 ml-auto">
                                    {TRADE_INTEL_ARCHIVE.filter(e => e.bcpId === selectedBCP).length} {{ EN: 'at this BCP', RO: 'la acest BCP', FR: 'à ce PdP', RU: 'на КПП' }[lang]}
                                </span>
                            </div>
                            <div className="p-2 space-y-1.5">
                                {TRADE_INTEL_ARCHIVE.map(e => {
                                    const outcomeCls = e.outcome === 'SEIZED'          ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                                                       e.outcome === 'REFERRED_POLICE' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                                                       e.outcome === 'FINE_ISSUED'     ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                                                       e.outcome === 'DETAINED'        ? 'bg-rose-500/15 text-rose-400 border-rose-500/30' :
                                                       'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
                                    const chCls = e.channel === 'RED' ? 'text-red-400' : e.channel === 'YELLOW' ? 'text-amber-400' : 'text-emerald-400';
                                    const isBCP = e.bcpId === selectedBCP;
                                    return (
                                        <div key={e.id} className={`p-2 rounded-lg border text-[7px] ${isBCP ? 'border-teal-500/30 bg-teal-950/10' : 'border-slate-700/40 bg-slate-900/30'}`}>
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="font-mono text-[9px] font-bold text-slate-200 shrink-0">{e.plate}</span>
                                                    <span className="text-slate-600 truncate">{e.bcpName}</span>
                                                    {isBCP && <span className="text-[6px] text-teal-400 bg-teal-500/10 px-1 rounded border border-teal-500/20 shrink-0">THIS BCP</span>}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 ml-1">
                                                    <span className={`px-1 py-0.5 rounded border font-bold ${outcomeCls}`}>{e.outcome.replace(/_/g, ' ')}</span>
                                                    <span className={`font-mono font-bold ${chCls}`}>{e.channel}</span>
                                                </div>
                                            </div>
                                            <div className="text-slate-500 truncate mb-1">{e.goodsDesc[lang === 'RO' ? 'RO' : 'EN']}</div>
                                            <div className="flex items-center justify-between">
                                                <div className="flex gap-1 flex-wrap">
                                                    {e.bpFindings.wl  && <span className="bg-red-500/10 text-red-400 px-1 rounded border border-red-500/20">WL</span>}
                                                    {e.bpFindings.doc && <span className="bg-amber-500/10 text-amber-400 px-1 rounded border border-amber-500/20">DOC</span>}
                                                    {e.bpFindings.bio && <span className="bg-violet-500/10 text-violet-400 px-1 rounded border border-violet-500/20">BIO</span>}
                                                    {e.linkedReportId && <span className="bg-teal-500/10 text-teal-400 px-1 rounded border border-teal-500/20">📊 {e.linkedReportId}</span>}
                                                </div>
                                                <span className="text-slate-600 font-mono">{Math.round(e.recordedAtMsAgo / 3600000)}h ago · R:{e.riskScore}</span>
                                            </div>
                                            {e.svFindings.dutyGap && e.svFindings.dutyGap > 0 && (
                                                <div className="mt-0.5 text-[6px] text-red-400/70 truncate">⚠ Duty gap: €{e.svFindings.dutyGap.toLocaleString()} — {e.svFindings.notes}</div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="px-3 py-1 border-y border-slate-800/30 bg-slate-900/20">
                                <span className="text-[7px] text-slate-500 uppercase font-bold tracking-wider">{{ EN: 'Analyst Reports — Relevant to this BCP', RO: 'Rapoarte Analişti — Relevante', FR: 'Rapports Analystes', RU: 'Аналитические Отчёты' }[lang]}</span>
                            </div>
                            <div className="p-2 space-y-1.5 pb-4">
                                {RISK_ANALYST_REPORTS.filter(r => r.bcpScope === 'ALL' || (Array.isArray(r.bcpScope) && r.bcpScope.includes(selectedBCP))).map(r => {
                                    const sevCls = r.severity === 'CRITICAL' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                                                   r.severity === 'HIGH'     ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' :
                                                   'text-amber-400 border-amber-500/30 bg-amber-500/10';
                                    return (
                                        <div key={r.id} className="p-2 rounded-lg border border-slate-700/40 bg-slate-900/30 text-[7px]">
                                            <div className="flex items-start justify-between gap-1 mb-0.5">
                                                <span className="text-[8px] font-bold text-slate-200 leading-tight flex-1">{r.title[lang === 'RO' ? 'RO' : 'EN']}</span>
                                                <span className={`font-bold px-1 py-0.5 rounded border shrink-0 ${sevCls}`}>{r.severity}</span>
                                            </div>
                                            <div className="flex items-center justify-between text-slate-600">
                                                <span>{r.uploadedBy} · {Math.floor(r.uploadedAtMsAgo / 3600000)}h ago</span>
                                                <span className="font-mono border border-slate-700/40 px-1 rounded">{r.id}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                 </DashboardWidget>
            </div>
        )}
      </div>}

      {/* ── Inter-Agency Chat Panel ─────────────────────────────────────── */}
      {loggedInOfficer && (() => {
        const myInst = loggedInOfficer.institution === 'BORDER_POLICE' ? 'BP' : 'SV';
        const roleColor: Record<ChatSenderRole, string> = {
          'OCC-IGPF':    'bg-blue-500/20 text-blue-300 border-blue-500/30',
          'OCC-SV':      'bg-orange-500/20 text-orange-300 border-orange-500/30',
          'SEF-TURA-BP': 'bg-blue-400/15 text-blue-400 border-blue-400/25',
          'SEF-TURA-SV': 'bg-orange-400/15 text-orange-400 border-orange-400/25',
          'OFFICER':     'bg-slate-600/20 text-slate-400 border-slate-600/30',
        };
        const roleShort: Record<ChatSenderRole, string> = {
          'OCC-IGPF':    'OCC·IGPF',
          'OCC-SV':      'OCC·SV',
          'SEF-TURA-BP': 'ȘEF·PF',
          'SEF-TURA-SV': 'ȘEF·SV',
          'OFFICER':     'OFIȚER',
        };
        const channels = [
          { id: 'GENERAL', label: '🌐 General' },
          ...BCPS.map(b => ({ id: b.id, label: b.name.split(' (')[0].replace('PTF ','') })),
        ];
        const visibleMessages = chatMessages
          .filter(m => chatChannel === 'GENERAL' ? true : m.channel === chatChannel || m.channel === 'GENERAL')
          .slice(-80);
        const sendMessage = () => {
          if (!chatInput.trim()) return;
          const newMsg: ChatMessage = {
            id: `my-${Date.now()}`,
            senderId: loggedInOfficer.badge,
            senderName: `${loggedInOfficer.surname} ${loggedInOfficer.name}`,
            senderRole: 'OFFICER',
            institution: myInst,
            location: BCPS.find(b => b.id === selectedBCP)?.name ?? 'Console',
            bcpId: selectedBCP,
            text: chatInput.trim(),
            timestamp: Date.now(),
            priority: 'NORMAL',
            channel: chatChannel,
          };
          setChatMessages(prev => [...prev, newMsg]);
          setChatInput('');
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        };
        return (
          <>
            {/* Floating button */}
            <button
              onClick={() => { setChatOpen(o => !o); setChatUnread(0); }}
              className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-12 h-12 rounded-full shadow-2xl border transition-all ${
                chatOpen
                  ? 'bg-blue-600/80 border-blue-500/60 text-white'
                  : 'bg-[#111623] border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
              title={{ EN: 'Inter-agency chat', RO: 'Chat inter-agentii', FR: 'Chat inter-agences', RU: 'Межведомственный чат' }[lang]}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {chatUnread > 0 && !chatOpen && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {chatUnread > 9 ? '9+' : chatUnread}
                </span>
              )}
            </button>

            {/* Chat panel */}
            {chatOpen && (
              <div className="fixed bottom-20 right-6 z-50 w-[420px] h-[520px] bg-[#0C1018] border border-slate-700/60 rounded-2xl flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-4 py-2.5 border-b border-slate-800/80 bg-slate-900/60 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide">
                        {{ EN: 'Operational Communications', RO: 'Comunicații Operative', FR: 'Communications Opérationnelles', RU: 'Оперативные Коммуникации' }[lang]}
                      </span>
                    </div>
                    <button onClick={() => setChatOpen(false)} className="text-slate-600 hover:text-slate-400 transition-colors p-0.5">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[8px] text-blue-400 font-bold">IGPF · str. Petricani 19</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-[8px] text-orange-400 font-bold">SV · str. N. Starostenco 30</span>
                    <span className="text-slate-700">|</span>
                    <span className="text-[8px] text-slate-600">+ {CHAT_PARTICIPANTS.filter(p => p.isOnline).length} online</span>
                  </div>
                </div>

                {/* Channel tabs */}
                <div className="flex overflow-x-auto border-b border-slate-800/60 shrink-0 custom-scrollbar" style={{ scrollbarWidth: 'none' }}>
                  {channels.map(ch => {
                    const unread = chatChannel !== ch.id
                      ? chatMessages.filter(m => m.channel === ch.id && m.priority === 'URGENT').length
                      : 0;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setChatChannel(ch.id)}
                        className={`shrink-0 px-3 py-1.5 text-[8px] font-bold uppercase tracking-wide transition-colors whitespace-nowrap relative ${
                          chatChannel === ch.id
                            ? 'text-blue-300 border-b-2 border-blue-500 bg-blue-500/5'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {ch.label}
                        {unread > 0 && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2 space-y-2">
                  {visibleMessages.map(m => {
                    const isOwn = m.senderId === loggedInOfficer.badge;
                    const priorityBorder = m.priority === 'URGENT' ? 'border-l-2 border-red-500/60 pl-2' : m.priority === 'INFO' ? 'border-l-2 border-blue-500/40 pl-2' : '';
                    return (
                      <div key={m.id} className={`${isOwn ? 'ml-6' : ''}`}>
                        <div className={`text-[8px] bg-slate-900/40 rounded-lg px-2.5 py-2 border border-slate-800/40 ${priorityBorder}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`px-1 py-0.5 rounded text-[7px] font-bold uppercase tracking-wide border ${roleColor[m.senderRole]}`}>
                              {roleShort[m.senderRole]}
                            </span>
                            <span className={`font-bold text-[9px] ${isOwn ? 'text-emerald-400' : m.institution === 'BP' ? 'text-blue-300' : 'text-orange-300'}`}>
                              {m.senderName}
                            </span>
                            {m.bcpId && (
                              <span className="text-[7px] text-slate-600 font-mono">
                                · {BCPS.find(b => b.id === m.bcpId)?.name.split(' (')[0].replace('PTF ','') ?? m.bcpId}
                              </span>
                            )}
                            <span className="text-[7px] text-slate-700 ml-auto shrink-0">
                              {new Date(m.timestamp).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className={`text-[9px] leading-relaxed ${m.priority === 'URGENT' ? 'text-red-200' : m.priority === 'INFO' ? 'text-slate-400' : 'text-slate-300'}`}>
                            {m.priority === 'URGENT' && <span className="text-red-400 font-bold mr-1">⚠</span>}
                            {m.text}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Participants strip */}
                <div className="px-3 py-1.5 border-t border-slate-800/60 bg-slate-900/20 shrink-0">
                  <div className="flex items-center gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {CHAT_PARTICIPANTS.filter(p => p.isOnline).slice(0, 10).map(p => (
                      <div key={p.id} title={`${p.name} · ${p.location}`}
                        className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[7px] font-bold ${
                          p.institution === 'BP'
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-500'
                            : 'bg-orange-500/10 border-orange-500/20 text-orange-500'
                        }`}>
                        <div className="w-1 h-1 rounded-full bg-emerald-400" />
                        {p.name.split(' ')[0]}
                      </div>
                    ))}
                    {CHAT_PARTICIPANTS.filter(p => p.isOnline).length > 10 && (
                      <span className="text-[7px] text-slate-600 shrink-0">+{CHAT_PARTICIPANTS.filter(p => p.isOnline).length - 10}</span>
                    )}
                  </div>
                </div>

                {/* Input */}
                <div className="px-3 py-2 border-t border-slate-800/60 bg-slate-900/40 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${myInst === 'BP' ? 'bg-blue-400' : 'bg-orange-400'}`} />
                    <input
                      type="text"
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={{ EN: 'Message… (Enter to send)', RO: 'Mesaj… (Enter pentru trimitere)', FR: 'Message… (Entrée pour envoyer)', RU: 'Сообщение… (Enter для отправки)' }[lang]}
                      className="flex-1 bg-slate-900/60 border border-slate-700/40 rounded-lg px-2.5 py-1.5 text-[9px] text-slate-300 placeholder-slate-700 focus:outline-none focus:border-blue-500/40 transition-colors"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!chatInput.trim()}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[9px] font-bold uppercase tracking-wide hover:bg-blue-600/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {{ EN: 'Send', RO: 'Trimite', FR: 'Envoyer', RU: 'Отправить' }[lang]}
                    </button>
                  </div>
                  <div className="text-[7px] text-slate-700 mt-1">
                    {{ EN: 'Encrypted · TETRA backup available', RO: 'Criptat · backup TETRA disponibil', FR: 'Chiffré · backup TETRA disponible', RU: 'Зашифровано · резерв TETRA доступен' }[lang]}
                    {' · '}{chatChannel === 'GENERAL' ? 'Canal: GENERAL' : `Canal: ${BCPS.find(b=>b.id===chatChannel)?.name.split(' (')[0] ?? chatChannel}`}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
        <ConsequenceTicker events={consequenceFeed} />
      </div>
      )}
    </div>
  );
};

export default App;