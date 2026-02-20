const views = {
  home: document.getElementById("viewHome"),
  calc: document.getElementById("viewCalc"),
  d3: document.getElementById("view3d"),
  docs: document.getElementById("viewDocs"),
};

const btns = {
  home: document.getElementById("btnHome"),
  calc: document.getElementById("btnCalc"),
  d3: document.getElementById("btn3d"),
  docs: document.getElementById("btnDocs"),
};

function show(which) {
  Object.values(views).forEach((v) => v.classList.add("hidden"));
  Object.values(btns).forEach((b) => b.classList.remove("active"));

  if (which === "home") {
    views.home.classList.remove("hidden");
    btns.home.classList.add("active");
  }
  if (which === "calc") {
    views.calc.classList.remove("hidden");
    btns.calc.classList.add("active");
  }
  if (which === "d3") {
    views.d3.classList.remove("hidden");
    btns.d3.classList.add("active");
  }
  if (which === "docs") {
    views.docs.classList.remove("hidden");
    btns.docs.classList.add("active");
  }
}

btns.home.addEventListener("click", () => show("home"));
btns.calc.addEventListener("click", () => show("calc"));
btns.d3.addEventListener("click", () => show("d3"));
btns.docs.addEventListener("click", () => show("docs"));

show("home");

// --------- Helpers ----------
const money = (n) =>
  Number.isFinite(n) ? n.toLocaleString("hu-HU") : "-";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Lépcsős "állapot faktor" 0..1 között:
 * 1.0 = rossz (nincs/kevés szigetelés)
 * 0.7 = közepes
 * 0.55 = jó
 * 0.45 = nagyon jó
 *
 * Így nem tud “véletlenül” 0%-ra kijönni gyenge háznál.
 */
function wallFactor(cm) {
  if (cm <= 0) return 1.0;
  if (cm < 5) return 0.97;
  if (cm < 10) return 0.92;
  if (cm < 15) return 0.85;
  if (cm < 20) return 0.78;
  return 0.72;
}

function roofFactor(cm) {
  if (cm <= 0) return 1.0;
  if (cm < 10) return 0.90;
  if (cm < 20) return 0.80;
  if (cm < 30) return 0.72;
  return 0.68;
}

function heatingFactor(type) {
  // 1.0 = régi gáz (rosszabb)
  // 0.92 = kondenzációs
  // 0.82 = hőszivattyú
  if (type === "kondenzacios") return 0.92;
  if (type === "hoszivattyu") return 0.82;
  return 1.0;
}

