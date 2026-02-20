import IAPWS97 from "@neutrium/thermo-iaspw97";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Use POST");
  const { pipe, global } = req.body;
  try {
    // Call your simulation function
    const result = simulatePipe(pipe, global);
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
// PASTE ALL YOUR MATH CONSTANTS AND FUNCTIONS HERE
// (e.g., const PIPE_OD, function airProps, etc.)

/**
 * Data + equations grounded in workbook:
 * - OD table and CS/SS wall thickness tables [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
 * - Air property regressions (nu, Pr, k_air) [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
 * - Insulation k(T) regressions [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
 * - Convection correlation: Churchill–Bernstein
 * - Radiation uses Stefan–Boltzmann constant in Imperial units [2](https://2021.help.altair.com/2021.1/flowsim/topics/internal/solver_technical_manual/general_functions_routines/gfr_htc_correlations_internal.htm)[3](https://www.chemeurope.com/en/encyclopedia/Churchill-Bernstein_Equation.html)
 */

const IN_TO_FT = 1 / 12;
const MPH_TO_FTPS = 1.4666666667;
const PI = Math.PI;

// Stefan–Boltzmann constant in Btu/(h·ft²·R⁴) (common conversion reference) [2](https://2021.help.altair.com/2021.1/flowsim/topics/internal/solver_technical_manual/general_functions_routines/gfr_htc_correlations_internal.htm)[3](https://www.chemeurope.com/en/encyclopedia/Churchill-Bernstein_Equation.html)
const SIGMA = 1.714e-9;

// ---- Pipe OD table (nominal -> OD in) from Pipe Data sheet [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
const pipeOD_in = {
  1: 1.315,
  1.5: 1.9,
  2: 2.375,
  2.5: 2.875,
  3: 3.5,
  4: 4.5,
  6: 6.625,
  8: 8.625,
  10: 10.75,
  12: 12.75,
  14: 14.0,
  16: 16.0,
  18: 18.0,
  20: 20.0,
};

// ---- Wall thickness (in) tables from Pipe Data sheet (subset schedules shown in sheet) [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
const wallCS_in = {
  20: { 8: 0.25, 10: 0.25, 12: 0.312, 14: 0.312, 16: 0.312, 18: 0.375 },
  40: {
    1: 0.133,
    1.5: 0.145,
    2: 0.154,
    2.5: 0.203,
    3: 0.216,
    4: 0.237,
    6: 0.28,
    8: 0.322,
    10: 0.365,
    12: 0.406,
    14: 0.438,
    16: 0.5,
    18: 0.562,
    20: 0.594,
  },
  80: {
    1: 0.179,
    1.5: 0.2,
    2: 0.218,
    2.5: 0.276,
    3: 0.3,
    4: 0.337,
    6: 0.432,
    8: 0.5,
    10: 0.594,
    12: 0.688,
    14: 0.75,
    16: 0.844,
    18: 0.938,
    20: 1.031,
  },
  120: {
    4: 0.438,
    6: 0.562,
    8: 0.719,
    10: 0.844,
    12: 1.0,
    14: 1.094,
    16: 1.219,
    18: 1.375,
    20: 1.5,
  },
  160: {
    1: 0.25,
    1.5: 0.281,
    2: 0.344,
    2.5: 0.375,
    3: 0.438,
    4: 0.531,
    6: 0.719,
    8: 0.906,
    10: 1.125,
    12: 1.312,
    14: 1.406,
    16: 1.594,
    18: 1.781,
    20: 1.969,
  },
};

const wallSS_in = {
  5: {
    1: 0.065,
    1.5: 0.065,
    2: 0.065,
    2.5: 0.083,
    3: 0.083,
    4: 0.083,
    6: 0.109,
    8: 0.109,
    10: 0.134,
    12: 0.156,
    14: 0.156,
    16: 0.165,
    18: 0.165,
    20: 0.188,
  },
  10: {
    1: 0.109,
    1.5: 0.109,
    2: 0.109,
    2.5: 0.12,
    3: 0.12,
    4: 0.12,
    6: 0.134,
    8: 0.148,
    10: 0.165,
    12: 0.18,
    14: 0.188,
    16: 0.188,
    18: 0.188,
    20: 0.218,
  },
  40: {
    1: 0.133,
    1.5: 0.145,
    2: 0.154,
    2.5: 0.203,
    3: 0.216,
    4: 0.237,
    6: 0.28,
    8: 0.322,
    10: 0.365,
    12: 0.375,
    14: 0.375,
    16: 0.375,
    18: 0.375,
    20: 0.375,
  },
  80: {
    1: 0.179,
    1.5: 0.2,
    2: 0.218,
    2.5: 0.276,
    3: 0.3,
    4: 0.337,
    6: 0.432,
    8: 0.5,
    10: 0.5,
    12: 0.5,
    14: 0.5,
    16: 0.5,
    18: 0.5,
    20: 0.5,
  },
};

// ---- Air property regressions from Pipe Data sheet [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
// nu_air (ft^2/s) = a0 + a1*T(F) + a2*T(F)^2
const AIR_NU = {
  a0: 1.2736473758354083e-4,
  a1: 4.4175648669899082e-7,
  a2: 8.8389464028305565e-10,
};
// Pr_air = a0 + a1*T(F) + a2*T(F)^2
const AIR_PR = {
  a0: 0.71925606964726618,
  a1: -1.5500176366842918e-4,
  a2: 1.7636684303350467e-7,
};
// k_air in W/mK then converted; coefficients shown in sheet [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
const AIR_K_WMK = {
  a0: 2.2704656280511465e-2,
  a1: 4.5002874779541333e-5,
  a2: -9.7001763668425007e-9,
};
const WMK_TO_BTUHR_FT_F = 0.577789318;

function poly2(c, x) {
  return c.a0 + c.a1 * x + c.a2 * x * x;
}

function airProps(Tf) {
  return {
    nu: poly2(AIR_NU, Tf),
    Pr: poly2(AIR_PR, Tf),
    k: poly2(AIR_K_WMK, Tf) * WMK_TO_BTUHR_FT_F,
  };
}

function waterPropsFromInitialTemp_F(Tf) {
  // Convert °F → K
  const Tk = ((Tf - 32) * 5) / 9 + 273.15;

  // Atmospheric pressure
  const P_MPa = 0.101325;

  // IAPWS IF97 region lookup using T & P
  const water = NeutriumJS.thermo.IAPWS97.PT.solve(P_MPa, Tk);

  // Returned SI units:
  // water.rho  → kg/m³
  // water.cp   → kJ/(kg·K)

  return {
    rho_kgm3: water.rho,
    cp_kJkgK: water.cp,

    // Converted to Imperial (what your model uses)
    rho_lbft3: water.rho * 0.062428, // kg/m3 → lb/ft3
    cp_Btu: water.cp * 0.238846, // kJ/kg-K → Btu/lbm-F
  };
}

// ---- Insulation thermal conductivity regressions from Pipe Data sheet [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
// All of these are in Btu/(h*ft*F) already in sheet (k = a0 + a1*T(F) + a2*T(F)^2)
const INS_K = {
  "Calcium Silicate": {
    a0: 2.9402783428570306e-2,
    a1: 3.9539397142862767e-5,
    a2: 4.1272857142796301e-9,
  },
  Fiberglass: {
    a0: 1.7296042998765276e-2,
    a1: 1.0254521604939615e-5,
    a2: 9.8086728395059227e-8,
  },
  "Mineral Wool": {
    a0: 1.7829874285714337e-2,
    a1: 2.6689780952380622e-5,
    a2: 5.6406238095238504e-8,
  },
  Perlite: {
    a0: 3.7648935194286172e-2,
    a1: 3.541706417142626e-5,
    a2: 2.2287342857145379e-8,
  },
};
function kInsulation(type, Tf) {
  return poly2(INS_K[type], Tf);
}

// ---- Convection correlation (Churchill–Bernstein)
function nusseltChurchillBernstein(Re, Pr) {
  const term1 = 0.3;
  const num = 0.62 * Math.sqrt(Re) * Math.cbrt(Pr);
  const den = Math.pow(1 + Math.pow(0.4 / Pr, 2 / 3), 1 / 4);
  const term2 = num / den;
  const term3 = Math.pow(1 + Math.pow(Re / 282000, 5 / 8), 4 / 5);
  return term1 + term2 * term3;
}

// ---- Material properties (densities) from Inputs sheet constants [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
const RHO = {
  ice: 57.43, // lb/ft3 [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
  CS: 490.3, // lb/ft3 [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
  SS: 492.9, // lb/ft3 [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
  P22: 485.5, // lb/ft3 [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
  P91: 476.9, // lb/ft3 [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
};

// Pipe cp: the sheet provides typical cp values per material at initial temp in the Inputs & Results example [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
// For a simple “plain JS” build, we use those representative values; you can upgrade to temperature-dependent cp from Pipe Data later.
const CP_PIPE = {
  CS: 0.10007788243178692,
  SS: 0.10897876421419209,
  P22: 0.10358848242009366,
  P91: 0.10358848242009366,
};

// Pipe k: representative values from Inputs & Results example [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
const K_PIPE = {
  CS: 35.466351781545505,
  SS: 8.250425649515888,
  P22: 14.531265577383071,
  P91: 14.531265577383071,
};

// Aluminum cladding conductivity from Inputs example [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
function kAluminum() {
  return 99.7;
}

// ---- UI: pipe rows
const tbody = document.querySelector("#pipesTable tbody");
let pipes = [];

function nominalOptions() {
  return Object.keys(pipeOD_in)
    .map(Number)
    .sort((a, b) => a - b);
}
function scheduleOptions(material) {
  if (material === "SS") return [5, 10, 40, 80];
  return [20, 40, 80, 120, 160];
}

function addRow(
  pipe = { enabled: true, nominal: 1, schedule: 80, material: "CS" },
) {
  pipes.push(pipe);
  renderPipes();
}
function clearPipes() {
  pipes = [];
  renderPipes();
}
function renderPipes() {
  tbody.innerHTML = "";
  pipes.forEach((p, idx) => {
    const tr = document.createElement("tr");

    const tdIdx = document.createElement("td");
    tdIdx.textContent = idx + 1;
    tr.appendChild(tdIdx);

    const tdEn = document.createElement("td");
    const en = document.createElement("input");
    en.type = "checkbox";
    en.checked = !!p.enabled;
    en.addEventListener("change", () => {
      p.enabled = en.checked;
    });
    tdEn.appendChild(en);
    tr.appendChild(tdEn);

    const tdNom = document.createElement("td");
    const selNom = document.createElement("select");
    nominalOptions().forEach((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      if (Number(p.nominal) === n) o.selected = true;
      selNom.appendChild(o);
    });
    selNom.addEventListener("change", () => {
      p.nominal = Number(selNom.value);
    });
    tdNom.appendChild(selNom);
    tr.appendChild(tdNom);

    const tdSch = document.createElement("td");
    const selSch = document.createElement("select");
    scheduleOptions(p.material).forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      if (Number(p.schedule) === s) o.selected = true;
      selSch.appendChild(o);
    });
    selSch.addEventListener("change", () => {
      p.schedule = Number(selSch.value);
    });
    tdSch.appendChild(selSch);
    tr.appendChild(tdSch);

    const tdMat = document.createElement("td");
    const selMat = document.createElement("select");
    ["CS", "SS", "P22", "P91", "Custom"].forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      if (p.material === m) o.selected = true;
      selMat.appendChild(o);
    });
    selMat.addEventListener("change", () => {
      p.material = selMat.value;
      // refresh schedule options
      renderPipes();
    });
    tdMat.appendChild(selMat);
    tr.appendChild(tdMat);

    tbody.appendChild(tr);
  });

  dumpPipeData();
}

