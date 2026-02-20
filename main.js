/* Energia Advisor 3D – Valós (C) kalkulátor
   - UA + infiltráció + HDD
   - Kalibrálás: a MOST Ft/év értéket bázisnak vesszük (hogy a modell "valós" legyen)
   + Tudástár: keresés + kategória + cikk megjelenítés
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

    // Tudástár render mindig, amikor oda mész
    if (which === "docs") {
      initDocsOnce();
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
  const U_BASE = {
    brick: 1.25,
    adobe: 1.10,
    concrete: 1.60,
    roof: 1.60,
    floor: 1.10,
    window: 2.60
  };

  // fűtés hatásfok / COP
  const HEAT = {
    gas_old: { name: "Régi gázkazán", eff: 0.75 },
    gas_cond: { name: "Kondenzációs gázkazán", eff: 0.92 },
    hp: { name: "Hőszivattyú", eff: null }
  };

  function uWithInsulation(uBase, thicknessCm, lambda) {
    const t = Math.max(0, thicknessCm) / 100;
    if (t <= 0) return uBase;
    const r0 = 1 / uBase;
    const rIns = t / lambda;
    return 1 / (r0 + rIns);
  }

  function geometry(areaTotal, storeys, height) {
    const s = clamp(storeys, 1, 3);
    const footprint = areaTotal / s;
    const side = Math.sqrt(Math.max(footprint, 1));
    const perim = 4 * side;

    const wallGross = perim * height * s;
    const roofArea = footprint;
    const floorArea = footprint;
    const volume = footprint * height * s;

    return { footprint, side, perim, wallGross, roofArea, floorArea, volume };
  }

  function heatLossH(Uwall, Awall, Uwin, Awin, Uroof, Aroof, Ufloor, Afloor, nAir, volume, bridgePct) {
    const Htrans = (Uwall * Awall) + (Uwin * Awin) + (Uroof * Aroof) + (Ufloor * Afloor);
    const Hvent = 0.33 * nAir * volume;
    const bridge = 1 + (bridgePct / 100);
    return { Htrans, Hvent, H: (Htrans + Hvent) * bridge };
  }

  function annualHeatDemandKWh(H_WperK, HDD) {
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
    if (!$("area")) return; // ha épp nincs megnyitva a kalk nézet

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
    const deltaWall = Math.max(0, sTarget.wall - sNow.wall);
    const deltaRoof = Math.max(0, sTarget.roof - sNow.roof);
    const deltaFloor = Math.max(0, sTarget.floor - sNow.floor);

    const wallCost = areas.AwallNet * costs.costWallM2 * (deltaWall / 10);
    const roofCost = areas.Aroof * costs.costRoofM2 * (deltaRoof / 10);
    const floorCost = areas.Afloor * costs.costFloorM2 * (deltaFloor / 10);

    return { wallCost, roofCost, floorCost, heatCost: costs.costHeating };
  }

  function renderResult(out) {
    if (resultBox) resultBox.innerHTML = out;
  }

  function calcAll() {
    const x = readInputs();

    const nowScenario = computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsNow, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsNow, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsNow, floorInsMat: x.floorInsMat
    });

    const targetScenario = computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsTarget, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsTarget, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsTarget, floorInsMat: x.floorInsMat
    });

    const Q_model_now = annualHeatDemandKWh(nowScenario.H.H, x.hdd);

    const Q_real_now = heatDemandFromCost(
      x.annualCostNow,
      x.heatingNow,
      x.priceGas,
      x.priceEl,
      x.scopNow
    );

    const calib = (Q_model_now > 0) ? (Q_real_now / Q_model_now) : 1;

    const Q_model_target = annualHeatDemandKWh(targetScenario.H.H, x.hdd);
    const Q_real_target = Q_model_target * calib;

    const costNow = x.annualCostNow;
    const costTarget = costFromHeatDemand(Q_real_target, x.heatingTarget, x.priceGas, x.priceEl, x.scopTarget);

    const savingYear = Math.max(0, costNow - costTarget);
    const savingMonth = savingYear / 12;

    const improve = (Q_real_now > 0) ? (1 - (Q_real_target / Q_real_now)) : 0;

    function costOnly(change) {
      const wall = change.wall ?? x.wallInsNow;
      const roof = change.roof ?? x.roofInsNow;
      const floor = change.floor ?? x.floorInsNow;

      const sc = computeScenario({
        area: x.area, storeys: x.storeys, height: x.height,
        wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
        wallInsCm: wall, wallInsMat: x.wallInsMat,
        roofInsCm: roof, roofInsMat: x.roofInsMat,
        floorInsCm: floor, floorInsMat: x.floorInsMat
      });

      const Q_model = annualHeatDemandKWh(sc.H.H, x.hdd);
      const Q_real = Q_model * calib;

      const heating = change.heating ?? x.heatingNow;
      const scop = change.scop ?? x.scopNow;

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

    const prio = [
      { k: "Födém/padlás", v: saveOnlyRoof },
      { k: "Fal", v: saveOnlyWall },
      { k: "Padló/aljzat", v: saveOnlyFloor },
      { k: "Fűtés", v: saveOnlyHeat }
    ].sort((a, b) => b.v - a.v);

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

    const techNow = { Q_model: Q_model_now, Q_real: Q_real_now, H: nowScenario.H.H, U: nowScenario.U };
    const techTarget = { Q_model: Q_model_target, Q_real: Q_real_target, H: targetScenario.H.H, U: targetScenario.U };

    const html = `
      <div class="sectionTitle">Eredmény</div>

      <div class="out" style="margin-top:10px;">
        <div class="sectionTitle">MOST → CÉL</div>
        <ul>
          <li><b>Fal:</b> ${x.wallInsNow} cm → ${x.wallInsTarget} cm (${x.wallInsMat.toUpperCase()})</li>
          <li><b>Födém/padlás:</b> ${x.roofInsNow} cm → ${x.roofInsTarget} cm (${x.roofInsMat.toUpperCase()})</li>
          <li><b>Padló/aljzat:</b> ${x.floorInsNow} cm → ${x.floorInsTarget} cm (${x.floorInsMat.toUpperCase()})</li>
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

  // init calc defaults
  setDefaults();

  // ---------- TUDÁSTÁR (FIX: ne legyen 0 találat) ----------
  const DOCS = [
    {
      id: "hdd",
      title: "Mi az a HDD (fűtési foknap) és miért számít?",
      cat: "alapok",
      minutes: 3,
      tags: ["HDD", "alapok"],
      quick: [
        "HU átlag irányszám: ~3000 (településtől függ).",
        "Nagyobb HDD = hidegebb év/hely = több fűtési energia ugyanahhoz a házhoz.",
        "A kalkulátor azért kéri, hogy országos átlaggal is lehessen becsülni."
      ],
      body: `
A HDD (Heating Degree Days) azt mutatja meg, mennyire volt „összesen hideg” egy év/időszak egy adott helyen.
Nem hőmérséklet, hanem egy összevont mutató.

Minél nagyobb a HDD:
• annál több energiát kell betolni a házba ugyanahhoz a komforthoz,
• ezért ugyanaz a ház más településen más éves költséget ad.

Gyakorlatban:
ha hidegebb környéken vagy, a MOST költség is magasabb → a megtakarítás forintban is magasabb lehet.
      `.trim()
    },
    {
      id: "legcsere",
      title: "Légcsere (infiltráció): a láthatatlan pénzégető",
      cat: "alapok",
      minutes: 4,
      tags: ["légcsere", "infiltráció"],
      quick: [
        "A légcsere (n) sokszor nagyobb veszteség, mint gondolnád.",
        "Régi nyílászáró + rossz légzárás = magas Hvent.",
        "Szigetelés előtt/után is érdemes légzárást javítani."
      ],
      body: `
A kalkulátorban a szellőzési veszteség:
Hvent ≈ 0.33 · n · V.

n = légcsere 1/óra (mennyi levegő cserélődik óránként),
V = fűtött térfogat.

Ha huzatos a ház:
• hiába szigeteled, a meleg „kiszökik”,
• a megtakarítás kisebb lesz, mint papíron.

Gyors tipp:
• tömítések, beállítás, rések megszüntetése,
• pince/ padlás átjárások lezárása,
• később akár hővisszanyerős szellőzés.
      `.trim()
    },
    {
      id: "fodemplus",
      title: "Miért a födém a legjobb első lépés sok háznál?",
      cat: "szigeteles",
      minutes: 3,
      tags: ["födém", "prioritás"],
      quick: [
        "A meleg felfelé száll – a födém gyakran TOP veszteség.",
        "Ár/hatás arányban sokszor a legjobb lépés.",
        "20–30 cm födém/padlás szigetelés gyakran „nagyot üt”."
      ],
      body: `
Sok régi háznál a padlás/födém szigetelés vagy nincs, vagy minimális.
Ilyenkor a felfelé távozó hő nagyon nagy.

Ha a kalkulátorban a födém a TOP:
• nem meglepő – elsőként érdemes azt megfogni.

Általános irány:
• 20–30 cm (anyagfüggő) már jó szint.
      `.trim()
    },
    {
      id: "fal5vs15",
      title: "Fal szigetelés: miért nem mindegy 5 cm vs 15 cm?",
      cat: "szigeteles",
      minutes: 4,
      tags: ["fal", "EPS", "kőzetgyapot"],
      quick: [
        "5 cm sokszor csak „érzetjavítás”, nem igazi szint.",
        "10–15 cm környékén kezd „rendes” lenni.",
        "A megtérülés függ: falazat, hőhidak, árak, munkadíj."
      ],
      body: `
A fal U-értéke nem lineárisan javul, de a nagyon vékony réteg sokszor kevés.
5 cm-ről 10–15 cm-re ugrani sokkal érthetőbb eredményt ad.

Fontos:
• hőhidak (koszorú, lábazat, nyílászáró környéke) sokat számítanak,
• rossz részletek mellett romlik a „papír forma”.
      `.trim()
    },
    {
      id: "padlo",
      title: "Padló/aljzat szigetelés: mikor éri meg?",
      cat: "szigeteles",
      minutes: 3,
      tags: ["padló", "komfort"],
      quick: [
        "Komfortban sokat ad: nem hideg a láb.",
        "Energiában akkor nagy, ha nincs alatta semmi / hideg pince.",
        "Felújításnál (burkolat csere) a legésszerűbb."
      ],
      body: `
Padlószigetelésnél gyakori, hogy nem csak Ft/év számít, hanem a komfort.
Hideg aljzatnál a hőérzet rosszabb, magasabbra tekered a fűtést.

Mikor éri meg igazán:
• ha amúgy is bontasz/burkolatot cserélsz,
• ha alatta pince/átfúj, vagy nincs rendes rétegrend.
      `.trim()
    },
    {
      id: "futesmatek",
      title: "Régi gázkazán vs kondenz vs hőszivattyú: miért változik a matek?",
      cat: "futes",
      minutes: 5,
      tags: ["fűtés", "SCOP"],
      quick: [
        "Gáz: hatásfok (0.75 / 0.92) dönt.",
        "Hőszivattyú: SCOP (pl. 3.2–4.0) a kulcs.",
        "Árarány (Ft/kWh gáz vs villany) nagyon meghatározó."
      ],
      body: `
Ugyanazt a hőt többféleképp lehet előállítani.

• Régi gázkazánnál sok elmegy a veszteségen → alacsony hatásfok.
• Kondenznél jobb a hatásfok.
• Hőszivattyúnál a COP/SCOP azt jelenti: 1 kWh villanyból mennyi hőt csinál.

Ezért tud az lenni, hogy:
jó szigeteléssel + jó SCOP-pal a hőszivattyú matekja hirtelen sokat javul.
      `.trim()
    },
    {
      id: "hohid",
      title: "Hőhidak: a leggyakoribb „nem értem miért penészedik” ok",
      cat: "hibak",
      minutes: 4,
      tags: ["hőhíd", "penész"],
      quick: [
        "A hőhíd hideg felületet csinál → ott csapódik ki a pára.",
        "Koszorú, áthidaló, lábazat, erkélylemez tipikus.",
        "Szigetelésnél a részletek döntik el a végeredményt."
      ],
      body: `
Ha egy sarok/ koszorú/ ablak környéke hideg, ott a levegő párája könnyebben kicsapódik.
Ebből lesz penész.

A kalkulátorban a “Hőhíd korrekció” azért van, mert a valóságban a hőhidak rontják a papír U·A-t.

Gyakorlati tipp:
• csomópontok (lábazat, koszorú) átgondolása,
• belső párakezelés (szellőztetés) is számít.
      `.trim()
    },
    {
      id: "checklist",
      title: "Kérdéslista szakiknak: mit kérdezz, hogy ne bukj pénzt",
      cat: "kerdeslista",
      minutes: 6,
      tags: ["kérdések", "ellenőrzés"],
      quick: [
        "Milyen rétegrend lesz pontosan (anyag + vastagság + ragasztás/dübel)?",
        "Hőhidak kezelése: koszorú/lábazat/nyílászáró csomópont?",
        "Garancia, műszaki leírás, fotódokumentáció?"
      ],
      body: `
Ha ajánlatot kérsz, ezekkel a kérdésekkel gyorsan kiderül, ki profi:

1) Pontos rétegrend (anyagok, vastagságok, gyártó).
2) Részletek: lábazat, koszorú, nyílászáró csatlakozások.
3) Pára/ szellőzés: kell-e plusz megoldás?
4) Munkadíj és anyag külön bontva?
5) Garancia + mit tartalmaz pontosan.

Ezzel nagyon sok “rábeszélős” hibát ki tudsz szűrni.
      `.trim()
    }
  ];

  let docsState = {
    inited: false,
    cat: "all",
    q: "",
    selectedId: "hdd"
  };

  function initDocsOnce() {
    if (docsState.inited) return;

    const search = $("docsSearch");
    const list = $("docsList");

    // ha nincs DOCS UI (valaki még nem cserélte az index részt), ne dobjon hibát
    if (!search || !list) return;

    // keresés
    search.addEventListener("input", () => {
      docsState.q = (search.value || "").trim().toLowerCase();
      renderDocs();
    });

    // kategória gombok
    document.querySelectorAll(".docsChip").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".docsChip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        docsState.cat = btn.dataset.cat || "all";
        renderDocs();
      });
    });

    docsState.inited = true;
  }

  function matchesDoc(d) {
    const q = docsState.q;
    const cat = docsState.cat;

    const catOk = (cat === "all") || (d.cat === cat);
    if (!catOk) return false;

    if (!q) return true;

    const hay = (d.title + " " + d.body + " " + d.tags.join(" ")).toLowerCase();
    return hay.includes(q);
  }

  function renderDocs() {
    const search = $("docsSearch");
    const count = $("docsCount");
    const list = $("docsList");
    const title = $("docsTitle");
    const meta = $("docsMeta");
    const content = $("docsContent");

    if (!list || !count || !title || !meta || !content) return;

    const filtered = DOCS.filter(matchesDoc);

    count.textContent = `${filtered.length} találat`;

    // lista
    list.innerHTML = "";
    filtered.forEach(d => {
      const item = document.createElement("div");
      item.className = "card"; // hasznos a meglévő stílus miatt
      item.style.padding = "12px";
      item.style.borderRadius = "16px";
      item.style.background = "rgba(255,255,255,.03)";
      item.style.cursor = "pointer";
      item.style.border = (d.id === docsState.selectedId)
        ? "1px solid rgba(90,190,255,.45)"
        : "1px solid rgba(255,255,255,.10)";

      item.innerHTML = `
        <div style="font-weight:850; margin-bottom:6px;">${d.title}</div>
        <div class="muted" style="font-size:13px;">
          kategória: <b>${prettyCat(d.cat)}</b> • ~${d.minutes} perc • ${d.tags.map(t => `#${t}`).join(" ")}
        </div>
      `;

      item.addEventListener("click", () => {
        docsState.selectedId = d.id;
        renderDocs();
      });

      list.appendChild(item);
    });

    // ha nincs találat
    if (filtered.length === 0) {
      title.textContent = "Nincs találat";
      meta.textContent = "Próbálj más kulcsszót vagy válts kategóriát.";
      content.innerHTML = "";
      return;
    }

    // kiválasztott cikk
    const selected = filtered.find(d => d.id === docsState.selectedId) || filtered[0];
    docsState.selectedId = selected.id;

    title.textContent = selected.title;
    meta.textContent = `kategória: ${prettyCat(selected.cat)} • ~${selected.minutes} perc • ${selected.tags.map(t => `#${t}`).join(" ")}`;

    content.innerHTML = `
      <div style="margin-bottom:12px; color: rgba(255,255,255,.86); white-space:pre-line;">${escapeHtml(selected.body)}</div>

      <details style="margin-top:10px;">
        <summary>Gyors emlékeztető</summary>
        <div style="margin-top:10px;">
          <ul>
            ${selected.quick.map(x => `<li>${escapeHtml(x)}</li>`).join("")}
          </ul>
        </div>
      </details>
    `;

    // ha a user épp nem a Tudástár nézetben van, ne piszkáljuk a keresőjét
    if (search && search.value !== docsState.q) {
      // semmi
    }
  }

  function prettyCat(cat) {
    if (cat === "alapok") return "Alapok";
    if (cat === "szigeteles") return "Szigetelés";
    if (cat === "futes") return "Fűtés";
    if (cat === "hibak") return "Tipikus hibák";
    if (cat === "kerdeslista") return "Kérdéslista";
    return "Összes";
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  // indulás hash alapján
  initByHash();

})();
