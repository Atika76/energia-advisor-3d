/* Energia Advisor 3D – main.js (HTML-hez igazítva)
   - Navigáció (Kezdő/Calc/PRO/Plan/3D/Docs)
   - SzakiPiac gomb automatikus beszúrása (ha nincs)
   - Tudástár: cikklista + kereső + chip szűrés + cikk nézet
   - 3D hőtérkép (MVP): MOST/CÉL/KÜLÖNBSÉG + bontás lista + gyors értelmezés
   - Mentés/betöltés: LocalStorage
   - Export/Import: JSON fájl letöltés + fájl kiválasztó
   - PDF: window.print()
   - PRO: geometriák + élő összegzés + PRO alkalmazás/kikapcsolás
*/

(function () {
  "use strict";

  // ---------------- helpers ----------------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, d = 0) => {
    const p = Math.pow(10, d);
    return Math.round(v * p) / p;
  };
  const fmt = (n) => (isFinite(n) ? n.toLocaleString("hu-HU") : "–");
  const fmt1 = (n) => (isFinite(n) ? round(n, 1).toLocaleString("hu-HU") : "–");

  // ---------------- config ----------------
  const SZAKIPIAC_HOME_URL = "https://szakipiac-2025.hu";
  const LS_KEY = "ea3d_state_v4";
  const LS_LAST = "ea3d_last_result_v4";
  const LS_DOCS = "ea3d_docs_v1";
  const LS_HM_MODE = "ea3d_hm_mode_v1";

  // ---------------- views ----------------
  const viewHome = $("viewHome");
  const viewCalc = $("viewCalc");
  const viewPro = $("viewPro");
  const viewPlan = $("viewPlan");
  const view3d = $("view3d");
  const viewDocs = $("viewDocs");

  // nav buttons
  const btnHome = $("btnHome");
  const btnCalc = $("btnCalc");
  const btnPro = $("btnPro");
  const btnPlan = $("btnPlan");
  const btn3d = $("btn3d");
  const btnDocs = $("btnDocs");

  // home actions
  const homeGoCalc = $("homeGoCalc");
  const homeGoDocs = $("homeGoDocs");

  // calc buttons
  const btnCalcRun = $("btnCalcRun");
  const btnReset = $("btnReset");
  const btnShare = $("btnShare");
  const btnLead = $("btnLead");

  // calc header buttons (a te HTML-ed szerint!)
  const btnSaveState = $("btnSaveState");
  const btnLoadState = $("btnLoadState");
  const btnClearState = $("btnClearState");
  const btnExportState = $("btnExportState");
  const btnImportState = $("btnImportState");
  const btnExportPDF = $("btnExportPDF");

  const resultBox = $("resultBox");

  // plan
  const planBox = $("planBox");
  const planLockedNote = $("planLockedNote");
  const btnExportPDF_Plan = $("btnExportPDF_Plan");

  // PRO
  const btnProApply = $("btnProApply");
  const btnProOff = $("btnProOff");
  const proSummary = $("proSummary");

  // 3D
  const hmModeNow = $("hmModeNow");
  const hmModeTarget = $("hmModeTarget");
  const hmModeDelta = $("hmModeDelta");
  const hmRoof = $("hmRoof");
  const hmWallL = $("hmWallL");
  const hmWallR = $("hmWallR");
  const hmWin = $("hmWin");
  const hmFloor = $("hmFloor");
  const hmVent = $("hmVent");
  const hmList = $("hmList");
  const hmExplain = $("hmExplain");
  const btnExportPDF_3D = $("btnExportPDF_3D");

  // docs
  const docSearch = $("docSearch");
  const docList = $("docList");
  const docView = $("docView");
  const docCount = $("docCount");
  const chipAll = $("docChipAll");
  const chipBasics = $("docChipBasics");
  const chipIns = $("docChipIns");
  const chipHeat = $("docChipHeat");
  const chipMist = $("docChipMist");
  const chipList = $("docChipList");

  // ---------------- state ----------------
  let activeView = "home";
  let activeDocCat = "all";
  let activeDocId = null;
  let hmMode = localStorage.getItem(LS_HM_MODE) || "now";

  // ---------------- inject SzakiPiac button (if not present) ----------------
  function ensureSzakiPiacButton() {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    if ($("btnSzakiPiac")) return;

    const existing = Array.from(nav.querySelectorAll("button")).find((b) =>
      (b.textContent || "").toLowerCase().includes("szakipiac")
    );

    if (existing) {
      existing.id = existing.id || "btnSzakiPiac";
      existing.addEventListener("click", () => (window.location.href = SZAKIPIAC_HOME_URL));
      return;
    }

    const b = document.createElement("button");
    b.id = "btnSzakiPiac";
    b.className = "navBtn";
    b.type = "button";
    b.textContent = "← SzakiPiac";
    b.addEventListener("click", () => (window.location.href = SZAKIPIAC_HOME_URL));
    nav.insertBefore(b, nav.firstChild);
  }

  // ---------------- view switching ----------------
  function setActiveNav(btn) {
    const navBtns = document.querySelectorAll(".navBtn");
    navBtns.forEach((x) => x.classList.remove("active"));
    if (btn) btn.classList.add("active");
  }

  function hideAll() {
    [viewHome, viewCalc, viewPro, viewPlan, view3d, viewDocs].filter(Boolean).forEach((v) => {
      v.style.display = "none";
    });
  }

  function go(view) {
    activeView = view;
    hideAll();

    if (view === "home" && viewHome) {
      viewHome.style.display = "";
      setActiveNav(btnHome);
      return;
    }

    if (view === "calc" && viewCalc) {
      viewCalc.style.display = "";
      setActiveNav(btnCalc);
      updatePlanLock();
      return;
    }

    if (view === "pro" && viewPro) {
      viewPro.style.display = "";
      setActiveNav(btnPro);
      renderProSummary();
      return;
    }

    if (view === "plan" && viewPlan) {
      viewPlan.style.display = "";
      setActiveNav(btnPlan);
      updatePlanLock();
      renderPlanFromLast();
      return;
    }

    if (view === "3d" && view3d) {
      view3d.style.display = "";
      setActiveNav(btn3d);
      renderHeatmapFromLast();
      return;
    }

    if (view === "docs" && viewDocs) {
      viewDocs.style.display = "";
      setActiveNav(btnDocs);
      renderDocs();
      return;
    }

    // fallback
    if (viewHome) {
      viewHome.style.display = "";
      setActiveNav(btnHome);
    }
  }

  // ---------------- inputs ----------------
  const inputIds = [
    "area",
    "storeys",
    "height",
    "wallType",
    "winRatio",
    "nAir",
    "wallInsNow",
    "wallInsMat",
    "roofInsNow",
    "roofInsMat",
    "floorInsNow",
    "floorInsMat",
    "heatingNow",
    "scopNow",
    "annualCostNow",
    "wallInsTarget",
    "roofInsTarget",
    "floorInsTarget",
    "heatingTarget",
    "scopTarget",
    "hdd",
    "priceGas",
    "priceEl",
    "bridge",
    "costWallM2",
    "costRoofM2",
    "costFloorM2",
    "costHeating",
  ];

  // PRO ids – a TE HTML-ed szerint
  const proIds = [
    "proEnabled",    // 0/1
    "proSyncArea",   // 0/1
    "proLen",
    "proWid",
    "proPerim",
    "proWallArea",
    "proWinArea",
    "proRoofArea",
    "proFloorArea",
    "proVolume",
    "proAreaTotal",
  ];

  function getVal(id) {
    const el = $(id);
    if (!el) return null;

    if (el.tagName === "SELECT") return el.value;

    const t = el.type || "";
    if (t === "checkbox") return !!el.checked;

    const v = el.value;
    if (v === "" || v == null) return null;

    const n = Number(v);
    return isNaN(n) ? v : n;
  }

  function setVal(id, v) {
    const el = $(id);
    if (!el) return;

    if (el.tagName === "SELECT") {
      el.value = v ?? el.value;
      return;
    }

    const t = el.type || "";
    if (t === "checkbox") {
      el.checked = !!v;
      return;
    }

    el.value = v ?? "";
  }

  function defaults() {
    return {
      area: 100,
      storeys: "1",
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
      costWallM2: 150000,
      costRoofM2: 120000,
      costFloorM2: 150000,
      costHeating: 3500000,

      // PRO defaults (TE HTML-ed: 0/1)
      proEnabled: "0",
      proSyncArea: "1",
      proLen: 10,
      proWid: 10,
      proPerim: 0,
      proWallArea: 0,
      proWinArea: 0,
      proRoofArea: 0,
      proFloorArea: 0,
      proVolume: 0,
      proAreaTotal: 0,
    };
  }

  function collectState() {
    const s = {};
    inputIds.forEach((id) => (s[id] = getVal(id)));
    proIds.forEach((id) => (s[id] = getVal(id)));
    return s;
  }

  function applyState(s) {
    if (!s) return;
    inputIds.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(s, id)) setVal(id, s[id]);
    });
    proIds.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(s, id)) setVal(id, s[id]);
    });
  }

  // ---------------- toast ----------------
  let toastTimer = null;
  function toast(msg) {
    let t = $("ea_toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "ea_toast";
      t.style.position = "fixed";
      t.style.left = "50%";
      t.style.bottom = "22px";
      t.style.transform = "translateX(-50%)";
      t.style.padding = "10px 14px";
      t.style.borderRadius = "12px";
      t.style.background = "rgba(15, 20, 35, 0.85)";
      t.style.border = "1px solid rgba(255,255,255,0.12)";
      t.style.color = "rgba(255,255,255,0.92)";
      t.style.zIndex = "9999";
      t.style.fontSize = "14px";
      t.style.backdropFilter = "blur(10px)";
      t.style.boxShadow = "0 12px 30px rgba(0,0,0,0.25)";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (t) t.style.opacity = "0";
    }, 1400);
  }

  // ---------------- Export / Import ----------------
  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportJson() {
    const payload = { ver: 1, ts: new Date().toISOString(), state: collectState(), last: safeReadLast() };
    downloadText("energia-advisor-mentes.json", JSON.stringify(payload, null, 2));
    toast("Export kész (JSON letöltve).");
  }

  function importJson() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.addEventListener("change", async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      try {
        const txt = await file.text();
        const payload = JSON.parse(txt);
        if (payload && payload.state) {
          applyState(payload.state);
          saveStateLocal(false);
          if (payload.last) saveLast(payload.last);
          toast("Import sikeres.");
          renderProSummary();
          renderHeatmapFromLast();
          updatePlanLock();
        } else {
          toast("Hibás fájl (nincs state).");
        }
      } catch {
        toast("Hibás JSON.");
      }
    });
    inp.click();
  }

  // ---------------- local save/load ----------------
  function saveStateLocal(showToast = true) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(collectState()));
      if (showToast) toast("Mentve (helyben).");
    } catch {
      if (showToast) toast("Mentés hiba.");
    }
  }

  function loadStateLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (s) {
        applyState(s);
        toast("Betöltve.");
        renderProSummary();
        updatePlanLock();
        renderHeatmapFromLast();
      } else {
        toast("Nincs mentés.");
      }
    } catch {
      toast("Betöltés hiba.");
    }
  }

  function clearStateLocal() {
    localStorage.removeItem(LS_KEY);
    toast("Mentés törölve.");
  }

  function saveLast(r) {
    try {
      localStorage.setItem(LS_LAST, JSON.stringify(r));
    } catch {}
  }

  function safeReadLast() {
    try {
      const x = localStorage.getItem(LS_LAST);
      return x ? JSON.parse(x) : null;
    } catch {
      return null;
    }
  }

  // ---------------- model ----------------
  function materialLambda(mat) {
    if (mat === "eps") return 0.038;
    if (mat === "xps") return 0.034;
    if (mat === "rockwool") return 0.039;
    return 0.038;
  }

  function baseUForWall(type) {
    if (type === "adobe") return 1.1;
    if (type === "concrete") return 1.4;
    return 1.2;
  }

  function uAfterInsulation(uBase, insCm, mat) {
    const d = Math.max(0, Number(insCm) || 0) / 100;
    if (d <= 0) return uBase;
    const lambda = materialLambda(mat);
    const r0 = 1 / Math.max(0.0001, uBase);
    const rIns = d / Math.max(0.0001, lambda);
    return 1 / (r0 + rIns);
  }

  function geometryAUTO(s) {
    const area = Math.max(1, Number(s.area) || 100);
    const storeys = Math.max(1, Number(s.storeys) || 1);
    const height = Math.max(2.2, Number(s.height) || 2.6);

    const fp = area / storeys;
    const side = Math.sqrt(fp);
    const perim = 4 * side;

    const wallGross = perim * height * storeys;

    const winRatio = clamp(Number(s.winRatio) || 18, 5, 40) / 100;
    const winArea = wallGross * winRatio;
    const wallNet = Math.max(0, wallGross - winArea);

    const roofArea = fp;
    const floorArea = fp;
    const volume = fp * height * storeys;

    return {
      mode: "AUTO",
      area,
      storeys,
      height,
      footprint: fp,
      perim,
      wallGross,
      winArea,
      wallNet,
      roofArea,
      floorArea,
      volume,
    };
  }

  function geometryPRO(s) {
    const storeys = Math.max(1, Number(s.storeys) || 1);
    const height = Math.max(2.2, Number(s.height) || 2.6);

    const len = Math.max(1, Number(s.proLen) || 10);
    const wid = Math.max(1, Number(s.proWid) || 10);

    const perimAuto = 2 * (len + wid);
    const fpAuto = len * wid;

    const perimOverride = Math.max(0, Number(s.proPerim) || 0);
    const perim = perimOverride > 0 ? perimOverride : perimAuto;

    const wallGrossAuto = perim * height * storeys;
    const wallGrossOverride = Math.max(0, Number(s.proWallArea) || 0);
    const wallGross = wallGrossOverride > 0 ? wallGrossOverride : wallGrossAuto;

    const winOverride = Math.max(0, Number(s.proWinArea) || 0);
    const winRatio = clamp(Number(s.winRatio) || 18, 5, 40) / 100;
    const winArea = winOverride > 0 ? winOverride : wallGross * winRatio;

    const wallNet = Math.max(0, wallGross - winArea);

    const roofOverride = Math.max(0, Number(s.proRoofArea) || 0);
    const roofArea = roofOverride > 0 ? roofOverride : fpAuto;

    const floorOverride = Math.max(0, Number(s.proFloorArea) || 0);
    const floorArea = floorOverride > 0 ? floorOverride : fpAuto;

    const volOverride = Math.max(0, Number(s.proVolume) || 0);
    const volume = volOverride > 0 ? volOverride : fpAuto * height * storeys;

    const heatedAreaOverride = Math.max(0, Number(s.proAreaTotal) || 0);
    const area = heatedAreaOverride > 0 ? heatedAreaOverride : (Number(s.area) || fpAuto * storeys);

    return {
      mode: "PRO",
      area,
      storeys,
      height,
      footprint: fpAuto,
      perim,
      wallGross,
      winArea,
      wallNet,
      roofArea,
      floorArea,
      volume,
      len,
      wid,
    };
  }

  function resolveGeometry(s) {
    const proEnabled = String(s.proEnabled || "0") === "1";
    if (!proEnabled) return geometryAUTO(s);

    const g = geometryPRO(s);

    const sync = String(s.proSyncArea || "1") === "1";
    if (sync) {
      const newArea = g.footprint * g.storeys;
      g.area = newArea;
      if ($("area")) $("area").value = Math.round(newArea);
    }

    return g;
  }

  function calcHParts(s, mode /* now|target */) {
    const g = resolveGeometry(s);

    const wallType = s.wallType || "brick";
    const wallBase = baseUForWall(wallType);
    const winU = 2.4;
    const roofBase = 1.6;
    const floorBase = 1.1;

    const bridge = clamp(Number(s.bridge) || 0, 0, 25) / 100;

    const wallInsCm = mode === "now" ? (Number(s.wallInsNow) || 0) : (Number(s.wallInsTarget) || 0);
    const roofInsCm = mode === "now" ? (Number(s.roofInsNow) || 0) : (Number(s.roofInsTarget) || 0);
    const floorInsCm = mode === "now" ? (Number(s.floorInsNow) || 0) : (Number(s.floorInsTarget) || 0);

    const wallMat = s.wallInsMat || "eps";
    const roofMat = s.roofInsMat || "rockwool";
    const floorMat = s.floorInsMat || "xps";

    const Uwall = uAfterInsulation(wallBase, wallInsCm, wallMat);
    const Uroof = uAfterInsulation(roofBase, roofInsCm, roofMat);
    const Ufloor = uAfterInsulation(floorBase, floorInsCm, floorMat);

    const Hwall = g.wallNet * Uwall * (1 + bridge);
    const Hwin = g.winArea * winU;
    const Hroof = g.roofArea * Uroof;
    const Hfloor = g.floorArea * Ufloor;

    const nAir = clamp(Number(s.nAir) || 0.6, 0.2, 1.2);
    const Hvent = 0.33 * nAir * g.volume;

    const Htot = Hwall + Hwin + Hroof + Hfloor + Hvent;

    return {
      geo: g,
      Uwall,
      Uroof,
      Ufloor,
      Hwall,
      Hwin,
      Hroof,
      Hfloor,
      Hvent,
      Htot,
    };
  }

  function computeFull(s) {
    const now = calcHParts(s, "now");
    const target = calcHParts(s, "target");

    const annualCostNow = Math.max(0, Number(s.annualCostNow) || 0);
    const hdd = clamp(Number(s.hdd) || 3000, 1800, 4500);

    const heatingNow = s.heatingNow || "gas_old";
    const heatingTarget = s.heatingTarget || "hp";
    const priceGas = Math.max(1, Number(s.priceGas) || 40);
    const priceEl = Math.max(1, Number(s.priceEl) || 70);

    function costToKwh(cost, heating, scop) {
      if (heating === "hp") {
        const sc = clamp(Number(scop) || 3.2, 2.2, 5.5);
        return (cost * sc) / priceEl;
      }
      return cost / priceGas;
    }

    function kwhToCost(kwh, heating, scop) {
      if (heating === "hp") {
        const sc = clamp(Number(scop) || 3.6, 2.2, 5.5);
        return (kwh / sc) * priceEl;
      }
      return kwh * priceGas;
    }

    const QrealNow = costToKwh(annualCostNow, heatingNow, s.scopNow);
    const denom = Math.max(0.0001, now.Htot * hdd);
    const calib = QrealNow / denom;

    const QmodelNow = now.Htot * hdd * calib;
    const QmodelTarget = target.Htot * hdd * calib;

    const costNow = kwhToCost(QmodelNow, heatingNow, s.scopNow);
    const costTarget = kwhToCost(QmodelTarget, heatingTarget, s.scopTarget);

    const saving = Math.max(0, costNow - costTarget);
    const savingMo = saving / 12;
    const improve = costNow > 0 ? (saving / costNow) * 100 : 0;

    // investment (irány)
    const g = now.geo;
    const wallM2_10 = Math.max(0, Number(s.costWallM2) || 0);
    const roofM2_10 = Math.max(0, Number(s.costRoofM2) || 0);
    const floorM2_10 = Math.max(0, Number(s.costFloorM2) || 0);
    const heatCost = Math.max(0, Number(s.costHeating) || 0);

    const dWall = Math.max(0, (Number(s.wallInsTarget) || 0) - (Number(s.wallInsNow) || 0));
    const dRoof = Math.max(0, (Number(s.roofInsTarget) || 0) - (Number(s.roofInsNow) || 0));
    const dFloor = Math.max(0, (Number(s.floorInsTarget) || 0) - (Number(s.floorInsNow) || 0));

    const wallAreaCostBase = g.wallGross;

    const investWall = wallAreaCostBase * wallM2_10 * (dWall / 10);
    const investRoof = g.roofArea * roofM2_10 * (dRoof / 10);
    const investFloor = g.floorArea * floorM2_10 * (dFloor / 10);

    const changeHeat = heatingNow !== heatingTarget;
    const investHeat = changeHeat ? heatCost : 0;

    const investTotal = investWall + investRoof + investFloor + investHeat;
    const payback = saving > 0 ? investTotal / saving : Infinity;

    // prio
    const dH = {
      roof: Math.max(0, now.Hroof - target.Hroof),
      wall: Math.max(0, now.Hwall - target.Hwall),
      floor: Math.max(0, now.Hfloor - target.Hfloor),
      win: Math.max(0, now.Hwin - target.Hwin),
      vent: Math.max(0, now.Hvent - target.Hvent),
    };

    const sumDH = dH.wall + dH.roof + dH.floor + dH.win + dH.vent + (changeHeat ? now.Htot * 0.15 : 0);
    const dhToFt = (dh) => (sumDH <= 0 ? 0 : saving * (dh / sumDH));

    const prio = [
      { key: "futes", name: "Fűtés", ft: changeHeat ? Math.max(dhToFt(now.Htot * 0.15), saving * 0.35) : 0, invest: investHeat },
      { key: "roof", name: "Födém/padlás", ft: dhToFt(dH.roof), invest: investRoof },
      { key: "wall", name: "Fal", ft: dhToFt(dH.wall), invest: investWall },
      { key: "floor", name: "Padló/aljzat", ft: dhToFt(dH.floor), invest: investFloor },
    ].filter((x) => x.ft > 0.01 || x.invest > 0.01);

    prio.sort((a, b) => b.ft - a.ft);

    return {
      ts: Date.now(),
      inputs: s,
      geo: g,
      now,
      target,
      costNow,
      costTarget,
      saving,
      savingMo,
      improve,
      QmodelNow,
      QmodelTarget,
      calib,
      investWall,
      investRoof,
      investFloor,
      investHeat,
      investTotal,
      payback,
      prio,
    };
  }

  // ---------------- render result ----------------
  function renderResult(r) {
    if (!resultBox || !r) return;

    const g = r.geo;

    const surfaces = `
      <div class="miniCard" style="margin-top:10px;">
        <div class="miniTitle">Felületek (modell alapja)</div>
        <div class="muted tiny">
          Mód: <b>${g.mode}</b><br/>
          Fal bruttó: <b>${fmt1(g.wallGross)} m²</b> • Ablak: <b>${fmt1(g.winArea)} m²</b> • Fal nettó: <b>${fmt1(g.wallNet)} m²</b><br/>
          Födém/padlás: <b>${fmt1(g.roofArea)} m²</b> • Padló/aljzat: <b>${fmt1(g.floorArea)} m²</b> • Térfogat: <b>${fmt1(g.volume)} m³</b>
          <br/><span class="muted">(Ezekből számolja a beruházás költséget is: m² × Ft/m² × vastagság arány)</span>
        </div>
      </div>
    `;

    const prioHtml = (r.prio || [])
      .map((p, i) => `<div class="muted">${i + 1}. <b>${p.name}</b>: ~ ${fmt(Math.round(p.ft))} Ft / év</div>`)
      .join("");

    const investLines = [
      { name: "Födém", v: r.investRoof },
      { name: "Fal", v: r.investWall },
      { name: "Padló", v: r.investFloor },
      { name: "Fűtés", v: r.investHeat },
    ]
      .filter((x) => x.v > 0)
      .map((x) => `<div class="muted">• ${x.name}: <b>${fmt(Math.round(x.v))} Ft</b></div>`)
      .join("");

    const paybackTxt = isFinite(r.payback) ? `${fmt1(r.payback)} év` : "–";

    resultBox.innerHTML = `
      <div class="sectionTitle">Eredmény</div>

      ${surfaces}

      <div class="miniCard" style="margin-top:12px;">
        <div class="miniTitle">Költség (becslés)</div>
        <div class="muted">MOST (Ft/év): <b>${fmt(Math.round(r.costNow))} Ft</b> ~ ${fmt(Math.round(r.costNow / 12))} Ft/hó</div>
        <div class="muted">CÉL (Ft/év): <b>${fmt(Math.round(r.costTarget))} Ft</b> ~ ${fmt(Math.round(r.costTarget / 12))} Ft/hó</div>
        <div class="muted" style="margin-top:6px;">Különbség: <b>${fmt(Math.round(r.saving))} Ft</b> ~ ${fmt(Math.round(r.savingMo))} Ft/hó</div>
        <div class="muted">Javulás (költség): <b>${fmt1(r.improve)}%</b></div>
      </div>

      <div class="miniCard" style="margin-top:12px;">
        <div class="miniTitle">Prioritás (Ft/év alapján)</div>
        ${prioHtml || `<div class="muted">–</div>`}
        <div class="tiny muted" style="margin-top:6px;">Tipp: a Felújítási terv fül az Elemzés után aktiválódik.</div>
      </div>

      <div class="miniCard" style="margin-top:12px;">
        <div class="miniTitle">Beruházás + megtérülés (irány)</div>
        ${investLines || `<div class="muted">–</div>`}
        <div class="muted" style="margin-top:6px;">Összesen: <b>${fmt(Math.round(r.investTotal))} Ft</b> • megtérülés: <b>${paybackTxt}</b></div>
      </div>

      <details class="details" style="margin-top:12px;">
        <summary>▶ Technikai számok (ellenőrzéshez)</summary>
        <div class="muted tiny" style="margin-top:8px;">
          H (MOST): ${fmt1(r.now.Htot)} W/K • Q_model: ${fmt(Math.round(r.QmodelNow))} kWh/év<br/>
          H (CÉL): ${fmt1(r.target.Htot)} W/K • Q_model: ${fmt(Math.round(r.QmodelTarget))} kWh/év<br/>
          Kalibrációs szorzó: ${fmt1(r.calib)}
        </div>
      </details>
    `;

    saveLast(r);
    updatePlanLock();
  }

  // ---------------- plan ----------------
  function updatePlanLock() {
    const has = !!safeReadLast();
    if (btnPlan) {
      btnPlan.setAttribute("aria-disabled", has ? "false" : "true");
      btnPlan.title = has ? "" : "Előbb futtasd az Elemzést.";
      btnPlan.style.opacity = has ? "" : "0.75";
    }
    if (planLockedNote) planLockedNote.style.display = has ? "none" : "";
  }

  function renderPlanFromLast() {
    if (!planBox) return;
    const r = safeReadLast();
    if (!r) {
      planBox.innerHTML = "";
      return;
    }

    const totalInvest = Math.round(r.investTotal || 0);
    const totalSave = Math.round(r.saving || 0);
    const totalPay = isFinite(r.payback) ? round(r.payback, 1) : null;

    const pr = (r.prio || []).slice(0, 5);

    const cards = pr
      .map((p, idx) => {
        const pb = p.ft > 0 ? (p.invest || 0) / p.ft : Infinity;
        const pbTxt = isFinite(pb) ? `${round(pb, 1)} év` : "–";
        return `
          <div class="miniCard" style="margin-top:12px;">
            <div class="miniTitle">${idx + 1}. ${p.name}</div>
            <div class="muted"><b>Várható megtakarítás:</b> ~ ${fmt(Math.round(p.ft))} Ft / év (~ ${fmt(Math.round(p.ft / 12))} Ft/hó)</div>
            <div class="muted"><b>Becsült beruházás:</b> ${fmt(Math.round(p.invest || 0))} Ft</div>
            <div class="muted"><b>Megtérülés (irány):</b> ${pbTxt}</div>
          </div>
        `;
      })
      .join("");

    planBox.innerHTML = `
      <div class="miniCard" style="margin-top:10px;">
        <div class="miniTitle">Összesítés (MOST → CÉL)</div>
        <div class="muted">Teljes beruházás: <b>${fmt(totalInvest)} Ft</b></div>
        <div class="muted">Teljes éves megtakarítás: <b>${fmt(totalSave)} Ft / év</b> (~ ${fmt(Math.round(totalSave / 12))} Ft/hó)</div>
        <div class="muted">Teljes megtérülés: <b>${totalPay != null ? fmt1(totalPay) + " év" : "–"}</b></div>
      </div>

      <div class="miniCard" style="margin-top:12px;">
        <div class="miniTitle">3–5 lépéses felújítási terv</div>
        <div class="muted">A sorrend a várható <b>Ft/év</b> megtakarítás alapján van. (A valós sorrendet befolyásolhatja a kivitelezés, állapot, hozzáférhetőség.)</div>
      </div>

      ${cards}

      <div class="miniCard" style="margin-top:12px;">
        <div class="miniTitle">Ajánlatkérés a terv alapján</div>
        <div class="muted">Kérj ajánlatot a számolt terv alapján — a szakik gyorsabban tudnak árazni, ha látják a célokat.</div>
        <div style="margin-top:10px;">
          <button id="planLeadBtn" class="btn primary">Ajánlatkérés szakiktól</button>
        </div>
      </div>
    `;

    const planLeadBtn = $("planLeadBtn");
    if (planLeadBtn) planLeadBtn.addEventListener("click", () => (window.location.href = SZAKIPIAC_HOME_URL));
  }

  // ---------------- heatmap (3D) ----------------
  function setHmMode(mode) {
    hmMode = mode;
    localStorage.setItem(LS_HM_MODE, mode);

    [hmModeNow, hmModeTarget, hmModeDelta].forEach((b) => b && b.classList.remove("active"));
    if (mode === "now" && hmModeNow) hmModeNow.classList.add("active");
    if (mode === "target" && hmModeTarget) hmModeTarget.classList.add("active");
    if (mode === "delta" && hmModeDelta) hmModeDelta.classList.add("active");

    renderHeatmapFromLast();
  }

  function pickClass(norm) {
    if (norm >= 0.66) return "hmHot";
    if (norm >= 0.33) return "hmMid";
    return "hmCool";
  }

  function applyHmClass(el, norm) {
    if (!el) return;
    el.classList.remove("hmHot", "hmMid", "hmCool");
    el.classList.add(pickClass(norm));
  }

  function renderHeatmapFromLast() {
    if (!view3d) return;

    const r = safeReadLast();
    if (!r) {
      if (hmList) hmList.innerHTML = "";
      if (hmExplain) hmExplain.textContent = "–";
      [hmRoof, hmWallL, hmWallR, hmWin, hmFloor, hmVent].forEach((el) => applyHmClass(el, 0));
      return;
    }

    const now = r.now;
    const target = r.target;

    let parts;

    if (hmMode === "now") {
      parts = { Roof: now.Hroof, Wall: now.Hwall, Win: now.Hwin, Floor: now.Hfloor, Vent: now.Hvent };
    } else if (hmMode === "target") {
      parts = { Roof: target.Hroof, Wall: target.Hwall, Win: target.Hwin, Floor: target.Hfloor, Vent: target.Hvent };
    } else {
      parts = {
        Roof: Math.max(0, now.Hroof - target.Hroof),
        Wall: Math.max(0, now.Hwall - target.Hwall),
        Win: Math.max(0, now.Hwin - target.Hwin),
        Floor: Math.max(0, now.Hfloor - target.Hfloor),
        Vent: Math.max(0, now.Hvent - target.Hvent),
      };
    }

    const total = Math.max(0.0001, parts.Roof + parts.Wall + parts.Win + parts.Floor + parts.Vent);
    const maxV = Math.max(parts.Roof, parts.Wall, parts.Win, parts.Floor, parts.Vent, 0.0001);

    applyHmClass(hmRoof, parts.Roof / maxV);
    applyHmClass(hmWallL, parts.Wall / maxV);
    applyHmClass(hmWallR, parts.Wall / maxV);
    applyHmClass(hmWin, parts.Win / maxV);
    applyHmClass(hmFloor, parts.Floor / maxV);
    applyHmClass(hmVent, parts.Vent / maxV);

    if (hmList) {
      const rows = [
        { name: "Légcsere", v: parts.Vent },
        { name: "Ablak", v: parts.Win },
        { name: "Padló", v: parts.Floor },
        { name: "Fal", v: parts.Wall },
        { name: "Födém", v: parts.Roof },
      ]
        .map((x) => {
          const pct = (x.v / total) * 100;
          return `
            <div class="hmRow">
              <div class="hmName">${x.name}</div>
              <div class="hmBar"><div class="hmFill" style="width:${clamp(pct, 0, 100)}%"></div></div>
              <div class="hmPct">${fmt1(pct)}%</div>
              <div class="hmSub muted tiny">H hozzájárulás: <b>${fmt1(x.v)} W/K</b></div>
            </div>
          `;
        })
        .join("");

      hmList.innerHTML = rows;
    }

    if (hmExplain) {
      if (hmMode === "now") hmExplain.textContent = "MOST: megmutatja, hol szökik el most a legtöbb hő (prioritás).";
      else if (hmMode === "target") hmExplain.textContent = "CÉL: megmutatja, hogy cél állapotban hol marad veszteség.";
      else {
        const items = [
          { n: "Légcsere", v: parts.Vent },
          { n: "Ablak", v: parts.Win },
          { n: "Padló", v: parts.Floor },
          { n: "Fal", v: parts.Wall },
          { n: "Födém", v: parts.Roof },
        ].sort((a, b) => b.v - a.v);
        hmExplain.textContent = `KÜLÖNBSÉG: a legnagyobb “nyereség” várhatóan itt jön: ${items[0]?.n || "–"}.`;
      }
    }
  }

  // ---------------- PRO summary + gombok ----------------
  function renderProSummary() {
    if (!proSummary) return;

    const s = { ...defaults(), ...collectState() };
    const g = resolveGeometry(s);

    proSummary.innerHTML = `
      <div class="miniTitle">Mód: ${g.mode}</div>
      <div class="muted" style="margin-top:6px;">
        Fal bruttó: <b>${fmt1(g.wallGross)} m²</b><br/>
        Ablak: <b>${fmt1(g.winArea)} m²</b><br/>
        Fal nettó: <b>${fmt1(g.wallNet)} m²</b><br/>
        Födém/padlás: <b>${fmt1(g.roofArea)} m²</b><br/>
        Padló: <b>${fmt1(g.floorArea)} m²</b><br/>
        Térfogat: <b>${fmt1(g.volume)} m³</b><br/>
        <span class="tiny muted">kerület: ${fmt1(g.perim)} m • footprint: ${fmt1(g.footprint)} m² • szintek: ${g.storeys} • belmagasság: ${fmt1(g.height)} m</span>
      </div>
    `;
  }

  function setProEnabled(on) {
    if ($("proEnabled")) $("proEnabled").value = on ? "1" : "0";
    saveStateLocal(false);
    renderProSummary();
    toast(on ? "PRO bekapcsolva." : "PRO kikapcsolva.");
  }

  // ---------------- docs ----------------
  function seedDocs() {
    if (localStorage.getItem(LS_DOCS)) return;

    const docs = [
      { id: "hdd", cat: "basics", mins: 3, title: "Mi az a HDD (fűtési foknap) és miért számít?",
        tags: ["HDD", "fűtés", "alapok"],
        body: `<p>A <b>HDD</b> (Heating Degree Days) azt mutatja, mennyire volt hideg egy évben/idényben.</p>
               <p><b>HU irány:</b> ~3000 (településtől függ).</p>` },
      { id: "vent", cat: "basics", mins: 3, title: "Légcsere (1/h): miért tud elvinni rengeteg pénzt?",
        tags: ["légcsere", "infiltráció"],
        body: `<p>Ha a ház huzatos, a meleg kijut, a hideg bejön → a fűtés ezt pótolja.</p>` },
      { id: "attic", cat: "ins", mins: 4, title: "Miért a födém/padlás szigetelés szokott a legjobb első lépés lenni?",
        tags: ["födém", "padlás", "megtérülés"],
        body: `<p>Felfelé szökik a meleg — ezért a födém gyakran top veszteség.</p>` },
      { id: "bridges", cat: "mist", mins: 4, title: "Hőhidak: miért lehet penész akkor is, ha szigeteltél?",
        tags: ["hőhíd", "penész"],
        body: `<p>A hőhíd helyén hidegebb a felület → ott kicsapódhat a pára.</p>` },
      { id: "qlist", cat: "list", mins: 5, title: "10 kérdés kivitelezőnek, hogy ne bukj a részleteken",
        tags: ["kivitelező", "kérdések"],
        body: `<ol>
                 <li>Csomópontok: koszorú/lábazat/ablak körül?</li>
                 <li>Mi van benne az árban (állvány, szállítás, törmelék)?</li>
                 <li>Garancia mire és mennyi?</li>
               </ol>` },
    ];

    localStorage.setItem(LS_DOCS, JSON.stringify(docs));
  }

  function loadDocs() {
    seedDocs();
    try { return JSON.parse(localStorage.getItem(LS_DOCS) || "[]"); }
    catch { return []; }
  }

  function setActiveChip(cat) {
    activeDocCat = cat;
    [chipAll, chipBasics, chipIns, chipHeat, chipMist, chipList].filter(Boolean).forEach((c) => c.classList.remove("active"));
    if (cat === "all" && chipAll) chipAll.classList.add("active");
    if (cat === "basics" && chipBasics) chipBasics.classList.add("active");
    if (cat === "ins" && chipIns) chipIns.classList.add("active");
    if (cat === "heat" && chipHeat) chipHeat.classList.add("active");
    if (cat === "mist" && chipMist) chipMist.classList.add("active");
    if (cat === "list" && chipList) chipList.classList.add("active");
    renderDocs();
  }

  function openDoc(id) {
    const docs = loadDocs();
    const d = docs.find((x) => x.id === id);
    if (!d || !docView) return;
    activeDocId = id;

    const catName =
      d.cat === "basics" ? "Alapok" :
      d.cat === "ins" ? "Szigetelés" :
      d.cat === "heat" ? "Fűtés" :
      d.cat === "mist" ? "Tipikus hibák" : "Kérdéslista";

    docView.innerHTML = `
      <div class="docArticle">
        <div class="docTitleBig">${d.title}</div>
        <div class="muted tiny">kategória: <b>${catName}</b> • ~${d.mins || 3} perc</div>
        <div class="docBody" style="margin-top:12px;">${d.body || ""}</div>
      </div>
    `;

    // list active jelölés frissítés
    renderDocs(true);
  }

  function renderDocs(keepSelection = false) {
    if (!viewDocs) return;

    const docs = loadDocs();
    const q = (docSearch && docSearch.value ? docSearch.value : "").trim().toLowerCase();

    let filtered = docs;
    if (activeDocCat !== "all") filtered = filtered.filter((d) => d.cat === activeDocCat);

    if (q) {
      filtered = filtered.filter((d) => {
        const hay = (d.title + " " + (d.tags || []).join(" ") + " " + (d.body || "")).toLowerCase();
        return hay.includes(q);
      });
    }

    if (docCount) docCount.textContent = String(filtered.length);

    if (docList) {
      docList.innerHTML = filtered
        .map((d) => {
          const isActive = d.id === activeDocId;
          return `
            <div class="docItem ${isActive ? "active" : ""}" data-doc="${d.id}">
              <div class="docTitle">${d.title}</div>
              <div class="muted tiny">~${d.mins || 3} perc • ${(d.tags || []).slice(0, 4).map(t => `#${t}`).join(" ")}</div>
            </div>
          `;
        })
        .join("");

      Array.from(docList.querySelectorAll(".docItem")).forEach((el) => {
        el.addEventListener("click", () => openDoc(el.getAttribute("data-doc")));
      });
    }

    if (!keepSelection) {
      if (!activeDocId && filtered.length > 0) openDoc(filtered[0].id);
      if (filtered.length === 0 && docView) {
        docView.innerHTML = `<div class="muted">Nincs találat.</div>`;
        activeDocId = null;
      }
    }
  }

  // ---------------- calc run ----------------
  function runAnalysis() {
    const s = { ...defaults(), ...collectState() };

    if (!s.area || Number(s.area) <= 0) s.area = 100;
    if (!s.annualCostNow || Number(s.annualCostNow) <= 0) {
      toast("Add meg az éves fűtési költséget MOST (Ft/év).");
      return;
    }

    const r = computeFull(s);
    renderResult(r);
    toast("Elemzés kész.");

    if (activeView === "3d") renderHeatmapFromLast();
    if (activeView === "plan") renderPlanFromLast();
  }

  function resetDefaults() {
    applyState(defaults());
    renderProSummary();
    toast("Alapértékek beállítva.");
  }

  function shareLink() {
    saveStateLocal(false);
    const url = new URL(window.location.href);
    url.hash = "#calc&share=1";
    navigator.clipboard
      .writeText(url.toString())
      .then(() => toast("Megosztási link kimásolva."))
      .catch(() => toast("Link kész (nem tudtam másolni vágólapra)."));
  }

  // ---------------- bind events ----------------
  function bindNav() {
    if (btnHome) btnHome.addEventListener("click", () => go("home"));
    if (btnCalc) btnCalc.addEventListener("click", () => go("calc"));
    if (btnPro) btnPro.addEventListener("click", () => go("pro"));

    if (btnPlan) {
      btnPlan.addEventListener("click", () => {
        if (!safeReadLast()) {
          toast("Előbb futtasd az Elemzést.");
          go("calc");
          return;
        }
        go("plan");
      });
    }

    if (btn3d) btn3d.addEventListener("click", () => go("3d"));
    if (btnDocs) btnDocs.addEventListener("click", () => go("docs"));

    if (homeGoCalc) homeGoCalc.addEventListener("click", () => go("calc"));
    if (homeGoDocs) homeGoDocs.addEventListener("click", () => go("docs"));
  }

  function bindCalcButtons() {
    if (btnCalcRun) btnCalcRun.addEventListener("click", runAnalysis);
    if (btnReset) btnReset.addEventListener("click", resetDefaults);
    if (btnShare) btnShare.addEventListener("click", shareLink);
    if (btnLead) btnLead.addEventListener("click", () => (window.location.href = SZAKIPIAC_HOME_URL));

    if (btnSaveState) btnSaveState.addEventListener("click", () => saveStateLocal(true));
    if (btnLoadState) btnLoadState.addEventListener("click", loadStateLocal);
    if (btnClearState) btnClearState.addEventListener("click", clearStateLocal);

    if (btnExportState) btnExportState.addEventListener("click", exportJson);
    if (btnImportState) btnImportState.addEventListener("click", importJson);

    if (btnExportPDF) btnExportPDF.addEventListener("click", () => window.print());
  }

  function bindPro() {
    // élő összegzés: bármely input változik → friss
    proIds.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        renderProSummary();
        saveStateLocal(false);
      });
      el.addEventListener("change", () => {
        renderProSummary();
        saveStateLocal(false);
      });
    });

    if (btnProApply) {
      btnProApply.addEventListener("click", () => {
        setProEnabled(true);
        go("calc"); // vissza calc, hogy “futtasd újra”
      });
    }
    if (btnProOff) {
      btnProOff.addEventListener("click", () => {
        setProEnabled(false);
        go("calc");
      });
    }
  }

  function bind3D() {
    if (hmModeNow) hmModeNow.addEventListener("click", () => setHmMode("now"));
    if (hmModeTarget) hmModeTarget.addEventListener("click", () => setHmMode("target"));
    if (hmModeDelta) hmModeDelta.addEventListener("click", () => setHmMode("delta"));
    if (btnExportPDF_3D) btnExportPDF_3D.addEventListener("click", () => window.print());

    setHmMode(hmMode);
  }

  function bindDocs() {
    if (docSearch) docSearch.addEventListener("input", () => renderDocs(false));
    if (chipAll) chipAll.addEventListener("click", () => setActiveChip("all"));
    if (chipBasics) chipBasics.addEventListener("click", () => setActiveChip("basics"));
    if (chipIns) chipIns.addEventListener("click", () => setActiveChip("ins"));
    if (chipHeat) chipHeat.addEventListener("click", () => setActiveChip("heat"));
    if (chipMist) chipMist.addEventListener("click", () => setActiveChip("mist"));
    if (chipList) chipList.addEventListener("click", () => setActiveChip("list"));
  }

  // ---------------- small fallback styles ----------------
  function ensureFallbackStyles() {
    const id = "ea_fallback_styles_v1";
    if ($(id)) return;
    const st = document.createElement("style");
    st.id = id;
    st.textContent = `
      .hmHot{ filter:saturate(1.2); }
      .hmMid{ filter:saturate(1.05); opacity:.95; }
      .hmCool{ filter:saturate(.9); opacity:.9; }

      .hmRow{ padding:10px 10px; border:1px solid rgba(255,255,255,.08); border-radius:14px; margin-bottom:10px; background:rgba(15,20,35,.25); }
      .hmName{ font-weight:600; margin-bottom:6px; }
      .hmBar{ height:8px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.08); }
      .hmFill{ height:100%; background:rgba(120,180,255,.75); }

      .docItem{ cursor:pointer; padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:14px; margin-bottom:10px; background:rgba(15,20,35,.22); }
      .docItem.active{ outline:2px solid rgba(120,180,255,.35); }
      .docTitle{ font-weight:700; }
      .docTitleBig{ font-size:20px; font-weight:800; }
    `;
    document.head.appendChild(st);
  }

  // ---------------- init ----------------
  function init() {
    ensureFallbackStyles();
    ensureSzakiPiacButton();

    bindNav();
    bindCalcButtons();
    bindPro();
    bind3D();
    bindDocs();

    const saved = localStorage.getItem(LS_KEY);
    if (saved) loadStateLocal();
    else applyState(defaults());

    renderProSummary();
    updatePlanLock();

    const h = (window.location.hash || "").toLowerCase();
    if (h.includes("docs")) go("docs");
    else if (h.includes("3d")) go("3d");
    else if (h.includes("plan")) go("plan");
    else if (h.includes("pro")) go("pro");
    else if (h.includes("calc")) go("calc");
    else go("home");

    if (viewDocs) renderDocs(false);
    renderHeatmapFromLast();
  }

  init();
})();
