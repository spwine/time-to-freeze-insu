// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const logEl = $("log");
const statusEl = $("status");

function log(line) {
  logEl.value += line + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}
function setStatus(text, cls = "") {
  statusEl.textContent = text;
  statusEl.className = "pill" + (cls ? " " + cls : "");
}

function toFloat(x) {
  if (x == null) return NaN;
  if (typeof x === "number") return x;
  const s = String(x)
    .replace(/[,\"]+/g, " ")
    .trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
}

function normYes(x) {
  if (x == null) return false;
  const s = String(x).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

// choose smallest classTemp >= opTemp; if none, use max classTemp
function pickClassTemp(classTempsAsc, opTempF) {
  for (const t of classTempsAsc) {
    if (opTempF <= t) return t;
  }
  return classTempsAsc[classTempsAsc.length - 1];
}

// ---------- Parse insulation matrix ----------
function buildInsulationLookup(insWb) {
  const sheetName = insWb.SheetNames[0];
  const ws = insWb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Find header row that contains many diameter numbers (0.5, 0.75, 1, ...)
  let headerRowIdx = -1;
  let tempColIdx = -1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < 5) continue;

    // Find a cell that mentions Temperature
    const tIdx = row.findIndex(
      (c) => typeof c === "string" && /temperature/i.test(c),
    );
    if (tIdx === -1) continue;

    // Count numeric-ish cells to the right (diameters)
    let numericCount = 0;
    for (let c = tIdx + 1; c < row.length; c++) {
      const v = toFloat(row[c]);
      if (!Number.isNaN(v)) numericCount++;
    }
    if (numericCount >= 5) {
      headerRowIdx = r;
      tempColIdx = tIdx;
      break;
    }
  }

  if (headerRowIdx === -1)
    throw new Error(
      "Could not locate insulation table header row (Temperature + diameter columns).",
    );

  const header = rows[headerRowIdx];
  const diamToCol = new Map();

  for (let c = tempColIdx + 1; c < header.length; c++) {
    const d = toFloat(header[c]);
    if (!Number.isNaN(d)) diamToCol.set(d, c);
  }

  const table = new Map(); // classTemp -> Map(diam -> thickness)

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const classTemp = toFloat(row[tempColIdx]);
    if (Number.isNaN(classTemp)) continue;

    const diamMap = new Map();
    for (const [diam, c] of diamToCol.entries()) {
      const thk = toFloat(row[c]);
      if (!Number.isNaN(thk)) diamMap.set(diam, thk);
    }
    table.set(classTemp, diamMap);
  }

  const classTempsAsc = Array.from(table.keys()).sort((a, b) => a - b);

  log(`Loaded insulation matrix from sheet: ${sheetName}`);
  log(
    `Found ${classTempsAsc.length} temperature classes and ${diamToCol.size} diameters.`,
  );

  function lookup(opTempF, sizeIn) {
    const classT = pickClassTemp(classTempsAsc, opTempF);
    const diamMap = table.get(classT);
    if (!diamMap) return { thickness: null, classT };

    // exact diameter match
    if (diamMap.has(sizeIn)) return { thickness: diamMap.get(sizeIn), classT };

    // if exact not found, try nearest diameter (optional fallback)
    let nearest = null;
    let best = Infinity;
    for (const d of diamMap.keys()) {
      const diff = Math.abs(d - sizeIn);
      if (diff < best) {
        best = diff;
        nearest = d;
      }
    }
    if (nearest != null)
      return { thickness: diamMap.get(nearest), classT, usedNearest: nearest };
    return { thickness: null, classT };
  }

  return { lookup };
}

