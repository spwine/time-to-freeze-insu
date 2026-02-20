// 1. GLOBAL VARIABLES (Top of file)
let pipes = [];
const IN_TO_FT = 1 / 12; // Some constants are needed in both places

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

async function runCalculation() {
  const g = getGlobal();
  // 1. Calculate water props locally using the CDN library
  const waterProps = waterPropsFromInitialTemp_F(g.tInitF);
  const enabledPipes = pipes.filter((p) => p.enabled);
  const rows = [];
  for (const p of enabledPipes) {
    // 2. Send the pipe data + the pre-calculated water data to the API
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipe: p,
        global: g,
        waterData: waterProps, // <--- Pass the "answer" to the server
      }),
    });
    const simResult = await response.json();
    rows.push({ ...p, ...simResult });
  }
  renderResults(rows);
}

// This ensures the buttons are ready before the script tries to find them
document.addEventListener("DOMContentLoaded", () => {
  // Add Row Button
  document.getElementById("addPipe").addEventListener("click", () => {
    addRow({ enabled: true, nominal: 1, schedule: 80, material: "CS" });
  });
  // Run Calculation Button
  document.getElementById("runCalc").addEventListener("click", async () => {
    console.log("Button clicked!"); // This helps you test
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
  // Clear Button
  document.getElementById("clearPipes").addEventListener("click", clearPipes);
  // Initial setup (adds the first row when page loads)
  addRow({ enabled: true, nominal: 1, schedule: 80, material: "CS" });
});
