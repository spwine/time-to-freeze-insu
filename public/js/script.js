async function runCalculation() {
  const inputs = getGlobalInputs();
  const response = await fetch("/api/simulate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pipe: currentPipe, global: inputs }),
  });
  const data = await response.json();
  updateResultsTable(data); // Display the answer
}