// ---------- Update Pipe_Run workbook ----------
function fillPipeRun(pipeWb, lookup) {
  // Prefer a sheet named "Pipe_Run" if it exists, else first sheet
  const targetName = pipeWb.SheetNames.includes("Pipe_Run")
    ? "Pipe_Run"
    : pipeWb.SheetNames[0];
  const ws = pipeWb.Sheets[targetName];
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  });

  // Find the header row containing these columns:
  // "Size", "Insulation Thickness (in)", "Normal Operating Temperature (°F)", "Run Is Insulated (y/n)"
  const required = [
    "Size",
    "Insulation Thickness (in)",
    "Normal Operating Temperature (°F)",
    "Run Is Insulated (y/n)",
  ];

  let headerRowIdx = -1;
  let col = {};

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const textRow = row.map((v) => (v == null ? "" : String(v).trim()));

    const hasAll = required.every((name) => textRow.includes(name));
    if (hasAll) {
      headerRowIdx = r;
      col.size = textRow.indexOf("Size");
      col.thk = textRow.indexOf("Insulation Thickness (in)");
      col.temp = textRow.indexOf("Normal Operating Temperature (°F)");
      col.isIns = textRow.indexOf("Run Is Insulated (y/n)");
      break;
    }
  }

  if (headerRowIdx === -1)
    throw new Error(
      "Could not find the Pipe_Run header row with the required column names.",
    );

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    // stop if the row looks empty
    const nonEmpty = row.some((v) => v !== null && v !== "" && v !== undefined);
    if (!nonEmpty) continue;

    const isIns = normYes(row[col.isIns]);
    if (!isIns) {
      skipped++;
      continue;
    }

    const sizeIn = toFloat(row[col.size]);
    const opTempF = toFloat(row[col.temp]);
    if (Number.isNaN(sizeIn) || Number.isNaN(opTempF)) {
      missing++;
      continue;
    }

    const res = lookup(opTempF, sizeIn);
    if (res.thickness == null) {
      missing++;
      continue;
    }

    // write thickness into the row
    row[col.thk] = res.thickness;
    updated++;

    // optional: log nearest diameter usage
    if (res.usedNearest != null && res.usedNearest !== sizeIn) {
      log(
        `Row ${r + 1}: Size ${sizeIn} not in table; used nearest ${res.usedNearest}.`,
      );
    }
  }

  // write modified rows back into worksheet (preserve other sheets)
  const newWs = XLSX.utils.aoa_to_sheet(rows);

  // attempt to preserve column widths if they exist
  if (ws["!cols"]) newWs["!cols"] = ws["!cols"];
  if (ws["!rows"]) newWs["!rows"] = ws["!rows"];
  if (ws["!merges"]) newWs["!merges"] = ws["!merges"];

  pipeWb.Sheets[targetName] = newWs;

  log(`Updated rows: ${updated}`);
  log(`Skipped (Run Is Insulated != Yes): ${skipped}`);
  log(`Missing/No match (size/temp out of range): ${missing}`);

  return { updated, skipped, missing, targetName };
}

async function readWorkbookFromFile(file) {
  const data = await file.arrayBuffer();
  return XLSX.read(data, {
    type: "array",
    cellStyles: true,
    cellNF: true,
    cellText: true,
  });
}

function downloadWorkbook(wb, filename) {
  const wbout = XLSX.write(wb, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
  });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- UI ----------
$("runBtn").addEventListener("click", async () => {
  logEl.value = "";
  setStatus("running…");

  const insFile = $("insFile").files[0];
  const pipeFile = $("pipeFile").files[0];

  if (!insFile || !pipeFile) {
    setStatus("missing files", "bad");
    log("Please upload both files before running.");
    return;
  }

  try {
    log("Reading insulation file…");
    const insWb = await readWorkbookFromFile(insFile);

    log("Building lookup…");
    const { lookup } = buildInsulationLookup(insWb);

    log("Reading pipe run file…");
    const pipeWb = await readWorkbookFromFile(pipeFile);

    log("Updating Pipe_Run…");
    const stats = fillPipeRun(pipeWb, lookup);

    setStatus("done", "ok");
    log(`Done. Updated sheet: ${stats.targetName}`);

    const outName = pipeFile.name.replace(/\.xlsx$/i, "") + "_UPDATED.xlsx";
    downloadWorkbook(pipeWb, outName);

    // scroll top for UX
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    setStatus("error", "bad");
    log("ERROR: " + err.message);
    console.error(err);
  }
});
