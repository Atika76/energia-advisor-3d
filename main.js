// ===== NAV + VIEW KEZELÉS =====
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
  views[which].classList.remove("hidden");
  btns[which].classList.add("active");
}

btns.home?.addEventListener("click", () => show("home"));
btns.calc?.addEventListener("click", () => show("calc"));
btns.d3?.addEventListener("click", () => show("d3"));
btns.docs?.addEventListener("click", () => show("docs"));
show("home");

// ===== SEGÉD =====
const money = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("hu-HU") : "-");
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

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
  if (type === "kondenzacios") return 0.92;
  if (type === "hoszivattyu") return 0.82;
  return 1.0; // régi gázkazán
}

// Kombinált "veszteségfaktor" – MVP súlyok
function combinedFactor(wallCm, roofCm, heatType) {
  const wf = wallFactor(wallCm);
  const rf = roofFactor(roofCm);
  const hf = heatingFactor(heatType);
  // súly: födém 45%, fal 35%, fűtés 20%
  return wf * 0.35 + rf * 0.45 + hf * 0.20;
}

function heatLabel(v) {
  if (v === "kondenzacios") return "Kondenzációs kazán";
  if (v === "hoszivattyu") return "Hőszivattyú";
  return "Régi gázkazán";
}

// ===== KALKULÁTOR – B LOGIKA (JELENLEGI vs CÉL) =====
let lastHeatingInvestFt = null;

