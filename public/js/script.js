// 1. GLOBAL VARIABLES (Top of file)
let pipes = [];
const IN_TO_FT = 1 / 12; // Some constants are needed in both places
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

// 2. UI & TABLE FUNCTIONS
function addRow(
  pipe = { enabled: true, nominal: 1, schedule: 80, material: "CS" },
) {
  pipes.push(pipe);
  renderPipes();
}
function renderPipes() {
  const tbody = document.querySelector("#pipesTable tbody");
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

function clearPipes() {
  pipes = [];
  renderPipes();
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

// 3. THE "CALCULATE" LOGIC (Talking to the API)
async function runCalculation() {
  const g = getGlobal();
  const enabledPipes = pipes.filter((p) => p.enabled);
  const resultsWrap = document.getElementById("results-wrap");
  resultsWrap.style.display = "flex";
  // Pre-calculate water props locally using CDN
  const waterData = waterPropsFromInitialTemp_F(g.tInitF);
  const rows = [];
  for (const p of enabledPipes) {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipe: p, global: g, waterData: waterData }),
    });
    const simResult = await response.json();
    rows.push({ ...p, ...simResult });
  }
  renderResults(rows);
}

function nominalOptions() {
  return Object.keys(pipeOD_in)
    .map(Number)
    .sort((a, b) => a - b);
}
function scheduleOptions(material) {
  if (material === "SS") return [5, 10, 40, 80];
  return [20, 40, 80, 120, 160];
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

// 4. EVENT LISTENERS (At the very bottom)
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addPipe").addEventListener("click", addRow);
  document.getElementById("runCalc").addEventListener("click", runCalculation);
  document.getElementById("clearPipes").addEventListener("click", clearPipes);
  // Add the first row automatically
  addRow();
});
