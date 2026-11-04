import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, deleteField, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { EVENTO } from "./config.js";
import { pontosDe, totalDe, classificar, provasLancadas } from "./ranking.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, texto) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;
  return e;
};

let atletas = [];
let unsubs = [];
let filtroAdmin = "";
const norm = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const iniciais = (nome) => {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};
const cards = new Map(); // id -> { root, nome, box, total, inputs: {provaId: {input, pts}} }

// ---------- Login ----------
$("form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erro-login").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("senha").value);
  } catch {
    $("erro-login").textContent = "E-mail ou senha inválidos.";
  }
});

$("btn-sair").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  unsubs.forEach((u) => u());
  unsubs = [];
  $("tela-login").hidden = !!user;
  $("tela-painel").hidden = !user;
  if (!user) return;

  $("usuario").textContent = `Conectada como ${user.email}`;

  unsubs.push(
    onSnapshot(
      collection(db, "atletas"),
      (snap) => {
        atletas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        $("msg-admin").textContent = "";
        render();
      },
      () => {
        $("msg-admin").textContent =
          "Sem permissão para ver os atletas. Confira se o seu e-mail está nas regras do Firestore.";
      }
    )
  );
});

// ---------- Lista (atualiza sem perder o foco dos campos) ----------
function render() {
  const grid = $("lista-admin");
  const ordenados = [...atletas].sort((a, b) =>
    String(a.nome).localeCompare(String(b.nome), "pt-BR")
  );
  const ids = new Set(ordenados.map((a) => a.id));

  for (const [id, c] of cards) {
    if (!ids.has(id)) { c.root.remove(); cards.delete(id); }
  }

  ordenados.forEach((a, i) => {
    let c = cards.get(a.id);
    if (!c) { c = criarCard(a.id); cards.set(a.id, c); }
    atualizarCard(c, a);
    if (grid.children[i] !== c.root) grid.insertBefore(c.root, grid.children[i] || null);
  });

  ordenados.forEach((a) => {
    const c = cards.get(a.id);
    const ok = !filtroAdmin || norm(a.nome).includes(filtroAdmin) || norm(a.box).includes(filtroAdmin);
    c.root.hidden = !ok;
  });

  $("vazio").hidden = ordenados.length > 0;

  const rank = classificar(atletas);
  $("st-atletas").textContent = atletas.length;
  $("st-provas").textContent = `${provasLancadas(atletas).length}/${EVENTO.provas.length}`;
  $("st-lider").textContent =
    rank.length && rank[0].temResultado ? String(rank[0].nome).split(" ")[0] : "—";
}

$("busca-admin").addEventListener("input", (e) => {
  filtroAdmin = norm(e.target.value.trim());
  render();
});

function criarCard(id) {
  const root = el("section", "card atleta");

  const topo = el("div", "topo-atleta");
  const avatar = el("span", "avatar");
  const textos = el("div", "textos");
  const nome = el("span", "nome-atleta");
  const box = el("span", "box-atleta");
  textos.append(nome, box);
  const total = el("span", "contador");
  topo.append(avatar, textos, total);

  const acoes = el("div", "toolbar-btns");
  const editar = el("button", "btn btn-ghost", "Editar");
  editar.type = "button";
  editar.addEventListener("click", () => editarAtleta(id));
  const excluir = el("button", "btn-excluir", "Excluir atleta");
  excluir.type = "button";
  excluir.addEventListener("click", () => excluirAtleta(id));
  acoes.append(editar, excluir);

  const grade = el("div", "posicoes");
  const inputs = {};
  EVENTO.provas.forEach((p) => {
    const lab = el("label", "pos-in");
    lab.appendChild(el("span", "", p.label));
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "1";
    input.max = "999";
    input.placeholder = "—";
    input.setAttribute("aria-label", `Colocação no ${p.label}`);
    input.addEventListener("input", () => input.classList.toggle("ok", input.value.trim() !== ""));
    input.addEventListener("change", () => salvarPosicao(id, p.id, input));
    const pts = el("small", "pts-prova", "");
    lab.append(input, pts);
    grade.appendChild(lab);
    inputs[p.id] = { input, pts };
  });

  root.append(topo, grade, acoes);
  return { root, nome, box, avatar, total, inputs };
}

