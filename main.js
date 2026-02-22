/* Energia Advisor 3D – Valós (C) kalkulátor
   - UA + infiltráció + HDD
   - Kalibrálás: a MOST Ft/év értéket bázisnak vesszük (hogy a modell "valós" legyen)
   - Tudástár (kereső + kategóriák + cikk nézet)
   - 3D nézet (MVP) = Profi hőtérkép MOST/CÉL/KÜLÖNBSÉG
   - LINKELHETŐ KALKULÁCIÓ (share link): #calc&share=...
   - FELÚJÍTÁSI TERV nézet (#plan) elemzés után
   - Export/Import JSON fájlba (letöltés/fájlválasztó)

   + PRO (ingyen) – komolyabb inputok:
     - Ablak U-érték
     - HRV (hővisszanyerés) hatásfok: Hvent csökkentés
     - n50 -> nAir becslés (opcionális) + gyors légzárási profil
   + Admin (MVP PIN): PRO alapból ON, badge
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // =========================
  // SZAKIPIAC VISSZA – KÖZÖS
  // =========================
  const SZAKIPIAC_HOME_URL = "https://szakipiac-2025.hu/#home";
  function goToSzakipiacHome() {
    window.location.href = SZAKIPIAC_HOME_URL;
  }

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
    el._t = setTimeout(() => {
      el.style.opacity = "0";
    }, 1400);
  }

  function scrollToResult() {
    const resultBox = $("resultBox");
    if (!resultBox) return;
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ==============================
  // PRO + ADMIN (MVP – ingyen)
  // ==============================
  const LS_PRO_KEY = "ea3d_pro_enabled_v1";
  const LS_ADMIN_KEY = "ea3d_admin_v1";

  // Állítsd be magadnak:
  const ADMIN_PIN = "1976"; // <-- ezt írd át, ha akarod

  let EA_IS_PRO = (localStorage.getItem(LS_PRO_KEY) === "1");
  let EA_IS_ADMIN = (localStorage.getItem(LS_ADMIN_KEY) === "1");

  // Adminnál alapból legyen PRO ON
  if (EA_IS_ADMIN && !EA_IS_PRO) {
    EA_IS_PRO = true;
    localStorage.setItem(LS_PRO_KEY, "1");
  }

  function setPro(on) {
    EA_IS_PRO = !!on;
    localStorage.setItem(LS_PRO_KEY, EA_IS_PRO ? "1" : "0");
    updateProUi();
    toast(EA_IS_PRO ? "PRO bekapcsolva ✅" : "PRO kikapcsolva.");
    // ha kalkulátorban vagyunk, frissítsünk
    if ((location.hash || "").includes("calc")) {
      // nem futtatjuk automatikusan az elemzést, csak frissítjük a pro panelt
      ensureProPanel();
    }
  }

  function setAdmin(on) {
    EA_IS_ADMIN = !!on;
    localStorage.setItem(LS_ADMIN_KEY, EA_IS_ADMIN ? "1" : "0");
    if (EA_IS_ADMIN) {
      // adminnál PRO ON
      setPro(true);
    }
    updateProUi();
  }

  function adminLogin() {
    const pin = prompt("Admin PIN:");
    if (!pin) return;
    if (pin === ADMIN_PIN) {
      setAdmin(true);
      toast("Admin mód: ON ✅");
    } else {
      toast("Hibás PIN.");
    }
  }

  function adminLogout() {
    setAdmin(false);
    toast("Admin mód: OFF");
  }

  function updateProUi() {
    const proBtn = document.getElementById("btnPro");
    if (proBtn) {
      proBtn.textContent = EA_IS_PRO ? "PRO: ON" : "PRO";
      proBtn.classList.toggle("active", !!EA_IS_PRO);
    }
    const adminBadge = document.getElementById("eaAdminBadge");
    const proBadge = document.getElementById("eaProBadge");

    if (proBadge) proBadge.style.display = EA_IS_PRO ? "" : "none";
    if (adminBadge) adminBadge.style.display = EA_IS_ADMIN ? "" : "none";

    document.body.classList.toggle("isPro", !!EA_IS_PRO);
    document.body.classList.toggle("isAdmin", !!EA_IS_ADMIN);
  }

  // ==============================
  // NAV + NÉZETEK
  // ==============================
  const btnHome = $("btnHome");
  const btnCalc = $("btnCalc");
  const btnPlan = $("btnPlan");
  const btn3d = $("btn3d");
  const btnDocs = $("btnDocs");

  const viewHome = $("viewHome");
  const viewCalc = $("viewCalc");
  const viewPlan = $("viewPlan");
  const view3d = $("view3d");
  const viewDocs = $("viewDocs");

  const homeGoCalc = $("homeGoCalc");
  const homeGoDocs = $("homeGoDocs");

  function setActive(btn) {
    [btnHome, btnCalc, btnPlan, btn3d, btnDocs].forEach((b) => b && b.classList.remove("active"));
    btn && btn.classList.add("active");
  }

  function showView(which) {
    if (viewHome) viewHome.style.display = which === "home" ? "" : "none";
    if (viewCalc) viewCalc.style.display = which === "calc" ? "" : "none";
    if (viewPlan) viewPlan.style.display = which === "plan" ? "" : "none";
    if (view3d) view3d.style.display = which === "3d" ? "" : "none";
    if (viewDocs) viewDocs.style.display = which === "docs" ? "" : "none";

    if (which === "home") setActive(btnHome);
    if (which === "calc") setActive(btnCalc);
    if (which === "plan") setActive(btnPlan);
    if (which === "3d") setActive(btn3d);
    if (which === "docs") setActive(btnDocs);

    if (which === "docs") renderDocs();
    if (which === "3d") updateHeatmap();
    if (which === "plan") renderPlan();

    if (which === "calc") ensureProPanel();

    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (_) {}
  }

  if (btnHome) btnHome.addEventListener("click", () => { location.hash = "#home"; showView("home"); });
  if (btnCalc) btnCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  if (btnPlan) btnPlan.addEventListener("click", () => {
    if (!EA_PLAN_UNLOCKED) {
      toast("Előbb futtasd az Elemzést a Kalkulátorban.");
      return;
    }
    location.hash = "#plan";
    showView("plan");
  });
  if (btn3d) btn3d.addEventListener("click", () => { location.hash = "#3d"; showView("3d"); });
  if (btnDocs) btnDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

  if (homeGoCalc) homeGoCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  if (homeGoDocs) homeGoDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

  // ==============================
  // NAV: „← SzakiPiac” + PRO + Badge-ek beszúrás
  // ==============================
  function addBackToSzakipiacButton() {
    if (document.getElementById("eaBackToSzakipiac")) return;

    const refBtn =
      document.getElementById("btnHome") ||
      document.getElementById("btnCalc") ||
      document.getElementById("btnPlan") ||
      document.getElementById("btn3d") ||
      document.getElementById("btnDocs");

    if (!refBtn) return;

    const navGroup = refBtn.parentElement;
    if (!navGroup) return;

    // ← SzakiPiac link
    const a = document.createElement("a");
    a.id = "eaBackToSzakipiac";
    a.href = SZAKIPIAC_HOME_URL;
    a.textContent = "← SzakiPiac";
    a.className = (refBtn.className || "").replace(/\bactive\b/g, "").trim();
    a.style.whiteSpace = "nowrap";
    navGroup.insertBefore(a, refBtn);

    // PRO gomb
    const proBtn = document.createElement("button");
    proBtn.id = "btnPro";
    proBtn.className = (refBtn.className || "").replace(/\bactive\b/g, "").trim() || "navBtn";
    proBtn.textContent = EA_IS_PRO ? "PRO: ON" : "PRO";
    proBtn.title = "PRO mód: extra mezők + pontosabb számítás";
    proBtn.addEventListener("click", () => {
      flashBtn(proBtn);
      // admin esetén simán toggle, nem adminnál is (ingyen)
      setPro(!EA_IS_PRO);
    });
    navGroup.appendChild(proBtn);

    // Badge-ek (PRO / ADMIN)
    const proBadge = document.createElement("span");
    proBadge.id = "eaProBadge";
    proBadge.textContent = "PRO";
    proBadge.style.cssText =
      "margin-left:8px;padding:6px 10px;border-radius:999px;font-weight:800;font-size:12px;background:rgba(0,200,120,.16);border:1px solid rgba(0,200,120,.35);color:#b9ffe0;display:none;white-space:nowrap;";
    navGroup.appendChild(proBadge);

    const adminBadge = document.createElement("span");
    adminBadge.id = "eaAdminBadge";
    adminBadge.textContent = "ADMIN";
    adminBadge.style.cssText =
      "margin-left:8px;padding:6px 10px;border-radius:999px;font-weight:800;font-size:12px;background:rgba(255,215,0,.14);border:1px solid rgba(255,215,0,.35);color:#fff1a6;display:none;white-space:nowrap;cursor:pointer;";
    adminBadge.title = "Katt: admin ki";
    adminBadge.addEventListener("click", () => adminLogout());
    navGroup.appendChild(adminBadge);

    // Admin login: dupla katt a logóra (MVP, nem zavar senkit)
    const logo = document.querySelector(".logo");
    if (logo) {
      logo.style.cursor = "pointer";
      logo.title = "Dupla katt: admin belépés";
      logo.addEventListener("dblclick", () => adminLogin());
    }

    updateProUi();
  }

  // ==============================
  // PRO PANEL (extra mezők a kalkulátorban)
  // ==============================
  const PRO_INPUT_IDS = [
    "pro_winU",
    "pro_hrvEff",
    "pro_airProfile",
    "pro_n50"
  ];

  const PRO_DEFAULTS = {
    pro_winU: 1.4,      // korszerűbb ablak
    pro_hrvEff: 0,      // % (0..85)
    pro_airProfile: "avg", // drafty/avg/tight
    pro_n50: ""         // ha megadja, felülírja a profilt
  };

  function ensureProPanel() {
    if (!viewCalc) return;

    // már megvan?
    if ($("eaProPanel")) {
      // csak láthatóság frissítés
      $("eaProPanel").style.display = EA_IS_PRO ? "" : "none";
      return;
    }

    // Megkeressük a "Cél állapot" panelt, és elé beszúrjuk
    const panels = viewCalc.querySelectorAll(".panel");
    if (!panels || panels.length < 2) return;

    const targetPanel = panels[1];

    const wrap = document.createElement("div");
    wrap.id = "eaProPanel";
    wrap.className = "panel";
    wrap.style.marginBottom = "14px";
    wrap.style.display = EA_IS_PRO ? "" : "none";
    wrap.innerHTML = `
      <div class="panelTitle">PRO – pontosítás (ingyen)</div>

      <label class="field">Ablak U-érték (W/m²K)
        <input id="pro_winU" type="number" min="0.6" max="3.5" step="0.1" />
      </label>

      <label class="field">Hővisszanyerés (HRV) hatásfok (%)
        <input id="pro_hrvEff" type="number" min="0" max="85" step="1" />
      </label>

      <label class="field">Légzárási profil
        <select id="pro_airProfile">
          <option value="drafty">Huzatos (régi, sok rés)</option>
          <option value="avg">Átlagos</option>
          <option value="tight">Tömörebb (jobb légzárás)</option>
        </select>
      </label>

      <label class="field">n50 (blower door) – ha van (1/h)
        <input id="pro_n50" type="number" min="0" max="25" step="0.5" placeholder="pl. 6.0 (ha nincs, hagyd üresen)" />
      </label>

      <div class="muted tiny">
        PRO magyarázat: az ablak U nem fix, a légcsere veszteséget HRV csökkenti, és n50-ből reálisabb nAir számolható.
      </div>
    `;

    targetPanel.parentElement.insertBefore(wrap, targetPanel);

    // defaultok betöltése
    Object.keys(PRO_DEFAULTS).forEach((k) => {
      const el = $(k);
      if (!el) return;
      el.value = PRO_DEFAULTS[k];
    });
  }

  // ---------- Material lambdas (W/mK) ----------
  const LAMBDA = {
    eps: 0.037,
    rockwool: 0.039,
    xps: 0.034
  };

  // Base U-values (W/m²K) for "régi" szerkezetek
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

  function heatLossBreakdown(Uwall, Awall, Uwin, Awin, Uroof, Aroof, Ufloor, Afloor, nAir, volume, bridgePct, hrvEffPct) {
    const H_wall = (Uwall * Awall);
    const H_win  = (Uwin * Awin);
    const H_roof = (Uroof * Aroof);
    const H_floor= (Ufloor * Afloor);
    const Htrans = H_wall + H_win + H_roof + H_floor;

    // Ventilációs veszteség: HRV hatásfokkal csökkenthető (PRO)
    const baseHvent  = 0.33 * nAir * volume;
    const hrvEff = clamp(num(hrvEffPct, 0), 0, 85) / 100;
    const Hvent = baseHvent * (1 - hrvEff);

    const bridge = 1 + (bridgePct / 100);

    const parts = {
      wall: H_wall * bridge,
      window: H_win * bridge,
      roof: H_roof * bridge,
      floor: H_floor * bridge,
      vent: Hvent * bridge
    };
    const H = (Htrans + Hvent) * bridge;

    return { H, Htrans: Htrans * bridge, Hvent: Hvent * bridge, parts, bridge, hrvEff };
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

  // PRO: n50 -> nAir becslés (egyszerűsített)
  // nAir ~ n50 / 20 … / 30 (épület + szél függő). Itt konzervatív 25.
  function nAirFromN50(n50) {
    const x = num(n50, 0);
    if (!x || x <= 0) return null;
    return clamp(x / 25, 0.2, 1.2);
  }

  function nAirFromProfile(profile) {
    if (profile === "drafty") return 0.9;
    if (profile === "tight") return 0.35;
    return 0.6; // avg
  }

  function computeScenario(params) {
    const {
      area, storeys, height,
      wallType, winRatio, nAir, bridgePct,
      wallInsCm, wallInsMat,
      roofInsCm, roofInsMat,
      floorInsCm, floorInsMat,
      // PRO
      winUOverride,
      hrvEffPct
    } = params;

    const g = geometry(area, storeys, height);
    const Awin = g.wallGross * clamp(winRatio, 5, 35) / 100;
    const AwallNet = Math.max(0, g.wallGross - Awin);

    const Uwall = uWithInsulation(U_BASE[wallType], wallInsCm, LAMBDA[wallInsMat]);
    const Uroof = uWithInsulation(U_BASE.roof, roofInsCm, LAMBDA[roofInsMat]);
    const Ufloor = uWithInsulation(U_BASE.floor, floorInsCm, LAMBDA[floorInsMat]);

    // Ablak U: alap = 2.6, PRO override = input
    const Uwin = (winUOverride && winUOverride > 0) ? winUOverride : U_BASE.window;

    const loss = heatLossBreakdown(
      Uwall, AwallNet,
      Uwin, Awin,
      Uroof, g.roofArea,
      Ufloor, g.floorArea,
      nAir, g.volume,
      bridgePct,
      hrvEffPct
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
  }

  // ---------- Kalkulátor állapot (input lista) ----------
  const INPUT_IDS = [
    "area","storeys","height","wallType","winRatio","nAir",
    "wallInsNow","wallInsMat","roofInsNow","roofInsMat","floorInsNow","floorInsMat",
    "heatingNow","scopNow","annualCostNow",
    "wallInsTarget","roofInsTarget","floorInsTarget","heatingTarget","scopTarget",
    "hdd","priceGas","priceEl",
    "bridge","costWallM2","costRoofM2","costFloorM2","costHeating"
  ];

  function serializeState(){
    const s = {};
    INPUT_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      s[id] = el.value;
    });
    // PRO mezők is
    PRO_INPUT_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      s[id] = el.value;
    });
    s.__pro = EA_IS_PRO ? "1" : "0";
    return s;
  }

  function applyState(s){
    if (!s) return;
    INPUT_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      if (s[id] !== undefined) el.value = s[id];
    });

    // PRO panelt előbb biztosítsuk
    ensureProPanel();

    PRO_INPUT_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      if (s[id] !== undefined) el.value = s[id];
    });

    if (s.__pro !== undefined) {
      setPro(String(s.__pro) === "1");
    }
  }

  // =========================
  // LINKELHETŐ KALKULÁCIÓ (share URL)
  // =========================
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
    const root = viewCalc || document;
    const buttons = Array.from(root.querySelectorAll("button"));

    const pick = (needle) => {
      const n = (needle||"").toLowerCase();
      return buttons.find(b => ((b.textContent||"").trim().toLowerCase() === n))
          || buttons.find(b => ((b.textContent||"").toLowerCase().includes(n)));
    };

    const btnShare = $("btnShare") || pick("megosztás") || pick("link");
    if (btnShare){
      btnShare.addEventListener("click", async () => { flashBtn(btnShare); await shareLink(); });
    }
  }

  // =========================
  // MENTÉS / BETÖLTÉS / TÖRLÉS (LocalStorage)
  // =========================
  const STATE_KEY = "ea3d_state_v1";

  function bindStateButtons(){
    const btnSave = $("btnSaveState");
    const btnLoad = $("btnLoadState");
    const btnClear = $("btnClearState");

    if (btnSave){
      btnSave.addEventListener("click", () => {
        flashBtn(btnSave);
        try{
          const state = serializeState();
          localStorage.setItem(STATE_KEY, JSON.stringify(state));
          toast("Mentve (böngészőbe) ✅");
        }catch(e){
          console.error(e);
          toast("Mentés hiba.");
        }
      });
    }

    if (btnLoad){
      btnLoad.addEventListener("click", () => {
        flashBtn(btnLoad);
        try{
          const raw = localStorage.getItem(STATE_KEY);
          if (!raw){
            toast("Nincs mentés a böngészőben.");
            return;
          }
          const state = JSON.parse(raw);
          applyState(state);
          toast("Betöltve ✅");
          calcAll();
          if ((location.hash || "").includes("3d")) updateHeatmap();
        }catch(e){
          console.error(e);
          toast("Betöltés hiba.");
        }
      });
    }

    if (btnClear){
      btnClear.addEventListener("click", () => {
        flashBtn(btnClear);
        try{
          localStorage.removeItem(STATE_KEY);
          toast("Böngészős mentés törölve 🧹");
        }catch(e){
          console.error(e);
          toast("Törlés hiba.");
        }
      });
    }
  }

  // =========================
  // EXPORT / IMPORT (JSON fájl)
  // =========================
  const EXPORT_VERSION = 1;

  function buildExportPayload(){
    return {
      app: "Energia Advisor 3D",
      version: EXPORT_VERSION,
      createdAt: new Date().toISOString(),
      state: serializeState(),
      lastAnalysis: EA_LAST || null,
      pro: EA_IS_PRO ? true : false
    };
  }

  function safeFileName(){
    const d = new Date();
    const pad = (n) => String(n).padStart(2,"0");
    return `energia-advisor-kalkulacio_${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  }

  function downloadJson(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "energia-advisor-kalkulacio.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function bindExportImportButtons(){
    const btnExport = $("btnExportState");
    const btnImport = $("btnImportState");
    const fileInput = $("eaImportFile");

    if (btnExport){
      btnExport.addEventListener("click", () => {
        flashBtn(btnExport);
        try{
          const payload = buildExportPayload();
          downloadJson(payload, safeFileName());
          toast("Export kész ✅ (letöltés)");
        }catch(e){
          console.error(e);
          toast("Export hiba.");
        }
      });
    }

    if (btnImport && fileInput){
      btnImport.addEventListener("click", () => {
        flashBtn(btnImport);
        fileInput.value = "";
        fileInput.click();
      });

      fileInput.addEventListener("change", async () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;

        try{
          const text = await f.text();
          const payload = JSON.parse(text);

          if (!payload || typeof payload !== "object" || !payload.state){
            toast("Hibás JSON fájl.");
            return;
          }

          applyState(payload.state);

          if (payload.lastAnalysis && typeof payload.lastAnalysis === "object"){
            EA_LAST = payload.lastAnalysis;
            setPlanUnlocked(true);
            toast("Import kész ✅ (állapot + terv)");
            calcAll();
          } else {
            toast("Import kész ✅ (állapot)");
            calcAll();
          }

          if ((location.hash || "").includes("3d")) updateHeatmap();
        }catch(e){
          console.error(e);
          toast("Import hiba (nem jó JSON?).");
        }
      });
    }
  }

  // =========================
  // PDF (egyszerű: nyomtatás PDF-be)
  // =========================
  function bindPdfButtons(){
    const btnPdfCalc = $("btnExportPDF");
    const btnPdf3d = $("btnExportPDF_3D");

    const doPrint = (btn) => {
      flashBtn(btn);
      toast("PDF / Nyomtatás…");
      setTimeout(() => window.print(), 150);
    };

    if (btnPdfCalc) btnPdfCalc.addEventListener("click", () => doPrint(btnPdfCalc));
    if (btnPdf3d) btnPdf3d.addEventListener("click", () => doPrint(btnPdf3d));
  }

  // ---------- Core calc ----------
  function readInputs() {
    const val = (id, fallback) => $(id) ? $(id).value : fallback;

    const area = clamp(num(val("area", 100), 100), 20, 1000);
    const storeys = clamp(num(val("storeys", 1), 1), 1, 3);
    const height = clamp(num(val("height", 2.6), 2.6), 2.2, 3.2);
    const wallType = val("wallType", "brick");

    const winRatio = clamp(num(val("winRatio", 18), 18), 5, 35);

    // Légcsere: PRO esetén profil/n50 felülírhatja az input mezőt
    let nAir = clamp(num(val("nAir", 0.6), 0.6), 0.2, 1.2);

    // PRO extra
    const pro_winU = clamp(num(val("pro_winU", PRO_DEFAULTS.pro_winU), PRO_DEFAULTS.pro_winU), 0.6, 3.5);
    const pro_hrvEff = clamp(num(val("pro_hrvEff", PRO_DEFAULTS.pro_hrvEff), PRO_DEFAULTS.pro_hrvEff), 0, 85);
    const pro_airProfile = val("pro_airProfile", PRO_DEFAULTS.pro_airProfile);
    const pro_n50_raw = val("pro_n50", PRO_DEFAULTS.pro_n50);

    if (EA_IS_PRO) {
      const n50 = num(pro_n50_raw, 0);
      const nAirFrom = nAirFromN50(n50);
      if (nAirFrom !== null) {
        nAir = nAirFrom;
      } else {
        nAir = nAirFromProfile(pro_airProfile);
      }
    }

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

      // PRO
      pro_winU,
      pro_hrvEff,
      pro_airProfile,
      pro_n50_raw
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

  function renderResult(out) {
    if (!resultBox) return;
    resultBox.innerHTML = out;
  }

  // ====== Felújítási terv állapot ======
  let EA_LAST = null;
  let EA_PLAN_UNLOCKED = false;

  function setPlanUnlocked(on){
    EA_PLAN_UNLOCKED = !!on;
    if (!btnPlan) return;

    if (EA_PLAN_UNLOCKED){
      btnPlan.setAttribute("aria-disabled", "false");
      btnPlan.removeAttribute("title");
      btnPlan.classList.remove("isDisabled");
    } else {
      btnPlan.setAttribute("aria-disabled", "true");
      btnPlan.setAttribute("title", "Előbb futtasd az Elemzést.");
      btnPlan.classList.add("isDisabled");
    }
  }

  function planStepHint(key){
    if (key === "Fűtés") return "Szigetelés után gyakran még jobb a hatása.";
    if (key === "Födém/padlás") return "Jellemzően gyors és jó első lépés.";
    if (key === "Fal") return "Csomópontok (koszorú/lábazat) minősége sokat számít.";
    if (key === "Padló/aljzat") return "Bontás/hozzáférés függő, ezért változó megtérülés.";
    return "";
  }

  function renderPlan(){
    const planBox = $("planBox");
    const locked = $("planLockedNote");
    if (!planBox || !locked) return;

    if (!EA_PLAN_UNLOCKED || !EA_LAST){
      locked.style.display = "";
      planBox.innerHTML = "";
      return;
    }

    locked.style.display = "none";

    const L = EA_LAST;

    const totalInv =
      (L.inv?.roofCost || 0) +
      (L.inv?.wallCost || 0) +
      (L.inv?.floorCost || 0) +
      ((L.heatingChanged ? (L.inv?.heatCost || 0) : 0));

    const totalSave = L.savingYear || 0;
    const totalPb = paybackYears(totalInv, totalSave);

    const steps = (L.prio || []).slice(0, 5);

    const lines = steps.map((s, i) => {
      const invest = (L.invMap && L.invMap[s.k]) ? L.invMap[s.k] : 0;
      const pb = paybackYears(invest, s.v || 0);
      return `
        <div class="out" style="margin-top:12px;">
          <div class="sectionTitle">${i+1}. ${s.k}</div>
          <div style="margin-top:8px;">
            <b>Várható megtakarítás:</b> ~ ${fmtFt(s.v)} / év <span class="muted">(~ ${fmtFtShort((s.v||0)/12)} Ft/hó)</span><br/>
            <b>Becsült beruházás:</b> ${fmtFt(invest)}<br/>
            <b>Megtérülés (irány):</b> ${fmtYears(pb)}<br/>
            <div class="muted" style="margin-top:6px;">${planStepHint(s.k)}</div>
          </div>
        </div>
      `;
    }).join("");

    planBox.innerHTML = `
      <div class="out">
        <div class="sectionTitle">Összesítés (MOST → CÉL)</div>
        <div style="margin-top:8px;">
          <b>Teljes beruházás:</b> ${fmtFt(totalInv)}<br/>
          <b>Teljes éves megtakarítás:</b> ${fmtFt(totalSave)} / év <span class="muted">(~ ${fmtFtShort(totalSave/12)} Ft/hó)</span><br/>
          <b>Teljes megtérülés:</b> ${fmtYears(totalPb)}
        </div>
      </div>

      <div class="out" style="margin-top:12px;">
        <div class="sectionTitle">3–5 lépéses felújítási terv</div>
        <div class="muted" style="margin-top:6px;">
          A sorrend a várható <b>Ft/év megtakarítás</b> alapján van. (A valós sorrendet befolyásolhatja a kivitelezés, állapot, hozzáférhetőség.)
        </div>
      </div>

      ${lines}

      <div class="out" style="margin-top:12px;">
        <div class="sectionTitle">Ajánlatkérés a terv alapján</div>
        <div class="muted" style="margin-top:6px;">Kérj ajánlatot a számolt terv alapján – a szakik gyorsabban tudnak árazni, ha látják a célokat.</div>
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

  function calcAll() {
    const x = readInputs();

    const nowScenario = computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsNow, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsNow, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsNow, floorInsMat: x.floorInsMat,
      winUOverride: EA_IS_PRO ? x.pro_winU : null,
      hrvEffPct: EA_IS_PRO ? x.pro_hrvEff : 0
    });

    const targetScenario = computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsTarget, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsTarget, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsTarget, floorInsMat: x.floorInsMat,
      winUOverride: EA_IS_PRO ? x.pro_winU : null,
      hrvEffPct: EA_IS_PRO ? x.pro_hrvEff : 0
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
        floorInsCm: floor, floorInsMat: x.floorInsMat,
        winUOverride: EA_IS_PRO ? x.pro_winU : null,
        hrvEffPct: EA_IS_PRO ? x.pro_hrvEff : 0
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
    const heatingChanged = (x.heatingTarget !== x.heatingNow);
    const pbHeat = heatingChanged ? paybackYears(inv.heatCost, saveOnlyHeat) : Infinity;

    const techNow = { Q_model: Q_model_now, Q_real: Q_real_now, H: nowScenario.H.H, U: nowScenario.U, Hvent: nowScenario.H.Hvent, hrv: nowScenario.H.hrvEff };
    const techTarget = { Q_model: Q_model_target, Q_real: Q_real_target, H: targetScenario.H.H, U: targetScenario.U, Hvent: targetScenario.H.Hvent, hrv: targetScenario.H.hrvEff };

    EA_LAST = {
      savingYear,
      prio,
      inv,
      heatingChanged,
      invMap: {
        "Födém/padlás": inv.roofCost,
        "Fal": inv.wallCost,
        "Padló/aljzat": inv.floorCost,
        "Fűtés": inv.heatCost
      }
    };
    setPlanUnlocked(true);

    const proLine = EA_IS_PRO ? `
      <li><b>PRO:</b> Ablak U=${x.pro_winU} W/m²K • HRV=${x.pro_hrvEff}% • (nAir=${x.nAir.toFixed(2)} 1/h)</li>
    ` : `<li class="muted"><b>PRO:</b> kikapcsolva (ablak U fix, HRV nincs)</li>`;

    const html = `
      <div class="sectionTitle">Eredmény</div>

      <div class="out" style="margin-top:10px;">
        <div class="sectionTitle">MOST → CÉL</div>
        <ul>
          <li><b>Fal:</b> ${x.wallInsNow} cm → ${x.wallInsTarget} cm (${x.wallInsMat.toUpperCase()})</li>
          <li><b>Födém/padlás:</b> ${x.roofInsNow} cm → ${x.roofInsTarget} cm (${x.roofInsMat.toUpperCase()})</li>
          <li><b>Padló/aljzat:</b> ${x.floorInsNow} cm → ${x.floorInsTarget} cm (${x.floorInsMat.toUpperCase()})</li>
          <li><b>Fűtés:</b> ${HEAT[x.heatingNow].name} → ${HEAT[x.heatingTarget].name}</li>
          <li class="muted">HDD: ${x.hdd} • légcsere: ${x.nAir.toFixed(2)} 1/h • ablakarány: ${x.winRatio}% • hőhíd: ${x.bridge}%</li>
          ${proLine}
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
        <div class="muted tiny">Tipp: a Felújítási terv fül az Elemzés után aktiválódik.</div>
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
            H (MOST): ${(techNow.H).toFixed(0)} W/K • Q_model: ${fmtKwh(techNow.Q_model)}<br/>
            H (CÉL): ${(techTarget.H).toFixed(0)} W/K • Q_model: ${fmtKwh(techTarget.Q_model)}<br/>
            Kalibrációs szorzó: ${calib.toFixed(2)}<br/>
            Q_real(MOST): ${fmtKwh(techNow.Q_real)} • Q_real(CÉL): ${fmtKwh(techTarget.Q_real)}<br/>
            Vent (MOST): ${techNow.Hvent.toFixed(0)} W/K ${EA_IS_PRO ? `(HRV ${(techNow.hrv*100).toFixed(0)}%)` : ""}<br/>
            Vent (CÉL): ${techTarget.Hvent.toFixed(0)} W/K ${EA_IS_PRO ? `(HRV ${(techTarget.hrv*100).toFixed(0)}%)` : ""}
          </div>
        </div>
      </details>
    `;

    renderResult(html);

    if ((location.hash || "").includes("plan")) renderPlan();
    if ((location.hash || "").includes("3d")) updateHeatmap();
  }

  if (btnRun) btnRun.addEventListener("click", () => {
    flashBtn(btnRun);
    calcAll();
    toast("Kész — frissítve.");
    scrollToResult();
  });

  if (btnReset) btnReset.addEventListener("click", () => {
    flashBtn(btnReset);
    setDefaults();
    setPlanUnlocked(false);
    EA_LAST = null;
    toast("Alapértékek visszaállítva.");
    renderResult(`
      <div class="sectionTitle">Eredmény</div>
      <div class="muted">Kattints az <b>Elemzés</b> gombra.</div>
    `);
    if ((location.hash || "").includes("3d")) updateHeatmap();
    if ((location.hash || "").includes("plan")) renderPlan();
  });

  // ---------- TUDÁSTÁR ----------
  const DOCS = [
    { id:"hdd", cat:"Alapok", read:"~3 perc", tags:["HDD","fűtés","alapok"], title:"Mi az a HDD (fűtési foknap) és miért számít?", body:`A HDD (Heating Degree Days) azt mutatja meg, mennyire volt hideg egy évben/idényben egy adott helyen.<br/><br/><b>Magyar irányszám:</b> ~3000 (településtől függ). A kalkulátor azért kéri, hogy országos átlaggal is lehessen becsülni.<br/><br/><b>Gyakorlat:</b> ha ugyanaz a ház hidegebb környéken van, a MOST költség magasabb → a megtakarítás forintban is magasabb lehet.`.trim() },
    { id:"uvalue", cat:"Alapok", read:"~4 perc", tags:["U-érték","hőveszteség","fal"], title:"U-érték egyszerűen: mit jelent és mitől lesz jobb?", body:`Az <b>U-érték</b> (W/m²K) megmutatja, mennyi hő “szökik át” 1 m² szerkezeten 1°C különbségnél.<br/><br/><b>Kisebb U = jobb.</b> Szigetelésnél általában a fal/födém U-értéke csökken látványosan.<br/><br/>A kalkulátor “régi” tipikus U-ból indul, és a megadott cm + anyag alapján számolja a javulást.`.trim() },
    { id:"airchange", cat:"Alapok", read:"~3 perc", tags:["légcsere","infiltráció","szellőzés"], title:"Légcsere (1/h): miért tud elvinni rengeteg pénzt?", body:`A légcsere a ház “szivárgását” jelzi: rések, rossz nyílászáró, kéményhatás.<br/><br/>A hőveszteség része: <b>Hvent = 0,33 × n × térfogat</b> (W/K).<br/><br/><b>Gyakorlat:</b> hiába szigetelsz, ha a ház “huzatos”, a megtakarítás kisebb lesz. Ezért van külön blokk a 3D nézetben is.`.trim() },
    { id:"roof_first", cat:"Szigetelés", read:"~4 perc", tags:["födém","padlás","megtérülés"], title:"Miért a födém/padlás szigetelés szokott a legjobb első lépés lenni?", body:`A meleg levegő felfelé száll, ezért a födém sok háznál “fő veszteségcsatorna”.<br/><br/><b>Előny:</b> gyors kivitelezés, sokszor olcsóbb, és már 20–30 cm jó anyaggal látványos eredményt ad.<br/><br/>A kalkulátorban próbáld: csak a födémet állítsd CÉL-ra → nézd meg a Prioritás listában.`.trim() },
    { id:"wall_eps_rw", cat:"Szigetelés", read:"~5 perc", tags:["EPS","kőzetgyapot","fal"], title:"EPS vagy kőzetgyapot? Rövid döntési szempontok", body:`<b>EPS:</b> jó ár/érték, könnyű, elterjedt. <b>Kőzetgyapot:</b> jobb pára- és tűztechnika, jó hanggátlás.<br/><br/>A hőszigetelés szempontjából mindkettő jó lehet, a különbséget gyakran a részletek adják: ragasztás, dübelezés, hálózás, lábazat, csomópontok.<br/><br/>Tipp: ha “hőhíd” problémád van, a kivitelezés minősége többet számít, mint az anyag neve.`.trim() },
    { id:"floor", cat:"Szigetelés", read:"~4 perc", tags:["padló","aljzat","XPS"], title:"Padló/aljzat szigetelés: mikor éri meg?", body:`Padló szigetelés akkor ad nagyot, ha alatta hideg tér van (pince, szellőző légrés, talaj felől hideg).<br/><br/>Felújításnál gyakori, hogy bontással jár → ezért a megtérülés változó.<br/><br/>A kalkulátorban külön “csak padló” összehasonlítással látod, mennyi Ft/év jön ki belőle.`.trim() },
    { id:"boiler_vs_hp", cat:"Fűtés", read:"~5 perc", tags:["kazán","hőszivattyú","SCOP"], title:"Kazáncsere vagy hőszivattyú? Miért fontos a SCOP?", body:`Hőszivattyúnál a <b>SCOP</b> az éves átlagos hatásfokot jelzi: mennyi hő lesz 1 kWh villanyból.<br/><br/><b>Példa:</b> SCOP 3,6 → 1 kWh villanyból ~3,6 kWh hő.<br/><br/>Fontos: ha a ház nincs rendben (szigetelés/légzárás), a fűtéscsere önmagában sokszor kevésbé “üt”, mint gondolnád.`.trim() },
    { id:"cond_boiler", cat:"Fűtés", read:"~3 perc", tags:["kondenz","kazán","hatásfok"], title:"Kondenzációs kazán: mikor hoz látványos javulást?", body:`Régi kazánhoz képest a kondenzációs kazán hatásfoka jobb, főleg alacsonyabb előremenő hőmérsékleten.<br/><br/><b>Ha radiátor + magas előremenő</b> van, a különbség lehet kisebb, mint padlófűtésnél.<br/><br/>A kalkulátorban: állítsd MOST = régi kazán, CÉL = kondenz → nézd meg a “csak fűtés” hatást.`.trim() },
    { id:"thermal_bridges", cat:"Tipikus hibák", read:"~4 perc", tags:["hőhíd","csomópont","penész"], title:"Hőhidak: miért lehet penész akkor is, ha szigeteltél?", body:`A hőhíd olyan pont, ahol a hő “könnyebben” távozik (koszorú, áthidaló, erkélylemez, lábazat, csatlakozások).<br/><br/>Ha a felület lehűl, kicsapódhat a pára → penész kockázat.<br/><br/>Ezért van a kalkulátorban <b>hőhíd korrekció</b>: ha sok a csomóponti hiba, a valós megtakarítás kisebb lehet.`.trim() },
    { id:"air_sealing_mistake", cat:"Tipikus hibák", read:"~3 perc", tags:["légzárás","huzat","szalag"], title:"Tipikus hiba: szigetelés van, de a ház továbbra is “huzatos”", body:`Szigetelés mellett is elmehet a hő, ha nincs légzárás: rossz ablakbeépítés, rések, padlásfeljáró, kémény környéke.<br/><br/><b>Gyors ellenőrzés:</b> hideg napon kézzel/füsttel érezhető-e áramlás a kritikus helyeken?<br/><br/>A kalkulátorban a légcserét (1/h) emelve rögtön látod, mennyire befolyásol mindent.`.trim() },
    { id:"questions_for_contractor", cat:"Kérdéslista", read:"~5 perc", tags:["kivitelező","kérdések","minőség"], title:"10 kérdés kivitelezőnek, hogy ne bukj a részleteken", body:`1) Milyen csomóponti megoldást adsz koszorúnál/lábazatnál?<br/>2) Mivel ragasztasz, dűbelezés hogyan lesz?<br/>3) Párazárás/páratechnika: hol kritikus?<br/>4) Milyen vastagságot miért javasolsz?<br/>5) Milyen hálózás, élvédő, indítóprofil lesz?<br/>6) Milyen minőségű anyagot hozol (márka, rendszer)?<br/>7) Fotózod-e a rétegrendet kivitelezés közben?<br/>8) Garancia mire és mennyi?<br/>9) Mikor fizetek és milyen ütemezéssel?<br/>10) Mi a leggyakoribb hibapont ennél a háznál?<br/><b>Tipp:</b> ha erre bizonytalan válaszokat kapsz, az már jel.`.trim() }
  ];

  let docFilterCat = "Összes";
  let docSearch = "";
  let docSelectedId = (DOCS[0] && DOCS[0].id) ? DOCS[0].id : null;

  function getDocChips(){
    const byId = Array.from(document.querySelectorAll('[id^="docChip"]'));
    const byData = Array.from(document.querySelectorAll('[data-doc-cat]'));
    return Array.from(new Set([...byId, ...byData]));
  }

  function getChipCategory(el){
    const dc = (el?.dataset?.docCat || "").trim();
    if (dc) return dc;
    if (el?.id === "docChipAll") return "Összes";
    const txt = (el?.textContent || "").trim();
    return txt || "Összes";
  }

  function setDocChipActive(activeEl){
    getDocChips().forEach(c => c.classList.remove("active"));
    if (activeEl) activeEl.classList.add("active");
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
      const text = `${d.title} ${d.body} ${(d.tags||[]).join(" ")}`.toLowerCase();
      return text.includes(q);
    });

    if (countEl) countEl.textContent = String(filtered.length);

    if (docSelectedId && !filtered.some(d => d.id === docSelectedId)) {
      docSelectedId = filtered[0]?.id || null;
    }
    if (!docSelectedId && filtered[0]) docSelectedId = filtered[0].id;

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

  const docSearchEl = $("docSearch");
  if (docSearchEl) {
    docSearchEl.addEventListener("input", (e) => {
      docSearch = e.target.value || "";
      renderDocs();
    });
  }

  (function bindDocChips(){
    const chips = getDocChips();
    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        docFilterCat = getChipCategory(chip);
        docSelectedId = null;
        setDocChipActive(chip);
        renderDocs();
      });
    });

    const chipAll = $("docChipAll") || chips.find(c => getChipCategory(c) === "Összes") || null;
    if (chipAll) setDocChipActive(chipAll);
  })();

  // ---------- HEATMAP (MVP) ----------
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

  function colorForValue01(x){
    const v = clamp(x, 0, 1);
    const stops = [
      { t: 0.00, c: [ 30, 110, 255] },
      { t: 0.25, c: [  0, 210, 255] },
      { t: 0.50, c: [  0, 220, 120] },
      { t: 0.75, c: [255, 215,   0] },
      { t: 1.00, c: [255,  60,  60] },
    ];
    const lerp = (a,b,t) => a + (b-a)*t;

    let a = stops[0], b = stops[stops.length-1];
    for (let i=0; i<stops.length-1; i++){
      const s1 = stops[i], s2 = stops[i+1];
      if (v >= s1.t && v <= s2.t){ a = s1; b = s2; break; }
    }
    const tt = (b.t === a.t) ? 0 : (v - a.t) / (b.t - a.t);
    const r = Math.round(lerp(a.c[0], b.c[0], tt));
    const g = Math.round(lerp(a.c[1], b.c[1], tt));
    const bl = Math.round(lerp(a.c[2], b.c[2], tt));
    return `rgba(${r},${g},${bl},0.82)`;
  }

  function setBlock(id, v01){
    const el = $(id);
    if (!el) return;
    el.style.background = colorForValue01(v01);
  }

  function scenarioFromInputs(which){
    const x = readInputs();
    if (which === "now") {
      return computeScenario({
        area: x.area, storeys: x.storeys, height: x.height,
        wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
        wallInsCm: x.wallInsNow, wallInsMat: x.wallInsMat,
        roofInsCm: x.roofInsNow, roofInsMat: x.roofInsMat,
        floorInsCm: x.floorInsNow, floorInsMat: x.floorInsMat,
        winUOverride: EA_IS_PRO ? x.pro_winU : null,
        hrvEffPct: EA_IS_PRO ? x.pro_hrvEff : 0
      });
    }
    return computeScenario({
      area: x.area, storeys: x.storeys, height: x.height,
      wallType: x.wallType, winRatio: x.winRatio, nAir: x.nAir, bridgePct: x.bridge,
      wallInsCm: x.wallInsTarget, wallInsMat: x.wallInsMat,
      roofInsCm: x.roofInsTarget, roofInsMat: x.roofInsMat,
      floorInsCm: x.floorInsTarget, floorInsMat: x.floorInsMat,
      winUOverride: EA_IS_PRO ? x.pro_winU : null,
      hrvEffPct: EA_IS_PRO ? x.pro_hrvEff : 0
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
      keys.forEach(k => parts[k] = Math.max(0, partsNow[k] - partsTar[k]));
      explain = "KÜLÖNBSÉG: azt mutatja, hol csökken a legjobban a veszteség MOST → CÉL között.";
    }

    const maxPart = keys.reduce((m,k)=> Math.max(m, parts[k]||0), 0) || 1;

    const ratios = {};
    keys.forEach(k => {
      const raw = (parts[k]||0) / maxPart;
      ratios[k] = Math.pow(clamp(raw,0,1), 0.65);
    });

    setBlock("hmRoof", ratios.roof);
    setBlock("hmFloor", ratios.floor);
    setBlock("hmVent", ratios.vent);

    setBlock("hmWallL", ratios.wall);
    setBlock("hmWallC", ratios.wall);
    setBlock("hmWallR", ratios.wall);

    setBlock("hmWin", ratios.window);

    const labelMap = {
      roof: "Födém",
      wall: "Fal",
      window: "Ablak",
      floor: "Padló",
      vent: "Légcsere"
    };

    const total = keys.reduce((s,kk)=> s + (parts[kk]||0), 0) || 1;

    const rows = keys
      .map(k => ({
        k,
        label: labelMap[k],
        val: parts[k] || 0,
        pct: ((parts[k]||0) / total) * 100
      }))
      .sort((a,b)=> b.val - a.val);

    list.innerHTML = rows.map(r => `
      <div class="hmRow">
        <div class="hmTop">
          <div>${r.label}</div>
          <div>${fmtPct(r.pct)}</div>
        </div>
        <div class="hmBar"><div class="hmFill" style="width:${Math.round(r.pct)}%"></div></div>
        <div class="hmMeta">H hozzájárulás: <b>${r.val.toFixed(0)} W/K</b></div>
      </div>
    `).join("");

    const ex = $("hmExplain");
    if (ex) ex.textContent = explain;
  }

  // ---------- initByHash (share betöltéssel) ----------
  function initByHash() {
    const { view } = parseHash();
    const onlyCalcExists = !!viewCalc && !viewHome && !viewPlan && !view3d && !viewDocs;

    if (onlyCalcExists) {
      showView("calc");
      tryApplyShareFromUrl();
      return;
    }

    if (view === "calc") { showView("calc"); tryApplyShareFromUrl(); return; }
    if (view === "plan") { showView("plan"); return; }
    if (view === "3d") return showView("3d");
    if (view === "docs") return showView("docs");
    return showView("home");
  }

  // ===== SZAKIPIAC LEAD (AJÁNLATKÉRÉS) =====
  (function bindLeadButton(){
    const btnLead = document.getElementById("btnLead");
    if (!btnLead) return;

    btnLead.addEventListener("click", () => {
      flashBtn(btnLead);
      toast("Vissza a SzakiPiacra…");
      goToSzakipiacHome();
    });
  })();

  // ---------- START ----------
  setDefaults();
  setPlanUnlocked(false);

  bindShareButton();
  bindStateButtons();
  bindExportImportButtons();
  bindPdfButtons();

  initByHash();
  window.addEventListener("hashchange", initByHash);

  // „← SzakiPiac” + PRO + badge
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBackToSzakipiacButton);
  } else {
    addBackToSzakipiacButton();
  }

})();
