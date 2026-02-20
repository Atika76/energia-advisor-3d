/* Energia Advisor 3D – Valós (C) kalkulátor
   - UA + infiltráció + HDD
   - Kalibrálás: a MOST Ft/év értéket bázisnak vesszük (hogy a modell "valós" legyen)
   - Tudástár (kereső + kategóriák + cikk nézet) + PRO kategória összegzés
   - 3D nézet (MVP) = Profi hőtérkép MOST/CÉL/KÜLÖNBSÉG + PRO Top nyereség kiemelés
   - PRO: Mentés/Betöltés/Megosztás + Export (TXT/JSON) + Nyomtatás
   - PRO: Ajánlás-generátor
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
    [btnHome, btnCalc, btn3d, btnDocs].forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }

  function showView(which) {
    viewHome.style.display = which === "home" ? "" : "none";
    viewCalc.style.display = which === "calc" ? "" : "none";
    view3d.style.display = which === "3d" ? "" : "none";
    viewDocs.style.display = which === "docs" ? "" : "none";

    if (which === "home") setActive(btnHome);
    if (which === "calc") setActive(btnCalc);
    if (which === "3d") setActive(btn3d);
    if (which === "docs") setActive(btnDocs);

    // frissítések
    if (which === "docs") renderDocs();
    if (which === "3d") updateHeatmap();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  btnHome.addEventListener("click", () => { location.hash = "#home"; showView("home"); });
  btnCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  btn3d.addEventListener("click", () => { location.hash = "#3d"; showView("3d"); });
  btnDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

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

  function toast(msg){
    const t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.style.display = "";
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> t.style.display="none", 2600);
  }

  function downloadText(filename, text){
    const blob = new Blob([text], {type:"text/plain;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  function downloadJson(filename, obj){
    const text = JSON.stringify(obj, null, 2);
    const blob = new Blob([text], {type:"application/json;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Material lambdas (W/mK) ----------
  const LAMBDA = {
    eps: 0.037,
    rockwool: 0.039,
    xps: 0.034
  };

  // Base U-values (W/m²K) for "régi" szerkezetek (tipikus közelítés)
  const U_BASE = {
    brick: 1.25,     // régi tégla
    adobe: 1.10,     // vályog
    concrete: 1.60,  // panel/beton
    roof: 1.60,      // födém/padlás szig nélkül
    floor: 1.10,     // aljzat/padló szig nélkül
    window: 2.60     // átlag régi/gyenge ablak
  };

  // fűtés hatásfok / COP
  const HEAT = {
    gas_old: { name: "Régi gázkazán", eff: 0.75 },
    gas_cond: { name: "Kondenzációs gázkazán", eff: 0.92 },
    hp: { name: "Hőszivattyú", eff: null } // COP/SCOP adja
  };

  function uWithInsulation(uBase, thicknessCm, lambda) {
    const t = Math.max(0, thicknessCm) / 100; // m
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

  function heatLossBreakdown(Uwall, Awall, Uwin, Awin, Uroof, Aroof, Ufloor, Afloor, nAir, volume, bridgePct) {
    const H_wall = (Uwall * Awall);
    const H_win  = (Uwin * Awin);
    const H_roof = (Uroof * Aroof);
    const H_floor= (Ufloor * Afloor);
    const Htrans = H_wall + H_win + H_roof + H_floor;
    const Hvent  = 0.33 * nAir * volume; // W/K
    const bridge = 1 + (bridgePct / 100);

    const parts = {
      wall: H_wall * bridge,
      window: H_win * bridge,
      roof: H_roof * bridge,
      floor: H_floor * bridge,
      vent: Hvent * bridge
    };
    const H = (Htrans + Hvent) * bridge;

    return { H, Htrans: Htrans * bridge, Hvent: Hvent * bridge, parts, bridge };
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

    const loss = heatLossBreakdown(
      Uwall, AwallNet,
      Uwin, Awin,
      Uroof, g.roofArea,
      Ufloor, g.floorArea,
      nAir, g.volume,
      bridgePct
    );

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
  const recBox = $("recBox");

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

    recBox && (recBox.innerHTML = `<div class="muted">Az ajánlás az elemzés után jelenik meg.</div>`);
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

  function serializeInputs() {
    return readInputs();
  }

  function applyInputs(obj) {
    if (!obj) return;

    const setVal = (id, v) => {
      const el = $(id);
      if (!el) return;
      el.value = String(v);
    };

    setVal("area", obj.area ?? DEFAULTS.area);
    setVal("storeys", obj.storeys ?? DEFAULTS.storeys);
    setVal("height", obj.height ?? DEFAULTS.height);
    setVal("wallType", obj.wallType ?? DEFAULTS.wallType);
    setVal("winRatio", obj.winRatio ?? DEFAULTS.winRatio);
    setVal("nAir", obj.nAir ?? DEFAULTS.nAir);

    setVal("wallInsNow", obj.wallInsNow ?? DEFAULTS.wallInsNow);
    setVal("wallInsMat", obj.wallInsMat ?? DEFAULTS.wallInsMat);
    setVal("roofInsNow", obj.roofInsNow ?? DEFAULTS.roofInsNow);
    setVal("roofInsMat", obj.roofInsMat ?? DEFAULTS.roofInsMat);
    setVal("floorInsNow", obj.floorInsNow ?? DEFAULTS.floorInsNow);
    setVal("floorInsMat", obj.floorInsMat ?? DEFAULTS.floorInsMat);

    setVal("heatingNow", obj.heatingNow ?? DEFAULTS.heatingNow);
    setVal("scopNow", obj.scopNow ?? DEFAULTS.scopNow);
    setVal("annualCostNow", obj.annualCostNow ?? DEFAULTS.annualCostNow);

    setVal("wallInsTarget", obj.wallInsTarget ?? DEFAULTS.wallInsTarget);
    setVal("roofInsTarget", obj.roofInsTarget ?? DEFAULTS.roofInsTarget);
    setVal("floorInsTarget", obj.floorInsTarget ?? DEFAULTS.floorInsTarget);

    setVal("heatingTarget", obj.heatingTarget ?? DEFAULTS.heatingTarget);
    setVal("scopTarget", obj.scopTarget ?? DEFAULTS.scopTarget);

    setVal("hdd", obj.hdd ?? DEFAULTS.hdd);
    setVal("priceGas", obj.priceGas ?? DEFAULTS.priceGas);
    setVal("priceEl", obj.priceEl ?? DEFAULTS.priceEl);

    setVal("bridge", obj.bridge ?? DEFAULTS.bridge);
    setVal("costWallM2", obj.costWallM2 ?? DEFAULTS.costWallM2);
    setVal("costRoofM2", obj.costRoofM2 ?? DEFAULTS.costRoofM2);
    setVal("costFloorM2", obj.costFloorM2 ?? DEFAULTS.costFloorM2);
    setVal("costHeating", obj.costHeating ?? DEFAULTS.costHeating);
  }

  // Megosztás link: query paramokban JSON (base64url)
  function base64UrlEncode(str){
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  }
  function base64UrlDecode(str){
    const b64 = str.replace(/-/g,"+").replace(/_/g,"/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const bin = atob(b64 + pad);
    return decodeURIComponent(escape(bin));
  }

  function buildShareLink(){
    const state = serializeInputs();
    const payload = base64UrlEncode(JSON.stringify(state));
    const url = new URL(location.href);
    url.hash = "#calc";
    url.searchParams.set("s", payload);
    return url.toString();
  }

  function tryLoadFromUrl(){
    try{
      const url = new URL(location.href);
      const s = url.searchParams.get("s");
      if (!s) return false;
      const json = base64UrlDecode(s);
      const obj = JSON.parse(json);
      applyInputs(obj);
      toast("✅ Betöltve a megosztott linkből");
      return true;
    } catch(e){
      console.warn("Share load error", e);
      return false;
    }
  }

  function investmentCosts(sNow, sTarget, areas, costs) {
    const deltaWall = Math.max(0, sTarget.wall - sNow.wall);
    const deltaRoof = Math.max(0, sTarget.roof - sNow.roof);
    const deltaFloor = Math.max(0, sTarget.floor - sNow.floor);

    const wallCost = areas.AwallNet * costs.costWallM2 * (deltaWall / 10);
    const roofCost = areas.Aroof * costs.costRoofM2 * (deltaRoof / 10);
    const floorCost = areas.Afloor * costs.costFloorM2 * (deltaFloor / 10);
    const heatCost = costs.costHeating;

    return { wallCost, roofCost, floorCost, heatCost };
  }

  function renderResult(out) {
    resultBox.innerHTML = out;
  }

  function buildRecommendation(payload){
    const {
      savingYear, improve, prio, pbRoof, pbWall, pbFloor, pbHeat,
      inv, x, saveOnlyHeat, saveOnlyRoof, saveOnlyWall, saveOnlyFloor
    } = payload;

    const top = prio[0];
    const second = prio[1];
    const third = prio[2];

    const fmtStep = (k, v) => `<li><b>${k}:</b> ~ ${fmtFt(v)} / év</li>`;

    const pbMap = {
      "Fűtés": pbHeat,
      "Födém/padlás": pbRoof,
      "Fal": pbWall,
      "Padló/aljzat": pbFloor
    };

    const topPb = pbMap[top.k];

    const safety = `
      <div class="tiny muted">
        Megjegyzés: ez döntéstámogatás. A valós megtérülést a kivitelezés minősége, hőhidak, légzárás, árak, használati szokások befolyásolják.
      </div>
    `;

    const “oneTwo” = `
      <div class="out">
        <div class="sectionTitle">1–2 lépéses javaslat</div>
        <ul>
          ${fmtStep(top.k, top.v)}
          ${fmtStep(second.k, second.v)}
        </ul>
        <div class="muted">Ha csak két dolgot csinálsz: ezek hozzák a legtöbb éves megtakarítást a MOST-hoz képest.</div>
      </div>
    `;

    const paybackBlock = `
      <div class="out">
        <div class="sectionTitle">Megtérülés gyorsan</div>
        <ul>
          <li><b>Födém:</b> ${fmtYears(pbRoof)} • beruházás: ${fmtFt(inv.roofCost)}</li>
          <li><b>Fal:</b> ${fmtYears(pbWall)} • beruházás: ${fmtFt(inv.wallCost)}</li>
          <li><b>Padló:</b> ${fmtYears(pbFloor)} • beruházás: ${fmtFt(inv.floorCost)}</li>
          <li><b>Fűtés:</b> ${fmtYears(pbHeat)} • beruházás: ${fmtFt(inv.heatCost)}</li>
        </ul>
      </div>
    `;

    const nuance = `
      <div class="out">
        <div class="sectionTitle">Mit jelent ez emberi nyelven?</div>
        <div class="muted">
          <b>Össz megtakarítás:</b> ~ ${fmtFt(savingYear)} / év (~ ${fmtFtShort(savingYear/12)} Ft/hó).<br/>
          <b>Hőigény javulás:</b> ${fmtPct(improve*100)}.<br/><br/>
          <b>Top nyereség:</b> ${top.k} (várhatóan a legnagyobb Ft/év hatás).<br/>
          <b>Ha a megtérülés számít:</b> nézd meg, melyik lépés ad <b>~10 év alatti</b> értéket a listában.
        </div>
      </div>
    `;

    return `
      ${oneTwo}
      ${nuance}
      ${paybackBlock}
      ${safety}
    `;
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
      { k: "Fűtés", v: saveOnlyHeat },
      { k: "Födém/padlás", v: saveOnlyRoof },
      { k: "Fal", v: saveOnlyWall },
      { k: "Padló/aljzat", v: saveOnlyFloor }
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

    // PRO ajánlás
    if (recBox){
      recBox.innerHTML = buildRecommendation({
        savingYear, improve, prio,
        pbRoof, pbWall, pbFloor, pbHeat,
        inv, x, saveOnlyHeat, saveOnlyRoof, saveOnlyWall, saveOnlyFloor
      });
    }

    // ha épp 3D nézeten van, frissüljön
    if ((location.hash || "").includes("3d")) updateHeatmap();
  }

  // events
  btnRun?.addEventListener("click", calcAll);
  btnReset?.addEventListener("click", () => {
    setDefaults();
    renderResult(`<div class="muted">Kattints az <b>Elemzés</b> gombra.</div>`);
    if ((location.hash || "").includes("3d")) updateHeatmap();
  });

  // PRO: Mentés / Betöltés / Megosztás / Export / Print
  $("btnSave")?.addEventListener("click", () => {
    const state = serializeInputs();
    localStorage.setItem("ea3d_state", JSON.stringify(state));
    toast("✅ Mentve (helyben, ezen a böngészőn)");
  });

  $("btnLoad")?.addEventListener("click", () => {
    const s = localStorage.getItem("ea3d_state");
    if (!s) return toast("Nincs mentett állapot.");
    try{
      applyInputs(JSON.parse(s));
      toast("✅ Betöltve (Mentésből)");
    }catch{
      toast("Hiba: a mentés sérült.");
    }
  });

  $("btnShare")?.addEventListener("click", () => {
    const box = $("shareBox");
    const input = $("shareLink");
    if (!box || !input) return;
    const link = buildShareLink();
    input.value = link;
    box.style.display = "";
    input.focus();
    input.select();
    try { document.execCommand("copy"); toast("🔗 Link kimásolva"); } catch {}
  });

  $("btnExportTxt")?.addEventListener("click", () => {
    const state = serializeInputs();
    const txt =
`Energia Advisor 3D – export (TXT)
--------------------------------
Alapterület: ${state.area} m²
Szintek: ${state.storeys}
Belmagasság: ${state.height} m
Falazat: ${state.wallType}
Ablakarány: ${state.winRatio}%
Légcsere: ${state.nAir} 1/h

MOST:
- Fal szigetelés: ${state.wallInsNow} cm (${state.wallInsMat})
- Födém: ${state.roofInsNow} cm (${state.roofInsMat})
- Padló: ${state.floorInsNow} cm (${state.floorInsMat})
- Fűtés: ${state.heatingNow}
- SCOP: ${state.scopNow}
- Éves költség: ${state.annualCostNow} Ft

CÉL:
- Fal: ${state.wallInsTarget} cm
- Födém: ${state.roofInsTarget} cm
- Padló: ${state.floorInsTarget} cm
- Fűtés: ${state.heatingTarget}
- SCOP: ${state.scopTarget}

Árak:
- HDD: ${state.hdd}
- Gáz: ${state.priceGas} Ft/kWh
- Villany: ${state.priceEl} Ft/kWh
- Hőhíd: ${state.bridge}%

Megjegyzés: döntéstámogatás, becslés.
`;
    downloadText("energia-advisor-export.txt", txt);
    toast("⬇️ TXT export kész");
  });

  $("btnExportJson")?.addEventListener("click", () => {
    const state = serializeInputs();
    downloadJson("energia-advisor-export.json", { savedAt: new Date().toISOString(), state });
    toast("⬇️ JSON export kész");
  });

  $("btnPrint")?.addEventListener("click", () => {
    // A böngésző nyomtatás – PDF-be menthető
    window.print();
  });

  // init defaults (előbb)
  setDefaults();

  // próbáljuk betölteni share linkből
  tryLoadFromUrl();

  // ---------- TUDÁSTÁR ----------
  const DOCS = [
    {
      id: "hdd",
      cat: "Alapok",
      read: "~3 perc",
      tags: ["HDD", "alapok"],
      title: "Mi az a HDD (fűtési foknap) és miért számít?",
      body: `
A HDD (Heating Degree Days) azt mutatja meg, mennyire volt hideg egy évben/idényben egy adott helyen.
Minél nagyobb a HDD, annál több fűtési energia kell ugyanahhoz a házhoz.<br/><br/>
<b>Magyar irányszám:</b> ~3000 (településtől függ). A kalkulátor azért kéri, hogy országos átlaggal is lehessen becsülni.<br/><br/>
<b>Gyakorlat:</b> ha ugyanaz a ház hidegebb környéken van, a MOST költség magasabb → a megtakarítás forintban is magasabb lehet.
      `.trim()
    },
    {
      id: "infil",
      cat: "Alapok",
      read: "~4 perc",
      tags: ["légcsere", "infiltráció"],
      title: "Légcsere (infiltráció): a láthatatlan pénzégető",
      body: `
A ház nem csak falon keresztül veszít hőt: a részeken, nyílászárókon, résekben <b>ki-be áramlik a levegő</b>.
Ez sokszor nagyobb tétel, mint gondolnád.<br/><br/>
<b>Tipikus jelek:</b> huzat, hideg padló, penész sarkokban, gyors kihűlés.<br/><br/>
<b>Mit tehetsz?</b> Nyílászáró beállítás/tömítés, légzárás, padlásfeljáró tömítése, kémény/áttörések rendbetétele.
      `.trim()
    },
    {
      id: "roof",
      cat: "Szigetelés",
      read: "~3 perc",
      tags: ["födém", "prioritás"],
      title: "Miért a födém a legjobb első lépés sok háznál?",
      body: `
A meleg levegő felfelé száll, ezért a födém/padlás felé gyakran óriási a veszteség.
Általában gyorsan kivitelezhető, és <b>nagyon jó a megtérülése</b>.<br/><br/>
<b>Irány:</b> 20–30 cm födémszigetelés sok esetben “best buy”.
      `.trim()
    },
    {
      id: "wall",
      cat: "Szigetelés",
      read: "~4 perc",
      tags: ["fal", "EPS", "kőzetgyapot"],
      title: "Fal szigetelés: miért nem mindegy 5 cm vs 15 cm?",
      body: `
A fal U-értéke a szigeteléssel látványosan javul, de nem lineárisan.
5 cm már segít, de 12–15 cm gyakran sokkal jobb kompromisszum.<br/><br/>
<b>Fontos:</b> ne csak vastagság legyen: lábazat, hőhíd, dübelezés, hálózás, csomópontok.
      `.trim()
    },
    {
      id: "floor",
      cat: "Szigetelés",
      read: "~3 perc",
      tags: ["padló", "komfort"],
      title: "Padló/aljzat szigetelés: mikor éri meg?",
      body: `
A padló szigetelése sokszor <b>komfortot</b> hoz: melegebb padló, kisebb huzatérzet.
Megtérülésben vegyes: ha nagy a padló veszteség (pl. alápincézett, hideg talaj), akkor jó lépés lehet.
      `.trim()
    },
    {
      id: "heat",
      cat: "Fűtés",
      read: "~5 perc",
      tags: ["fűtés", "SCOP"],
      title: "Régi gázkazán vs kondenz vs hőszivattyú: miért változik a matek?",
      body: `
Nem ugyanaz, hogy a hőigényt milyen hatásfokkal állítod elő.
Régi kazánnál rosszabb a hasznosítás, kondenznál jobb, hőszivattyúnál pedig a COP/SCOP számít.<br/><br/>
<b>Tipp:</b> előbb szigetelés/légzárás, utána fűtéscsere – így kisebb gép is elég lehet.
      `.trim()
    },
    {
      id: "bridge",
      cat: "Tipikus hibák",
      read: "~4 perc",
      tags: ["hőhíd", "penész"],
      title: "Hőhidak: a leggyakoribb “nem értem miért penészedik” ok",
      body: `
A hőhíd olyan pont, ahol a hő könnyebben elszökik (koszorú, áthidaló, lábazat, erkélycsatlakozás).
Ott hidegebb a felület → kicsapódik a pára → penész.<br/><br/>
Ezért fontos a csomóponti gondolkodás, nem csak a “cm”.
      `.trim()
    },
    {
      id: "checklist",
      cat: "Kérdéslista",
      read: "~6 perc",
      tags: ["kérdések", "ellenőrzés"],
      title: "Kérdéslista szakiknak: mit kérdezz, hogy ne bukj pénzt",
      body: `
<b>Gyors lista:</b><br/>
• Milyen rétegrendet javasolsz és miért?<br/>
• Lábazat, koszorú, nyílászáró körül hogyan oldod meg?<br/>
• Páratechnika: kell-e párafék/páraáteresztés?<br/>
• Garancia, referencia, határidő?<br/>
• Pontos anyaglista + munkadíj bontás?<br/><br/>
Ezekkel elkerülhető sok “jó lesz az úgy” típusú bukás.
      `.trim()
    }
  ];

  let docFilterCat = "Összes";
  let docSearch = "";
  let docSelectedId = DOCS[0].id;

  function setDocChipActive(btn) {
    const ids = ["docChipAll","docChipBasics","docChipIns","docChipHeat","docChipMist","docChipList"];
    ids.forEach(i => $(i)?.classList.remove("active"));
    btn?.classList.add("active");
  }

  function renderDocCatSummary(filtered){
    const el = $("docCatSummary");
    if (!el) return;

    const cat = docFilterCat;
    if (cat === "Összes"){
      el.innerHTML = `Itt találsz gyors, érthető cikkeket felújításhoz: <b>alapok</b>, <b>szigetelés</b>, <b>fűtés</b>, tipikus hibák és kérdéslista.`;
      return;
    }

    const topTags = {};
    filtered.forEach(d => d.tags.forEach(t => topTags[t]=(topTags[t]||0)+1));
    const tags = Object.entries(topTags).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>`#${x[0]}`).join(" ");

    const map = {
      "Alapok":"Fogalmak és alap összefüggések (HDD, légcsere), hogy értsd a számokat.",
      "Szigetelés":"Melyik szerkezetet érdemes először? Mennyit hoz a vastagság? Tippek csomópontokra.",
      "Fűtés":"Kazán vs kondenz vs hőszivattyú – miért változik a matek, és mikor érdemes cserélni.",
      "Tipikus hibák":"A leggyakoribb bakik, amik pénzt visznek: hőhidak, penész, rossz csomópontok.",
      "Kérdéslista":"Mit kérdezz a szakiktól, hogy ne bukj pénzt (anyagok, rétegrend, garancia)."
    };

    el.innerHTML = `
      <div class="muted"><b>${cat}:</b> ${map[cat] || ""}</div>
      <div class="tiny muted" style="margin-top:6px;">Népszerű címkék: ${tags || "–"}</div>
    `;
  }

  function renderDocs() {
    const searchEl = $("docSearch");
    const listEl = $("docList");
    const viewEl = $("docView");
    const countEl = $("docCount");
    if (!listEl || !viewEl) return;

    const q = (docSearch || "").trim().toLowerCase();
    const filtered = DOCS.filter(d => {
      const catOk = (docFilterCat === "Összes") ? true : d.cat === docFilterCat;
      if (!catOk) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.body.toLowerCase().includes(q) ||
        d.tags.join(" ").toLowerCase().includes(q)
      );
    });

    countEl.textContent = String(filtered.length);
    renderDocCatSummary(filtered);

    if (!filtered.some(d => d.id === docSelectedId) && filtered.length) {
      docSelectedId = filtered[0].id;
    }

    listEl.innerHTML = filtered.map(d => {
      const active = d.id === docSelectedId ? "active" : "";
      return `
        <div class="docItem ${active}" data-doc="${d.id}">
          <div class="docTitle">${d.title}</div>
          <p class="docMeta">kategória: <b>${d.cat}</b> • ${d.read} • #${d.tags.join(" #")}</p>
        </div>
      `;
    }).join("");

    const sel = DOCS.find(d => d.id === docSelectedId) || filtered[0];
    if (sel) {
      viewEl.innerHTML = `
        <div class="miniTitle">${sel.title}</div>
        <div class="docMeta">kategória: <b>${sel.cat}</b> • ${sel.read} • #${sel.tags.join(" #")}</div>
        <div class="docBody">${sel.body}</div>

        <details style="margin-top:14px;">
          <summary>▶ Gyors emlékeztető: mit számol a kalkulátor?</summary>
          <div class="docBody">
            <b>H</b> = Σ(U·A) + <b>Hvent</b><br/>
            Hvent ≈ 0.33 · n · V<br/>
            <b>Q</b> ≈ H · HDD · 24 / 1000<br/><br/>
            A “MOST” Ft/év alapján a modell kalibrál (hogy a bázis a te valós költséged legyen).
          </div>
        </details>

        <div class="docTags">
          ${sel.tags.map(t => `<span class="tag">#${t}</span>`).join("")}
        </div>
      `;
    } else {
      viewEl.innerHTML = `<div class="miniTitle">Nincs találat</div><div class="muted">Próbáld más kulcsszóval.</div>`;
    }

    listEl.querySelectorAll(".docItem").forEach(el => {
      el.addEventListener("click", () => {
        docSelectedId = el.getAttribute("data-doc");
        renderDocs();
      });
    });

    if (searchEl) searchEl.value = docSearch;
  }

  // docs events
  $("docSearch")?.addEventListener("input", (e) => {
    docSearch = e.target.value || "";
    renderDocs();
  });

  $("docChipAll")?.addEventListener("click", () => { docFilterCat = "Összes"; setDocChipActive($("docChipAll")); renderDocs(); });
  $("docChipBasics")?.addEventListener("click", () => { docFilterCat = "Alapok"; setDocChipActive($("docChipBasics")); renderDocs(); });
  $("docChipIns")?.addEventListener("click", () => { docFilterCat = "Szigetelés"; setDocChipActive($("docChipIns")); renderDocs(); });
  $("docChipHeat")?.addEventListener("click", () => { docFilterCat = "Fűtés"; setDocChipActive($("docChipHeat")); renderDocs(); });
  $("docChipMist")?.addEventListener("click", () => { docFilterCat = "Tipikus hibák"; setDocChipActive($("docChipMist")); renderDocs(); });
  $("docChipList")?.addEventListener("click", () => { docFilterCat = "Kérdéslista"; setDocChipActive($("docChipList")); renderDocs(); });

  // ---------- HEATMAP (MVP + PRO) ----------
  let hmMode = "now"; // now | target | delta

  const hmModeNow = $("hmModeNow");
  const hmModeTarget = $("hmModeTarget");
  const hmModeDelta = $("hmModeDelta");

  function setHmActive(btn){
    [hmModeNow, hmModeTarget, hmModeDelta].forEach(b => b?.classList.remove("active"));
    btn?.classList.add("active");
  }

  hmModeNow?.addEventListener("click", () => { hmMode = "now"; setHmActive(hmModeNow); updateHeatmap(); });
  hmModeTarget?.addEventListener("click", () => { hmMode = "target"; setHmActive(hmModeTarget); updateHeatmap(); });
  hmModeDelta?.addEventListener("click", () => { hmMode = "delta"; setHmActive(hmModeDelta); updateHeatmap(); });

  // Prioritás színskála: zöld -> sárga -> piros (döntéstámogatás)
  function colorForValue01(x){
    const v = clamp(x, 0, 1);
    const hue = (1 - v) * 140; // 140=zöld, 0=piros
    const sat = 85;
    const light = 45;
    const alpha = 0.85;
    return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
  }

  function setBlock(id, v01){
    const el = $(id);
    if (!el) return;
    el.style.background = colorForValue01(v01);
  }

  // Csak a SZÍNEZÉSHEZ: normalizálás 0..1-re, hogy látható különbség legyen
  function normalizeForViz(ratios, keys){
    const vals = keys.map(k => ratios[k] ?? 0);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);

    if (Math.abs(maxV - minV) < 1e-9) {
      const out = {};
      keys.forEach(k => out[k] = 0.5);
      return out;
    }

    const gamma = 0.65;
    const out = {};
    keys.forEach(k => {
      const v = (ratios[k] ?? 0);
      const n = (v - minV) / (maxV - minV);
      out[k] = Math.pow(clamp(n, 0, 1), gamma);
    });
    return out;
  }

  function scenarioFromInputs(which){
    const x = readInputs();
    if (which === "now") {
      return computeScenario({
        area: x.area, storeys: x.storeys, height: x.height,
        wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
        wallInsCm: x.wallInsNow, wallInsMat: x.wallInsMat,
        roofInsCm: x.roofInsNow, roofInsMat: x.roofInsMat,
        floorInsCm: x.floorInsNow, floorInsMat: x.floorInsMat
      });
    }
    return computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsTarget, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsTarget, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsTarget, floorInsMat: x.floorInsMat
    });
  }

  function updateHeatmap(){
    const list = $("hmList");
    if (!list) return;

    const now = scenarioFromInputs("now");
    const target = scenarioFromInputs("target");

    const partsNow = now.H.parts;
    const partsTar = target.H.parts;

    const keys = ["roof","wall","window","floor","vent"];

    let parts = {};
    let explain = "";

    if (hmMode === "now") {
      parts = partsNow;
      explain = "MOST: megmutatja, hogy a jelenlegi állapotban hol megy el a hő arányosan (H bontás).";
    } else if (hmMode === "target") {
      parts = partsTar;
      explain = "CÉL: megmutatja, hogy a cél állapotban hol marad veszteség (még szigetelés után is).";
    } else {
      keys.forEach(k => parts[k] = Math.max(0, (partsNow[k]||0) - (partsTar[k]||0)));
      explain = "KÜLÖNBSÉG: azt mutatja, hol csökken a legjobban a veszteség MOST → CÉL között. Ez a “hol nyersz a legtöbbet” nézet.";
    }

    const total = keys.reduce((s,k)=> s + (parts[k]||0), 0) || 1;

    const ratios = {};
    keys.forEach(k => ratios[k] = (parts[k]||0) / total);

    const viz = normalizeForViz(ratios, keys);

    setBlock("hmRoof", viz.roof);
    setBlock("hmFloor", viz.floor);
    setBlock("hmVent", viz.vent);

    setBlock("hmWallL", viz.wall);
    setBlock("hmWallC", viz.wall);
    setBlock("hmWallR", viz.wall);

    setBlock("hmWin", viz.window);

    const labelMap = {
      roof: "Födém",
      wall: "Fal",
      window: "Ablak",
      floor: "Padló",
      vent: "Légcsere"
    };

    const rows = keys
      .map(k => ({
        k,
        label: labelMap[k],
        val: parts[k] || 0,
        pct: (ratios[k]||0) * 100
      }))
      .sort((a,b)=> b.val - a.val);

    const top = rows[0];

    list.innerHTML = rows.map((r, idx) => `
      <div class="hmRow" style="${idx===0 ? 'border-color: rgba(255,59,59,.40);' : ''}">
        <div class="hmTop">
          <div>${r.label} ${idx===0 ? '<span class="tag">TOP</span>' : ''}</div>
          <div>${fmtPct(r.pct)}</div>
        </div>
        <div class="hmBar"><div class="hmFill" style="width:${Math.round(r.pct)}%"></div></div>
        <div class="hmMeta">H hozzájárulás: <b>${r.val.toFixed(0)} W/K</b></div>
      </div>
    `).join("");

    const ex = $("hmExplain");
    if (ex) ex.textContent = explain;

    const tg = $("hmTopGain");
    if (tg){
      if (hmMode !== "delta"){
        tg.innerHTML = `Válts <b>KÜLÖNBSÉG</b> nézetre, és megmutatom, hol nyersz a legtöbbet.`;
      } else {
        tg.innerHTML = `<b>Top nyereség:</b> ${top.label} • ~ ${fmtPct(top.pct)} (a MOST→CÉL csökkenésből)`;
      }
    }
  }

  // ---------- START ----------
  initByHash();
})();
