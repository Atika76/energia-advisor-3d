/* Energia Advisor 3D – Valós (C) kalkulátor
   - UA + infiltráció + HDD
   - Kalibrálás: a MOST Ft/év értéket bázisnak vesszük (hogy a modell "valós" legyen)
   - PRO hőtérkép (3D nézet): MOST / CÉL / KÜLÖNBSÉG + top1/top2 kiemelés + tooltip + gyors összefoglaló
*/

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- NAV ----------
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
    [btnHome, btnCalc, btn3d, btnDocs].forEach((b) => b && b.classList.remove("active"));
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

    // PRO: ha 3D-re mész, frissítjük a hőtérképet a jelenlegi inputokból
    if (which === "3d") {
      try {
        heatmapRenderFromInputs();
      } catch (e) {
        // ne boruljon a UI
        // console.warn(e);
      }
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (btnHome) btnHome.addEventListener("click", () => { location.hash = "#home"; showView("home"); });
  if (btnCalc) btnCalc.addEventListener("click", () => { location.hash = "#calc"; showView("calc"); });
  if (btn3d) btn3d.addEventListener("click", () => { location.hash = "#3d"; showView("3d"); });
  if (btnDocs) btnDocs.addEventListener("click", () => { location.hash = "#docs"; showView("docs"); });

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
  initByHash();

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

  // Base U-values (W/m²K) for "régi" szerkezetek (tipikus közelítés)
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
    const footprint = areaTotal / s; // m²
    const side = Math.sqrt(Math.max(footprint, 1));
    const perim = 4 * side;

    const wallGross = perim * height * s;          // m²
    const roofArea = footprint;                    // m²
    const floorArea = footprint;                   // m²
    const volume = footprint * height * s;         // m³

    return { footprint, side, perim, wallGross, roofArea, floorArea, volume };
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

    // komponens bontás (hőhíd korrekciót a végén szorzóként tesszük rá)
    const H_wall = Uwall * AwallNet;
    const H_win = Uwin * Awin;
    const H_roof = Uroof * g.roofArea;
    const H_floor = Ufloor * g.floorArea;
    const H_vent = 0.33 * nAir * g.volume;

    const bridge = 1 + (bridgePct / 100);

    const base = {
      wall: H_wall,
      win: H_win,
      roof: H_roof,
      floor: H_floor,
      vent: H_vent
    };

    const withBridge = {
      wall: base.wall * bridge,
      win: base.win * bridge,
      roof: base.roof * bridge,
      floor: base.floor * bridge,
      vent: base.vent * bridge
    };

    const Htrans = withBridge.wall + withBridge.win + withBridge.roof + withBridge.floor;
    const Hvent = withBridge.vent;
    const H = Htrans + Hvent;

    return {
      geom: g,
      areas: { AwallNet, Awin, Aroof: g.roofArea, Afloor: g.floorArea },
      U: { Uwall, Uwin, Uroof, Ufloor },
      H: { Htrans, Hvent, H, breakdown: withBridge }
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
    if ($("area")) $("area").value = DEFAULTS.area;
    if ($("storeys")) $("storeys").value = String(DEFAULTS.storeys);
    if ($("height")) $("height").value = DEFAULTS.height;
    if ($("wallType")) $("wallType").value = DEFAULTS.wallType;
    if ($("winRatio")) $("winRatio").value = DEFAULTS.winRatio;
    if ($("nAir")) $("nAir").value = DEFAULTS.nAir;
    if ($("wallInsNow")) $("wallInsNow").value = DEFAULTS.wallInsNow;
    if ($("wallInsMat")) $("wallInsMat").value = DEFAULTS.wallInsMat;
    if ($("roofInsNow")) $("roofInsNow").value = DEFAULTS.roofInsNow;
    if ($("roofInsMat")) $("roofInsMat").value = DEFAULTS.roofInsMat;
    if ($("floorInsNow")) $("floorInsNow").value = DEFAULTS.floorInsNow;
    if ($("floorInsMat")) $("floorInsMat").value = DEFAULTS.floorInsMat;
    if ($("heatingNow")) $("heatingNow").value = DEFAULTS.heatingNow;
    if ($("scopNow")) $("scopNow").value = DEFAULTS.scopNow;
    if ($("annualCostNow")) $("annualCostNow").value = DEFAULTS.annualCostNow;

    if ($("wallInsTarget")) $("wallInsTarget").value = DEFAULTS.wallInsTarget;
    if ($("roofInsTarget")) $("roofInsTarget").value = DEFAULTS.roofInsTarget;
    if ($("floorInsTarget")) $("floorInsTarget").value = DEFAULTS.floorInsTarget;
    if ($("heatingTarget")) $("heatingTarget").value = DEFAULTS.heatingTarget;
    if ($("scopTarget")) $("scopTarget").value = DEFAULTS.scopTarget;
    if ($("hdd")) $("hdd").value = DEFAULTS.hdd;
    if ($("priceGas")) $("priceGas").value = DEFAULTS.priceGas;
    if ($("priceEl")) $("priceEl").value = DEFAULTS.priceEl;

    if ($("bridge")) $("bridge").value = DEFAULTS.bridge;
    if ($("costWallM2")) $("costWallM2").value = DEFAULTS.costWallM2;
    if ($("costRoofM2")) $("costRoofM2").value = DEFAULTS.costRoofM2;
    if ($("costFloorM2")) $("costFloorM2").value = DEFAULTS.costFloorM2;
    if ($("costHeating")) $("costHeating").value = DEFAULTS.costHeating;
  }

  // ---------- Core calc ----------
  function readInputs() {
    const area = clamp(num($("area")?.value, 100), 20, 1000);
    const storeys = clamp(num($("storeys")?.value, 1), 1, 3);
    const height = clamp(num($("height")?.value, 2.6), 2.2, 3.2);
    const wallType = $("wallType") ? $("wallType").value : "brick";

    const winRatio = clamp(num($("winRatio")?.value, 18), 5, 35);
    const nAir = clamp(num($("nAir")?.value, 0.6), 0.2, 1.2);

    const wallInsNow = clamp(num($("wallInsNow")?.value, 0), 0, 30);
    const wallInsMat = $("wallInsMat") ? $("wallInsMat").value : "eps";
    const roofInsNow = clamp(num($("roofInsNow")?.value, 0), 0, 60);
    const roofInsMat = $("roofInsMat") ? $("roofInsMat").value : "rockwool";
    const floorInsNow = clamp(num($("floorInsNow")?.value, 0), 0, 20);
    const floorInsMat = $("floorInsMat") ? $("floorInsMat").value : "xps";

    const heatingNow = $("heatingNow") ? $("heatingNow").value : "gas_old";
    const scopNow = clamp(num($("scopNow")?.value, 3.2), 2.2, 5.5);

    const annualCostNow = Math.max(0, num($("annualCostNow")?.value, 0));

    const wallInsTarget = clamp(num($("wallInsTarget")?.value, 15), 0, 30);
    const roofInsTarget = clamp(num($("roofInsTarget")?.value, 25), 0, 60);
    const floorInsTarget = clamp(num($("floorInsTarget")?.value, 10), 0, 20);

    const heatingTarget = $("heatingTarget") ? $("heatingTarget").value : "hp";
    const scopTarget = clamp(num($("scopTarget")?.value, 3.6), 2.2, 5.5);

    const hdd = clamp(num($("hdd")?.value, 3000), 1800, 4500);
    const priceGas = clamp(num($("priceGas")?.value, 40), 10, 120);
    const priceEl = clamp(num($("priceEl")?.value, 70), 20, 180);

    const bridge = clamp(num($("bridge")?.value, 10), 0, 25);

    const costWallM2 = Math.max(0, num($("costWallM2")?.value, 18000));
    const costRoofM2 = Math.max(0, num($("costRoofM2")?.value, 12000));
    const costFloorM2 = Math.max(0, num($("costFloorM2")?.value, 15000));
    const costHeating = Math.max(0, num($("costHeating")?.value, 3500000));

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

    const heatCost = costs.costHeating;

    return { wallCost, roofCost, floorCost, heatCost };
  }

  function renderResult(out) {
    if (resultBox) resultBox.innerHTML = out;
  }

  // ---------- Hőtérkép PRO (3D nézet) ----------
  let HEATMAP_MODE = "now"; // "now" | "target" | "diff"
  let LAST_HEATMAP = null;  // { nowScenario, targetScenario, x, calib, Q_real_now, Q_real_target }

  function ensureHeatmapStylesOnce() {
    if (document.getElementById("ea-heatmap-style")) return;
    const css = `
      .heatWrap{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;align-items:start}
      @media(max-width:980px){.heatWrap{grid-template-columns:1fr}}
      .heatHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .heatTitle{margin:0;font-size:26px;letter-spacing:.2px}
      .heatSub{margin:6px 0 0;color:rgba(255,255,255,.72)}
      .segmented{display:flex;gap:8px;flex-wrap:wrap}
      .segBtn{padding:9px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:rgba(255,255,255,.92);cursor:pointer;font-weight:750;transition:.15s}
      .segBtn:hover{transform:translateY(-1px);background:rgba(255,255,255,.08)}
      .segBtn.on{border-color:rgba(90,190,255,.45);box-shadow:0 0 0 3px rgba(90,190,255,.15) inset}
      .heatCard{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.045);border-radius:18px;padding:14px}
      .house{position:relative;border:1px solid rgba(255,255,255,.10);border-radius:18px;background:rgba(255,255,255,.03);padding:16px}
      .houseGrid{display:grid;grid-template-rows:80px 1fr 80px;gap:10px}
      .roof{border-radius:14px;padding:10px;display:flex;align-items:center;justify-content:center;font-weight:850}
      .mid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
      .wall{border-radius:14px;padding:10px;display:flex;align-items:center;justify-content:center;font-weight:850;min-height:120px}
      .win{border-radius:14px;padding:10px;display:flex;align-items:center;justify-content:center;font-weight:900;min-height:120px;transform:scale(.92)}
      .floor{border-radius:14px;padding:10px;display:flex;align-items:center;justify-content:center;font-weight:850}
      .vent{position:absolute;left:18px;bottom:18px;border-radius:999px;padding:9px 12px;font-weight:850;border:1px solid rgba(255,255,255,.14)}
      .legend{position:absolute;right:14px;top:14px;border-radius:14px;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.22);padding:10px 10px;font-size:12px;color:rgba(255,255,255,.75)}
      .legendRow{display:flex;align-items:center;gap:8px;margin:4px 0}
      .dot{width:10px;height:10px;border-radius:50%}
      .bars .barRow{margin:10px 0 14px}
      .bars .barTop{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
      .bars .barName{font-weight:900}
      .bars .barVal{color:rgba(255,255,255,.72);font-weight:750}
      .barTrack{height:10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.10);overflow:hidden;margin-top:6px}
      .barFill{height:100%;border-radius:999px}
      .miniExplain{margin-top:10px;color:rgba(255,255,255,.68);font-size:13px;line-height:1.35}
      .heatSummary{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px;margin-bottom:12px}
      .heatSummary b{font-weight:950}
      .heatSummary .line{display:flex;justify-content:space-between;gap:10px;margin:6px 0;color:rgba(255,255,255,.80)}
      .heatTip{margin-top:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.03);border-radius:16px;padding:12px}
      .heatTip .head{font-weight:950;margin-bottom:6px}
      .tooltipBox{position:absolute;z-index:50;min-width:260px;max-width:320px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(10,14,24,.92);box-shadow:0 18px 55px rgba(0,0,0,.45);padding:12px;color:rgba(255,255,255,.92);display:none}
      .tooltipBox .tTitle{font-weight:950;margin-bottom:6px}
      .tooltipBox .tRow{display:flex;justify-content:space-between;gap:10px;color:rgba(255,255,255,.78);margin:4px 0}
      .tooltipBox .tHint{margin-top:8px;color:rgba(255,255,255,.68);font-size:12.5px;line-height:1.35}
      .clickable{cursor:pointer;transition:.12s}
      .clickable:hover{transform:translateY(-1px);filter:brightness(1.05)}
    `;
    const style = document.createElement("style");
    style.id = "ea-heatmap-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function tipsForKey(key) {
    const map = {
      roof: "Födém/padlás: 20–30 cm sok háznál a legjobb első lépés.",
      wall: "Fal: 12–15 cm már jó szint, hőhidak + csomópontok számítanak.",
      floor: "Padló/aljzat: komfortot is ad, de bontás miatt drágább lehet.",
      win: "Ablak: ha nagyon régi, sokat dob, de beépítés + páratechnika fontos.",
      vent: "Légcsere: szél, réseken szökik a hő. Légzárás sokszor olcsó nagy nyereség."
    };
    return map[key] || "";
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  // Színlogika:
  // - MOST/CÉL: top1 piros, top2 narancs, többi zöld (de intenzitás arányos)
  // - KÜLÖNBSÉG: "nyereség" (kék->zöld) intenzitással
  function colorForLoss(rank, t) {
    // t: 0..1 (arány)
    // top1 pirosas, top2 narancsos, egyéb zöldes
    if (rank === 0) {
      return `linear-gradient(135deg, rgba(255,110,120,${0.30 + 0.45*t}), rgba(255,190,90,${0.08 + 0.20*t}))`;
    }
    if (rank === 1) {
      return `linear-gradient(135deg, rgba(255,190,90,${0.25 + 0.40*t}), rgba(90,220,170,${0.06 + 0.14*t}))`;
    }
    return `linear-gradient(135deg, rgba(90,220,170,${0.18 + 0.38*t}), rgba(90,190,255,${0.05 + 0.10*t}))`;
  }

  function colorForGain(t) {
    // t: 0..1 (mennyit javul)
    return `linear-gradient(135deg, rgba(90,190,255,${0.16 + 0.42*t}), rgba(90,220,170,${0.12 + 0.40*t}))`;
  }

  function computeBreakdown(scenario) {
    const b = scenario.H.breakdown; // {wall, win, roof, floor, vent}
    const total = Math.max(1e-9, scenario.H.H);
    const parts = [
      { key: "roof", name: "Födém", H: b.roof },
      { key: "floor", name: "Padló", H: b.floor },
      { key: "wall", name: "Fal", H: b.wall },
      { key: "vent", name: "Légcsere", H: b.vent },
      { key: "win", name: "Ablak", H: b.win }
    ];
    parts.forEach(p => { p.share = p.H / total; });
    // rang MOST/CÉL színezéshez
    const ranked = [...parts].sort((a, b) => b.H - a.H).map(p => p.key);
    parts.forEach(p => { p.rank = ranked.indexOf(p.key); });
    return { total, parts, rankedKeys: ranked };
  }

  function computeDiff(nowScenario, targetScenario) {
    const n = nowScenario.H.breakdown;
    const t = targetScenario.H.breakdown;
    const diff = {
      roof: Math.max(0, n.roof - t.roof),
      floor: Math.max(0, n.floor - t.floor),
      wall: Math.max(0, n.wall - t.wall),
      vent: Math.max(0, n.vent - t.vent),
      win: Math.max(0, n.win - t.win)
    };
    const totalGain = Math.max(1e-9, diff.roof + diff.floor + diff.wall + diff.vent + diff.win);
    const parts = [
      { key: "roof", name: "Födém", H: diff.roof },
      { key: "floor", name: "Padló", H: diff.floor },
      { key: "wall", name: "Fal", H: diff.wall },
      { key: "vent", name: "Légcsere", H: diff.vent },
      { key: "win", name: "Ablak", H: diff.win }
    ];
    parts.forEach(p => { p.share = p.H / totalGain; });
    const ranked = [...parts].sort((a, b) => b.H - a.H).map(p => p.key);
    parts.forEach(p => { p.rank = ranked.indexOf(p.key); });
    return { total: totalGain, parts, rankedKeys: ranked };
  }

  function renderHeatmapUI() {
    if (!view3d) return;
    ensureHeatmapStylesOnce();

    // Ha a 3D nézetedben van már valami, felülírjuk a belsejét erre a PRO UI-ra:
    view3d.innerHTML = `
      <div class="heatHeader">
        <div>
          <h2 class="heatTitle">Profi hőtérkép (MVP)</h2>
          <div class="heatSub">A hőtérkép a kalkulátor adataiból számol: fal / ablak / födém / padló / légcsere. Válts: <b>MOST</b> • <b>CÉL</b> • <b>KÜLÖNBSÉG</b>.</div>
        </div>
        <div class="segmented">
          <button class="segBtn" id="hmNow">MOST</button>
          <button class="segBtn" id="hmTarget">CÉL</button>
          <button class="segBtn" id="hmDiff">KÜLÖNBSÉG</button>
        </div>
      </div>

      <div class="heatWrap" style="margin-top:14px;">
        <div class="heatCard">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline;flex-wrap:wrap;">
            <div style="font-weight:950;">Ház – hőveszteség vizuálisan</div>
            <div class="muted" style="font-size:13px;">Tipp: módosíts a kalkulátorban, majd gyere vissza ide – automatikusan frissül.</div>
          </div>

          <div class="house" style="margin-top:12px;">
            <div class="legend">
              <div class="legendRow"><span class="dot" style="background:rgba(255,110,120,.85)"></span> top veszteség</div>
              <div class="legendRow"><span class="dot" style="background:rgba(255,190,90,.85)"></span> 2. hely</div>
              <div class="legendRow"><span class="dot" style="background:rgba(90,220,170,.85)"></span> kisebb</div>
              <div class="legendRow"><span class="dot" style="background:rgba(90,190,255,.85)"></span> nyereség (különbség)</div>
            </div>

            <div class="houseGrid">
              <div class="roof clickable" id="hmRoof">Födém</div>
              <div class="mid">
                <div class="wall clickable" id="hmWallL">Fal</div>
                <div class="win clickable" id="hmWin">Ablak</div>
                <div class="wall clickable" id="hmWallR">Fal</div>
              </div>
              <div class="floor clickable" id="hmFloor">Padló</div>
            </div>

            <div class="vent clickable" id="hmVent">Légcsere</div>

            <div class="miniExplain" style="margin-top:12px;">
              A színezés az egyes elemek <b>H (W/K)</b> hozzájárulásán alapul (UA + Hvent), hőhíd-korrekcióval.
              <span class="muted">MOST/CÉL: top1 piros, top2 narancs. KÜLÖNBSÉG: ahol a legtöbbet javulsz, ott a legerősebb a “nyereség” szín.</span>
            </div>

            <div class="tooltipBox" id="hmTip"></div>
          </div>
        </div>

        <div class="heatCard">
          <div class="heatSummary" id="hmSummary">
            <div style="font-weight:950;">Gyors összefoglaló</div>
            <div class="muted" style="margin-top:6px;">Kattints az <b>Elemzés</b>-re a kalkulátoron, vagy csak állíts értékeket → itt frissül.</div>
          </div>

          <div class="bars" id="hmBars">
            <!-- dinamikus -->
          </div>

          <div class="heatTip" id="hmInterpret">
            <div class="head">Gyors értelmezés</div>
            <div class="muted" id="hmInterpretTxt">MOST: megmutatja, hogy a jelenlegi állapotban hol megy el a hő arányosan (H bontás).</div>
          </div>
        </div>
      </div>
    `;

    // mode buttons
    const hmNow = $("hmNow");
    const hmTarget = $("hmTarget");
    const hmDiff = $("hmDiff");
    const setOn = () => {
      [hmNow, hmTarget, hmDiff].forEach(b => b && b.classList.remove("on"));
      if (HEATMAP_MODE === "now") hmNow && hmNow.classList.add("on");
      if (HEATMAP_MODE === "target") hmTarget && hmTarget.classList.add("on");
      if (HEATMAP_MODE === "diff") hmDiff && hmDiff.classList.add("on");
    };
    if (hmNow) hmNow.addEventListener("click", () => { HEATMAP_MODE = "now"; setOn(); heatmapApply(LAST_HEATMAP); });
    if (hmTarget) hmTarget.addEventListener("click", () => { HEATMAP_MODE = "target"; setOn(); heatmapApply(LAST_HEATMAP); });
    if (hmDiff) hmDiff.addEventListener("click", () => { HEATMAP_MODE = "diff"; setOn(); heatmapApply(LAST_HEATMAP); });
    setOn();

    // click tooltip
    const tip = $("hmTip");
    function attachTip(elId, key) {
      const el = $(elId);
      if (!el || !tip) return;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showTipForKey(key, el);
      });
    }
    attachTip("hmRoof", "roof");
    attachTip("hmFloor", "floor");
    attachTip("hmWallL", "wall");
    attachTip("hmWallR", "wall");
    attachTip("hmWin", "win");
    attachTip("hmVent", "vent");

    document.addEventListener("click", () => {
      const t = $("hmTip");
      if (t) t.style.display = "none";
    }, { passive: true });
  }

  function showTipForKey(key, anchorEl) {
    const tip = $("hmTip");
    if (!tip || !LAST_HEATMAP) return;

    const nowB = LAST_HEATMAP.nowScenario.H.breakdown;
    const tarB = LAST_HEATMAP.targetScenario.H.breakdown;

    const now = nowB[key];
    const tar = tarB[key];
    const diff = Math.max(0, now - tar);
    const pct = now > 0 ? (diff / now) : 0;

    const names = { roof: "Födém", floor: "Padló", wall: "Fal", win: "Ablak", vent: "Légcsere" };
    const title = names[key] || key;

    tip.innerHTML = `
      <div class="tTitle">${title}</div>
      <div class="tRow"><span>MOST H</span><b>${Math.round(now)} W/K</b></div>
      <div class="tRow"><span>CÉL H</span><b>${Math.round(tar)} W/K</b></div>
      <div class="tRow"><span>Javulás</span><b>-${Math.round(diff)} W/K (${fmtPct(pct*100)})</b></div>
      <div class="tHint">${tipsForKey(key)}</div>
    `;

    // pozíció
    const house = anchorEl.closest(".house") || view3d;
    const rA = anchorEl.getBoundingClientRect();
    const rH = house.getBoundingClientRect();
    const left = clamp((rA.left - rH.left) + 10, 8, (rH.width - 340));
    const top = clamp((rA.top - rH.top) + 10, 8, (rH.height - 180));

    tip.style.left = left + "px";
    tip.style.top = top + "px";
    tip.style.display = "block";
  }

  function heatmapApply(state) {
    if (!state) return;
    const { nowScenario, targetScenario } = state;

    const roofEl = $("hmRoof");
    const floorEl = $("hmFloor");
    const wallL = $("hmWallL");
    const wallR = $("hmWallR");
    const winEl = $("hmWin");
    const ventEl = $("hmVent");

    const bars = $("hmBars");
    const summary = $("hmSummary");
    const interpretTxt = $("hmInterpretTxt");

    // adat kiválasztása nézet alapján
    let pack;
    if (HEATMAP_MODE === "now") pack = computeBreakdown(nowScenario);
    else if (HEATMAP_MODE === "target") pack = computeBreakdown(targetScenario);
    else pack = computeDiff(nowScenario, targetScenario);

    const maxH = Math.max(...pack.parts.map(p => p.H), 1e-9);

    function paintElement(el, key) {
      if (!el) return;
      const p = pack.parts.find(x => x.key === key);
      const t = clamp01(p.H / maxH);

      if (HEATMAP_MODE === "diff") {
        el.style.background = colorForGain(t);
        el.style.border = "1px solid rgba(90,190,255,.28)";
      } else {
        el.style.background = colorForLoss(p.rank, t);
        el.style.border = "1px solid rgba(255,255,255,.14)";
      }
    }

    paintElement(roofEl, "roof");
    paintElement(floorEl, "floor");
    paintElement(wallL, "wall");
    paintElement(wallR, "wall");
    paintElement(winEl, "win");
    paintElement(ventEl, "vent");

    // Bars + számok
    if (bars) {
      const partsSorted = [...pack.parts].sort((a, b) => b.H - a.H);
      bars.innerHTML = `
        <div style="font-weight:950;margin-bottom:8px;">Bontás (arány + számok)</div>
        ${partsSorted.map(p => {
          const pct = pack.total > 0 ? (p.H / pack.total) : 0;
          const fill = clamp01(p.H / maxH);
          const fillStyle = (HEATMAP_MODE === "diff")
            ? `background:${colorForGain(fill)};`
            : `background:${colorForLoss(p.rank, fill)};`;
          return `
            <div class="barRow">
              <div class="barTop">
                <div class="barName">${p.name}</div>
                <div class="barVal">${(pct*100).toFixed(1)}%</div>
              </div>
              <div class="barTrack"><div class="barFill" style="width:${(pct*100).toFixed(1)}%;${fillStyle}"></div></div>
              <div class="muted" style="margin-top:6px;font-weight:750;">H hozzájárulás: ${Math.round(p.H)} W/K</div>
            </div>
          `;
        }).join("")}
      `;
    }

    // Summary
    if (summary) {
      const top = [...pack.parts].sort((a, b) => b.H - a.H)[0];
      const second = [...pack.parts].sort((a, b) => b.H - a.H)[1];
      const label = (HEATMAP_MODE === "now") ? "MOST" : (HEATMAP_MODE === "target") ? "CÉL" : "KÜLÖNBSÉG";

      // extra: MOST vs CÉL össz javulás gyorsan
      const totalNow = Math.max(1e-9, nowScenario.H.H);
      const totalTarget = Math.max(1e-9, targetScenario.H.H);
      const totalImprove = 1 - (totalTarget / totalNow);

      summary.innerHTML = `
        <div style="font-weight:950;">Gyors összefoglaló</div>
        <div class="line"><span>Nézet</span><b>${label}</b></div>
        <div class="line"><span>TOP elem</span><b>${top.name}</b></div>
        <div class="line"><span>2. elem</span><b>${second.name}</b></div>
        <div class="line"><span>Össz. H (MOST)</span><b>${Math.round(totalNow)} W/K</b></div>
        <div class="line"><span>Össz. H (CÉL)</span><b>${Math.round(totalTarget)} W/K</b></div>
        <div class="line"><span>Várható javulás</span><b>${fmtPct(totalImprove*100)}</b></div>
        <div class="muted" style="margin-top:8px;font-size:13px;">
          Tipp: a <b>KÜLÖNBSÉG</b> nézetben azt látod, hol nyersz a legtöbbet (W/K-ben).
        </div>
      `;
    }

    // Interpretáció
    if (interpretTxt) {
      if (HEATMAP_MODE === "now") interpretTxt.textContent = "MOST: megmutatja, hogy a jelenlegi állapotban hol megy el a hő arányosan (H bontás).";
      if (HEATMAP_MODE === "target") interpretTxt.textContent = "CÉL: megmutatja, hogy a fejlesztett állapotban hol marad a legnagyobb hőveszteség.";
      if (HEATMAP_MODE === "diff") interpretTxt.textContent = "KÜLÖNBSÉG: megmutatja, hol javulsz a legtöbbet (MOST H − CÉL H). Minél erősebb a szín, annál nagyobb a nyereség.";
    }
  }

  function heatmapRenderFromInputs() {
    if (!view3d) return;

    // PRO UI csak egyszer épüljön fel
    if (!document.getElementById("hmNow")) {
      renderHeatmapUI();
    }

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

    // kalibráció (ugyanaz, mint a kalkulátorban): MOST Ft/év -> Q_real_now, Q_model_now -> calib
    const Q_model_now = annualHeatDemandKWh(nowScenario.H.H, x.hdd);
    const Q_real_now = heatDemandFromCost(x.annualCostNow, x.heatingNow, x.priceGas, x.priceEl, x.scopNow);
    const calib = (Q_model_now > 0) ? (Q_real_now / Q_model_now) : 1;

    const Q_model_target = annualHeatDemandKWh(targetScenario.H.H, x.hdd);
    const Q_real_target = Q_model_target * calib;

    LAST_HEATMAP = { nowScenario, targetScenario, x, calib, Q_real_now, Q_real_target };
    heatmapApply(LAST_HEATMAP);

    // állítsuk a gombok "on" állapotát is
    const hmNow = $("hmNow");
    const hmTarget = $("hmTarget");
    const hmDiff = $("hmDiff");
    [hmNow, hmTarget, hmDiff].forEach(b => b && b.classList.remove("on"));
    if (HEATMAP_MODE === "now") hmNow && hmNow.classList.add("on");
    if (HEATMAP_MODE === "target") hmTarget && hmTarget.classList.add("on");
    if (HEATMAP_MODE === "diff") hmDiff && hmDiff.classList.add("on");
  }

  // ---------- Kalkulátor eredmény (változatlanul, de a végén frissítjük a hőtérképet is) ----------
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

    // PRO: hőtérkép frissítése is, hogy a 3D nézet azonnal kész legyen
    try {
      LAST_HEATMAP = { nowScenario, targetScenario, x, calib, Q_real_now, Q_real_target };
      if (document.getElementById("hmNow")) heatmapApply(LAST_HEATMAP);
    } catch (e) {}
  }

  // events
  if (btnRun) btnRun.addEventListener("click", calcAll);
  if (btnReset) btnReset.addEventListener("click", () => {
    setDefaults();
    renderResult(`
      <div class="sectionTitle">Eredmény</div>
      <div class="muted">Kattints az <b>Elemzés</b> gombra.</div>
    `);

    // PRO: reset után is frissítsük a hőtérképet, ha már megnyitották
    try {
      if (document.getElementById("hmNow")) heatmapRenderFromInputs();
    } catch (e) {}
  });

  // init
  setDefaults();

  // PRO: ha valaki közvetlenül a #3d-re jön, akkor felépítjük a hőtérképet
  try {
    if ((location.hash || "").includes("3d")) {
      heatmapRenderFromInputs();
    }
  } catch (e) {}
})();
