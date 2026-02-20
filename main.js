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

function show(which){
  Object.values(views).forEach(v => v.classList.add("hidden"));
  Object.values(btns).forEach(b => b.classList.remove("active"));

  if(which === "home"){ views.home.classList.remove("hidden"); btns.home.classList.add("active"); }
  if(which === "calc"){ views.calc.classList.remove("hidden"); btns.calc.classList.add("active"); }
  if(which === "d3"){ views.d3.classList.remove("hidden"); btns.d3.classList.add("active"); }
  if(which === "docs"){ views.docs.classList.remove("hidden"); btns.docs.classList.add("active"); }
}

btns.home.addEventListener("click", ()=>show("home"));
btns.calc.addEventListener("click", ()=>show("calc"));
btns.d3.addEventListener("click", ()=>show("d3"));
btns.docs.addEventListener("click", ()=>show("docs"));

show("home");
