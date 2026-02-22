/* Energia Advisor 3D – main.js (FULL)
   - Navigáció (Home/Calc/PRO/Plan/3D/Docs)
   - SzakiPiac vissza gomb beszúrása (ha nincs)
   - Tudástár: cikklista + kereső + kategória chip szűrés + cikk nézet
   - 3D hőtérkép (MVP): MOST/CÉL/KÜLÖNBSÉG + bontás lista + gyors értelmezés
   - State mentés/betöltés: LocalStorage + Export/Import JSON (fájlválasztóval)
   - Print/PDF: window.print()
*/

(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const round = (v, d = 0) => {
    const p = Math.pow(10, d);
    return Math.round(v * p) / p;
  };
  const fmt = (n) => (isFinite(n) ? n.toLocaleString("hu-HU") : "–");
  const fmt1 = (n) => (isFinite(n) ? round(n, 1).toLocaleString("hu-HU") : "–");

  // ---------- config ----------
  const SZAKIPIAC_HOME_URL = "https://szakipiac-2025.hu"; // ha mást akarsz, ide írd
  const LS_KEY = "ea3d_state_v3";
  const LS_LAST = "ea3d_last_result_v3";
  const LS_DOCS = "ea3d_docs_v1";
  const LS_HM_MODE = "ea3d_hm_mode_v1";

  // ---------- DOM refs (views) ----------
  const viewHome = $("viewHome");
  const viewCalc = $("viewCalc");
  const viewPlan = $("viewPlan");
  const view3d = $("view3d");
  const viewDocs = $("viewDocs");
  const viewPro = $("viewPro"); // ha a HTML-ben így van

  // nav buttons
  const btnHome = $("btnHome");
  const btnCalc = $("btnCalc");
  const btnPlan = $("btnPlan");
  const btn3d = $("btn3d");
  const btnDocs = $("btnDocs");
  const btnPro = $("btnPro"); // ha van

  // home actions
  const homeGoCalc = $("homeGoCalc");
  const homeGoDocs = $("homeGoDocs");

  // calc buttons
  const btnCalcRun = $("btnCalcRun");
  const btnReset = $("btnReset");
  const btnShare = $("btnShare");
  const btnLead = $("btnLead");

  // calc top buttons
  const btnSaveState = $("btnSaveState");
  const btnLoadState = $("btnLoadState");
  const btnClearState = $("btnClearState");
  const btnExportPDF = $("btnExportPDF");

  // optional export/import buttons (ha a HTML-ben léteznek)
  const btnExportJson = $("btnExport"); // ha van ilyen id
  const btnImportJson = $("btnImport"); // ha van ilyen id

  // result box
  const resultBox = $("resultBox");

  // plan
  const planBox = $("planBox");
  const planLockedNote = $("planLockedNote");
  const btnExportPDF_Plan = $("btnExportPDF_Plan");

  // 3d
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

  // ---------- state ----------
  let activeView = "home";
  let activeDocCat = "all";
  let activeDocId = null;

  // hm mode: now / target / delta
  let hmMode = localStorage.getItem(LS_HM_MODE) || "now";

  // ---------- inject SzakiPiac button (if not present) ----------
  function ensureSzakiPiacButton() {
    const nav = document.querySelector(".nav");
    if (!nav) return;

    // ha már van (id alapján vagy szöveg alapján), nem nyúlunk hozzá
    if ($("btnSzakiPiac")) return;

    const existing = Array.from(nav.querySelectorAll("button")).find((b) =>
      (b.textContent || "").toLowerCase().includes("szakipiac")
    );
    if (existing) {
      existing.id = existing.id || "btnSzakiPiac";
      existing.addEventListener("click", () => {
        window.location.href = SZAKIPIAC_HOME_URL;
      });
      return;
    }

    // beszúrjuk BALRA a nav-ban (elsőnek)
    const b = document.createElement("button");
    b.id = "btnSzakiPiac";
    b.className = "navBtn";
    b.type = "button";
    b.textContent = "← SzakiPiac";
    b.addEventListener("click", () => {
      window.location.href = SZAKIPIAC_HOME_URL;
    });
    nav.insertBefore(b, nav.firstChild);
  }

  // ---------- view switching ----------
  function setActiveNav(btn) {
    const navBtns = document.querySelectorAll(".navBtn");
    navBtns.forEach((x) => x.classList.remove("active"));
    if (btn) btn.classList.add("active");
  }

  function showOnly(viewId) {
    const all = [viewHome, viewCalc, viewPlan, view3d, viewDocs, viewPro].filter(Boolean);
    all.forEach((v) => (v.style.display = "none"));
    const v = $(viewId);
    if (v) v.style.display = "";
  }

  function go(view) {
    activeView = view;

    if (view === "home") {
      showOnly("viewHome");
      setActiveNav(btnHome);
      return;
    }

    if (view === "calc") {
      showOnly("viewCalc");
      setActiveNav(btnCalc);
      // frissítsük a gomb állapotokat
      updatePlanLock();
      return;
    }

    if (view === "plan") {
      showOnly("viewPlan");
      setActiveNav(btnPlan);
      updatePlanLock();
      renderPlanFromLast();
      return;
    }

    if (view === "3d") {
      showOnly("view3d");
      setActiveNav(btn3d);
      renderHeatmapFromLast();
      return;
    }

    if (view === "docs") {
      showOnly("viewDocs");
      setActiveNav(btnDocs);
      renderDocs();
      return;
    }

    if (view === "pro") {
      // ha nincs PRO nézet a HTML-ben, akkor vissza calc-ra
      if (!viewPro) {
        go("calc");
        return;
      }
      showOnly("viewPro");
      setActiveNav(btnPro);
      return;
    }
  }

  // ---------- inputs (calc) ----------
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

  // PRO ids (ha vannak)
  const proIds = [
    "proEnabled",
    "proSyncArea",
    "proLen",
    "proWid",
    "proPerimOverride",
    "proWallAreaOverride",
    "proWinAreaOverride",
    "proRoofAreaOverride",
    "proFloorAreaOverride",
    "proVolOverride",
    "proHeatedAreaOverride",
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
      costWallM2: 150000,  // Ft/m2 / 10cm (irány)
      costRoofM2: 120000,  // Ft/m2 / 10cm (irány)
      costFloorM2: 150000, // Ft/m2 / 10cm (irány)
      costHeating: 3500000,

      // PRO
      proEnabled: "off", // off | on
      proSyncArea: "yes",
      proLen: 10,
      proWid: 10,
      proPerimOverride: 0,
      proWallAreaOverride: 0,
      proWinAreaOverride: 0,
      proRoofAreaOverride: 0,
      proFloorAreaOverride: 0,
      proVolOverride: 0,
      proHeatedAreaOverride: 0,
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

  // ---------- export/import JSON (file picker) ----------
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
    const payload = {
      ver: 1,
      ts: new Date().toISOString(),
      state: collectState(),
      last: safeReadLast(),
    };
    downloadText("energia-advisor-mentes.json", JSON.stringify(payload, null, 2));
    toast("Export kész (JSON fájl letöltve).");
  }

  function importJson() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.addEventListener("change", async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      const txt = await file.text();
      try {
        const payload = JSON.parse(txt);
        if (payload && payload.state) {
          applyState(payload.state);
          saveStateLocal();
          if (payload.last) saveLast(payload.last);
          toast("Import sikeres.");
          // frissítsük a nézeteket
          renderHeatmapFromLast();
          renderDocs();
          updatePlanLock();
        } else {
          toast("Hibás fájl: nincs benne state.");
        }
      } catch (e) {
        toast("Hibás JSON fájl.");
      }
    });
    inp.click();
  }

  // ---------- toast (egyszerű) ----------
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

  // ---------- model / calculations (csak ami a 3D+terv+felületekhez kell) ----------
  function materialLambda(mat) {
    // W/mK irányértékek
    if (mat === "eps") return 0.038;
    if (mat === "xps") return 0.034;
    if (mat === "rockwool") return 0.039;
    return 0.038;
  }

  function baseUForWall(type) {
    // tipikus régi szerkezet U (W/m2K)
    if (type === "adobe") return 1.1;
    if (type === "concrete") return 1.4;
    return 1.2; // brick
  }

  function uAfterInsulation(uBase, insCm, mat) {
    const d = Math.max(0, Number(insCm) || 0) / 100; // m
    if (d <= 0) return uBase;
    const lambda = materialLambda(mat);
    // egyszerűsített: R_total = 1/Ubase + d/lambda
    const r0 = 1 / Math.max(0.0001, uBase);
    const rIns = d / Math.max(0.0001, lambda);
    return 1 / (r0 + rIns);
  }

  function geometryAUTO(s) {
    // AUTO: téglalap footprint a területből -> négyzetes közelítés
    const area = Math.max(1, Number(s.area) || 100);
    const storeys = Math.max(1, Number(s.storeys) || 1);
    const height = Math.max(2.2, Number(s.height) || 2.6);

    // footprint (egy szint) ≈ area / storeys
    const fp = area / storeys;

    // négyzet közelítés: oldal = sqrt(fp)
    const side = Math.sqrt(fp);
    const perim = 4 * side;

    // fal bruttó = kerület * magasság * szintek
    const wallGross = perim * height * storeys;

    const winRatio = clamp(Number(s.winRatio) || 18, 5, 40) / 100;
    const winArea = wallGross * winRatio;
    const wallNet = Math.max(0, wallGross - winArea);

    // roof/floor (összesített) – fűtött tér határoló
    const roofArea = fp; // felső határoló
    const floorArea = fp; // alsó határoló

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
    // PRO: hossz×szél vagy kézi felülírások
    const storeys = Math.max(1, Number(s.storeys) || 1);
    const height = Math.max(2.2, Number(s.height) || 2.6);

    const len = Math.max(1, Number(s.proLen) || 10);
    const wid = Math.max(1, Number(s.proWid) || 10);

    const perimAuto = 2 * (len + wid);
    const fpAuto = len * wid;

    const perimOverride = Math.max(0, Number(s.proPerimOverride) || 0);
    const perim = perimOverride > 0 ? perimOverride : perimAuto;

    const wallGrossAuto = perim * height * storeys;

    const wallGrossOverride = Math.max(0, Number(s.proWallAreaOverride) || 0);
    const wallGross = wallGrossOverride > 0 ? wallGrossOverride : wallGrossAuto;

    // ablak: override vagy % alapján
    const winOverride = Math.max(0, Number(s.proWinAreaOverride) || 0);
    const winRatio = clamp(Number(s.winRatio) || 18, 5, 40) / 100;
    const winArea = winOverride > 0 ? winOverride : wallGross * winRatio;

    const wallNet = Math.max(0, wallGross - winArea);

    const roofOverride = Math.max(0, Number(s.proRoofAreaOverride) || 0);
    const roofArea = roofOverride > 0 ? roofOverride : fpAuto;

    const floorOverride = Math.max(0, Number(s.proFloorAreaOverride) || 0);
    const floorArea = floorOverride > 0 ? floorOverride : fpAuto;

    const volOverride = Math.max(0, Number(s.proVolOverride) || 0);
    const volume = volOverride > 0 ? volOverride : fpAuto * height * storeys;

    const heatedAreaOverride = Math.max(0, Number(s.proHeatedAreaOverride) || 0);
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
    const proEnabled = (s.proEnabled || "off") === "on";
    if (!proEnabled) return geometryAUTO(s);

    const g = geometryPRO(s);

    // opcionális: area sync
    if ((s.proSyncArea || "yes") === "yes") {
      // alapterület = footprint * storeys
      g.area = g.footprint * g.storeys;
      // be is írjuk a mezőbe, hogy a user lássa
      if ($("area")) $("area").value = Math.round(g.area);
    }
    return g;
  }

  function calcHParts(s, mode /* now|target */) {
    const g = resolveGeometry(s);

    const wallType = s.wallType || "brick";

    const wallBase = baseUForWall(wallType);
    const winU = 2.4; // egyszerű
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

    // ventilation: Hvent = 0.33 * n * V
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
    // hőveszteség MOST és CÉL
    const now = calcHParts(s, "now");
    const target = calcHParts(s, "target");

    // “valós” kalibráció: annualCostNow a bázis
    const annualCostNow = Math.max(0, Number(s.annualCostNow) || 0);
    const hdd = clamp(Number(s.hdd) || 3000, 1800, 4500);

    // egyszerű: Q (kWh/év) arányos Htot * HDD
    // kalibrációs faktor = Q_real_now / (Hnow * HDD)
    // Q_real_now-t a költségből becsüljük a fűtési rendszertől függően
    const heatingNow = s.heatingNow || "gas_old";
    const heatingTarget = s.heatingTarget || "hp";
    const priceGas = Math.max(1, Number(s.priceGas) || 40);
    const priceEl = Math.max(1, Number(s.priceEl) || 70);

    function costToKwh(cost, heating, scop) {
      if (heating === "hp") {
        const sc = clamp(Number(scop) || 3.2, 2.2, 5.5);
        // cost = (Q / sc) * priceEl  => Q = cost * sc / priceEl
        return cost * sc / priceEl;
      }
      // gáz
      return cost / priceGas;
    }

    const QrealNow = costToKwh(annualCostNow, heatingNow, s.scopNow);

    const denom = Math.max(0.0001, now.Htot * hdd);
    const calib = QrealNow / denom;

    const QmodelNow = now.Htot * hdd * calib;
    const QmodelTarget = target.Htot * hdd * calib;

    function kwhToCost(kwh, heating, scop) {
      if (heating === "hp") {
        const sc = clamp(Number(scop) || 3.6, 2.2, 5.5);
        return (kwh / sc) * priceEl;
      }
      return kwh * priceGas;
    }

    const costNow = kwhToCost(QmodelNow, heatingNow, s.scopNow);
    const costTarget = kwhToCost(QmodelTarget, heatingTarget, s.scopTarget);

    const saving = Math.max(0, costNow - costTarget);
    const savingMo = saving / 12;

    const improve = costNow > 0 ? (saving / costNow) * 100 : 0;

    // beruházás irány: felület * (Ft/m2/10cm) * vastagság arány
    const g = now.geo;
    const wallM2_10 = Math.max(0, Number(s.costWallM2) || 0);
    const roofM2_10 = Math.max(0, Number(s.costRoofM2) || 0);
    const floorM2_10 = Math.max(0, Number(s.costFloorM2) || 0);
    const heatCost = Math.max(0, Number(s.costHeating) || 0);

    const dWall = Math.max(0, (Number(s.wallInsTarget) || 0) - (Number(s.wallInsNow) || 0));
    const dRoof = Math.max(0, (Number(s.roofInsTarget) || 0) - (Number(s.roofInsNow) || 0));
    const dFloor = Math.max(0, (Number(s.floorInsTarget) || 0) - (Number(s.floorInsNow) || 0));

    // a “felület” itt: fal bruttó/nettó? – beruházásnál bruttó falat szokták számolni (ablak kivágás/korrekció később)
    const wallAreaCostBase = g.wallGross;

    const investWall = wallAreaCostBase * wallM2_10 * (dWall / 10);
    const investRoof = g.roofArea * roofM2_10 * (dRoof / 10);
    const investFloor = g.floorArea * floorM2_10 * (dFloor / 10);

    const changeHeat = heatingNow !== heatingTarget;
    const investHeat = changeHeat ? heatCost : 0;

    const investTotal = investWall + investRoof + investFloor + investHeat;

    const payback = saving > 0 ? investTotal / saving : Infinity;

    // prioritás: hozzájárulásból (H csökkenés) ~ pénz
    const dH = {
      futes: changeHeat ? 999999 : 0, // csak hogy listában legyen (később finomítható)
      wall: Math.max(0, now.Hwall - target.Hwall),
      roof: Math.max(0, now.Hroof - target.Hroof),
      floor: Math.max(0, now.Hfloor - target.Hfloor),
      win: Math.max(0, now.Hwin - target.Hwin),
      vent: Math.max(0, now.Hvent - target.Hvent),
    };

    // “Ft/év súly”: arányosan a teljes megtakarításból
    const sumDH = dH.wall + dH.roof + dH.floor + dH.win + dH.vent + (changeHeat ? (now.Htot * 0.15) : 0);
    function dhToFt(dh) {
      if (sumDH <= 0) return 0;
      return saving * (dh / sumDH);
    }

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

  // ---------- render: result box ----------
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

    const prioHtml = r.prio
      .map(
        (p, i) =>
          `<div class="muted">${i + 1}. <b>${p.name}</b>: ~ ${fmt(Math.round(p.ft))} Ft/év</div>`
      )
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

  // ---------- plan ----------
  function updatePlanLock() {
    // terv csak akkor legyen “enabled”, ha van last result
    const has = !!safeReadLast();
    if (btnPlan) {
      btnPlan.setAttribute("aria-disabled", has ? "false" : "true");
      btnPlan.title = has ? "" : "Előbb futtasd az Elemzést.";
      btnPlan.style.opacity = has ? "" : "0.75";
      btnPlan.style.pointerEvents = ""; // clicket mi kezeljük
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
    if (planLeadBtn) {
      planLeadBtn.addEventListener("click", () => {
        window.location.href = SZAKIPIAC_HOME_URL;
      });
    }
  }

  // ---------- heatmap (3D) ----------
  function setHmMode(mode) {
    hmMode = mode;
    localStorage.setItem(LS_HM_MODE, mode);

    [hmModeNow, hmModeTarget, hmModeDelta].forEach((b) => b && b.classList.remove("active"));
    if (mode === "now" && hmModeNow) hmModeNow.classList.add("active");
    if (mode === "target" && hmModeTarget) hmModeTarget.classList.add("active");
    if (mode === "delta" && hmModeDelta) hmModeDelta.classList.add("active");

    renderHeatmapFromLast();
  }

  function pickColor(norm) {
    // norm: 0..1 (0 = kicsi, 1 = nagy)
    // egyszerű 3 lépcső (zöld/sárga/piros) – CSS a háttérben
    if (norm >= 0.66) return "hmHot";
    if (norm >= 0.33) return "hmMid";
    return "hmCool";
  }

  function applyHmClass(el, norm) {
    if (!el) return;
    el.classList.remove("hmHot", "hmMid", "hmCool");
    el.classList.add(pickColor(norm));
  }

  function renderHeatmapFromLast() {
    // ha nincs 3D nézet, nincs dolgunk
    if (!view3d) return;

    const r = safeReadLast();
    if (!r) {
      // üres állapot: csak nullázzuk a listát és magyarázatot
      if (hmList) hmList.innerHTML = "";
      if (hmExplain) hmExplain.textContent = "–";
      // elemek alapra
      [hmRoof, hmWallL, hmWallR, hmWin, hmFloor, hmVent].forEach((el) => applyHmClass(el, 0));
      return;
    }

    const now = r.now;
    const target = r.target;

    // választott mode szerint számolunk “értékeket”
    let parts = null;

    if (hmMode === "now") {
      parts = {
        Roof: now.Hroof,
        Wall: now.Hwall,
        Win: now.Hwin,
        Floor: now.Hfloor,
        Vent: now.Hvent,
        Total: now.Htot,
      };
    } else if (hmMode === "target") {
      parts = {
        Roof: target.Hroof,
        Wall: target.Hwall,
        Win: target.Hwin,
        Floor: target.Hfloor,
        Vent: target.Hvent,
        Total: target.Htot,
      };
    } else {
      // delta = MOST - CÉL (mennyi csökken)
      parts = {
        Roof: Math.max(0, now.Hroof - target.Hroof),
        Wall: Math.max(0, now.Hwall - target.Hwall),
        Win: Math.max(0, now.Hwin - target.Hwin),
        Floor: Math.max(0, now.Hfloor - target.Hfloor),
        Vent: Math.max(0, now.Hvent - target.Hvent),
      };
      parts.Total = parts.Roof + parts.Wall + parts.Win + parts.Floor + parts.Vent;
    }

    const maxV = Math.max(parts.Roof, parts.Wall, parts.Win, parts.Floor, parts.Vent, 0.0001);

    // hm blocks
    applyHmClass(hmRoof, parts.Roof / maxV);
    applyHmClass(hmWallL, parts.Wall / maxV);
    applyHmClass(hmWallR, parts.Wall / maxV);
    applyHmClass(hmWin, parts.Win / maxV);
    applyHmClass(hmFloor, parts.Floor / maxV);
    applyHmClass(hmVent, parts.Vent / maxV);

    // list (arány + számok)
    if (hmList) {
      const total = Math.max(0.0001, parts.Total);
      const rows = [
        { name: "Légcsere", v: parts.Vent },
        { name: "Ablak", v: parts.Win },
        { name: "Padló", v: parts.Floor },
        { name: "Fal", v: parts.Wall },
        { name: "Födém", v: parts.Roof },
      ].map((x) => {
        const pct = (x.v / total) * 100;
        return `
          <div class="hmRow">
            <div class="hmName">${x.name}</div>
            <div class="hmBar"><div class="hmFill" style="width:${clamp(pct, 0, 100)}%"></div></div>
            <div class="hmPct">${fmt1(pct)}%</div>
            <div class="hmSub muted tiny">H hozzájárulás: <b>${fmt1(x.v)} W/K</b></div>
          </div>
        `;
      });
      hmList.innerHTML = rows.join("");
    }

    // quick explain
    if (hmExplain) {
      if (hmMode === "now") {
        hmExplain.textContent = "MOST: megmutatja, hol szökik el most a legtöbb hő (prioritás).";
      } else if (hmMode === "target") {
        hmExplain.textContent = "CÉL: megmutatja, hogy a cél állapotban hol marad veszteség (még szigetelés után is).";
      } else {
        // delta
        const items = [
          { n: "Légcsere", v: parts.Vent },
          { n: "Ablak", v: parts.Win },
          { n: "Padló", v: parts.Floor },
          { n: "Fal", v: parts.Wall },
          { n: "Födém", v: parts.Roof },
        ];
        items.sort((a, b) => b.v - a.v);
        const top = items[0];
        hmExplain.textContent = `KÜLÖNBSÉG: a legnagyobb “nyereség” várhatóan itt jön: ${top ? top.n : "–"}.`;
      }
    }
  }

  // ---------- docs ----------
  function seedDocs() {
    // ha már van eltárolva, nem írjuk felül
    if (localStorage.getItem(LS_DOCS)) return;

    const docs = [
      {
        id: "hdd",
        cat: "basics",
        mins: 3,
        title: "Mi az a HDD (fűtési foknap) és miért számít?",
        tags: ["HDD", "fűtés", "alapok"],
        body: `
          <p>A <b>HDD</b> (Heating Degree Days) azt mutatja, mennyire volt hideg egy évben/idényben egy adott helyen.
          Minél nagyobb a HDD, annál több fűtési energia kell ugyanahhoz a házhoz.</p>
          <p><b>Magyar irányszám:</b> ~3000 (településtől függ). A kalkulátor azért kéri, hogy országos átlaggal is lehessen becsülni.</p>
          <p><b>Gyakorlat:</b> ha ugyanaz a ház hidegebb környéken van, a MOST költség magasabb → a megtakarítás forintban is nagyobb lehet.</p>
        `,
      },
      {
        id: "uvalue",
        cat: "basics",
        mins: 4,
        title: "U-érték egyszerűen: mit jelent és mitől lesz jobb?",
        tags: ["U-érték", "hőveszteség", "fal"],
        body: `
          <p>Az <b>U-érték</b> megmutatja, 1 m² felületen mennyi hő megy át 1°C különbség mellett. <b>Minél kisebb, annál jobb.</b></p>
          <p>Szigetelésnél a cél, hogy a fal/födém/padló U-értéke csökkenjen — így csökken a hőveszteség és a költség.</p>
          <ul>
            <li>Fal: régi házaknál gyakran magas (rossz) U</li>
            <li>Födém: sokszor a legjobb első lépés</li>
            <li>Padló: bontásfüggő, de sokat tud számítani</li>
          </ul>
        `,
      },
      {
        id: "vent",
        cat: "basics",
        mins: 3,
        title: "Légcsere (1/h): miért tud elvinni rengeteg pénzt?",
        tags: ["légcsere", "infiltráció", "szellőzés"],
        body: `
          <p>Ha a ház “huzatos”, a meleg levegő kijut, a hideg bejön — ezt a fűtésnek folyamatosan pótolnia kell.</p>
          <p><b>Tipikus jelek:</b> hideg padló, huzat az ablaknál, magas számla még szigetelés után is.</p>
          <p><b>Mit tehetsz:</b> nyílászáró beállítás, tömítések, légzárási hibák javítása, padlásfödém átfújások megszüntetése.</p>
        `,
      },
      {
        id: "atticfirst",
        cat: "ins",
        mins: 4,
        title: "Miért a födém/padlás szigetelés szokott a legjobb első lépés lenni?",
        tags: ["födém", "padlás", "megtérülés"],
        body: `
          <p>Felfelé szökik a meleg — ezért a <b>födém</b> gyakran a legnagyobb veszteség.</p>
          <p>Általában gyorsan kivitelezhető, kevesebb bontással, és jó ár/érték arányú.</p>
          <p><b>Tipp:</b> légzárás nélkül a szigetelés hatása gyengébb — a rések megszüntetése sokat dob.</p>
        `,
      },
      {
        id: "epsrock",
        cat: "ins",
        mins: 5,
        title: "EPS vagy kőzetgyapot? Rövid döntési szempontok",
        tags: ["EPS", "kőzetgyapot", "fal"],
        body: `
          <ul>
            <li><b>EPS:</b> jó ár/érték, könnyű, gyakori homlokzatra</li>
            <li><b>Kőzetgyapot:</b> jobb pára/akusztika, tűzállóbb, drágább</li>
          </ul>
          <p>A választás függ a falazattól, páratechnikától, költségkerettől és a kivitelezéstől.</p>
        `,
      },
      {
        id: "floorworth",
        cat: "ins",
        mins: 4,
        title: "Padló/aljzat szigetelés: mikor éri meg?",
        tags: ["padló", "aljzat", "XPS"],
        body: `
          <p>Padló szigetelés akkor a legjobb, ha amúgy is bontasz/felújítasz.</p>
          <p>Ha nincs bontás, sokszor drágább és macerásabb, de komfortban nagyot tud dobni (hideg padló megszűnik).</p>
        `,
      },
      {
        id: "boilerhp",
        cat: "heat",
        mins: 5,
        title: "Kazáncsere vagy hőszivattyú? Miért fontos a SCOP?",
        tags: ["kazán", "hőszivattyú", "SCOP"],
        body: `
          <p><b>SCOP</b> az éves átlagos hatásfok: minél nagyobb, annál kevesebb villany kell ugyanahhoz a hőhöz.</p>
          <p>Hőszivattyúnál a rendszer (radiátor/ padlófűtés), szigetelés és beállítások erősen befolyásolják a valós SCOP-ot.</p>
        `,
      },
      {
        id: "cond",
        cat: "heat",
        mins: 3,
        title: "Kondenzációs kazán: mikor hoz látványos javulást?",
        tags: ["kondenz", "kazán", "hatásfok"],
        body: `
          <p>Alacsonyabb előremenő hőmérsékleten működik a legjobban (pl. padlófűtés vagy túlméretezett radiátor).</p>
          <p>Szigetelés és szabályozás mellett sokszor látványosabb a megtakarítás.</p>
        `,
      },
      {
        id: "bridges",
        cat: "mist",
        mins: 4,
        title: "Hőhidak: miért lehet penész akkor is, ha szigeteltél?",
        tags: ["hőhíd", "csomópont", "penész"],
        body: `
          <p>A hőhíd helyén hidegebb a felület, ott kicsapódhat a pára → penész.</p>
          <p><b>Kritikus pontok:</b> koszorú, áthidaló, erkélylemez, lábazat, ablak környéke.</p>
        `,
      },
      {
        id: "drafty",
        cat: "mist",
        mins: 3,
        title: "Tipikus hiba: szigetelés van, de a ház továbbra is “huzatos”",
        tags: ["légzárás", "huzat", "szalag"],
        body: `
          <p>Ha a légzárás nincs rendben, a hő nagy része továbbra is elmegy légcserén.</p>
          <p>Nyílászáró tömítések, csatlakozások, padlásfödém átvezetések javítása sokat segít.</p>
        `,
      },
      {
        id: "qlist",
        cat: "list",
        mins: 5,
        title: "10 kérdés kivitelezőnek, hogy ne bukj a részleteken",
        tags: ["kivitelező", "kérdések", "minőség"],
        body: `
          <ol>
            <li>Mi a pontos rétegrend és anyag?</li>
            <li>Hőhidak kezelése hogyan történik?</li>
            <li>Lábazat, koszorú, ablak körüli csomópontok?</li>
            <li>Ragasztás/dübelezés arány és szabvány?</li>
            <li>Páratechnika (páraáteresztés) rendben lesz?</li>
            <li>Garancia mire vonatkozik és mennyi?</li>
            <li>Ütemezés és időjárás miatti szabályok?</li>
            <li>Hogyan védik a felületet kivitelezés közben?</li>
            <li>Mi van benne az árban (állvány, szállítás, törmelék)?</li>
            <li>Referenciák, helyszíni megtekintés?</li>
          </ol>
        `,
      },
    ];

    localStorage.setItem(LS_DOCS, JSON.stringify(docs));
  }

  function loadDocs() {
    seedDocs();
    try {
      return JSON.parse(localStorage.getItem(LS_DOCS) || "[]");
    } catch {
      return [];
    }
  }

  function setActiveChip(cat) {
    activeDocCat = cat;

    const chips = [chipAll, chipBasics, chipIns, chipHeat, chipMist, chipList].filter(Boolean);
    chips.forEach((c) => c.classList.remove("active"));

    if (cat === "all" && chipAll) chipAll.classList.add("active");
    if (cat === "basics" && chipBasics) chipBasics.classList.add("active");
    if (cat === "ins" && chipIns) chipIns.classList.add("active");
    if (cat === "heat" && chipHeat) chipHeat.classList.add("active");
    if (cat === "mist" && chipMist) chipMist.classList.add("active");
    if (cat === "list" && chipList) chipList.classList.add("active");

    renderDocs();
  }

  function renderDocs() {
    if (!viewDocs) return;

    const docs = loadDocs();
    const q = (docSearch && docSearch.value ? docSearch.value : "").trim().toLowerCase();

    let filtered = docs;

    if (activeDocCat !== "all") {
      filtered = filtered.filter((d) => d.cat === activeDocCat);
    }

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
          const catName =
            d.cat === "basics"
              ? "Alapok"
              : d.cat === "ins"
              ? "Szigetelés"
              : d.cat === "heat"
              ? "Fűtés"
              : d.cat === "mist"
              ? "Tipikus hibák"
              : "Kérdéslista";
          const tags = (d.tags || []).slice(0, 4).map((t) => `#${t}`).join(" ");
          const isActive = d.id === activeDocId;
          return `
            <div class="docItem ${isActive ? "active" : ""}" data-doc="${d.id}">
              <div class="docTitle">${d.title}</div>
              <div class="muted tiny">kategória: <b>${catName}</b> • ~${d.mins || 3} perc • ${tags}</div>
            </div>
          `;
        })
        .join("");

      // kattintás
      Array.from(docList.querySelectorAll(".docItem")).forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-doc");
          openDoc(id);
        });
      });
    }

    // ha nincs kiválasztott cikk, nyissuk meg az elsőt
    if (!activeDocId && filtered.length > 0) openDoc(filtered[0].id);
    if (filtered.length === 0 && docView) {
      docView.innerHTML = `<div class="muted">Nincs találat.</div>`;
      activeDocId = null;
    }
  }

  function openDoc(id) {
    const docs = loadDocs();
    const d = docs.find((x) => x.id === id);
    if (!d) return;

    activeDocId = id;

    // lista újrarajz, hogy az active kijelzés meglegyen
    renderDocs();

    if (!docView) return;

    const catName =
      d.cat === "basics"
        ? "Alapok"
        : d.cat === "ins"
        ? "Szigetelés"
        : d.cat === "heat"
        ? "Fűtés"
        : d.cat === "mist"
        ? "Tipikus hibák"
        : "Kérdéslista";

    docView.innerHTML = `
      <div class="docArticle">
        <div class="docTitleBig">${d.title}</div>
        <div class="muted tiny">kategória: <b>${catName}</b> • ~${d.mins || 3} perc</div>
        <div class="docBody" style="margin-top:12px;">${d.body || ""}</div>
      </div>
    `;
  }

  // ---------- local save/load ----------
  function saveStateLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(collectState()));
      toast("Mentve (helyben).");
    } catch {
      toast("Mentés hiba.");
    }
  }

  function loadStateLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (s) {
        applyState(s);
        toast("Betöltve.");
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

  // ---------- calc run ----------
  function runAnalysis() {
    const s = { ...defaults(), ...collectState() };

    // minimális validálás
    if (!s.area || Number(s.area) <= 0) s.area = 100;
    if (!s.annualCostNow || Number(s.annualCostNow) <= 0) {
      toast("Add meg az éves fűtési költséget MOST (Ft/év).");
      return;
    }

    const r = computeFull(s);
    renderResult(r);
    toast("Elemzés kész.");

    // ha épp 3D-n vagyunk, frissítsük
    if (activeView === "3d") renderHeatmapFromLast();
    if (activeView === "plan") renderPlanFromLast();
  }

  function resetDefaults() {
    const d = defaults();
    applyState(d);
    toast("Alapértékek beállítva.");
  }

  // ---------- share ----------
  function shareLink() {
    // egyszerű: state local-ba + hash jelzés (később lehet bővíteni base64-el)
    saveStateLocal();
    const url = new URL(window.location.href);
    url.hash = "#calc&share=1";
    navigator.clipboard
      .writeText(url.toString())
      .then(() => toast("Megosztási link kimásolva."))
      .catch(() => toast("Link kész (nem tudtam másolni vágólapra)."));
  }

  // ---------- bind events ----------
  function bindNav() {
    if (btnHome) btnHome.addEventListener("click", () => go("home"));
    if (btnCalc) btnCalc.addEventListener("click", () => go("calc"));
    if (btn3d) btn3d.addEventListener("click", () => go("3d"));
    if (btnDocs) btnDocs.addEventListener("click", () => go("docs"));

    if (btnPro) btnPro.addEventListener("click", () => go("pro"));

    if (btnPlan) {
      btnPlan.addEventListener("click", () => {
        const has = !!safeReadLast();
        if (!has) {
          toast("Előbb futtasd az Elemzést.");
          go("calc");
          return;
        }
        go("plan");
      });
    }

    if (homeGoCalc) homeGoCalc.addEventListener("click", () => go("calc"));
    if (homeGoDocs) homeGoDocs.addEventListener("click", () => go("docs"));
  }

  function bindCalcButtons() {
    if (btnCalcRun) btnCalcRun.addEventListener("click", runAnalysis);
    if (btnReset) btnReset.addEventListener("click", resetDefaults);
    if (btnShare) btnShare.addEventListener("click", shareLink);
    if (btnLead) btnLead.addEventListener("click", () => (window.location.href = SZAKIPIAC_HOME_URL));

    if (btnSaveState) btnSaveState.addEventListener("click", saveStateLocal);
    if (btnLoadState) btnLoadState.addEventListener("click", loadStateLocal);
    if (btnClearState) btnClearState.addEventListener("click", clearStateLocal);

    // PDF (nyomtatás)
    if (btnExportPDF) btnExportPDF.addEventListener("click", () => window.print());

    // export/import JSON (ha van külön gomb)
    if (btnExportJson) btnExportJson.addEventListener("click", exportJson);
    if (btnImportJson) btnImportJson.addEventListener("click", importJson);

    // Ha nincs külön export/import gomb, de szeretnéd: a Mentés/Betöltés megmarad local-ra.
  }

  function bind3D() {
    if (hmModeNow) hmModeNow.addEventListener("click", () => setHmMode("now"));
    if (hmModeTarget) hmModeTarget.addEventListener("click", () => setHmMode("target"));
    if (hmModeDelta) hmModeDelta.addEventListener("click", () => setHmMode("delta"));

    if (btnExportPDF_3D) btnExportPDF_3D.addEventListener("click", () => window.print());

    // initial active state
    setHmMode(hmMode);
  }

  function bindDocs() {
    if (docSearch) {
      docSearch.addEventListener("input", () => renderDocs());
    }
    if (chipAll) chipAll.addEventListener("click", () => setActiveChip("all"));
    if (chipBasics) chipBasics.addEventListener("click", () => setActiveChip("basics"));
    if (chipIns) chipIns.addEventListener("click", () => setActiveChip("ins"));
    if (chipHeat) chipHeat.addEventListener("click", () => setActiveChip("heat"));
    if (chipMist) chipMist.addEventListener("click", () => setActiveChip("mist"));
    if (chipList) chipList.addEventListener("click", () => setActiveChip("list"));
  }

  // ---------- init ----------
  function init() {
    ensureSzakiPiacButton();
    bindNav();
    bindCalcButtons();
    bind3D();
    bindDocs();

    // első induláskor default értékek
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      loadStateLocal();
    } else {
      applyState(defaults());
    }

    updatePlanLock();

    // hash alapú indulás
    const h = (window.location.hash || "").toLowerCase();
    if (h.includes("docs")) go("docs");
    else if (h.includes("3d")) go("3d");
    else if (h.includes("plan")) go("plan");
    else if (h.includes("pro")) go("pro");
    else if (h.includes("calc")) go("calc");
    else go("home");

    // docs első render
    if (viewDocs) renderDocs();

    // ha van last, 3d is tud rajzolni
    renderHeatmapFromLast();
  }

  // ---------- CSS class safety for heatmap ----------
  // Ha a style.css-ben nincs hmHot/hmMid/hmCool, akkor is “látszódjon”
  function ensureHeatmapFallbackStyles() {
    const styleId = "ea_hm_fallback";
    if ($(styleId)) return;
    const st = document.createElement("style");
    st.id = styleId;
    st.textContent = `
      .hmHot{ filter:saturate(1.2); }
      .hmMid{ filter:saturate(1.05); opacity:.95; }
      .hmCool{ filter:saturate(.9); opacity:.9; }

      /* hmList fallback (ha a CSS-ben nincs) */
      .hmRow{ padding:10px 10px; border:1px solid rgba(255,255,255,.08); border-radius:14px; margin-bottom:10px; background:rgba(15,20,35,.25); }
      .hmName{ font-weight:600; margin-bottom:6px; }
      .hmBar{ height:8px; border-radius:999px; overflow:hidden; background:rgba(255,255,255,.08); }
      .hmFill{ height:100%; background:rgba(120,180,255,.75); }
      .hmPct{ margin-top:6px; font-weight:600; }
      .hmSub{ margin-top:4px; }
      .docItem{ cursor:pointer; padding:12px; border:1px solid rgba(255,255,255,.08); border-radius:14px; margin-bottom:10px; background:rgba(15,20,35,.22); }
      .docItem.active{ outline:2px solid rgba(120,180,255,.35); }
      .docTitle{ font-weight:700; }
      .docTitleBig{ font-size:20px; font-weight:800; }
    `;
    document.head.appendChild(st);
  }

  ensureHeatmapFallbackStyles();
  init();
})();
