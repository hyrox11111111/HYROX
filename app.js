import {
  collection, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { EVENTO } from "./config.js";
import { classificar, provasLancadas } from "./ranking.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, texto) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;
  return e;
};
const iniciais = (nome) => {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};
const medalha = (rank) => ["ouro", "prata", "bronze"][Math.min(rank, 3) - 1];
const norm = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// ---------- Cabeçalho ----------
$("modalidade").textContent = EVENTO.modalidade;
$("nome-evento").textContent = EVENTO.nome.toUpperCase();
document.title = `Ranking · ${EVENTO.nome}`;
if (EVENTO.data) { $("data-evento").textContent = EVENTO.data; $("data-evento").hidden = false; }
if (EVENTO.local) { $("local").textContent = EVENTO.local; $("local").hidden = false; }
$("regra").textContent =
  `1º = ${EVENTO.pontosPrimeiro} pts, −${EVENTO.pontosPorPosicao} por posição · pontos somados em ${EVENTO.provas.length} provas`;

let atletas = [];
let filtro = "";

// ---------- Dados em tempo real ----------
onSnapshot(
  collection(db, "atletas"),
  (snap) => {
    atletas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  },
  () => {
    $("status").textContent = "Não foi possível carregar o ranking. Atualize a página.";
  }
);

$("busca").addEventListener("input", (e) => {
  filtro = norm(e.target.value.trim());
  render();
});

// ---------- Desenho ----------
function render() {
  const todos = classificar(atletas);
  const lancadas = provasLancadas(atletas);
  $("status").textContent = lancadas.length
    ? `Ao vivo · após ${lancadas[lancadas.length - 1].label} · ${todos.length} atletas`
    : "Aguardando resultados";

  const podio = $("podio");
  const lista = $("lista");
  podio.innerHTML = "";
  lista.innerHTML = "";

  if (todos.length === 0) {
    lista.appendChild(el("p", "muted small vazio", "Nenhum atleta cadastrado ainda."));
    return;
  }

  const lider = todos[0].total;
  const comResultado = todos.filter((a) => a.temResultado);
  let linhas = todos;

  if (filtro) {
    linhas = todos.filter((a) => norm(a.nome).includes(filtro) || norm(a.box).includes(filtro));
  } else if (comResultado.length >= 3) {
    montarPodio(podio, todos.slice(0, 3));
    linhas = todos.slice(3);
  }

  if (linhas.length === 0) {
    lista.appendChild(el("p", "muted small vazio", "Nenhum atleta encontrado."));
    return;
  }
  linhas.forEach((a, i) => lista.appendChild(montarLinha(a, lider, i)));
}

function montarPodio(container, top3) {
  [top3[1], top3[0], top3[2]].forEach((a, i) => {
    const col = el("div", "col " + medalha(a.rank));
    col.style.setProperty("--i", i);

    const p = el("div", "p" + (a === top3[0] ? " m1" : ""));
    p.append(
      el("span", "avatar-p", iniciais(a.nome)),
      el("div", "nm", a.nome)
    );
    const tm = el("div", "tm", a.total);
    tm.appendChild(el("small", "", "pts"));
    p.appendChild(tm);

    col.append(p, el("div", "base", a.rank));
    container.appendChild(col);
  });
}

function montarLinha(a, lider, i) {
  const r = el("div", "linha");
  r.style.setProperty("--i", Math.min(i, 12));

  const n = el("div", "n" + (a.temResultado && a.rank <= 3 ? " " + medalha(a.rank) : ""), a.temResultado ? a.rank : "—");
  const av = el("span", "avatar-l", iniciais(a.nome));

  const info = el("div", "info");
  info.appendChild(el("div", "nome", a.nome));
  if (a.box) info.appendChild(el("div", "box", a.box));

  const prog = el("div", "prog");
  const fill = document.createElement("span");
  fill.style.width = (lider > 0 ? Math.round((a.total / lider) * 100) : 0) + "%";
  prog.appendChild(fill);
  info.appendChild(prog);

  const chips = el("div", "chips");
  EVENTO.provas.forEach((p) => {
    const v = (a.posicoes || {})[p.id];
    const cls = "chip" + (v === 1 ? " c1" : v === 2 ? " c2" : v === 3 ? " c3" : "");
    chips.appendChild(el("span", cls, `${p.label} · ${Number.isInteger(v) ? v + "º" : "—"}`));
  });
  info.appendChild(chips);

  const pts = el("div", "pts");
  pts.appendChild(el("div", "t", a.total));
  if (a.temResultado && a.total < lider) pts.appendChild(el("div", "gap", "−" + (lider - a.total)));

  r.append(n, av, info, pts);
  return r;
}
