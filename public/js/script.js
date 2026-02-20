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