// ---- Derived frozen mass fraction from radius %
// workbook example: 10% => 0.19, 20% => 0.36 [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
function massFrozenFromRadiusPct(rPct) {
  const fr = Math.max(0, Math.min(100, rPct)) / 100;
  return 1 - Math.pow(1 - fr, 2);
}

// ---- Lookup thickness
function wallThicknessIn(material, schedule, nominal) {
  if (material === "SS") {
    const row = wallSS_in[schedule] || {};
    return row[nominal] ?? null;
  }
  // treat P22 and P91 as CS schedules in the sheet input behavior
  const row = wallCS_in[schedule] || {};
  return row[nominal] ?? null;
}
function outerDiameterIn(material, nominal, customOD) {
  if (material === "Custom") return Number(customOD);
  return pipeOD_in[nominal] ?? null;
}

// ---- Solve outer surface temperature Tclad (simple fixed-point):
// Tclad influences radiation; we iterate to balance conduction+convection+radiation.
// This mirrors the workbook’s “TempClad / Qcond / Qconv / Qrad” iterative nature. [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
function solveTclad({ TwF, TaF, TskyF, eps, h, r4_ft, Rcond_hrF_per_Btu }) {
  const A = 2 * Math.PI * r4_ft * 1; // per ft length
  const TaR = TaF + 459.67;
  const TskyR = TskyF + 459.67;

  // Define f(Tclad) = Qcond - (Qconv + Qrad)
  function f(TcladF) {
    const TcladR = TcladF + 459.67;

    const Qcond = (TwF - TcladF) / Rcond_hrF_per_Btu; // Btu/hr-ft
    const Qconv = h * A * (TcladF - TaF); // Btu/hr-ft
    const Qrad = eps * SIGMA * A * (Math.pow(TcladR, 4) - Math.pow(TskyR, 4)); // Btu/hr-ft

    return Qcond - (Qconv + Qrad);
  }

  // Bracket between air and water for cooling (Tw > Ta). For heating, bracket accordingly.
  let lo = Math.min(TwF, TaF);
  let hi = Math.max(TwF, TaF);

  // Expand slightly in case radiation makes it slightly outside
  lo -= 5;
  hi += 5;

  let flo = f(lo),
    fhi = f(hi);

  // If not bracketed, fall back to clamped midpoint (prevents NaNs)
  if (flo * fhi > 0) {
    return Math.max(Math.min((TwF + TaF) / 2, hi), lo);
  }

  // Bisection
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-6) return mid;
    if (flo * fmid <= 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

// ---- Total heat loss rate per foot at a given water temp
function heatLossPerFoot_BtuPerHr(params) {
  const {
    TwF,
    TaF,
    TskyF,
    windMph,
    r2_ft,
    r3_ft,
    r4_ft,
    kPipe,
    kIns,
    kClad,
    eps,
  } = params;

  // Air props evaluated at film temperature (workbook references film evaluation concept) [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
  const TfilmF = (TaF + TwF) / 2;
  const air = airProps(TfilmF);
  const V = windMph * MPH_TO_FTPS;
  const D = 2 * r4_ft;

  const Re = (V * D) / air.nu;
  const Nu = nusseltChurchillBernstein(Re, air.Pr);
  const h = (Nu * air.k) / D;

  // Conduction resistance per foot: sum ln(rout/rin)/(2πkL)
  // pipe wall: r2 -> r2 (thin) is handled by kPipe using r1 & r2 where r1 is inside radius
  // Here we assume r1 is included in r2_ft computation upstream; compute R layers with available radii:
  // We'll pass r1 separately via params if you extend.
  // For this starter, treat pipe wall resistance as small vs insulation; still include using kPipe and a guessed r1.
  // We'll approximate r1 = r2 - t_wall (in ft) in calling code.
  const r1_ft = params.r1_ft;

  const Rpipe = Math.log(r2_ft / r1_ft) / (2 * PI * kPipe * 1);
  const Rins = Math.log(r3_ft / r2_ft) / (2 * PI * kIns * 1);
  const Rclad = Math.log(r4_ft / r3_ft) / (2 * PI * kClad * 1);

  const Rcond = Rpipe + Rins + Rclad; // hr*F/Btu per foot

  const TcladF = solveTclad({
    TwF,
    TaF,
    TskyF,
    eps,
    h,
    r4_ft,
    Rcond_hrF_per_Btu: Rcond,
  });

  // Now compute Q at solved Tclad
  const A = 2 * PI * r4_ft * 1;
  const Qconv = h * A * (TcladF - TaF);
  const Qrad =
    eps *
    SIGMA *
    A *
    (Math.pow(TcladF + 459.67, 4) - Math.pow(TskyF + 459.67, 4));
  const Qout = Math.max(0, Qconv + Qrad);
  // Btu/hr-ft leaving to environment

  return { Qout, Re, Nu, h, TcladF, Rcond, Rpipe };
}

// ---- Main simulation per pipe:
// Stage 1: cool water from Tinit -> 32°F
// Stage 2: freeze fraction of water mass (based on radius frozen criterion)
// Uses time-stepping (dt) as workbook indicates iteration steps. [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
function simulatePipe(pipe, global) {
  const logLines = [];

  const {
    acceptableHr,
    frozenRadiusPct,
    sinkTempF,
    emissivity,
    cladThkIn,
    insThkIn,
    insType,
    tInitF,
    tAirF,
    windMph,
    latentBtuPerLb,
    dtSec,
    cust,
  } = global;

  const frMass = massFrozenFromRadiusPct(frozenRadiusPct);

  // geometry
  const OD_in = outerDiameterIn(pipe.material, pipe.nominal, cust.OD);
  if (!OD_in) throw new Error("OD not found for pipe.");

  const t_wall_in =
    pipe.material === "Custom"
      ? Math.max(0, (cust.OD - cust.ID) / 2)
      : wallThicknessIn(pipe.material, pipe.schedule, pipe.nominal);

  if (pipe.material !== "Custom" && t_wall_in == null)
    throw new Error("Wall thickness not found for that schedule/nominal.");

  const r2_ft = (OD_in / 2) * IN_TO_FT;
  const r1_ft = Math.max(1e-6, r2_ft - t_wall_in * IN_TO_FT);
  const r3_ft = r2_ft + Number(insThkIn) * IN_TO_FT;
  const r4_ft = r3_ft + Number(cladThkIn) * IN_TO_FT;

  // material props
  const kPipe =
    pipe.material === "Custom"
      ? Number(cust.k)
      : (K_PIPE[pipe.material] ?? K_PIPE.CS);
  const cpPipe =
    pipe.material === "Custom"
      ? Number(cust.cp)
      : (CP_PIPE[pipe.material] ?? CP_PIPE.CS);
  const rhoPipe =
    pipe.material === "Custom"
      ? Number(cust.rho)
      : (RHO[pipe.material] ?? RHO.CS);

  const kIns = kInsulation(insType, (tInitF + tAirF) / 2);
  const kClad = kAluminum();

  // masses per foot

  // Get water properties at initial temperature
  const waterProps = waterPropsFromInitialTemp_F(tInitF);

  const rhoWater = waterProps.rho_lbft3; // lb/ft3
  const cpWater = waterProps.cp_Btu; // Btu/lbm-F

  const Vwater = PI * (r1_ft * r1_ft) * 1; // ft3 per ft length
  const mWater = Vwater * rhoWater; // lbm per ft
  const Vpipe = PI * (r2_ft * r2_ft - r1_ft * r1_ft) * 1;
  const mPipe = Vpipe * rhoPipe;

  const CpSys = mWater * cpWater + mPipe * cpPipe; // Btu/F per ft

  // ---- Stage 1: cool to 32F
  let Tw = Number(tInitF);
  let tSec = 0;

  while (Tw > 32.0) {
    const hl = heatLossPerFoot_BtuPerHr({
      TwF: Tw,
      TaF: Number(tAirF),
      TskyF: Number(sinkTempF),
      windMph: Number(windMph),
      r1_ft,
      r2_ft,
      r3_ft,
      r4_ft,
      kPipe,
      kIns,
      kClad,
      eps: Number(emissivity),
    });

    const Qout_perSec = hl.Qout / 3600; // Btu/s-ft
    const dT = (Qout_perSec * Number(dtSec)) / CpSys;

    Tw = Tw - dT;
    tSec += Number(dtSec);

    if (tSec > 7 * 24 * 3600) break; // guard
  }
  const timeTo32Hr = tSec / 3600;

  // ---- Stage 2 (VBA-style): freeze to fraction with pipe cooling accounted
  let Qremaining = mWater * frMass * Number(latentBtuPerLb); // Btu/ft (use 143.6 to match VBA)
  let tFreezeSec = 0;

  // Pipe temperature variable (°F). VBA tracks pipe metal temperature during freezing.
  let Tpipe = 32.0; // start at freezing point
  const pipeCap = mPipe * cpPipe; // Btu/°F per ft

  while (Qremaining > 0) {
    const hl = heatLossPerFoot_BtuPerHr({
      TwF: 32.0,
      TaF: Number(tAirF),
      TskyF: Number(sinkTempF),
      windMph: Number(windMph),
      r1_ft,
      r2_ft,
      r3_ft,
      r4_ft,
      kPipe,
      kIns,
      kClad,
      eps: Number(emissivity),
    });

    const dtHr = Number(dtSec) / 3600;

    // Total heat removed to ambient this step (Btu)
    const Qstep = hl.Qout * dtHr;

    // VBA-style pipe temperature drop from resistance (rate * Rpipe)
    // hl.Qout is Btu/hr-ft, hl.Rpipe is hr*°F/Btu, so drop is °F.
    const TpipeNew = 32.0 - hl.Qout * hl.Rpipe;

    // Energy used to cool pipe metal this step (Btu)
    const Qpipe = Math.max(0, (Tpipe - TpipeNew) * pipeCap);

    // Energy available to form new ice this step (Btu)
    const QnewIce = Math.max(0, Qstep - Qpipe);

    Qremaining -= QnewIce;
    Tpipe = TpipeNew;

    tFreezeSec += Number(dtSec);
    if (tFreezeSec > 30 * 24 * 3600) break; // keep your guard
  }

  const timeFreezeHr = tFreezeSec / 3600;
  const totalHr = timeTo32Hr + timeFreezeHr;
  const heatTracing = totalHr < Number(acceptableHr) ? "YES" : "NO"; // matches workbook behavior examples [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)

  // diagnostics
  logLines.push(`Pipe ${pipe.nominal}" Sch ${pipe.schedule} ${pipe.material}`);
  logLines.push(
    `  r1=${r1_ft.toFixed(4)}ft r2=${r2_ft.toFixed(4)}ft r3=${r3_ft.toFixed(4)}ft r4=${r4_ft.toFixed(4)}ft`,
  );
  logLines.push(
    `  mWater=${mWater.toFixed(3)} lb/ft, mPipe=${mPipe.toFixed(3)} lb/ft, CpSys=${CpSys.toFixed(3)} Btu/F-ft`,
  );
  logLines.push(
    `  frMass (from radius ${frozenRadiusPct}%) = ${frMass.toFixed(3)} (workbook example shows 10%→0.19, 20%→0.36)`,
  );
  logLines.push(
    `  Stage1 timeTo32=${timeTo32Hr.toFixed(3)} hr, Stage2 timeFreeze=${timeFreezeHr.toFixed(3)} hr, total=${totalHr.toFixed(3)} hr`,
  );

  return { timeTo32Hr, timeFreezeHr, totalHr, heatTracing, logLines };
}

// ---- UI actions
const resultsBody = document.querySelector("#resultsTable tbody");
const logBox = document.querySelector("#log");

function writeLog(lines) {
  logBox.value = lines.join("\n");
}

function getGlobal() {
  const frozenRadiusPct = Number(
    document.getElementById("frozenRadiusPct").value,
  );
  document.getElementById("massFrozen").value =
    massFrozenFromRadiusPct(frozenRadiusPct).toFixed(3);

  return {
    acceptableHr: Number(document.getElementById("acceptableHr").value),
    frozenRadiusPct,
    sinkTempF: Number(document.getElementById("sinkTempF").value),
    emissivity: Number(document.getElementById("emissivity").value),
    cladThkIn: Number(document.getElementById("cladThkIn").value),
    insThkIn: Number(document.getElementById("insThkIn").value),
    insType: document.getElementById("insType").value,
    tInitF: Number(document.getElementById("tInitF").value),
    tAirF: Number(document.getElementById("tAirF").value),
    windMph: Number(document.getElementById("windMph").value),
    latentBtuPerLb: Number(document.getElementById("latentBtuPerLb").value),
    dtSec: Number(document.getElementById("dtSec").value),
    cust: {
      ID: Number(document.getElementById("custID").value),
      OD: Number(document.getElementById("custOD").value),
      k: Number(document.getElementById("custK").value),
      cp: Number(document.getElementById("custCp").value),
      rho: Number(document.getElementById("custRho").value),
    },
  };
}

function renderResults(rows) {
  resultsBody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.nominal}</td>
      <td>${r.schedule}</td>
      <td>${r.material}</td>
      <td class="right">${r.timeTo32Hr.toFixed(3)}</td>
      <td class="right">${r.timeFreezeHr.toFixed(3)}</td>
      <td class="right">${r.totalHr.toFixed(3)}</td>
      <td class="${r.heatTracing === "YES" ? "bad" : "ok"}">${r.heatTracing}</td>
    `;
    resultsBody.appendChild(tr);
  });
}

document.getElementById("runCalc").addEventListener("click", () => {
  const g = getGlobal();
  const enabled = pipes.filter((p) => p.enabled);

  const allLogs = [];
  const rows = [];

  const ambTemp = document.getElementById("amb-air-temp");
  const wind = document.getElementById("wind-speed");
  const initTemp = document.getElementById("init-temp");
  const insThick = document.getElementById("ins-thick");
  const cpWaterTxt = document.getElementById("cp-water");
  const rhoWaterTxt = document.getElementById("rho-water");
  const resultsWrap = document.getElementById("results-wrap");

  const tAirF = Number(document.getElementById("tAirF").value);
  const tInitF = Number(document.getElementById("tInitF").value);
  const initWind = Number(document.getElementById("windMph").value);
  const insThkIn = Number(document.getElementById("insThkIn").value);

  const waterProps = waterPropsFromInitialTemp_F(tInitF);

  const rhoWater = Number(waterProps.rho_lbft3.toFixed(3)); // lb/ft3
  const cpWater = Number(waterProps.cp_Btu.toFixed(3)); // Btu/lbm-F

  resultsWrap.style.display = "flex";

  ambTemp.textContent = tAirF + " F";
  wind.textContent = initWind + " mph";
  initTemp.textContent = tInitF + " F";
  insThick.textContent = insThkIn + " in";
  cpWaterTxt.textContent = cpWater + " Btu/(lb*R)";
  rhoWaterTxt.textContent = rhoWater + " lb/ft^3";

  enabled.forEach((p) => {
    try {
      const sim = simulatePipe(p, g);
      rows.push({
        nominal: p.nominal,
        schedule: p.schedule,
        material: p.material,
        ...sim,
      });
      allLogs.push(...sim.logLines, "");
    } catch (e) {
      allLogs.push(
        `ERROR for pipe ${p.nominal} ${p.material}: ${e.message}`,
        "",
      );
    }
  });

  renderResults(rows);
  writeLog(allLogs);

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

document.getElementById("addPipe").addEventListener("click", () => {
  addRow({ enabled: true, nominal: 1, schedule: 80, material: "CS" });
});

document.getElementById("clearPipes").addEventListener("click", clearPipes);

// Load the same style of list as the workbook example Case 1 (11 pipes) [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)
document.getElementById("loadExample").addEventListener("click", () => {
  clearPipes();
  [1, 1.5, 2, 2.5, 3, 4, 6, 8, 10, 12, 14].forEach((n, i) => {
    addRow({
      enabled: true,
      nominal: n,
      schedule: n <= 2 ? 80 : 40,
      material: "CS",
    });
  });
});

// Tabs
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document
      .querySelectorAll(".tab")
      .forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;

    document
      .getElementById("tab-inputs")
      .classList.toggle("hide", tab !== "inputs");
    document
      .getElementById("tab-method")
      .classList.toggle("hide", tab !== "method");
    document
      .getElementById("tab-pipeData")
      .classList.toggle("hide", tab !== "pipeData");
  });
});

function dumpPipeData() {
  const dump = {
    pipeOD_in,
    wallCS_in_schedules: Object.keys(wallCS_in),
    wallSS_in_schedules: Object.keys(wallSS_in),
    airRegressions: { AIR_NU, AIR_PR, AIR_K_WMK },
    insulationTypes: Object.keys(INS_K),
  };
  document.getElementById("pipeDataDump").textContent =
    JSON.stringify(dump, null, 2) +
    "\n\nNotes: OD/thickness and regression coefficients are from the workbook Pipe Data sheet. [1](https://blackandveatch-my.sharepoint.com/personal/thiptinnakornp_bv_com/_layouts/15/Doc.aspx?sourcedoc=%7B6277BE68-B411-4EFF-B268-C3D8B627CEE5%7D&file=Time_to_Freeze_Calculation%20%28CS%29.xlsm&action=default&mobileredirect=true)";
}

// init
addRow({ enabled: true, nominal: 1, schedule: 80, material: "CS" });
addRow({ enabled: true, nominal: 1.5, schedule: 80, material: "CS" });
addRow({ enabled: true, nominal: 2, schedule: 80, material: "CS" });
document.getElementById("massFrozen").value =
  massFrozenFromRadiusPct(10).toFixed(3);
dumpPipeData();