// --------- Main calc ----------
window.calculateEnergy = function calculateEnergy() {
  const area = Number(document.getElementById("area")?.value || 0);
  const wallIns = Number(document.getElementById("wallIns")?.value || 0);
  const roofIns = Number(document.getElementById("roofIns")?.value || 0);
  const heating = String(document.getElementById("heating")?.value || "gaz");
  const annualCost = Number(document.getElementById("annualCost")?.value || 0);

  const box = document.getElementById("resultBox");
  if (!box) return;

  // validálás
  if (area <= 0) {
    box.innerHTML = `<b>Hiba:</b> add meg az alapterületet (m²).`;
    return;
  }
  if (wallIns < 0 || roofIns < 0) {
    box.innerHTML = `<b>Hiba:</b> a szigetelés vastagság nem lehet negatív.`;
    return;
  }
  if (annualCost < 0) {
    box.innerHTML = `<b>Hiba:</b> az éves fűtési költség nem lehet negatív.`;
    return;
  }

  // fűtés szöveg
  let heatText = "";
  if (heating === "gaz") {
    heatText =
      "Régi gázkazán → magasabb fogyasztás, érdemes korszerűsíteni (ha már a hőszigetelés rendben).";
  } else if (heating === "kondenzacios") {
    heatText =
      "Kondenzációs kazán → közepesen jó, a hőszigetelés sokat javít a költségen.";
  } else if (heating === "hoszivattyu") {
    heatText =
      "Hőszivattyú → jó irány, de akkor a szigetelés/légzárás különösen fontos.";
  }

  // --- PRIORITÁS: “hiány” pont ---
  // Célok: fal 15 cm, födém 25 cm
  const wallNeed = Math.max(0, 15 - wallIns);
  const roofNeed = Math.max(0, 25 - roofIns);
  const heatNeed = heating === "gaz" ? 10 : heating === "kondenzacios" ? 4 : 1;

  const scoreWall = wallNeed * 1.0;
  const scoreRoof = roofNeed * 1.25; // födém kicsit erősebb
  const scoreHeat = heatNeed * 1.0;

  const items = [
    {
      key: "Födém/padlás szigetelés",
      score: scoreRoof,
      note:
        roofIns <= 0
          ? "Nincs szigetelés → általában az egyik legjobb első lépés."
          : roofIns < 15
          ? "Kevés szigetelés → gyorsan javít a komforton és költségen."
          : "Födém rendben vagy közel rendben.",
    },
    {
      key: "Fal hőszigetelés",
      score: scoreWall,
      note:
        wallIns <= 0
          ? "Nincs szigetelés → nagy veszteség, 12–15 cm sokat javít."
          : wallIns < 10
          ? "5–10 cm alatt sokat veszítesz. 15 cm körül már jó."
          : "Fal szigetelés közepes/jó.",
    },
    { key: "Fűtési rendszer", score: scoreHeat, note: heatText },
  ].sort((a, b) => b.score - a.score);

  // --- AJÁNLÁS SZÖVEG ---
  const recWall =
    wallIns <= 0
      ? "Javaslat: falra 12–15 cm (anyag+falazat függő)."
      : wallIns < 10
      ? "Javaslat: falra 12–15 cm (anyag+falazat függő)."
      : wallIns < 15
      ? "Javaslat: falon 15 cm körüli szint már jó kompromisszum."
      : "Fal: jó szint (15 cm+).";

  const recRoof =
    roofIns <= 0
      ? "Javaslat: födém/padlás 20–30 cm (gyakran a legjobb megtérülés)."
      : roofIns < 10
      ? "Javaslat: födém/padlás 20–30 cm (gyakran a legjobb megtérülés)."
      : roofIns < 20
      ? "Javaslat: födém/padlás legalább 20–25 cm."
      : "Födém: jó szint (20–25 cm+).";

  // --- STABILABB % SZÁMOLÁS ---
  // 1) összeállítunk egy állapot faktort (minél kisebb, annál jobb)
  // 2) ezt hasonlítjuk egy “rossz alaphoz” (1.0)
  // 3) levágjuk 3..55% közé (mert ez MVP irányérték)
  const wf = wallFactor(wallIns);
  const rf = roofFactor(roofIns);
  const hf = heatingFactor(heating);

  // Súlyok: födém 0.45, fal 0.35, fűtés 0.20
  const combined = wf * 0.35 + rf * 0.45 + hf * 0.20;

  // Potenciál: rossz (1.0) -> current (combined)
  let estSavePct = Math.round((1.0 - combined) * 100);

  // Ha nagyon kevés adat, ne legyen 0% “csendben”
  // Minimum 3%, maximum 55% (MVP korlát)
  estSavePct = clamp(estSavePct, 3, 55);

  // --- PÉNZBEN ---
  const estimatedAnnualSaving = Math.round(annualCost * (estSavePct / 100));

  // --- beruházás becslés (irány) ---
  // Egyszerűbb: csak akkor számoljuk megtérülést, ha az adott elem “hiányos”
  // Ha már jó (fal>=15 / födém>=20), akkor '-' (nem életszerű most arra költeni)
  const estRoofCost = area * 12000; // Ft/m² (irány)
  const estWallCost = area * 20000; // Ft/m² (irány)

  const roofRelevant = roofIns < 20;
  const wallRelevant = wallIns < 15;

  const roofPaybackYears =
    roofRelevant && estimatedAnnualSaving > 0
      ? Math.round(estRoofCost / estimatedAnnualSaving)
      : null;

  const wallPaybackYears =
    wallRelevant && estimatedAnnualSaving > 0
      ? Math.round(estWallCost / estimatedAnnualSaving)
      : null;

  // --- kWh “érzet” (csak szemléltetés) ---
  // A combined alapján kicsit stabilabb
  const baseKwh = area * 140;
  const estKwh = Math.round(baseKwh * combined);

  box.innerHTML = `
    <div style="display:grid; gap:10px;">

      <div><b>Gyors eredmény (becslés):</b> ~${estSavePct}% potenciál a mostani állapothoz képest (nagyon durva irányszám).</div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Prioritási sorrend:</b>
        <ol style="margin:8px 0 0 18px;">
          ${items.map(i => `<li><b>${i.key}</b> – ${i.note}</li>`).join("")}
        </ol>
      </div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Javaslatok:</b>
        <ul style="margin:8px 0 0 18px;">
          <li>${recRoof}</li>
          <li>${recWall}</li>
          <li>${heatText}</li>
        </ul>
      </div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Megtérülési becslés (nagyon durva irányérték):</b>
        <ul style="margin:8px 0 0 18px;">
          <li>Éves fűtési költség: ~${money(annualCost)} Ft</li>
          <li>Éves becsült megtakarítás: ~${money(estimatedAnnualSaving)} Ft</li>
          <li>Födém szigetelés: ${
            roofRelevant
              ? `~${money(estRoofCost)} Ft → megtérülés: ${roofPaybackYears === null ? "-" : `${roofPaybackYears} év`}`
              : "már jó szinten (20 cm+), most nem elsődleges"
          }</li>
          <li>Fal szigetelés: ${
            wallRelevant
              ? `~${money(estWallCost)} Ft → megtérülés: ${wallPaybackYears === null ? "-" : `${wallPaybackYears} év`}`
              : "már jó szinten (15 cm+), most nem elsődleges"
          }</li>
        </ul>
      </div>

      <div style="color: rgba(255,255,255,.7); font-size:12px;">
        Megjegyzés: ez <b>döntéstámogatás</b>. Pontos számításhoz helyszíni felmérés / energetikus szükséges.
        (Becslés: ~${money(estKwh)} “kWh/év” ekvivalens)
      </div>

    </div>
  `;
};
