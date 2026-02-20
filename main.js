/* Energia Advisor 3D – Valós (C) kalkulátor
   - UA + infiltráció + HDD
   - Kalibrálás: a MOST Ft/év értéket bázisnak vesszük (hogy a modell "valós" legyen)
   + Tudástár (MVP): keresés, kategóriák, cikk lista + cikk megjelenítés
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // NAV
  const btnHome = $("btnHome");
  const btnCalc = $("btnCalc");
  const btn3d = $("btn3d");
  const btnDocs = $("btnDocs");

  const viewHome = $("viewHome");
  const viewCalc = $("viewCalc");
  const view3d = $("view3d");
  const viewDocs = $("viewDocs");

  const homeGoCalc = $("homeGoCalc");
  const homeGoDocs = $("homeGoDocs");

  function setActive(btn) {
    [btnHome, btnCalc, btn3d, btnDocs].forEach(b => b && b.classList.remove("active"));
    btn && btn.classList.add("active");
  }

  function showView(which) {
    if (viewHome) viewHome.style.display = which === "home" ? "" : "none";
    if (viewCalc) viewCalc.style.display = which === "calc" ? "" : "none";
    if (view3d) view3d.style.display = which === "3d" ? "" : "none";
    if (viewDocs) viewDocs.style.display = which === "docs" ? "" : "none";

    if (which === "home") setActive(btnHome);
    if (which === "calc") setActive(btnCalc);
    if (which === "3d") setActive(btn3d);
    if (which === "docs") setActive(btnDocs);

    // ha Tudástárra váltunk, rendereljük (ha van UI)
    if (which === "docs") {
      initDocsUI();
      renderDocs();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  btnHome && btnHome.addEventListener("click", () => { location.hash = "#home"; showView("home"); });
  btnCalc && btnCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  btn3d && btn3d.addEventListener("click", () => { location.hash = "#3d"; showView("3d"); });
  btnDocs && btnDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

  if (homeGoCalc) homeGoCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  if (homeGoDocs) homeGoDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

  function initByHash() {
    const h = (location.hash || "#home").replace("#", "");
    if (h === "calc") return showView("calc");
    if (h === "3d") return showView("3d");
    if (h === "docs") return showView("docs");
    return showView("home");
  }
  window.addEventListener("hashchange", initByHash);

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, fallback = 0) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  };

  function fmtFt(v) {
    const n = Math.round(v);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " Ft";
  }
  function fmtFtShort(v) {
    const n = Math.round(v);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }
  function fmtKwh(v) {
    const n = Math.round(v);
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " kWh/év";
  }
  function fmtPct(v) {
    return (Math.round(v * 10) / 10).toFixed(1) + "%";
  }
  function paybackYears(cost, savingPerYear) {
    if (savingPerYear <= 0) return Infinity;
    return cost / savingPerYear;
  }
  function fmtYears(y) {
    if (!Number.isFinite(y)) return "–";
    if (y > 99) return "99+ év";
    return (Math.round(y * 10) / 10).toFixed(1) + " év";
  }

  // ---------- Material lambdas (W/mK) ----------
  const LAMBDA = {
    eps: 0.037,
    rockwool: 0.039,
    xps: 0.034
  };

  // Base U-values (W/m²K) for "régi" szerkezetek (nagyon tipikus közelítés)
  // (Ezeket a szigetelés hozzáadásával javítjuk.)
  const U_BASE = {
    brick: 1.25,     // régi tégla
    adobe: 1.10,     // vályog
    concrete: 1.60,  // panel/beton
    roof: 1.60,      // födém/padlás szig nélkül
    floor: 1.10,     // aljzat/padló szig nélkül
    window: 2.60     // régi/átlag ablak
  };

  // fűtés hatásfok / COP
  const HEAT = {
    gas_old: { name: "Régi gázkazán", eff: 0.75 },  // hasznos hő / gáz energia
    gas_cond: { name: "Kondenzációs gázkazán", eff: 0.92 },
    hp: { name: "Hőszivattyú", eff: null } // COP/SCOP adja
  };

  function uWithInsulation(uBase, thicknessCm, lambda) {
    const t = Math.max(0, thicknessCm) / 100; // m
    if (t <= 0) return uBase;

    // R_total = 1/U_base + t/lambda
    const r0 = 1 / uBase;
    const rIns = t / lambda;
    const u = 1 / (r0 + rIns);
    return u;
  }

  function geometry(areaTotal, storeys, height) {
    const s = clamp(storeys, 1, 3);
    const footprint = areaTotal / s; // m²
    const side = Math.sqrt(Math.max(footprint, 1));
    const perim = 4 * side;

    const wallGross = perim * height * s;          // m²
    const roofArea = footprint;                    // m²
    const floorArea = footprint;                   // m²
    const volume = footprint * height * s;         // m³

    return { footprint, side, perim, wallGross, roofArea, floorArea, volume };
  }

  function heatLossH(Uwall, Awall, Uwin, Awin, Uroof, Aroof, Ufloor, Afloor, nAir, volume, bridgePct) {
    const Htrans = (Uwall * Awall) + (Uwin * Awin) + (Uroof * Aroof) + (Ufloor * Afloor);
    const Hvent = 0.33 * nAir * volume; // W/K (kb)
    const bridge = 1 + (bridgePct / 100);
    return { Htrans, Hvent, H: (Htrans + Hvent) * bridge };
  }

  function annualHeatDemandKWh(H_WperK, HDD) {
    // Q(kWh/év) = H(W/K) * HDD(K·nap) * 24(h/nap) / 1000(W/kW)
    return (H_WperK * HDD * 24) / 1000;
  }

  function costFromHeatDemand(QkWh, heatingType, priceGas, priceEl, scop) {
    if (heatingType === "hp") {
      const cop = clamp(scop, 2.2, 5.5);
      const elKwh = QkWh / cop;
      return elKwh * priceEl;
    } else {
      const eff = HEAT[heatingType].eff;
      const gasKwh = QkWh / eff;
      return gasKwh * priceGas;
    }
  }

  function heatDemandFromCost(costFt, heatingType, priceGas, priceEl, scop) {
    if (costFt <= 0) return 0;
    if (heatingType === "hp") {
      const cop = clamp(scop, 2.2, 5.5);
      const elKwh = costFt / Math.max(priceEl, 1e-6);
      return elKwh * cop;
    } else {
      const eff = HEAT[heatingType].eff;
      const gasKwh = costFt / Math.max(priceGas, 1e-6);
      return gasKwh * eff;
    }
  }

  function computeScenario(params) {
    const {
      area, storeys, height,
      wallType, winRatio, nAir, bridgePct,
      wallInsCm, wallInsMat,
      roofInsCm, roofInsMat,
      floorInsCm, floorInsMat
    } = params;

    const g = geometry(area, storeys, height);

    const Awin = g.wallGross * clamp(winRatio, 5, 35) / 100;
    const AwallNet = Math.max(0, g.wallGross - Awin);

    const Uwall = uWithInsulation(U_BASE[wallType], wallInsCm, LAMBDA[wallInsMat]);
    const Uroof = uWithInsulation(U_BASE.roof, roofInsCm, LAMBDA[roofInsMat]);
    const Ufloor = uWithInsulation(U_BASE.floor, floorInsCm, LAMBDA[floorInsMat]);
    const Uwin = U_BASE.window;

    const loss = heatLossH(Uwall, AwallNet, Uwin, Awin, Uroof, g.roofArea, Ufloor, g.floorArea, nAir, g.volume, bridgePct);

    return {
      geom: g,
      areas: { AwallNet, Awin, Aroof: g.roofArea, Afloor: g.floorArea },
      U: { Uwall, Uwin, Uroof, Ufloor },
      H: loss
    };
  }

  // ---------- UI / Defaults ----------
  const btnRun = $("btnCalcRun");
  const btnReset = $("btnReset");
  const resultBox = $("resultBox");

  const DEFAULTS = {
    area: 100,
    storeys: 1,
    height: 2.6,
    wallType: "brick",
    winRatio: 18,
    nAir: 0.6,
    wallInsNow: 0,
    wallInsMat: "eps",
    roofInsNow: 0,
    roofInsMat: "rockwool",
    floorInsNow: 0,
    floorInsMat: "xps",
    heatingNow: "gas_old",
    scopNow: 3.2,
    annualCostNow: 600000,

    wallInsTarget: 15,
    roofInsTarget: 25,
    floorInsTarget: 10,
    heatingTarget: "hp",
    scopTarget: 3.6,
    hdd: 3000,
    priceGas: 40,
    priceEl: 70,

    bridge: 10,
    costWallM2: 18000,
    costRoofM2: 12000,
    costFloorM2: 15000,
    costHeating: 3500000
  };

  function setDefaults() {
    $("area").value = DEFAULTS.area;
    $("storeys").value = String(DEFAULTS.storeys);
    $("height").value = DEFAULTS.height;
    $("wallType").value = DEFAULTS.wallType;
    $("winRatio").value = DEFAULTS.winRatio;
    $("nAir").value = DEFAULTS.nAir;
    $("wallInsNow").value = DEFAULTS.wallInsNow;
    $("wallInsMat").value = DEFAULTS.wallInsMat;
    $("roofInsNow").value = DEFAULTS.roofInsNow;
    $("roofInsMat").value = DEFAULTS.roofInsMat;
    $("floorInsNow").value = DEFAULTS.floorInsNow;
    $("floorInsMat").value = DEFAULTS.floorInsMat;
    $("heatingNow").value = DEFAULTS.heatingNow;
    $("scopNow").value = DEFAULTS.scopNow;
    $("annualCostNow").value = DEFAULTS.annualCostNow;

    $("wallInsTarget").value = DEFAULTS.wallInsTarget;
    $("roofInsTarget").value = DEFAULTS.roofInsTarget;
    $("floorInsTarget").value = DEFAULTS.floorInsTarget;
    $("heatingTarget").value = DEFAULTS.heatingTarget;
    $("scopTarget").value = DEFAULTS.scopTarget;
    $("hdd").value = DEFAULTS.hdd;
    $("priceGas").value = DEFAULTS.priceGas;
    $("priceEl").value = DEFAULTS.priceEl;

    $("bridge").value = DEFAULTS.bridge;
    $("costWallM2").value = DEFAULTS.costWallM2;
    $("costRoofM2").value = DEFAULTS.costRoofM2;
    $("costFloorM2").value = DEFAULTS.costFloorM2;
    $("costHeating").value = DEFAULTS.costHeating;
  }

  // ---------- Core calc ----------
  function readInputs() {
    const area = clamp(num($("area").value, 100), 20, 1000);
    const storeys = clamp(num($("storeys").value, 1), 1, 3);
    const height = clamp(num($("height").value, 2.6), 2.2, 3.2);
    const wallType = $("wallType").value;

    const winRatio = clamp(num($("winRatio").value, 18), 5, 35);
    const nAir = clamp(num($("nAir").value, 0.6), 0.2, 1.2);

    const wallInsNow = clamp(num($("wallInsNow").value, 0), 0, 30);
    const wallInsMat = $("wallInsMat").value;
    const roofInsNow = clamp(num($("roofInsNow").value, 0), 0, 60);
    const roofInsMat = $("roofInsMat").value;
    const floorInsNow = clamp(num($("floorInsNow").value, 0), 0, 20);
    const floorInsMat = $("floorInsMat").value;

    const heatingNow = $("heatingNow").value;
    const scopNow = clamp(num($("scopNow").value, 3.2), 2.2, 5.5);

    const annualCostNow = Math.max(0, num($("annualCostNow").value, 0));

    const wallInsTarget = clamp(num($("wallInsTarget").value, 15), 0, 30);
    const roofInsTarget = clamp(num($("roofInsTarget").value, 25), 0, 60);
    const floorInsTarget = clamp(num($("floorInsTarget").value, 10), 0, 20);

    const heatingTarget = $("heatingTarget").value;
    const scopTarget = clamp(num($("scopTarget").value, 3.6), 2.2, 5.5);

    const hdd = clamp(num($("hdd").value, 3000), 1800, 4500);
    const priceGas = clamp(num($("priceGas").value, 40), 10, 120);
    const priceEl = clamp(num($("priceEl").value, 70), 20, 180);

    const bridge = clamp(num($("bridge").value, 10), 0, 25);

    const costWallM2 = Math.max(0, num($("costWallM2").value, 18000));
    const costRoofM2 = Math.max(0, num($("costRoofM2").value, 12000));
    const costFloorM2 = Math.max(0, num($("costFloorM2").value, 15000));
    const costHeating = Math.max(0, num($("costHeating").value, 3500000));

    return {
      area, storeys, height, wallType,
      winRatio, nAir,
      wallInsNow, wallInsMat,
      roofInsNow, roofInsMat,
      floorInsNow, floorInsMat,
      heatingNow, scopNow,
      annualCostNow,
      wallInsTarget, roofInsTarget, floorInsTarget,
      heatingTarget, scopTarget,
      hdd, priceGas, priceEl,
      bridge,
      costWallM2, costRoofM2, costFloorM2, costHeating
    };
  }

  function investmentCosts(sNow, sTarget, areas, costs) {
    // Fajlagos ár @10cm -> arányosítjuk a DELTA vastagsággal
    const deltaWall = Math.max(0, sTarget.wall - sNow.wall);
    const deltaRoof = Math.max(0, sTarget.roof - sNow.roof);
    const deltaFloor = Math.max(0, sTarget.floor - sNow.floor);

    const wallCost = areas.AwallNet * costs.costWallM2 * (deltaWall / 10);
    const roofCost = areas.Aroof * costs.costRoofM2 * (deltaRoof / 10);
    const floorCost = areas.Afloor * costs.costFloorM2 * (deltaFloor / 10);

    const heatCost = costs.costHeating; // egyszeri

    return {
      wallCost,
      roofCost,
      floorCost,
      heatCost
    };
  }

  function renderResult(out) {
    if (resultBox) resultBox.innerHTML = out;
  }

  function calcAll() {
    const x = readInputs();

    // Szenárió (MOST)
    const nowScenario = computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsNow, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsNow, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsNow, floorInsMat: x.floorInsMat
    });

    // Szenárió (CÉL) – anyagokat a MOST anyagból vesszük (egyszerűsítés)
    const targetScenario = computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsTarget, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsTarget, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsTarget, floorInsMat: x.floorInsMat
    });

    // Modell Q (MOST) – csak fizika alapján
    const Q_model_now = annualHeatDemandKWh(nowScenario.H.H, x.hdd);

    // "Valós" Q (MOST) a megadott Ft/év alapján (árakból + hatásfokból)
    const Q_real_now = heatDemandFromCost(
      x.annualCostNow,
      x.heatingNow,
      x.priceGas,
      x.priceEl,
      x.scopNow
    );

    // Kalibrációs szorzó (ha a fizikai modell túl nagy/kicsi)
    const calib = (Q_model_now > 0) ? (Q_real_now / Q_model_now) : 1;

    // CÉL hőigény a fizikai modellből, kalibrálva
    const Q_model_target = annualHeatDemandKWh(targetScenario.H.H, x.hdd);
    const Q_real_target = Q_model_target * calib;

    // Költségek
    const costNow = x.annualCostNow; // bázis
    const costTarget = costFromHeatDemand(Q_real_target, x.heatingTarget, x.priceGas, x.priceEl, x.scopTarget);

    const savingYear = Math.max(0, costNow - costTarget);
    const savingMonth = savingYear / 12;

    const improve = (Q_real_now > 0) ? (1 - (Q_real_target / Q_real_now)) : 0;

    // “Csak X” összehasonlítás: csak egy elem változik a MOST-hoz képest
    function costOnly(change) {
      const wall = (change.wall !== undefined) ? change.wall : x.wallInsNow;
      const roof = (change.roof !== undefined) ? change.roof : x.roofInsNow;
      const floor = (change.floor !== undefined) ? change.floor : x.floorInsNow;

      const sc = computeScenario({
        area: x.area, storeys: x.storeys, height: x.height,
        wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
        wallInsCm: wall, wallInsMat: x.wallInsMat,
        roofInsCm: roof, roofInsMat: x.roofInsMat,
        floorInsCm: floor, floorInsMat: x.floorInsMat
      });

      const Q_model = annualHeatDemandKWh(sc.H.H, x.hdd);
      const Q_real = Q_model * calib;

      const heating = (change.heating !== undefined) ? change.heating : x.heatingNow;
      const scop = (change.scop !== undefined) ? change.scop : x.scopNow;

      return costFromHeatDemand(Q_real, heating, x.priceGas, x.priceEl, scop);
    }

    const costOnlyRoof = costOnly({ roof: x.roofInsTarget });
    const costOnlyWall = costOnly({ wall: x.wallInsTarget });
    const costOnlyFloor = costOnly({ floor: x.floorInsTarget });
    const costOnlyHeat = costOnly({ heating: x.heatingTarget, scop: x.scopTarget });

    const saveOnlyRoof = Math.max(0, costNow - costOnlyRoof);
    const saveOnlyWall = Math.max(0, costNow - costOnlyWall);
    const saveOnlyFloor = Math.max(0, costNow - costOnlyFloor);
    const saveOnlyHeat = Math.max(0, costNow - costOnlyHeat);

    // Prioritás Ft/év szerint
    const prio = [
      { k: "Födém/padlás", v: saveOnlyRoof },
      { k: "Fal", v: saveOnlyWall },
      { k: "Padló/aljzat", v: saveOnlyFloor },
      { k: "Fűtés", v: saveOnlyHeat }
    ].sort((a, b) => b.v - a.v);

    // Beruházás + megtérülés
    const inv = investmentCosts(
      { wall: x.wallInsNow, roof: x.roofInsNow, floor: x.floorInsNow },
      { wall: x.wallInsTarget, roof: x.roofInsTarget, floor: x.floorInsTarget },
      targetScenario.areas,
      { costWallM2: x.costWallM2, costRoofM2: x.costRoofM2, costFloorM2: x.costFloorM2, costHeating: x.costHeating }
    );

    const pbRoof = paybackYears(inv.roofCost, saveOnlyRoof);
    const pbWall = paybackYears(inv.wallCost, saveOnlyWall);
    const pbFloor = paybackYears(inv.floorCost, saveOnlyFloor);
    const pbHeat = (x.heatingTarget !== x.heatingNow) ? paybackYears(inv.heatCost, saveOnlyHeat) : Infinity;

    // Tech számok
    const techNow = {
      Q_model: Q_model_now,
      Q_real: Q_real_now,
      H: nowScenario.H.H,
      U: nowScenario.U
    };
    const techTarget = {
      Q_model: Q_model_target,
      Q_real: Q_real_target,
      H: targetScenario.H.H,
      U: targetScenario.U
    };

    const html = `
      <div class="sectionTitle">Eredmény</div>

      <div class="out" style="margin-top:10px;">
        <div class="sectionTitle">MOST → CÉL</div>
        <ul>
          <li><b>Fal:</b> ${x.wallInsNow} cm → ${x.wallInsTarget} cm (${String(x.wallInsMat).toUpperCase()})</li>
          <li><b>Födém/padlás:</b> ${x.roofInsNow} cm → ${x.roofInsTarget} cm (${String(x.roofInsMat).toUpperCase()})</li>
          <li><b>Padló/aljzat:</b> ${x.floorInsNow} cm → ${x.floorInsTarget} cm (${String(x.floorInsMat).toUpperCase()})</li>
          <li><b>Fűtés:</b> ${HEAT[x.heatingNow].name} → ${HEAT[x.heatingTarget].name}</li>
          <li class="muted">HDD: ${x.hdd} • légcsere: ${x.nAir} 1/h • ablakarány: ${x.winRatio}% • hőhíd: ${x.bridge}%</li>
        </ul>
      </div>

      <div class="out">
        <div class="sectionTitle">Költség (becslés)</div>
        <div style="margin-top:6px;">
          <b>MOST (Ft/év):</b> ${fmtFt(costNow)} <span class="muted">~ ${fmtFtShort(costNow/12)} Ft/hó</span><br/>
          <b>CÉL (Ft/év):</b> ${fmtFt(costTarget)} <span class="muted">~ ${fmtFtShort(costTarget/12)} Ft/hó</span><br/>
          <div class="hr"></div>
          <b>Különbség:</b> ${fmtFt(savingYear)} <span class="muted">~ ${fmtFtShort(savingMonth)} Ft/hó</span><br/>
          <b>Javulás (hőigény):</b> ${fmtPct(improve*100)}<br/>
          <span class="muted">Magyarázat: a “MOST” Ft/év értékből visszaszámoljuk a MOST hőigényt, majd ugyanazzal a kalibrációval számoljuk a CÉL hőigényt.</span>
        </div>
      </div>

      <div class="out">
        <div class="sectionTitle">“Csak X” összehasonlítás (Ft/év megtakarítás a MOST-hoz képest)</div>
        <ul>
          <li><b>Csak fűtés:</b> ~ ${fmtFt(saveOnlyHeat)}</li>
          <li><b>Csak födém/padlás:</b> ~ ${fmtFt(saveOnlyRoof)}</li>
          <li><b>Csak fal:</b> ~ ${fmtFt(saveOnlyWall)}</li>
          <li><b>Csak padló/aljzat:</b> ~ ${fmtFt(saveOnlyFloor)}</li>
        </ul>
        <div class="muted">Ez segít dönteni: melyik lépés adja a legtöbb Ft/év hatást önmagában.</div>
      </div>

      <div class="out">
        <div class="sectionTitle">Prioritás (Ft/év alapján)</div>
        <ol>
          <li><b>${prio[0].k}:</b> ~ ${fmtFt(prio[0].v)} / év</li>
          <li><b>${prio[1].k}:</b> ~ ${fmtFt(prio[1].v)} / év</li>
          <li><b>${prio[2].k}:</b> ~ ${fmtFt(prio[2].v)} / év</li>
          <li><b>${prio[3].k}:</b> ~ ${fmtFt(prio[3].v)} / év</li>
        </ol>
      </div>

      <div class="out">
        <div class="sectionTitle">Beruházás + megtérülés (irány, állítható)</div>
        <ul>
          <li><b>Födém:</b> ${fmtFt(inv.roofCost)} → megtérülés: <b>${fmtYears(pbRoof)}</b></li>
          <li><b>Fal:</b> ${fmtFt(inv.wallCost)} → megtérülés: <b>${fmtYears(pbWall)}</b></li>
          <li><b>Padló:</b> ${fmtFt(inv.floorCost)} → megtérülés: <b>${fmtYears(pbFloor)}</b></li>
          <li><b>Fűtés:</b> ${fmtFt(inv.heatCost)} → megtérülés: <b>${fmtYears(pbHeat)}</b> <span class="muted">(csak ha csere van)</span></li>
        </ul>
        <div class="muted">A fajlagos árak a “Haladó” részben állíthatók. A megtérülés a MOST→CÉL különbségen és a te áraiddal számol.</div>
      </div>

      <details>
        <summary>Technikai számok (ellenőrzéshez)</summary>

        <div class="out" style="margin-top:10px;">
          <div class="sectionTitle">Felületek (becslés)</div>
          <div class="muted">
            Fal nettó: ${Math.round(targetScenario.areas.AwallNet)} m² • ablak: ${Math.round(targetScenario.areas.Awin)} m² • födém: ${Math.round(targetScenario.areas.Aroof)} m² • padló: ${Math.round(targetScenario.areas.Afloor)} m² • térfogat: ${Math.round(targetScenario.geom.volume)} m³
          </div>

          <div class="hr"></div>

          <div class="sectionTitle">U-értékek (W/m²K)</div>
          <div class="muted">
            MOST: fal ${techNow.U.Uwall.toFixed(2)} • födém ${techNow.U.Uroof.toFixed(2)} • padló ${techNow.U.Ufloor.toFixed(2)} • ablak ${techNow.U.Uwin.toFixed(2)}<br/>
            CÉL: fal ${techTarget.U.Uwall.toFixed(2)} • födém ${techTarget.U.Uroof.toFixed(2)} • padló ${techTarget.U.Ufloor.toFixed(2)} • ablak ${techTarget.U.Uwin.toFixed(2)}
          </div>

          <div class="hr"></div>

          <div class="sectionTitle">H és hőigény</div>
          <div class="muted">
            H (MOST): ${(techNow.H).toFixed(0)} W/K • Q_model: ${fmtKwh(techNow.Q_model)}<br/>
            H (CÉL): ${(techTarget.H).toFixed(0)} W/K • Q_model: ${fmtKwh(techTarget.Q_model)}<br/>
            Kalibrációs szorzó: ${calib.toFixed(2)}<br/>
            Q_real(MOST): ${fmtKwh(techNow.Q_real)} • Q_real(CÉL): ${fmtKwh(techTarget.Q_real)}
          </div>
        </div>
      </details>
    `;

    renderResult(html);
  }

  // events
  btnRun && btnRun.addEventListener("click", calcAll);
  btnReset && btnReset.addEventListener("click", () => {
    setDefaults();
    renderResult(`
      <div class="sectionTitle">Eredmény</div>
      <div class="muted">Kattints az <b>Elemzés</b> gombra.</div>
    `);
  });

  // init
  setDefaults();
  initByHash();

  // =========================
  // TUDÁSTÁR (MVP)
  // =========================

  const DOCS = [
    {
      id: "hdd",
      cat: "alap",
      title: "Mi az a HDD (fűtési foknap) és miért számít?",
      minutes: 3,
      tags: ["HDD", "alapok"],
      body: [
        "A HDD (Heating Degree Days) azt mutatja meg, mennyire volt hideg egy év/idény egy adott helyen.",
        "Minél nagyobb a HDD, annál több fűtési energia kell ugyanahhoz a házhoz.",
        "",
        "• Magyar átlagos irányszám: ~3000 (településtől függ).",
        "• A kalkulátor azért kéri, hogy országos átlaggal is lehessen becsülni.",
        "",
        "Gyakorlatban:",
        "Ha ugyanaz a ház egy hidegebb környéken van, a MOST költsége magasabb → a megtakarítás forintban is magasabb lehet."
      ]
    },
    {
      id: "legcsere",
      cat: "alap",
      title: "Légcsere (infiltráció): a láthatatlan pénzégető",
      minutes: 4,
      tags: ["légcsere", "infiltráció"],
      body: [
        "A légcsere (n, 1/h) azt jelenti: óránként hányszor cserélődik ki a levegő a házban.",
        "",
        "Tipikus irányszámok:",
        "• 0.3–0.5: viszonylag jó légzárás",
        "• 0.6–0.9: átlagos régi ház",
        "• 1.0 felett: huzatos / sok rés / rossz nyílászáró",
        "",
        "Miért fontos?",
        "Hiába szigeteled a falat, ha a meleg levegő elszökik → a fűtés dolgozik helyette.",
        "",
        "Tipp kivitelező szemmel:",
        "Ablakcserénél / padlásfeljárónál / kémény körül / födém áttöréseknél rengeteg szökik."
      ]
    },
    {
      id: "prioritas",
      cat: "szigeteles",
      title: "Miért a födém a legjobb első lépés sok háznál?",
      minutes: 3,
      tags: ["födém", "prioritás"],
      body: [
        "Sok magyar családi háznál a padlás/födém a legnagyobb veszteség.",
        "Ok: a meleg levegő felfelé száll, és ha nincs rendes födém szigetelés, gyorsan elmegy.",
        "",
        "Miért jó kezdés?",
        "• általában olcsóbb m²-re",
        "• gyorsan kivitelezhető",
        "• nagy hatás → hamarabb látszik a számlán",
        "",
        "Irány:",
        "• 20–30 cm jó szint (anyagfüggő), 25 cm már erős."
      ]
    },
    {
      id: "fal",
      cat: "szigeteles",
      title: "Fal szigetelés: miért nem mindegy 5 cm vs 15 cm?",
      minutes: 4,
      tags: ["fal", "EPS", "kőzetgyapot"],
      body: [
        "5 cm gyakran csak 'enyhe javulás' (régi háznál sokszor még mindig nagy a veszteség).",
        "15 cm már egy érezhető szint: stabilabb belső hőmérséklet, kisebb kazán- / hőszivattyú terhelés.",
        "",
        "Fontos:",
        "A megtérülés nem csak az anyagtól függ, hanem:",
        "• hőhidaktól",
        "• ablakoktól",
        "• légzárástól",
        "• fűtési rendszertől",
        "",
        "Tipp:",
        "Ha falat szigetelsz, a részletek (lábazat, koszorú, áthidaló, erkélycsatlakozás) döntik el a végeredményt."
      ]
    },
    {
      id: "padlo",
      cat: "szigeteles",
      title: "Padló/aljzat szigetelés: mikor éri meg?",
      minutes: 3,
      tags: ["padló", "komfort"],
      body: [
        "Padló szigetelés sokszor komfort miatt is megéri: melegebb padló, kevesebb hidegérzet.",
        "",
        "Mikor erős a hatása?",
        "• ha alatta pince/üreg/nyitott tér van",
        "• ha a padló most nagyon hideg",
        "",
        "Ha már kész burkolat van, költségesebb → megtérülés hosszabb lehet, de komfortban nagy nyereség."
      ]
    },
    {
      id: "futes",
      cat: "futes",
      title: "Régi gázkazán vs kondenz vs hőszivattyú: miért változik a matek?",
      minutes: 5,
      tags: ["fűtés", "SCOP"],
      body: [
        "Ugyanazt a hőigényt különböző hatásfokkal állítják elő.",
        "",
        "Durva logika:",
        "• Régi kazán: rosszabb hatásfok → több energia kell ugyanahhoz a hőhöz",
        "• Kondenz: jobb → kevesebb gáz ugyanarra",
        "• Hőszivattyú: 1 kWh villanyból több kWh hő (SCOP alapján)",
        "",
        "Miért fontos a szigetelés előtt?",
        "Ha nincs szigetelés, a hőszivattyú is sokat dolgozik → nagyobb rendszer kell → drágább beruházás.",
        "Ezért sokszor: előbb szigetelés/légzárás, aztán gépészet."
      ]
    },
    {
      id: "hidak",
      cat: "hibak",
      title: "Hőhidak: a leggyakoribb 'nem értem miért penészedik' ok",
      minutes: 4,
      tags: ["hőhíd", "penész"],
      body: [
        "A hőhíd egy olyan pont, ahol a hő könnyebben távozik (hidegebb felület).",
        "Ott könnyebben lecsapódik a pára → penész.",
        "",
        "Tipikus helyek:",
        "• koszorú, áthidalók",
        "• lábazat, erkélylemez",
        "• sarkok, csatlakozások",
        "",
        "Ezért van 'hőhíd korrekció' a kalkulátorban: ha sok a hőhíd, a valós megtakarítás kisebb lehet."
      ]
    },
    {
      id: "kerdeslista",
      cat: "checklist",
      title: "Kérdéslista szakiknak: mit kérdezz, hogy ne bukj pénzt",
      minutes: 6,
      tags: ["kérdések", "ellenőrzés"],
      body: [
        "Szigetelésnél:",
        "• milyen vastagság és miért pont az?",
        "• lábazat/koszorú/áthidaló megoldás hogyan lesz?",
        "• ragasztás + dübelezés rendben van-e?",
        "• hálózás, élvédők, indítóprofil minősége?",
        "",
        "Fűtéskorszerűsítésnél:",
        "• hőigény számítás van-e (ne csak ránézésre)?",
        "• radiátorok/méretezés megfelel?",
        "• hőszivattyúnál SCOP, HMV, zaj, elhelyezés?",
        "",
        "Extra:",
        "• garancia írásban, műszaki átadás, fotódokumentáció"
      ]
    }
  ];

  let docsState = {
    cat: "all",
    q: "",
    activeId: DOCS[0]?.id || null
  };

  let docsInited = false;

  function labelCat(cat) {
    switch (cat) {
      case "alap": return "Alapok";
      case "szigeteles": return "Szigetelés";
      case "futes": return "Fűtés";
      case "hibak": return "Tipikus hibák";
      case "checklist": return "Kérdéslista";
      default: return "Összes";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
    }[m]));
  }

  function renderDocsArticle(id, filteredList) {
    const titleEl = $("docsTitle");
    const metaEl = $("docsMeta");
    const bodyEl = $("docsBody");
    if (!titleEl || !metaEl || !bodyEl) return;

    const d = DOCS.find(x => x.id === id) || filteredList?.[0] || DOCS[0];
    if (!d) return;

    titleEl.textContent = d.title;
    metaEl.innerHTML = `kategória: <b>${labelCat(d.cat)}</b> • ~${d.minutes} perc • ${d.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join(" ")}`;

    bodyEl.innerHTML = d.body.map(p => {
      if (!p) return "<div style='height:8px'></div>";
      if (p.startsWith("• ")) return `<div style="margin:6px 0;">• ${escapeHtml(p.slice(2))}</div>`;
      return `<div style="margin:8px 0;">${escapeHtml(p)}</div>`;
    }).join("");
  }

  function renderDocs() {
    const listEl = $("docsList");
    const countEl = $("docsCount");
    const titleEl = $("docsTitle");
    const metaEl = $("docsMeta");
    const bodyEl = $("docsBody");

    // ha nincs Tudástár UI az indexben, ne csináljunk semmit
    if (!listEl || !countEl || !titleEl || !metaEl || !bodyEl) return;

    const q = (docsState.q || "").trim().toLowerCase();
    const filtered = DOCS.filter(d => {
      const catOk = (docsState.cat === "all") || (d.cat === docsState.cat);
      if (!catOk) return false;
      if (!q) return true;
      const hay = (d.title + " " + d.body.join(" ")).toLowerCase();
      return hay.includes(q);
    });

    countEl.textContent = `${filtered.length} találat`;

    listEl.innerHTML = "";
    filtered.forEach(d => {
      const btn = document.createElement("button");
      btn.className = "pill" + (d.id === docsState.activeId ? " active" : "");
      btn.style.textAlign = "left";
      btn.style.borderRadius = "16px";
      btn.style.padding = "12px 12px";

      btn.innerHTML = `
        <div style="font-weight:900; margin-bottom:4px;">${escapeHtml(d.title)}</div>
        <div class="muted" style="font-size:12px;">
          kategória: <b>${escapeHtml(labelCat(d.cat))}</b> • ~${d.minutes} perc • ${d.tags.map(t => `#${escapeHtml(t)}`).join(" ")}
        </div>
      `;

      btn.onclick = () => {
        docsState.activeId = d.id;
        renderDocs();
        renderDocsArticle(d.id, filtered);
      };

      listEl.appendChild(btn);
    });

    if (filtered.length && !filtered.some(x => x.id === docsState.activeId)) {
      docsState.activeId = filtered[0].id;
    }

    renderDocsArticle(docsState.activeId, filtered);
  }

  function initDocsUI() {
    if (docsInited) return;
    docsInited = true;

    const search = $("docsSearch");
    if (search) {
      search.addEventListener("input", (e) => {
        docsState.q = e.target.value || "";
        renderDocs();
      });
    }

    document.querySelectorAll("[data-doccat]").forEach(btn => {
      btn.addEventListener("click", () => {
        const cat = btn.getAttribute("data-doccat") || "all";
        docsState.cat = cat;

        document.querySelectorAll("[data-doccat]").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");

        renderDocs();
      });
    });

    renderDocs();
  }

  // Ha az oldal betölt, és hash=docs, akkor induljon a tudástár is
  document.addEventListener("DOMContentLoaded", () => {
    // initByHash már meghívódott, de DOM itt fixen kész
    if ((location.hash || "#home") === "#docs") {
      initDocsUI();
      renderDocs();
    }
  });

})();
