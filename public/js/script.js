// 1. GLOBAL VARIABLES (Top of file)
let pipes = [];
const IN_TO_FT = 1 / 12; // Some constants are needed in both places

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