function atualizarCard(c, a) {
  c.nome.textContent = a.nome;
  c.avatar.textContent = iniciais(a.nome);
  c.box.textContent = a.box || "Sem box";
  c.total.textContent = `${totalDe(a)} pts`;
  EVENTO.provas.forEach((p) => {
    const { input, pts } = c.inputs[p.id];
    const v = (a.posicoes || {})[p.id];
    if (document.activeElement !== input) input.value = Number.isInteger(v) ? v : "";
    input.classList.toggle("ok", Number.isInteger(v));
    pts.textContent = Number.isInteger(v) ? `${pontosDe(v)} pts` : "";
  });
}

// ---------- Lançar colocação ----------
async function salvarPosicao(id, provaId, input) {
  const raw = input.value.trim();
  const ref = doc(db, "atletas", id);
  try {
    if (raw === "") {
      await updateDoc(ref, { [`posicoes.${provaId}`]: deleteField() });
      return;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      alert("Digite a colocação como número inteiro (1 ou mais).");
      const atual = (atletas.find((a) => a.id === id)?.posicoes || {})[provaId];
      input.value = Number.isInteger(atual) ? atual : "";
      return;
    }
    await updateDoc(ref, { [`posicoes.${provaId}`]: n });
  } catch (e) {
    console.error(e);
    alert("Não foi possível salvar: " + (e.code || e.message));
  }
}

// ---------- Adicionar / editar / excluir atleta ----------
$("form-novo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = $("novo-nome").value.trim().replace(/\s+/g, " ");
  const box = $("novo-box").value.trim().replace(/\s+/g, " ");
  if (!nome) return;
  try {
    await addDoc(collection(db, "atletas"), {
      nome,
      box,
      posicoes: {},
      criadoEm: serverTimestamp()
    });
    $("novo-nome").value = "";
    $("novo-box").value = "";
    $("novo-nome").focus();
  } catch (err) {
    console.error(err);
    alert("Não foi possível adicionar: " + (err.code || err.message));
  }
});

async function editarAtleta(id) {
  const a = atletas.find((x) => x.id === id);
  if (!a) return;
  const nome = (prompt("Nome do atleta:", a.nome) || "").trim();
  if (!nome) return;
  const box = (prompt("Box (deixe vazio para nenhum):", a.box || "") ?? a.box ?? "").trim();
  try {
    await updateDoc(doc(db, "atletas", id), { nome, box });
  } catch (err) {
    console.error(err);
    alert("Erro: " + (err.code || err.message));
  }
}

async function excluirAtleta(id) {
  const a = atletas.find((x) => x.id === id);
  if (!a) return;
  if (!confirm(`Excluir o atleta ${a.nome}? Os resultados dele também serão apagados.`)) return;
  try {
    await deleteDoc(doc(db, "atletas", id));
  } catch (err) {
    console.error(err);
    alert("Erro: " + (err.code || err.message));
  }
}

// ---------- Exportar CSV (abre no Excel) ----------
$("btn-csv").addEventListener("click", () => {
  const esc = (s) => {
    let t = String(s ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; // evita fórmulas no Excel
    return `"${t.replace(/"/g, '""')}"`;
  };
  const cab = ["Posição", "Atleta", "Box", ...EVENTO.provas.map((p) => `${p.label} (colocação)`), "Total de pontos"];
  const linhas = [cab];
  classificar(atletas).forEach((a) => {
    linhas.push([
      a.temResultado ? a.rank : "",
      a.nome,
      a.box || "",
      ...EVENTO.provas.map((p) => {
        const v = (a.posicoes || {})[p.id];
        return Number.isInteger(v) ? v : "";
      }),
      a.total
    ]);
  });
  const csv = "\ufeff" + linhas.map((l) => l.map(esc).join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "ranking-campeonato.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

$("btn-imprimir").addEventListener("click", () => window.print());
