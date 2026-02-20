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

/**
 * Alap energia elemzés (MVP)
 * Nem hivatalos tanúsítás, csak döntéstámogatás.
 */
window.calculateEnergy = function calculateEnergy() {
  const area = Number(document.getElementById("area")?.value || 0);
  const wallIns = Number(document.getElementById("wallIns")?.value || 0);
  const roofIns = Number(document.getElementById("roofIns")?.value || 0);
  const heating = String(document.getElementById("heating")?.value || "gaz");
  const annualCost = Number(document.getElementById("annualCost")?.value || 0);

  const box = document.getElementById("resultBox");
  if (!box) return;

  // alap validálás
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

  // “hiány” pontszámok (minél nagyobb, annál sürgősebb)
  // egyszerű heurisztika célértékekkel
  const wallNeed = Math.max(0, 15 - wallIns); // cél: 15 cm
  const roofNeed = Math.max(0, 25 - roofIns); // cél: 25 cm

  // fűtés “bünti”
  let heatNeed = 0;
  let heatText = "";
  if (heating === "gaz") {
    heatNeed = 10;
    heatText =
      "Régi gázkazán → magasabb fogyasztás, érdemes korszerűsíteni (ha már a hőszigetelés rendben).";
  } else if (heating === "kondenzacios") {
    heatNeed = 4;
    heatText =
      "Kondenzációs kazán → közepesen jó, a hőszigetelés sokat javít a költségen.";
  } else if (heating === "hoszivattyu") {
    heatNeed = 1;
    heatText =
      "Hőszivattyú → jó irány, de akkor a szigetelés/légzárás különösen fontos.";
  }

  // súlyozás: födém általában nagyon megéri → nagyobb súly
  const scoreWall = wallNeed * 1.0;
  const scoreRoof = roofNeed * 1.2;
  const scoreHeat = heatNeed * 1.0;

  const items = [
    {
      key: "Födém/padlás szigetelés",
      score: scoreRoof,
      note:
        roofIns < 15
          ? "A födém gyakran a leggyorsabban megtérülő lépés."
          : "Födém rendben vagy közel rendben.",
    },
    {
      key: "Fal hőszigetelés",
      score: scoreWall,
      note:
        wallIns < 10
          ? "5–10 cm alatt sokat veszítesz. 15 cm körül már jó."
          : "Fal szigetelés közepes/jó.",
    },
    { key: "Fűtési rendszer", score: scoreHeat, note: heatText },
  ].sort((a, b) => b.score - a.score);

  // javaslatok
  const recWall =
    wallIns < 10
      ? "Javaslat: falra 12–15 cm (anyag+falazat függő)."
      : wallIns < 15
      ? "Javaslat: falon 15 cm körüli szint már jó kompromisszum."
      : "Fal: jó szint (15 cm+).";

  const recRoof =
    roofIns < 10
      ? "Javaslat: födém/padlás 20–30 cm (gyakran a legjobb megtérülés)."
      : roofIns < 20
      ? "Javaslat: födém/padlás legalább 20–25 cm."
      : "Födém: jó szint (20–25 cm+).";

  // nagyon durva energiaigény becslés (kWh ekvivalens) – csak szemléltetés
  const baseKwh = area * 140;

  const factor =
    (wallIns < 10 ? 1.0 : wallIns < 15 ? 0.92 : 0.88) *
    (roofIns < 10 ? 1.0 : roofIns < 20 ? 0.9 : 0.85) *
    (heating === "gaz" ? 1.0 : heating === "kondenzacios" ? 0.93 : 0.85);

  const estKwh = Math.round(baseKwh * factor);
  const estSavePct = Math.max(0, Math.round((1 - factor) * 100));

  // ✅ éves megtakarítás becslés Ft-ban
  const estimatedAnnualSaving = Math.round(annualCost * (estSavePct / 100));

  // ✅ nagyon durva beruházási becslés (csak irány!)
  // (ezeket később csomag/anyag/ár alapján finomítjuk)
  const estRoofCost = area * 12000; // Ft/m²
  const estWallCost = area * 20000; // Ft/m²

  const roofPaybackYears =
    estimatedAnnualSaving > 0
      ? Math.round(estRoofCost / estimatedAnnualSaving)
      : null;

  const wallPaybackYears =
    estimatedAnnualSaving > 0
      ? Math.round(estWallCost / estimatedAnnualSaving)
      : null;

  const money = (n) => (Number.isFinite(n) ? n.toLocaleString("hu-HU") : "-");

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
          <li>Födém szigetelés becsült költség: ~${money(estRoofCost)} Ft → megtérülés: ${
            roofPaybackYears === null ? "-" : `${roofPaybackYears} év`
          }</li>
          <li>Fal szigetelés becsült költség: ~${money(estWallCost)} Ft → megtérülés: ${
            wallPaybackYears === null ? "-" : `${wallPaybackYears} év`
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
