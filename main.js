(function () {
  const $ = (id) => document.getElementById(id);

  // =========================
  // SZAKIPIAC VISSZA
  // =========================
  const SZAKIPIAC_HOME_URL = "https://szakipiac-2025.hu/#home";
  function goToSzakipiacHome() { window.location.href = SZAKIPIAC_HOME_URL; }

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
  function fmtPct(v) { return (Math.round(v * 10) / 10).toFixed(1) + "%"; }
  function paybackYears(cost, savingPerYear) { if (savingPerYear <= 0) return Infinity; return cost / savingPerYear; }
  function fmtYears(y) { if (!Number.isFinite(y)) return "–"; if (y > 99) return "99+ év"; return (Math.round(y * 10) / 10).toFixed(1) + " év"; }

  function flashBtn(btn) {
    if (!btn) return;
    btn.classList.add("isBusy");
    setTimeout(() => btn.classList.remove("isBusy"), 450);
  }

  function toast(msg) {
    let el = document.getElementById("eaToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "eaToast";
      el.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(10,16,30,.92);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#fff;padding:10px 14px;border-radius:12px;font-weight:600;z-index:9999;opacity:0;transition:opacity .18s ease";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = "1";
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = "0"; }, 1400);
  }

  function scrollToResult() {
    const resultBox = $("resultBox");
    if (!resultBox) return;
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- NAV ----------
  const btnHome = $("btnHome");
  const btnCalc = $("btnCalc");
  const btnPro  = $("btnPro");
  const btnPlan = $("btnPlan");
  const btn3d   = $("btn3d");
  const btnDocs = $("btnDocs");

  const viewHome = $("viewHome");
  const viewCalc = $("viewCalc");
  const viewPro  = $("viewPro");
  const viewPlan = $("viewPlan");
  const view3d   = $("view3d");
  const viewDocs = $("viewDocs");

  const homeGoCalc = $("homeGoCalc");
  const homeGoDocs = $("homeGoDocs");

  function setActive(btn) {
    [btnHome, btnCalc, btnPro, btnPlan, btn3d, btnDocs].forEach((b) => b && b.classList.remove("active"));
    btn && btn.classList.add("active");
  }

  function showView(which) {
    if (viewHome) viewHome.style.display = which === "home" ? "" : "none";
    if (viewCalc) viewCalc.style.display = which === "calc" ? "" : "none";
    if (viewPro)  viewPro.style.display  = which === "pro"  ? "" : "none";
    if (viewPlan) viewPlan.style.display = which === "plan" ? "" : "none";
    if (view3d)   view3d.style.display   = which === "3d"   ? "" : "none";
    if (viewDocs) viewDocs.style.display = which === "docs" ? "" : "none";

    if (which === "home") setActive(btnHome);
    if (which === "calc") setActive(btnCalc);
    if (which === "pro")  setActive(btnPro);
    if (which === "plan") setActive(btnPlan);
    if (which === "3d")   setActive(btn3d);
    if (which === "docs") setActive(btnDocs);

    if (which === "pro") updateProSummary();
    if (which === "plan") renderPlanFromLast();
    if (which === "3d") updateHeatmap();
    if (which === "docs") renderDocs();

    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
  }

  if (btnHome) btnHome.addEventListener("click", () => { location.hash = "#home"; showView("home"); });
  if (btnCalc) btnCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  if (btnPro)  btnPro.addEventListener("click",  () => { location.hash = "#pro";  showView("pro");  });

  if (btnPlan) btnPlan.addEventListener("click", () => {
    const disabled = (btnPlan.getAttribute("aria-disabled") === "true");
    if (disabled) { toast("Előbb futtasd az Elemzést."); return; }
    location.hash = "#plan";
    showView("plan");
  });

  if (btn3d)   btn3d.addEventListener("click", () => { location.hash = "#3d"; showView("3d"); });
  if (btnDocs) btnDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

  if (homeGoCalc) homeGoCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  if (homeGoDocs) homeGoDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

  // ================================
  // „← SzakiPiac” gomb a NAV-BAN
  // ================================
  function addBackToSzakipiacButton() {
    if (document.getElementById("eaBackToSzakipiac")) return;

    const refBtn =
      document.getElementById("btnHome") ||
      document.getElementById("btnCalc") ||
      document.getElementById("btnPro")  ||
      document.getElementById("btnPlan") ||
      document.getElementById("btn3d")   ||
      document.getElementById("btnDocs");

    if (!refBtn) return;

    const navGroup = refBtn.parentElement;
    if (!navGroup) return;

    const a = document.createElement("a");
    a.id = "eaBackToSzakipiac";
    a.href = SZAKIPIAC_HOME_URL;
    a.textContent = "← SzakiPiac";
    a.className = (refBtn.className || "").replace(/\bactive\b/g, "").trim();
    if (!a.className) {
      a.style.cssText = `
        display:inline-flex;align-items:center;padding:10px 16px;border-radius:999px;
        background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);
        color:#eaf2ff;text-decoration:none;font-weight:600;backdrop-filter: blur(6px);
      `;
    }
    a.style.whiteSpace = "nowrap";
    navGroup.insertBefore(a, refBtn);
  }

  // ---------- Material lambdas (W/mK) ----------
  const LAMBDA = { eps: 0.037, rockwool: 0.039, xps: 0.034 };

  // Base U-values (W/m²K)
  const U_BASE = { brick: 1.25, adobe: 1.10, concrete: 1.60, roof: 1.60, floor: 1.10, window: 2.60 };

  // fűtés
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

  // =========================
  // PRO GEOMETRIA (AUTO + PRO)
  // =========================
  function geometryAuto(areaTotal, storeys, height) {
    const s = clamp(storeys, 1, 3);
    const footprint = areaTotal / s;
    const side = Math.sqrt(Math.max(footprint, 1));
    const perim = 4 * side;

    const wallGross = perim * height * s;
    const roofArea = footprint;
    const floorArea = footprint;
    const volume = footprint * height * s;

    return { footprint, perim, wallGross, roofArea, floorArea, volume, mode: "AUTO" };
  }

  function geometryFromInputs(areaTotal, storeys, height, pro) {
    const s = clamp(storeys, 1, 3);

    const enabled = pro.enabled === 1;

    if (!enabled) return geometryAuto(areaTotal, s, height);

    // 1) alap footprint: hossz×szél vagy kézi padló vagy kézi fűtött
    let footprint =
      (pro.len > 0 && pro.wid > 0) ? (pro.len * pro.wid) :
      (pro.floorArea > 0) ? pro.floorArea :
      (pro.roofArea > 0) ? pro.roofArea :
      (areaTotal / s);

    footprint = Math.max(1, footprint);

    // 2) perim: kézi kerület vagy téglalap
    let perim =
      (pro.perim > 0) ? pro.perim :
      (pro.len > 0 && pro.wid > 0) ? (2 * (pro.len + pro.wid)) :
      (4 * Math.sqrt(footprint));

    perim = Math.max(1, perim);

    // 3) felületek: roof/floor kézi felülírás
    const roofArea  = (pro.roofArea  > 0) ? pro.roofArea  : footprint;
    const floorArea = (pro.floorArea > 0) ? pro.floorArea : footprint;

    // 4) fal bruttó: kézi fal m² felülír mindent, különben perim×h×szintek
    const wallGross = (pro.wallArea > 0) ? pro.wallArea : (perim * height * s);

    // 5) térfogat: kézi, különben floor×h×szintek
    const volume = (pro.volume > 0) ? pro.volume : (floorArea * height * s);

    return { footprint, perim, wallGross, roofArea, floorArea, volume, mode: "PRO" };
  }

  function heatLossBreakdown(Uwall, Awall, Uwin, Awin, Uroof, Aroof, Ufloor, Afloor, nAir, volume, bridgePct) {
    const H_wall = (Uwall * Awall);
    const H_win  = (Uwin * Awin);
    const H_roof = (Uroof * Aroof);
    const H_floor= (Ufloor * Afloor);
    const Htrans = H_wall + H_win + H_roof + H_floor;
    const Hvent  = 0.33 * nAir * volume;
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
      floorInsCm, floorInsMat,
      pro
    } = params;

    const g = geometryFromInputs(area, storeys, height, pro);

    // ablak: PRO-ban lehet kézi ablak m² is (felülírja % arányt)
    const Awin = (pro.enabled === 1 && pro.winArea > 0)
      ? pro.winArea
      : (g.wallGross * clamp(winRatio, 5, 35) / 100);

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
      areas: { AwallNet, Awin, Aroof: g.roofArea, Afloor: g.floorArea, AwallGross: g.wallGross },
      U: { Uwall, Uwin, Uroof, Ufloor },
      H: loss
    };
  }

  // ---------- Defaults ----------
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
    costHeating: 3500000,

    // PRO
    proEnabled: 0,
    proSyncArea: 1,
    proLen: 10,
    proWid: 10,
    proPerim: 0,
    proWallArea: 0,
    proWinArea: 0,
    proRoofArea: 0,
    proFloorArea: 0,
    proVolume: 0,
    proAreaTotal: 0
  };

  function setDefaults() {
    const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };

    setVal("area", DEFAULTS.area);
    setVal("storeys", String(DEFAULTS.storeys));
    setVal("height", DEFAULTS.height);
    setVal("wallType", DEFAULTS.wallType);
    setVal("winRatio", DEFAULTS.winRatio);
    setVal("nAir", DEFAULTS.nAir);

    setVal("wallInsNow", DEFAULTS.wallInsNow);
    setVal("wallInsMat", DEFAULTS.wallInsMat);
    setVal("roofInsNow", DEFAULTS.roofInsNow);
    setVal("roofInsMat", DEFAULTS.roofInsMat);
    setVal("floorInsNow", DEFAULTS.floorInsNow);
    setVal("floorInsMat", DEFAULTS.floorInsMat);

    setVal("heatingNow", DEFAULTS.heatingNow);
    setVal("scopNow", DEFAULTS.scopNow);
    setVal("annualCostNow", DEFAULTS.annualCostNow);

    setVal("wallInsTarget", DEFAULTS.wallInsTarget);
    setVal("roofInsTarget", DEFAULTS.roofInsTarget);
    setVal("floorInsTarget", DEFAULTS.floorInsTarget);
    setVal("heatingTarget", DEFAULTS.heatingTarget);
    setVal("scopTarget", DEFAULTS.scopTarget);

    setVal("hdd", DEFAULTS.hdd);
    setVal("priceGas", DEFAULTS.priceGas);
    setVal("priceEl", DEFAULTS.priceEl);

    setVal("bridge", DEFAULTS.bridge);
    setVal("costWallM2", DEFAULTS.costWallM2);
    setVal("costRoofM2", DEFAULTS.costRoofM2);
    setVal("costFloorM2", DEFAULTS.costFloorM2);
    setVal("costHeating", DEFAULTS.costHeating);

    // PRO
    setVal("proEnabled", DEFAULTS.proEnabled);
    setVal("proSyncArea", DEFAULTS.proSyncArea);
    setVal("proLen", DEFAULTS.proLen);
    setVal("proWid", DEFAULTS.proWid);
    setVal("proPerim", DEFAULTS.proPerim);
    setVal("proWallArea", DEFAULTS.proWallArea);
    setVal("proWinArea", DEFAULTS.proWinArea);
    setVal("proRoofArea", DEFAULTS.proRoofArea);
    setVal("proFloorArea", DEFAULTS.proFloorArea);
    setVal("proVolume", DEFAULTS.proVolume);
    setVal("proAreaTotal", DEFAULTS.proAreaTotal);

    updateProSummary();
  }

  // ---------- State (mentés/export/import) ----------
  const INPUT_IDS = [
    "area","storeys","height","wallType","winRatio","nAir",
    "wallInsNow","wallInsMat","roofInsNow","roofInsMat","floorInsNow","floorInsMat",
    "heatingNow","scopNow","annualCostNow",
    "wallInsTarget","roofInsTarget","floorInsTarget","heatingTarget","scopTarget",
    "hdd","priceGas","priceEl",
    "bridge","costWallM2","costRoofM2","costFloorM2","costHeating",

    // PRO
    "proEnabled","proSyncArea","proLen","proWid","proPerim","proWallArea","proWinArea",
    "proRoofArea","proFloorArea","proVolume","proAreaTotal"
  ];

  function serializeState(){
    const s = {};
    INPUT_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      s[id] = el.value;
    });
    return s;
  }

  function applyState(s){
    if (!s) return;
    INPUT_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      if (s[id] !== undefined) el.value = s[id];
    });
    updateProSummary();
  }

  // ---------- Hash share ----------
  function parseHash(){
    const raw = (location.hash || "#home").replace(/^#/, "");
    const parts = raw.split("&").filter(Boolean);
    const view = (parts[0] || "home").split("?")[0];
    const params = {};
    parts.slice(1).forEach(p => {
      const [k, ...rest] = p.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(rest.join("=") || "");
    });
    return { view, params };
  }

  function b64urlEncode(str){
    const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    const b64 = btoa(utf8);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function b64urlDecode(b64url){
    const b64 = (b64url || "").replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64 + "===".slice((b64.length + 3) % 4);
    const bin = atob(pad);
    const pct = Array.prototype.map.call(bin, c =>
      "%" + c.charCodeAt(0).toString(16).padStart(2, "0")
    ).join("");
    return decodeURIComponent(pct);
  }

  function buildShareHash(){
    const payload = JSON.stringify(serializeState());
    const token = b64urlEncode(payload);
    return `#calc&share=${encodeURIComponent(token)}`;
  }

  function tryApplyShareFromUrl(){
    const { view, params } = parseHash();
    if (view !== "calc") return false;
    if (!params.share) return false;

    try{
      const json = b64urlDecode(params.share);
      const state = JSON.parse(json);
      applyState(state);
      toast("Megosztott kalkuláció betöltve.");
      return true;
    }catch(e){
      console.error(e);
      toast("Hibás megosztás link.");
      return false;
    }
  }

  async function copyToClipboard(text){
    try{
      if (navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text);
        return true;
      }
    }catch(_){}
    try{
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    }catch(_){}
    return false;
  }

  async function shareLink(){
    const url = location.origin + location.pathname + buildShareHash();
    const ok = await copyToClipboard(url);
    if (ok) toast("Link kimásolva ✅");
    else prompt("Másold ki ezt a linket:", url);
  }

  function bindShareButton(){
    const btnShare = $("btnShare");
    if (btnShare){
      btnShare.addEventListener("click", async () => { flashBtn(btnShare); await shareLink(); });
    }
  }

  // ---------- LocalStorage mentés ----------
  const STATE_KEY = "ea3d_state_v1";

  function bindStateButtons(){
    const btnSave = $("btnSaveState");
    const btnLoad = $("btnLoadState");
    const btnClear = $("btnClearState");

    if (btnSave){
      btnSave.addEventListener("click", () => {
        flashBtn(btnSave);
        try{
          localStorage.setItem(STATE_KEY, JSON.stringify(serializeState()));
          toast("Mentve (böngészőben) ✅");
        }catch(e){ console.error(e); toast("Mentés hiba."); }
      });
    }

    if (btnLoad){
      btnLoad.addEventListener("click", () => {
        flashBtn(btnLoad);
        try{
          const raw = localStorage.getItem(STATE_KEY);
          if (!raw){ toast("Nincs mentés."); return; }
          applyState(JSON.parse(raw));
          toast("Betöltve ✅");
        }catch(e){ console.error(e); toast("Betöltés hiba."); }
      });
    }

    if (btnClear){
      btnClear.addEventListener("click", () => {
        flashBtn(btnClear);
        try{
          localStorage.removeItem(STATE_KEY);
          toast("Mentés törölve 🧹");
        }catch(e){ console.error(e); toast("Törlés hiba."); }
      });
    }
  }

  // ---------- Export / Import (JSON fájl) ----------
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function bindExportImportButtons() {
    const btnExport = $("btnExportState");
    const btnImport = $("btnImportState");

    if (btnExport) {
      btnExport.addEventListener("click", () => {
        try {
          flashBtn(btnExport);
          const payload = JSON.stringify(serializeState(), null, 2);
          const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
          downloadTextFile(`EA3D-mentes-${ts}.json`, payload);
          toast("Export kész ✅");
        } catch (e) { console.error(e); toast("Export hiba."); }
      });
    }

    if (btnImport) {
      btnImport.addEventListener("click", () => {
        try {
          flashBtn(btnImport);
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "application/json,.json";
          input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            try {
              const text = await file.text();
              applyState(JSON.parse(text));
              toast("Import betöltve ✅");
            } catch (err) { console.error(err); toast("Hibás JSON fájl."); }
          };
          input.click();
        } catch (e) { console.error(e); toast("Import hiba."); }
      });
    }
  }

  // ---------- PDF (print) ----------
  function bindPdfButtons(){
    const btnPdfCalc = $("btnExportPDF");
    const btnPdf3d = $("btnExportPDF_3D");
    const doPrint = (btn) => { flashBtn(btn); toast("PDF / Nyomtatás…"); setTimeout(() => window.print(), 150); };
    if (btnPdfCalc) btnPdfCalc.addEventListener("click", () => doPrint(btnPdfCalc));
    if (btnPdf3d) btnPdf3d.addEventListener("click", () => doPrint(btnPdf3d));
  }

  // =========================
  // PRO UI + SZINKRON
  // =========================
  function readPro() {
    const enabled = num($("proEnabled")?.value, 0) ? 1 : 0;
    return {
      enabled,
      syncArea: num($("proSyncArea")?.value, 1) ? 1 : 0,
      len: Math.max(0, num($("proLen")?.value, 0)),
      wid: Math.max(0, num($("proWid")?.value, 0)),
      perim: Math.max(0, num($("proPerim")?.value, 0)),
      wallArea: Math.max(0, num($("proWallArea")?.value, 0)),
      winArea: Math.max(0, num($("proWinArea")?.value, 0)),
      roofArea: Math.max(0, num($("proRoofArea")?.value, 0)),
      floorArea: Math.max(0, num($("proFloorArea")?.value, 0)),
      volume: Math.max(0, num($("proVolume")?.value, 0)),
      areaTotal: Math.max(0, num($("proAreaTotal")?.value, 0))
    };
  }

  function maybeSyncAreaFromPro() {
    const pro = readPro();
    if (pro.enabled !== 1) return;

    const storeys = clamp(num($("storeys")?.value, 1), 1, 3);

    let footprint =
      (pro.len > 0 && pro.wid > 0) ? (pro.len * pro.wid) :
      (pro.floorArea > 0) ? pro.floorArea :
      (pro.roofArea > 0) ? pro.roofArea :
      0;

    if (pro.areaTotal > 0) {
      // ha kézi fűtött alapterület van megadva, azt nem írjuk felül
      return;
    }

    if (pro.syncArea === 1 && footprint > 0) {
      const total = footprint * storeys;
      if ($("area")) $("area").value = String(Math.round(total));
    }
  }

  function updateProSummary() {
    const box = $("proSummary");
    if (!box) return;

    const area = clamp(num($("area")?.value, 100), 20, 1000);
    const storeys = clamp(num($("storeys")?.value, 1), 1, 3);
    const height = clamp(num($("height")?.value, 2.6), 2.2, 3.2);

    const pro = readPro();

    const usedArea = (pro.enabled === 1 && pro.areaTotal > 0) ? pro.areaTotal : area;
    const g = geometryFromInputs(usedArea, storeys, height, pro);

    const winRatio = clamp(num($("winRatio")?.value, 18), 5, 35);
    const Awin = (pro.enabled === 1 && pro.winArea > 0)
      ? pro.winArea
      : (g.wallGross * winRatio / 100);

    const AwallNet = Math.max(0, g.wallGross - Awin);

    box.innerHTML = `
      <div class="miniTitle">Mód: <b>${g.mode}</b></div>
      <div style="margin-top:8px;">
        <b>Fal bruttó:</b> ${Math.round(g.wallGross)} m²<br/>
        <b>Ablak:</b> ${Math.round(Awin)} m²<br/>
        <b>Fal nettó:</b> ${Math.round(AwallNet)} m²<br/>
        <b>Födém/padlás:</b> ${Math.round(g.roofArea)} m²<br/>
        <b>Padló:</b> ${Math.round(g.floorArea)} m²<br/>
        <b>Térfogat:</b> ${Math.round(g.volume)} m³<br/>
        <div class="muted" style="margin-top:6px;">
          kerület: ${Math.round(g.perim)} m • footprint: ${Math.round(g.footprint)} m² • szintek: ${storeys} • belmagasság: ${height} m
        </div>
      </div>
    `;
  }

  function bindProUI() {
    const proIds = ["proEnabled","proSyncArea","proLen","proWid","proPerim","proWallArea","proWinArea","proRoofArea","proFloorArea","proVolume","proAreaTotal","storeys","height","winRatio","area"];
    proIds.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        maybeSyncAreaFromPro();
        updateProSummary();
      });
      el.addEventListener("change", () => {
        maybeSyncAreaFromPro();
        updateProSummary();
      });
    });

    const btnApply = $("btnProApply");
    const btnOff = $("btnProOff");
    if (btnApply) btnApply.addEventListener("click", () => {
      flashBtn(btnApply);
      if ($("proEnabled")) $("proEnabled").value = "1";
      maybeSyncAreaFromPro();
      updateProSummary();
      toast("PRO bekapcsolva ✅");
    });
    if (btnOff) btnOff.addEventListener("click", () => {
      flashBtn(btnOff);
      if ($("proEnabled")) $("proEnabled").value = "0";
      updateProSummary();
      toast("PRO kikapcsolva ⛔");
    });
  }

  // ---------- Kalk input olvasás ----------
  function readInputs() {
    const val = (id, fallback) => $(id) ? $(id).value : fallback;

    const area = clamp(num(val("area", 100), 100), 20, 1000);
    const storeys = clamp(num(val("storeys", 1), 1), 1, 3);
    const height = clamp(num(val("height", 2.6), 2.6), 2.2, 3.2);
    const wallType = val("wallType", "brick");

    const winRatio = clamp(num(val("winRatio", 18), 18), 5, 35);
    const nAir = clamp(num(val("nAir", 0.6), 0.6), 0.2, 1.2);

    const wallInsNow = clamp(num(val("wallInsNow", 0), 0), 0, 50);
    const wallInsMat = val("wallInsMat", "eps");
    const roofInsNow = clamp(num(val("roofInsNow", 0), 0), 0, 120);
    const roofInsMat = val("roofInsMat", "rockwool");
    const floorInsNow = clamp(num(val("floorInsNow", 0), 0), 0, 30);
    const floorInsMat = val("floorInsMat", "xps");

    const heatingNow = val("heatingNow", "gas_old");
    const scopNow = clamp(num(val("scopNow", 3.2), 3.2), 2.2, 5.5);
    const annualCostNow = Math.max(0, num(val("annualCostNow", 0), 0));

    const wallInsTarget = clamp(num(val("wallInsTarget", 15), 15), 0, 50);
    const roofInsTarget = clamp(num(val("roofInsTarget", 25), 25), 0, 120);
    const floorInsTarget = clamp(num(val("floorInsTarget", 10), 10), 0, 30);

    const heatingTarget = val("heatingTarget", "hp");
    const scopTarget = clamp(num(val("scopTarget", 3.6), 3.6), 2.2, 5.5);

    const hdd = clamp(num(val("hdd", 3000), 3000), 1800, 4500);
    const priceGas = clamp(num(val("priceGas", 40), 40), 10, 120);
    const priceEl = clamp(num(val("priceEl", 70), 70), 20, 180);

    const bridge = clamp(num(val("bridge", 10), 10), 0, 25);

    const costWallM2 = Math.max(0, num(val("costWallM2", 18000), 18000));
    const costRoofM2 = Math.max(0, num(val("costRoofM2", 12000), 12000));
    const costFloorM2 = Math.max(0, num(val("costFloorM2", 15000), 15000));
    const costHeating = Math.max(0, num(val("costHeating", 3500000), 3500000));

    const pro = readPro();

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
      costWallM2, costRoofM2, costFloorM2, costHeating,
      pro
    };
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

  function renderResult(out) { if (!resultBox) return; resultBox.innerHTML = out; }

  // ========= Felújítási terv =========
  let lastPlanData = null;

  function setPlanEnabled(enabled){
    if (!btnPlan) return;
    btnPlan.setAttribute("aria-disabled", enabled ? "false" : "true");
    btnPlan.title = enabled ? "Felújítási terv (Elemzés alapján)" : "Előbb futtasd az Elemzést.";
    btnPlan.style.opacity = enabled ? "" : "0.6";
    btnPlan.style.cursor = enabled ? "" : "not-allowed";
  }

  function buildPlanData(p){
    const totalInvestment = (p.inv.wallCost + p.inv.roofCost + p.inv.floorCost + p.inv.heatCost);
    const totalSavingYear = Math.max(0, p.savingYear);
    const totalPayback = paybackYears(totalInvestment, totalSavingYear);

    const notes = {
      "Fűtés": "Szigetelés után gyakran még jobb a hatása.",
      "Födém/padlás": "Jellemzően gyors és jó első lépés.",
      "Fal": "Csomópontok (koszorú/lábazat) minősége sokat számít.",
      "Padló/aljzat": "Bontás/hozzáférés függő, ezért változó megtérülés."
    };

    const map = {
      "Fűtés": { cost: p.inv.heatCost, save: p.saveOnlyHeat, pb: p.pbHeat },
      "Födém/padlás": { cost: p.inv.roofCost, save: p.saveOnlyRoof, pb: p.pbRoof },
      "Fal": { cost: p.inv.wallCost, save: p.saveOnlyWall, pb: p.pbWall },
      "Padló/aljzat": { cost: p.inv.floorCost, save: p.saveOnlyFloor, pb: p.pbFloor }
    };

    const steps = p.prio
      .filter(x => (x.v || 0) > 0)
      .slice(0, 5)
      .map(x => ({
        title: x.k,
        saveYear: map[x.k]?.save || 0,
        cost: map[x.k]?.cost || 0,
        payback: map[x.k]?.pb ?? Infinity,
        note: notes[x.k] || ""
      }));

    return { totalInvestment, totalSavingYear, totalPayback, steps };
  }

  function renderPlanFromLast(){
    const lock = $("planLockedNote");
    const box = $("planBox");
    if (!box) return;

    if (!lastPlanData){
      if (lock) lock.style.display = "";
      box.innerHTML = "";
      return;
    }

    if (lock) lock.style.display = "none";

    const t = lastPlanData;
    const stepsHtml = t.steps.map((s, i) => `
      <div class="out" style="margin-top:12px;">
        <div class="sectionTitle">${i+1}. ${s.title}</div>
        <div style="margin-top:6px;">
          <b>Várható megtakarítás:</b> ~ ${fmtFt(s.saveYear)} / év <span class="muted">(~ ${fmtFtShort(s.saveYear/12)} Ft/hó)</span><br/>
          <b>Becsült beruházás:</b> ${fmtFt(s.cost)}<br/>
          <b>Megtérülés (irány):</b> ${fmtYears(s.payback)}<br/>
          <div class="muted" style="margin-top:6px;">${s.note || ""}</div>
        </div>
      </div>
    `).join("");

    box.innerHTML = `
      <div class="out">
        <div class="sectionTitle">Összesítés (MOST → CÉL)</div>
        <div style="margin-top:6px;">
          <b>Teljes beruházás:</b> ${fmtFt(t.totalInvestment)}<br/>
          <b>Teljes éves megtakarítás:</b> ${fmtFt(t.totalSavingYear)} / év <span class="muted">(~ ${fmtFtShort(t.totalSavingYear/12)} Ft/hó)</span><br/>
          <b>Teljes megtérülés:</b> ${fmtYears(t.totalPayback)}
        </div>
      </div>

      <div class="out" style="margin-top:12px;">
        <div class="sectionTitle">3–5 lépéses felújítási terv</div>
        <div class="muted">A sorrend a várható <b>Ft/év</b> megtakarítás alapján van. (A valós sorrendet befolyásolhatja a kivitelezés, állapot, hozzáférhetőség.)</div>
      </div>

      ${stepsHtml}

      <div class="out" style="margin-top:14px;">
        <div class="sectionTitle">Ajánlatkérés a terv alapján</div>
        <div class="muted">Kérj ajánlatot a számolt terv alapján – a szakik gyorsabban tudnak árazni, ha látják a célokat.</div>
        <div style="margin-top:10px;">
          <button id="btnLeadPlan" class="btn primary">Ajánlatkérés szakiktól</button>
        </div>
      </div>
    `;

    const btnLeadPlan = $("btnLeadPlan");
    if (btnLeadPlan){
      btnLeadPlan.addEventListener("click", () => {
        flashBtn(btnLeadPlan);
        toast("Vissza a SzakiPiacra…");
        goToSzakipiacHome();
      });
    }
  }

  // ---------- Core calc ----------
  function calcAll() {
    const x = readInputs();

    // PRO: a modell “area” paraméterébe a pro.areaTotal mehet, ha megadta
    const areaForModel = (x.pro.enabled === 1 && x.pro.areaTotal > 0) ? x.pro.areaTotal : x.area;

    const nowScenario = computeScenario({
      area: areaForModel, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsNow, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsNow, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsNow, floorInsMat: x.floorInsMat,
      pro: x.pro
    });

    const targetScenario = computeScenario({
      area: areaForModel, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsTarget, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsTarget, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsTarget, floorInsMat: x.floorInsMat,
      pro: x.pro
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
        area: areaForModel, storeys: x.storeys, height: x.height,
        wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
        wallInsCm: wall, wallInsMat: x.wallInsMat,
        roofInsCm: roof, roofInsMat: x.roofInsMat,
        floorInsCm: floor, floorInsMat: x.floorInsMat,
        pro: x.pro
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

    lastPlanData = (savingYear > 0) ? buildPlanData({
      prio, inv,
      saveOnlyHeat, saveOnlyRoof, saveOnlyWall, saveOnlyFloor,
      pbHeat, pbRoof, pbWall, pbFloor,
      savingYear
    }) : null;
    setPlanEnabled(!!lastPlanData);

    // ✅ itt írjuk ki a m²-eket, hogy átlátható legyen miből számol
    const a = targetScenario.areas;
    const g = targetScenario.geom;

    const html = `
      <div class="sectionTitle">Eredmény</div>

      <div class="out" style="margin-top:10px;">
        <div class="sectionTitle">Felületek (modell alapja)</div>
        <div style="margin-top:6px;">
          <b>Mód:</b> ${g.mode}${x.pro.enabled===1 ? " (PRO)" : ""}<br/>
          <b>Fal bruttó:</b> ${Math.round(a.AwallGross)} m² • <b>Ablak:</b> ${Math.round(a.Awin)} m² • <b>Fal nettó:</b> ${Math.round(a.AwallNet)} m²<br/>
          <b>Födém/padlás:</b> ${Math.round(a.Aroof)} m² • <b>Padló/aljzat:</b> ${Math.round(a.Afloor)} m² • <b>Térfogat:</b> ${Math.round(g.volume)} m³
          <div class="muted" style="margin-top:6px;">
            (Ezekből számolja a beruházási költséget is: fal/födém/padló m² × Ft/m² × vastagság arány)
          </div>
        </div>
      </div>

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
        <div class="sectionTitle">Prioritás (Ft/év alapján)</div>
        <ol>
          <li><b>${prio[0].k}:</b> ~ ${fmtFt(prio[0].v)} / év</li>
          <li><b>${prio[1].k}:</b> ~ ${fmtFt(prio[1].v)} / év</li>
          <li><b>${prio[2].k}:</b> ~ ${fmtFt(prio[2].v)} / év</li>
          <li><b>${prio[3].k}:</b> ~ ${fmtFt(prio[3].v)} / év</li>
        </ol>
        <div class="muted tiny">Tipp: a <b>Felújítási terv</b> fül az Elemzés után aktiválódik.</div>
      </div>

      <div class="out">
        <div class="sectionTitle">Beruházás + megtérülés (irány)</div>
        <ul>
          <li><b>Födém:</b> ${fmtFt(inv.roofCost)} → megtérülés: <b>${fmtYears(pbRoof)}</b></li>
          <li><b>Fal:</b> ${fmtFt(inv.wallCost)} → megtérülés: <b>${fmtYears(pbWall)}</b></li>
          <li><b>Padló:</b> ${fmtFt(inv.floorCost)} → megtérülés: <b>${fmtYears(pbFloor)}</b></li>
          <li><b>Fűtés:</b> ${fmtFt(inv.heatCost)} → megtérülés: <b>${fmtYears(pbHeat)}</b> <span class="muted">(csak ha csere van)</span></li>
        </ul>
      </div>

      <details>
        <summary>Technikai számok (ellenőrzéshez)</summary>
        <div class="out" style="margin-top:10px;">
          <div class="sectionTitle">H és hőigény</div>
          <div class="muted">
            H (MOST): ${(nowScenario.H.H).toFixed(0)} W/K • Q_model: ${fmtKwh(Q_model_now)}<br/>
            H (CÉL): ${(targetScenario.H.H).toFixed(0)} W/K • Q_model: ${fmtKwh(Q_model_target)}<br/>
            Kalibrációs szorzó: ${calib.toFixed(2)}<br/>
            Q_real(MOST): ${fmtKwh(Q_real_now)} • Q_real(CÉL): ${fmtKwh(Q_real_target)}
          </div>
        </div>
      </details>
    `;

    renderResult(html);
    if ((location.hash || "").includes("3d")) updateHeatmap();
  }

  if (btnRun) btnRun.addEventListener("click", () => { flashBtn(btnRun); calcAll(); toast("Kész — frissítve."); scrollToResult(); });
  if (btnReset) btnReset.addEventListener("click", () => {
    flashBtn(btnReset);
    setDefaults();
    setPlanEnabled(false);
    lastPlanData = null;
    toast("Alapértékek visszaállítva.");
    renderResult(`<div class="sectionTitle">Eredmény</div><div class="muted">Kattints az <b>Elemzés</b> gombra.</div>`);
  });

  // ===== SZAKIPIAC LEAD =====
  (function bindLeadButton(){
    const btnLead = $("btnLead");
    if (!btnLead) return;
    btnLead.addEventListener("click", () => {
      flashBtn(btnLead);
      toast("Vissza a SzakiPiacra…");
      goToSzakipiacHome();
    });
  })();

  // ---------- DOCS / HEATMAP (a te verziódból jön; itt röviden, mert nálad már működik) ----------
  // Ha a teljes docs/heatmap blokk már megvan a fájlodban, maradhat úgy.
  // Itt minimal safe no-op, hogy ne törjön semmi:
  function renderDocs() {}
  function updateHeatmap() {}

  // ---------- initByHash ----------
  function initByHash() {
    const { view } = parseHash();
    if (view === "calc") { showView("calc"); tryApplyShareFromUrl(); return; }
    if (view === "pro")  { showView("pro");  return; }
    if (view === "plan") { showView("plan"); return; }
    if (view === "3d")   { showView("3d");   return; }
    if (view === "docs") { showView("docs"); return; }
    showView("home");
  }

  // ---------- START ----------
  setDefaults();
  setPlanEnabled(false);

  bindShareButton();
  bindStateButtons();
  bindExportImportButtons();
  bindPdfButtons();
  bindProUI();

  initByHash();
  window.addEventListener("hashchange", initByHash);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBackToSzakipiacButton);
  } else {
    addBackToSzakipiacButton();
  }

})();