window.calculateEnergyB = function calculateEnergyB() {
  const area = Number(document.getElementById("area")?.value || 0);
  const annualCostNowInput = Number(document.getElementById("annualCost")?.value || 0);

  const wallNow = Number(document.getElementById("wallNow")?.value || 0);
  const roofNow = Number(document.getElementById("roofNow")?.value || 0);
  const heatNow = String(document.getElementById("heatNow")?.value || "gaz");

  const wallTarget = Number(document.getElementById("wallTarget")?.value || 0);
  const roofTarget = Number(document.getElementById("roofTarget")?.value || 0);
  const heatTarget = String(document.getElementById("heatTarget")?.value || "gaz");

  const box = document.getElementById("resultBox");
  if (!box) return;

  // --- validálás ---
  if (area <= 0) {
    box.innerHTML = `<b>Hiba:</b> Add meg az alapterületet (m²).`;
    return;
  }
  if (annualCostNowInput < 0) {
    box.innerHTML = `<b>Hiba:</b> Az éves fűtési költség nem lehet negatív.`;
    return;
  }
  if ([wallNow, roofNow, wallTarget, roofTarget].some(v => v < 0)) {
    box.innerHTML = `<b>Hiba:</b> A szigetelés vastagság nem lehet negatív.`;
    return;
  }

  // --- faktorok ---
  const nowF = combinedFactor(wallNow, roofNow, heatNow);
  const targetF = combinedFactor(wallTarget, roofTarget, heatTarget);

  // Ha a cél nem jobb (vagy rosszabb)
  if (targetF >= nowF) {
    box.innerHTML = `
      <div style="padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">
        <b>Figyelem:</b> A célállapot így nem jobb a jelenleginél.
        <div style="margin-top:8px;color:rgba(255,255,255,.75);font-size:13px;">
          Tipp: növeld a cél szigetelés értéket vagy válassz hatékonyabb fűtést.
        </div>
      </div>
    `;
    return;
  }

  // --- MOST → CÉL költség becslés ---
  // Logika: a MOST éves költség a "nowF" állapothoz tartozik.
  // A CÉL költség arányosan csökken: annualCostTarget ≈ annualCostNow * (targetF / nowF)
  const annualCostNow = annualCostNowInput;
  const annualCostTarget = annualCostNow * (targetF / nowF);

  const annualSavingTotal = annualCostNow - annualCostTarget;
  const monthlySavingTotal = annualSavingTotal / 12;

  // "javulás %" – emberi kijelzés
  let improvePct = Math.round((annualSavingTotal / Math.max(annualCostNow, 1)) * 100);
  improvePct = clamp(improvePct, 1, 70);

  // --- Beruházási irányárak (MVP) ---
  // (később ezt szétszedjük anyag+munkadíjra, falazattípusra, állványra, stb.)
  const roofInvest = area * 12000; // Ft/m² (irány)
  const wallInvest = area * 20000; // Ft/m² (irány)

  const roofUpgrade = roofTarget > roofNow;
  const wallUpgrade = wallTarget > wallNow;
  const heatUpgrade = heatTarget !== heatNow;

  // --- Egyenkénti (csak X) megtakarítás számítása ---
  function savingIfOnly(changeWhat) {
    const w = changeWhat === "wall" ? wallTarget : wallNow;
    const r = changeWhat === "roof" ? roofTarget : roofNow;
    const h = changeWhat === "heat" ? heatTarget : heatNow;

    const f = combinedFactor(w, r, h);
    // költség ≈ annualCostNow * (f / nowF)
    const cost = annualCostNow * (f / nowF);
    return annualCostNow - cost;
  }

  const saveOnlyWall = wallUpgrade ? savingIfOnly("wall") : 0;
  const saveOnlyRoof = roofUpgrade ? savingIfOnly("roof") : 0;
  const saveOnlyHeat = heatUpgrade ? savingIfOnly("heat") : 0;

  // --- Megtérülés (év) ---
  const paybackYears = (investFt, annualSavingFt) => {
    if (!(annualSavingFt > 0)) return null;
    return Math.round(investFt / annualSavingFt);
  };

  const pbRoof = roofUpgrade ? paybackYears(roofInvest, saveOnlyRoof) : null;
  const pbWall = wallUpgrade ? paybackYears(wallInvest, saveOnlyWall) : null;

  // Fűtés beruházás: kérjük be, hogy ne legyen kamu szám
  let pbHeat = null;
  let heatInvest = null;

  if (heatUpgrade) {
    // ha még nincs megadva, rákérdezünk (csak akkor zavarjuk ezzel, ha tényleg vált fűtést)
    if (lastHeatingInvestFt === null) {
      const def = heatTarget === "hoszivattyu" ? 3500000 : 1200000; // csak alap javaslat a promptban
      const ans = prompt(
        "Fűtés csere becsült beruházási költsége (Ft)\n(Példa: 1200000 vagy 3500000)\nHa nem akarsz megadni, hagyd üresen.",
        String(def)
      );
      if (ans !== null && ans.trim() !== "") {
        const v = Number(ans.replace(/\s/g, ""));
        if (Number.isFinite(v) && v > 0) lastHeatingInvestFt = v;
      }
    }

    if (lastHeatingInvestFt !== null) {
      heatInvest = lastHeatingInvestFt;
      pbHeat = paybackYears(heatInvest, saveOnlyHeat);
    }
  }

  // --- Prioritás (valódi “érthető”): melyik adja a legtöbb Ft/év megtakarítást ---
  const prioList = [
    { name: "Födém/padlás", saving: saveOnlyRoof, enabled: roofUpgrade },
    { name: "Fal", saving: saveOnlyWall, enabled: wallUpgrade },
    { name: "Fűtés", saving: saveOnlyHeat, enabled: heatUpgrade },
  ]
    .filter(x => x.enabled)
    .sort((a, b) => b.saving - a.saving);

  const prioHtml = prioList.length
    ? `<ol style="margin:8px 0 0 18px;">
        ${prioList.map(p => `<li><b>${p.name}</b> – ~${money(p.saving)} Ft/év megtakarítás</li>`).join("")}
      </ol>`
    : `<div style="margin-top:6px;color:rgba(255,255,255,.75);">Nincs megadva fejlesztés (a cél állapot megegyezik a jelenlegivel).</div>`;

  // --- Magyarázó szöveg (tulajnak) ---
  const explainLine = `
    <div style="margin-top:8px;color:rgba(255,255,255,.8);">
      <b>Magyarázat:</b> A “MOST” költségedet tekintjük alapnak, és megnézzük,
      hogy a megadott <b>CÉL állapot</b> arányosan mennyivel csökkenti a hőveszteséget.
      Ez <b>durva irány</b>, de viszonyításnak érthető.
    </div>
  `;

  // --- Kimenet ---
  box.innerHTML = `
    <div style="display:grid; gap:12px;">

      <div style="padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">
        <div><b>Jelenlegi → Cél</b></div>
        <ul style="margin:8px 0 0 18px;">
          <li>Fal: ${wallNow} cm → ${wallTarget} cm</li>
          <li>Födém: ${roofNow} cm → ${roofTarget} cm</li>
          <li>Fűtés: ${heatLabel(heatNow)} → ${heatLabel(heatTarget)}</li>
        </ul>
      </div>

      <div style="padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">
        <div><b>MOST (becslés):</b> ~${money(annualCostNow)} Ft/év • ~${money(annualCostNow/12)} Ft/hó</div>
        <div><b>CÉL (becslés):</b> ~${money(annualCostTarget)} Ft/év • ~${money(annualCostTarget/12)} Ft/hó</div>
        <div style="margin-top:6px;"><b>Különbség:</b> ~${money(annualSavingTotal)} Ft/év • ~${money(monthlySavingTotal)} Ft/hó</div>
        <div style="margin-top:6px;"><b>Javulás (irány):</b> ~${improvePct}%</div>
        ${explainLine}
      </div>

      <div style="padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">
        <div><b>Prioritás (Ft/év alapján):</b></div>
        ${prioHtml}
      </div>

      <div style="padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">
        <div><b>“Csak X” összehasonlítás (érthető döntéshez)</b></div>
        <ul style="margin:8px 0 0 18px;">
          <li><b>Csak födém:</b> ${roofUpgrade ? `~${money(saveOnlyRoof)} Ft/év` : `nincs emelés megadva`}</li>
          <li><b>Csak fal:</b> ${wallUpgrade ? `~${money(saveOnlyWall)} Ft/év` : `nincs emelés megadva`}</li>
          <li><b>Csak fűtés:</b> ${heatUpgrade ? `~${money(saveOnlyHeat)} Ft/év` : `nincs csere megadva`}</li>
        </ul>
      </div>

      <div style="padding:12px;border:1px solid rgba(255,255,255,.15);border-radius:12px;">
        <div><b>Megtérülés (irány, külön elemenként)</b></div>
        <ul style="margin:8px 0 0 18px;">
          <li><b>Födém:</b> ${
            roofUpgrade
              ? `~${money(roofInvest)} Ft beruházás → ~${pbRoof ?? "-"} év`
              : "nincs fejlesztés megadva"
          }</li>
          <li><b>Fal:</b> ${
            wallUpgrade
              ? `~${money(wallInvest)} Ft beruházás → ~${pbWall ?? "-"} év`
              : "nincs fejlesztés megadva"
          }</li>
          <li><b>Fűtés:</b> ${
            heatUpgrade
              ? (heatInvest
                  ? `~${money(heatInvest)} Ft (megadva) → ~${pbHeat ?? "-"} év`
                  : `beruházási összeg nincs megadva (Elemzésnél megadhatod).`
                )
              : "nincs fejlesztés megadva"
          }</li>
        </ul>
        <div style="margin-top:8px;color:rgba(255,255,255,.65);font-size:12px;">
          Megjegyzés: MVP irányérték. Valós költségek anyag+munkadíj, helyszín, falazat, állapot alapján változnak.
        </div>
      </div>

    </div>
  `;
};
