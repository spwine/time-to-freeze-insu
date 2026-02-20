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
