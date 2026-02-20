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

btns.home.addEventListener("click", () => show("home"));
btns.calc.addEventListener("click", () => show("calc"));
btns.d3.addEventListener("click", () => show("d3"));
btns.docs.addEventListener("click", () => show("docs"));

show("home");

const money = (n) => (Number.isFinite(n) ? n.toLocaleString("hu-HU") : "-");
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
  return 1.0;
}

function combinedFactor(wallCm, roofCm, heatType) {
  const wf = wallFactor(wallCm);
  const rf = roofFactor(roofCm);
  const hf = heatingFactor(heatType);
  return wf * 0.35 + rf * 0.45 + hf * 0.20;
}

/**
 * B logika:
 * - kiszámoljuk a "most" és a "cél" combined faktort
 * - a különbség adja a javulást
 * - megtakarítás = éves költség * javulás%
 */
window.calculateEnergyB = function calculateEnergyB() {
  const area = Number(document.getElementById("area")?.value || 0);
  const annualCost = Number(document.getElementById("annualCost")?.value || 0);

  const wallNow = Number(document.getElementById("wallNow")?.value || 0);
  const roofNow = Number(document.getElementById("roofNow")?.value || 0);
  const heatNow = String(document.getElementById("heatNow")?.value || "gaz");

  const wallTarget = Number(document.getElementById("wallTarget")?.value || 0);
  const roofTarget = Number(document.getElementById("roofTarget")?.value || 0);
  const heatTarget = String(document.getElementById("heatTarget")?.value || "gaz");

  const box = document.getElementById("resultBox");
  if (!box) return;

  if (area <= 0) {
    box.innerHTML = `<b>Hiba:</b> add meg az alapterületet (m²).`;
    return;
  }
  if (annualCost < 0) {
    box.innerHTML = `<b>Hiba:</b> az éves fűtési költség nem lehet negatív.`;
    return;
  }
  if ([wallNow, roofNow, wallTarget, roofTarget].some(v => v < 0)) {
    box.innerHTML = `<b>Hiba:</b> a szigetelés vastagság nem lehet negatív.`;
    return;
  }

  // most vs cél faktor
  const nowF = combinedFactor(wallNow, roofNow, heatNow);
  const targetF = combinedFactor(wallTarget, roofTarget, heatTarget);

  // ha a cél rosszabb, mint a mostani
  if (targetF >= nowF) {
    box.innerHTML = `
      <div style="padding:12px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Figyelem:</b> a megadott célállapot nem jobb a jelenleginél (vagy közel azonos).
        <div style="margin-top:8px; color:rgba(255,255,255,.75); font-size:13px;">
          Tipp: növeld a cél szigetelés értékeket vagy válassz hatékonyabb fűtést.
        </div>
      </div>
    `;
    return;
  }

  // javulás %
  let improvePct = Math.round((nowF - targetF) * 100);
  improvePct = clamp(improvePct, 1, 70);

  const annualSaving = Math.round(annualCost * (improvePct / 100));

  // beruházási irányárak (MVP)
  // (később ezt külön “ár táblából” számoljuk anyag + munkadíj alapján)
  const roofCost = area * 12000; // Ft/m²
  const wallCost = area * 20000; // Ft/m²

  // csak azt számoljuk megtérülésnek, aminél tényleg van fejlesztés
  const roofUpgrade = roofTarget > roofNow;
  const wallUpgrade = wallTarget > wallNow;
  const heatUpgrade = heatTarget !== heatNow;

  // megtérülés: csak akkor, ha van megtakarítás
  const payback = (cost) => (annualSaving > 0 ? Math.round(cost / annualSaving) : null);

  const roofPay = roofUpgrade ? payback(roofCost) : null;
  const wallPay = wallUpgrade ? payback(wallCost) : null;

  // prioritás: melyik hozza a legtöbb javulást (heurisztika)
  const wallGain = wallFactor(wallNow) - wallFactor(wallTarget);
  const roofGain = roofFactor(roofNow) - roofFactor(roofTarget);
  const heatGain = heatingFactor(heatNow) - heatingFactor(heatTarget);

  const prio = [
    { k: "Födém/padlás szigetelés", s: roofGain * 1.25 },
    { k: "Fal hőszigetelés", s: wallGain * 1.0 },
    { k: "Fűtési rendszer", s: heatGain * 1.0 },
  ].sort((a, b) => b.s - a.s);

  box.innerHTML = `
    <div style="display:grid; gap:10px;">

      <div><b>Fejlesztés hatása (becslés):</b> ~${improvePct}% javulás a jelenlegihez képest (durva irányszám).</div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Jelenlegi → Cél</b>
        <ul style="margin:8px 0 0 18px;">
          <li>Fal: ${wallNow} cm → ${wallTarget} cm</li>
          <li>Födém: ${roofNow} cm → ${roofTarget} cm</li>
          <li>Fűtés: ${heatNow} → ${heatTarget}</li>
        </ul>
      </div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Megtakarítás / év:</b> ~${money(annualSaving)} Ft (éves költség: ~${money(annualCost)} Ft)
      </div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Prioritás (a megadott cél alapján):</b>
        <ol style="margin:8px 0 0 18px;">
          ${prio.map(p => `<li><b>${p.k}</b></li>`).join("")}
        </ol>
      </div>

      <div style="padding:10px; border:1px solid rgba(255,255,255,.15); border-radius:12px;">
        <b>Megtérülés (irány):</b>
        <ul style="margin:8px 0 0 18px;">
          <li>Födém: ${
            roofUpgrade
              ? `~${money(roofCost)} Ft → ~${roofPay ?? "-"} év`
              : "nincs fejlesztés megadva"
          }</li>
          <li>Fal: ${
            wallUpgrade
              ? `~${money(wallCost)} Ft → ~${wallPay ?? "-"} év`
              : "nincs fejlesztés megadva"
          }</li>
          <li>Fűtés: ${
            heatUpgrade
              ? "fejlesztés megadva (külön árazás később)"
              : "nincs fejlesztés megadva"
          }</li>
        </ul>
        <div style="margin-top:8px; color:rgba(255,255,255,.65); font-size:12px;">
          Megjegyzés: MVP irányérték. Valós költségek anyag+munkadíj, helyszín, állapot alapján változnak.
        </div>
      </div>

    </div>
  `;
};
