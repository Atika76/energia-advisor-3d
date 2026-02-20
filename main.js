/* Energia Advisor 3D – C verzió (valósabb fizikai becslés)
   Modell:
   - Transzmissziós veszteség: H = Σ(U*A)
   - Szellőzés/infiltráció: H_vent = 0.33 * n * V
   - Éves hőigény: Q = (H + H_vent) * HDD * 24 / 1000  (kWh/év)
   - Költség: gáz: Q/η * ár; hőszivattyú: Q/SCOP * ár

   Fontos: a "MOST fűtési költség" a bázis, abból kalibrálunk vissza "MOST hőigényt",
   így a felhasználó valós számaira támaszkodunk.
*/

(function () {
  // ---------- NAV ----------
  const views = {
    home: document.getElementById("viewHome"),
    calc: document.getElementById("viewCalc"),
    v3d: document.getElementById("view3d"),
    docs: document.getElementById("viewDocs"),
  };
  const btnHome = document.getElementById("btnHome");
  const btnCalc = document.getElementById("btnCalc");
  const btn3d = document.getElementById("btn3d");
  const btnDocs = document.getElementById("btnDocs");

  function setActive(tab) {
    // buttons
    [btnHome, btnCalc, btn3d, btnDocs].forEach(b => b.classList.remove("active"));
    // views
    Object.values(views).forEach(v => (v.style.display = "none"));

    if (tab === "home") { btnHome.classList.add("active"); views.home.style.display = ""; }
    if (tab === "calc") { btnCalc.classList.add("active"); views.calc.style.display = ""; }
    if (tab === "v3d") { btn3d.classList.add("active"); views.v3d.style.display = ""; }
    if (tab === "docs") { btnDocs.classList.add("active"); views.docs.style.display = ""; }
  }
  btnHome.addEventListener("click", () => setActive("home"));
  btnCalc.addEventListener("click", () => setActive("calc"));
  btn3d.addEventListener("click", () => setActive("v3d"));
  btnDocs.addEventListener("click", () => setActive("docs"));
  setActive("calc");

  // ---------- HELPERS ----------
  const $ = (id) => document.getElementById(id);

  const fmtFt = (n) => {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("hu-HU") + " Ft";
  };
  const fmtFtYr = (n) => `${fmtFt(n)}/év`;
  const fmtFtMo = (n) => `${fmtFt(n)}/hó`;
  const fmtKwh = (n) => {
    if (!isFinite(n)) return "—";
    return Math.round(n).toLocaleString("hu-HU") + " kWh/év";
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function readNum(id) {
    const v = parseFloat($(id).value);
    return isFinite(v) ? v : 0;
  }
  function readStr(id) {
    return ($(id).value || "").toString();
  }

  // ---------- MATERIALS ----------
  const lambda = {
    eps: 0.039,
    rockwool: 0.037,
    xps: 0.034
  };

  // Tipikus kiinduló U értékek szigeteletlen falra (nagyon durva, átlagos magyar régi)
  const baseUWall = {
    brick: 1.25,
    adobe: 1.05,
    concrete: 1.70
  };

  // Tipikus kiinduló U értékek szigeteletlen födémre/padlásra és padlóra
  const baseURoof = 1.60;  // padlásfödém szigeteletlen
  const baseUFloor = 1.10; // talajon fekvő padló szigeteletlen
  const baseUWindow = 2.60; // régi/átlagos vegyes ablak (ha nincs adat)

  // Belső/külső felületi ellenállások (m²K/W) – tipikus
  const Rsi = 0.13;
  const Rse = 0.04;

  // Hőhíd korrekció: H_total = H * (1 + bridge%)
  function applyBridge(H, bridgePercent) {
    return H * (1 + clamp(bridgePercent, 0, 25) / 100);
  }

  // U számítás: a kiinduló U0 alapján visszafejtjük a "szerkezet R"-t, és hozzáadjuk az ins R-t
  function U_after_insulation(U0, insCm, matKey) {
    const insM = Math.max(0, insCm) / 100;
    const lam = lambda[matKey] || lambda.eps;

    // U0 = 1 / (Rsi + R_struct + Rse)
    // => R_struct = 1/U0 - Rsi - Rse
    const R_struct = Math.max(0.001, (1 / U0) - Rsi - Rse);
    const R_ins = insM > 0 ? (insM / lam) : 0;

    const R_total = Rsi + R_struct + R_ins + Rse;
    return 1 / R_total;
  }

  // ---------- GEOMETRY APPROX ----------
  // Szigorúan pontos felületekhez alaprajz kell. Itt "négyzet alapú" becslést adunk:
  // Alapterület A -> oldal = sqrt(A) -> kerület = 4*oldal
  // Fal felület = kerület * belmagasság * szintek
  // Ablak felület = fal felület * (winRatio/100)
  // Tető/födém felület ~ alapterület (felső födém)
  // Padló felület ~ alapterület (talaj felé)
  function estimateAreas(areaFloor, storeys, height, winRatioPercent) {
    const A = Math.max(20, areaFloor);
    const s = Math.sqrt(A);
    const perimeter = 4 * s;

    const wallGross = perimeter * height * storeys; // m²
    const winRatio = clamp(winRatioPercent, 5, 35) / 100;
    const Awin = wallGross * winRatio;
    const AwallNet = Math.max(0, wallGross - Awin);

    // Felső födém felülete: egyszerűsítés
    const Aroof = A; // m²
    const Afloor = A; // m²

    const V = A * height * storeys; // m³

    return { AwallNet, Awin, Aroof, Afloor, V, wallGross };
  }

  // ---------- HEATING SYSTEM COST ----------
  function systemParams(type, scop) {
    // type: gas_old, gas_cond, hp
    if (type === "gas_old") return { kind: "gas", eff: 0.75, label: "Régi gázkazán" };
    if (type === "gas_cond") return { kind: "gas", eff: 0.92, label: "Kondenzációs gázkazán" };
    return { kind: "el", scop: clamp(scop, 2.2, 5.0), label: "Hőszivattyú" };
  }

  function costFromQ(Q_kwh, heatingType, scop, priceGas, priceEl) {
    const p = systemParams(heatingType, scop);
    if (p.kind === "gas") {
      // gáz: hőigény / hatásfok * gázár
      return (Q_kwh / p.eff) * priceGas;
    }
    // villany: hőigény / SCOP * villanyár
    return (Q_kwh / p.scop) * priceEl;
  }

  // ---------- CORE MODEL ----------
  function computeState(state) {
    // state: {area, storeys, height, wallType, winRatio, nAir, wallInsCm, wallMat, roofInsCm, roofMat, floorInsCm, floorMat, heatingType, scop, hdd, priceGas, priceEl, bridge}
    const areas = estimateAreas(state.area, state.storeys, state.height, state.winRatio);

    // U-k
    const Uw = U_after_insulation(baseUWall[state.wallType] || baseUWall.brick, state.wallInsCm, state.wallMat);
    const Ur = U_after_insulation(baseURoof, state.roofInsCm, state.roofMat);
    const Uf = U_after_insulation(baseUFloor, state.floorInsCm, state.floorMat);
    const Uwin = baseUWindow;

    // H transzmisszió (W/K)
    let H = 0;
    H += Uw * areas.AwallNet;
    H += Ur * areas.Aroof;
    H += Uf * areas.Afloor;
    H += Uwin * areas.Awin;

    // Hőhíd korrekció
    H = applyBridge(H, state.bridge);

    // Szellőzés/infiltráció (W/K)
    const n = clamp(state.nAir, 0.2, 1.2);
    const Hvent = 0.33 * n * areas.V;

    // Összes hőveszteségi tényező
    const Htot = H + Hvent;

    // Éves hőigény (kWh/év)
    const HDD = clamp(state.hdd, 1800, 4500);
    const Q = Htot * HDD * 24 / 1000;

    // Költség (Ft/év)
    const cost = costFromQ(Q, state.heatingType, state.scop, state.priceGas, state.priceEl);

    return {
      areas, Uw, Ur, Uf, Uwin,
      H_trans: H,
      H_vent: Hvent,
      H_total: Htot,
      Q_kwh: Q,
      costFt: cost
    };
  }

  // Kalibráció: a MOST megadott Ft/év alapján visszaszámoljuk a "MOST hőigény skálát"
  // Azaz: ha a modell szerint MOST costModel = X, de a valós MOST = annualCostNow,
  // akkor scale = annualCostNow / X.
  // Ezt a skálát rászorzunk a kWh igényre és a cél költségre is (hogy a bázis “valós” legyen).
  function calibrate(nowModelCost, annualCostNow) {
    const eps = 1e-6;
    if (!isFinite(nowModelCost) || nowModelCost < eps) return 1.0;
    const a = Math.max(0, annualCostNow);
    const s = a / nowModelCost;
    return clamp(s, 0.3, 3.0); // ne szaladjon el (pl. extrém árazás miatt)
  }

  // “Csak X” összehasonlítás (fal / födém / padló / fűtés) – mindet a MOST állapothoz képest
  function computeOnlyVariants(nowState, targetState) {
    const variants = [];

    // only wall
    {
      const s = { ...nowState, wallInsCm: targetState.wallInsCm, wallMat: targetState.wallMat };
      variants.push({ key: "Fal", state: s });
    }
    // only roof
    {
      const s = { ...nowState, roofInsCm: targetState.roofInsCm, roofMat: targetState.roofMat };
      variants.push({ key: "Födém/padlás", state: s });
    }
    // only floor
    {
      const s = { ...nowState, floorInsCm: targetState.floorInsCm, floorMat: targetState.floorMat };
      variants.push({ key: "Padló/aljzat", state: s });
    }
    // only heating
    {
      const s = { ...nowState, heatingType: targetState.heatingType, scop: targetState.scop };
      variants.push({ key: "Fűtés", state: s });
    }

    return variants;
  }

  // Beruházás becslés (nagyon durva):
  // fajlagos Ft/m² @10cm × (delta_cm/10) × felület
  function investmentEstimate(nowState, targetState, areas, unitCosts) {
    const deltaWall = Math.max(0, targetState.wallInsCm - nowState.wallInsCm);
    const deltaRoof = Math.max(0, targetState.roofInsCm - nowState.roofInsCm);
    const deltaFloor = Math.max(0, targetState.floorInsCm - nowState.floorInsCm);

    const wallInv = (unitCosts.wallM2 * (deltaWall / 10)) * areas.AwallNet;
    const roofInv = (unitCosts.roofM2 * (deltaRoof / 10)) * areas.Aroof;
    const floorInv = (unitCosts.floorM2 * (deltaFloor / 10)) * areas.Afloor;

    const heatingInv = (nowState.heatingType !== targetState.heatingType) ? unitCosts.heating : 0;

    return { wallInv, roofInv, floorInv, heatingInv };
  }

  function paybackYears(investmentFt, annualSavingFt) {
    if (!isFinite(investmentFt) || investmentFt <= 0) return null;
    if (!isFinite(annualSavingFt) || annualSavingFt <= 0) return null;
    const y = investmentFt / annualSavingFt;
    if (!isFinite(y) || y > 300) return 300;
    return y;
  }

  // ---------- UI / RUN ----------
  const resultBox = $("resultBox");
  const btnCalcRun = $("btnCalcRun");
  const btnReset = $("btnReset");

  btnCalcRun.addEventListener("click", run);
  btnReset.addEventListener("click", () => {
    // alapok
    $("area").value = 100;
    $("storeys").value = "1";
    $("height").value = 2.6;
    $("wallType").value = "brick";
    $("winRatio").value = 18;
    $("nAir").value = 0.6;

    $("wallInsNow").value = 0;
    $("wallInsMat").value = "eps";
    $("roofInsNow").value = 0;
    $("roofInsMat").value = "rockwool";
    $("floorInsNow").value = 0;
    $("floorInsMat").value = "xps";

    $("heatingNow").value = "gas_old";
    $("scopNow").value = 3.2;
    $("annualCostNow").value = 600000;

    $("wallInsTarget").value = 15;
    $("roofInsTarget").value = 25;
    $("floorInsTarget").value = 10;
    $("heatingTarget").value = "hp";
    $("scopTarget").value = 3.6;

    $("hdd").value = 3000;
    $("priceGas").value = 40;
    $("priceEl").value = 70;

    $("bridge").value = 10;
    $("costWallM2").value = 18000;
    $("costRoofM2").value = 12000;
    $("costFloorM2").value = 15000;
    $("costHeating").value = 3500000;

    run();
  });

  function gatherStates() {
    const common = {
      area: readNum("area"),
      storeys: parseInt(readStr("storeys"), 10) || 1,
      height: readNum("height"),
      wallType: readStr("wallType"),
      winRatio: readNum("winRatio"),
      nAir: readNum("nAir"),
      hdd: readNum("hdd"),
      priceGas: readNum("priceGas"),
      priceEl: readNum("priceEl"),
      bridge: readNum("bridge"),

      // anyagok (célban is ezekkel számolunk, mert a user külön választ most is)
      wallMat: readStr("wallInsMat"),
      roofMat: readStr("roofInsMat"),
      floorMat: readStr("floorInsMat"),
    };

    const now = {
      ...common,
      wallInsCm: readNum("wallInsNow"),
      roofInsCm: readNum("roofInsNow"),
      floorInsCm: readNum("floorInsNow"),
      heatingType: readStr("heatingNow"),
      scop: readNum("scopNow")
    };

    const target = {
      ...common,
      wallInsCm: readNum("wallInsTarget"),
      roofInsCm: readNum("roofInsTarget"),
      floorInsCm: readNum("floorInsTarget"),
      heatingType: readStr("heatingTarget"),
      scop: readNum("scopTarget")
    };

    const annualCostNow = readNum("annualCostNow");

    const unitCosts = {
      wallM2: readNum("costWallM2"),
      roofM2: readNum("costRoofM2"),
      floorM2: readNum("costFloorM2"),
      heating: readNum("costHeating")
    };

    // sanity clamps
    now.wallInsCm = clamp(now.wallInsCm, 0, 30);
    now.roofInsCm = clamp(now.roofInsCm, 0, 60);
    now.floorInsCm = clamp(now.floorInsCm, 0, 20);

    target.wallInsCm = clamp(target.wallInsCm, 0, 30);
    target.roofInsCm = clamp(target.roofInsCm, 0, 60);
    target.floorInsCm = clamp(target.floorInsCm, 0, 20);

    return { now, target, annualCostNow, unitCosts };
  }

  function run() {
    const { now, target, annualCostNow, unitCosts } = gatherStates();

    // Modell-számítás (nyers)
    const nowRaw = computeState(now);
    const targetRaw = computeState(target);

    // Kalibráció a "MOST költséghez"
    const scale = calibrate(nowRaw.costFt, annualCostNow);

    const nowCost = annualCostNow; // ezt tekintjük igaznak
    const nowQ = nowRaw.Q_kwh * scale;

    const targetCost = targetRaw.costFt * scale;
    const targetQ = targetRaw.Q_kwh * scale;

    const saving = Math.max(0, nowCost - targetCost);
    const savingMo = saving / 12;

    // Javulás (hőigény arány)
    const improvePct = (nowQ > 0) ? (1 - (targetQ / nowQ)) * 100 : 0;

    // “Csak X” összehasonlítás (kalibrált)
    const variants = computeOnlyVariants(now, target);
    const variantRows = variants.map(v => {
      const raw = computeState(v.state);
      const c = raw.costFt * scale;
      const s = Math.max(0, nowCost - c);
      return { name: v.key, cost: c, saving: s };
    });

    // Prioritás Ft/év szerint
    const sorted = [...variantRows].sort((a, b) => b.saving - a.saving);

    // Beruházás + megtérülés elemként
    const inv = investmentEstimate(now, target, nowRaw.areas, unitCosts);

    const payWall = paybackYears(inv.wallInv, variantRows.find(x=>x.name==="Fal")?.saving || 0);
    const payRoof = paybackYears(inv.roofInv, variantRows.find(x=>x.name==="Födém/padlás")?.saving || 0);
    const payFloor = paybackYears(inv.floorInv, variantRows.find(x=>x.name==="Padló/aljzat")?.saving || 0);
    const payHeat = paybackYears(inv.heatingInv, variantRows.find(x=>x.name==="Fűtés")?.saving || 0);

    // Szöveges magyarázat: mi történt
    const heatNowLabel = systemParams(now.heatingType, now.scop).label;
    const heatTarLabel = systemParams(target.heatingType, target.scop).label;

    // KPI blokkok
    const kpiHtml = `
      <div class="kpi">
        <div class="box">
          <span>MOST (Ft/év)</span>
          <b>${fmtFt(nowCost)}</b>
          <span class="mono">${fmtFtMo(nowCost/12)}</span>
        </div>
        <div class="box">
          <span>CÉL (Ft/év)</span>
          <b>${fmtFt(targetCost)}</b>
          <span class="mono">${fmtFtMo(targetCost/12)}</span>
        </div>
        <div class="box">
          <span>Különbség (Ft/év)</span>
          <b>${fmtFt(saving)}</b>
          <span class="mono">${fmtFtMo(savingMo)}</span>
        </div>
        <div class="box">
          <span>Javulás (hőigény)</span>
          <b>${isFinite(improvePct) ? (improvePct.toFixed(1) + "%") : "—"}</b>
          <span class="mono">${fmtKwh(nowQ)} → ${fmtKwh(targetQ)}</span>
        </div>
      </div>
    `;

    const assumptionsHtml = `
      <div class="sectionTitle">Mi alapján számol?</div>
      <ul>
        <li><b>Felület-becslés:</b> négyzet alaprajz (alapterületből), fal felület = kerület × belmagasság × szintek</li>
        <li><b>Transzmisszió:</b> H = Σ(U·A) (fal, ablak, födém, padló)</li>
        <li><b>Szellőzés:</b> H<sub>vent</sub> = 0,33 · n · V</li>
        <li><b>Éves hőigény:</b> Q = (H+Hvent) · HDD · 24 / 1000</li>
        <li><b>Kalibráció:</b> a te megadott <b>MOST Ft/év</b> értékedhez igazítjuk a modellt (hogy a bázis “valós” legyen)</li>
      </ul>
      <div class="help">
        <b>Megjegyzés:</b> Ha a ház formája nem négyzet, vagy nagyon sok/kevés az ablak, a valós felületek eltérhetnek.
        Később be tudunk tenni “alaprajz arányt” (pl. 1:1, 1:1.5, 1:2) vagy kézi kerületet is.
      </div>
    `;

    const stateHtml = `
      <div class="hr"></div>
      <div class="sectionTitle">Jelenlegi → Cél (összefoglaló)</div>
      <ul>
        <li><b>Fal:</b> ${now.wallInsCm} cm → ${target.wallInsCm} cm (${readStr("wallInsMat").toUpperCase()})</li>
        <li><b>Födém/padlás:</b> ${now.roofInsCm} cm → ${target.roofInsCm} cm (${readStr("roofInsMat").toUpperCase()})</li>
        <li><b>Padló/aljzat:</b> ${now.floorInsCm} cm → ${target.floorInsCm} cm (${readStr("floorInsMat").toUpperCase()})</li>
        <li><b>Fűtés:</b> ${heatNowLabel} → ${heatTarLabel}</li>
        <li><b>HDD:</b> ${Math.round(now.hdd)} • <b>Légcsere:</b> ${now.nAir.toFixed(2)} 1/h • <b>Ablakarány:</b> ${now.winRatio}%</li>
      </ul>
    `;

    const priorityHtml = `
      <div class="hr"></div>
      <div class="sectionTitle">“Csak X” összehasonlítás (Ft/év megtakarítás a MOST-hoz képest)</div>
      <ul>
        ${sorted.map(x => `<li><b>${x.name}:</b> ${fmtFtYr(x.saving)}</li>`).join("")}
      </ul>
      <div class="help">Ez segít dönteni: melyik lépés adja a legtöbb Ft/év hatást önmagában.</div>
    `;

    const investHtml = `
      <div class="hr"></div>
      <div class="sectionTitle">Beruházás + megtérülés (irány, állítható)</div>
      <ul>
        <li><b>Födém:</b> ${fmtFt(inv.roofInv)} → megtérülés: ${payRoof ? (payRoof.toFixed(1) + " év") : "—"}</li>
        <li><b>Fal:</b> ${fmtFt(inv.wallInv)} → megtérülés: ${payWall ? (payWall.toFixed(1) + " év") : "—"}</li>
        <li><b>Padló:</b> ${fmtFt(inv.floorInv)} → megtérülés: ${payFloor ? (payFloor.toFixed(1) + " év") : "—"}</li>
        <li><b>Fűtés:</b> ${fmtFt(inv.heatingInv)} → megtérülés: ${payHeat ? (payHeat.toFixed(1) + " év") : "—"}</li>
      </ul>
      <div class="help">
        A megtérülés attól függ, milyen áron csináljátok meg. A “Haladó” résznél a fajlagos Ft/m² és a fűtés ára állítható.
      </div>
    `;

    const techHtml = `
      <div class="hr"></div>
      <div class="sectionTitle">Technikai számok (ellenőrzéshez)</div>
      <div class="mono muted">
        Felületek (becslés): fal nettó ${nowRaw.areas.AwallNet.toFixed(0)} m² • ablak ${nowRaw.areas.Awin.toFixed(0)} m² • födém ${nowRaw.areas.Aroof.toFixed(0)} m² • padló ${nowRaw.areas.Afloor.toFixed(0)} m² • térfogat ${nowRaw.areas.V.toFixed(0)} m³<br/>
        U-értékek MOST: fal ${nowRaw.Uw.toFixed(2)} • födém ${nowRaw.Ur.toFixed(2)} • padló ${nowRaw.Uf.toFixed(2)} • ablak ${nowRaw.Uwin.toFixed(2)} (W/m²K)<br/>
        U-értékek CÉL: fal ${targetRaw.Uw.toFixed(2)} • födém ${targetRaw.Ur.toFixed(2)} • padló ${targetRaw.Uf.toFixed(2)} • ablak ${targetRaw.Uwin.toFixed(2)} (W/m²K)<br/>
        H (W/K) MOST: transz ${nowRaw.H_trans.toFixed(0)} + vent ${nowRaw.H_vent.toFixed(0)} = ${nowRaw.H_total.toFixed(0)}<br/>
        H (W/K) CÉL: transz ${targetRaw.H_trans.toFixed(0)} + vent ${targetRaw.H_vent.toFixed(0)} = ${targetRaw.H_total.toFixed(0)}<br/>
        Kalibrációs szorzó: ${scale.toFixed(2)} (MOST Ft/év alapján)
      </div>
    `;

    resultBox.innerHTML = `
      <div class="sectionTitle">Eredmény</div>
      ${kpiHtml}
      ${stateHtml}
      ${priorityHtml}
      ${investHtml}
      ${assumptionsHtml}
      ${techHtml}
    `;
  }

  // induláskor számol
  run();
})();
