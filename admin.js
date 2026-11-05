import {
  collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase.js";
import {
  TIPOS, normalizarProvas, classificar, provasLancadas,
  lerNumero, lerResultado, paraCampo, fmt, fmtResultado
} from "./ranking.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, texto) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto !== undefined) e.textContent = texto;
  return e;
};
const num = (x) => Number.isFinite(x);
const norm = (t) =>
  String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const iniciais = (nome) => {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};

let atletas = [];
let provas = normalizarProvas(null);
let unsubs = [];
let filtroAdmin = "";
let chaveProvas = "";
const cards = new Map(); // id -> { root, nome, box, avatar, total, linhas: {provaId: {...}} }

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
      doc(db, "config", "evento"),
      (snap) => {
        provas = normalizarProvas(snap.exists() ? snap.data().provas : null);
        renderProvas();
        render();
      },
      () => {
        $("msg-admin").textContent =
          "Sem permissão para ler as provas. Publique as regras novas do Firestore.";
      }
    )
  );

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

// =====================================================
//  Provas (nome, tipo, ordem)
// =====================================================
async function salvarProvas(lista) {
  try {
    await setDoc(doc(db, "config", "evento"), { provas: lista }, { merge: true });
  } catch (e) {
    console.error(e);
    alert("Não foi possível salvar as provas: " + (e.code || e.message));
  }
}

function renderProvas() {
  const box = $("lista-provas");
  const ativo = document.activeElement;
  if (ativo && box.contains(ativo) && (ativo.tagName === "INPUT" || ativo.tagName === "SELECT")) return; // não atrapalha quem está digitando
  box.innerHTML = "";

  provas.forEach((p, i) => {
    const linha = el("div", "prova-edit");

    const nome = document.createElement("input");
    nome.value = p.label;
    nome.maxLength = 30;
    nome.setAttribute("aria-label", "Nome da prova");
    nome.addEventListener("change", () => {
      const v = nome.value.trim();
      if (!v) { nome.value = p.label; return; }
      salvarProvas(provas.map((x) => (x.id === p.id ? { ...x, label: v } : x)));
    });

    const tipo = document.createElement("select");
    tipo.setAttribute("aria-label", "Tipo da prova");
    Object.entries(TIPOS).forEach(([valor, t]) => {
      const o = document.createElement("option");
      o.value = valor;
      o.textContent = `${t.nome} (${t.dica})`;
      if (valor === p.tipo) o.selected = true;
      tipo.appendChild(o);
    });
    tipo.addEventListener("change", () => {
      salvarProvas(provas.map((x) => (x.id === p.id ? { ...x, tipo: tipo.value } : x)));
    });

    const acoes = el("div", "prova-acoes");
    const sobe = el("button", "btn btn-ghost", "↑");
    const desce = el("button", "btn btn-ghost", "↓");
    const apaga = el("button", "btn-excluir", "Excluir");
    [sobe, desce, apaga].forEach((b) => (b.type = "button"));
    sobe.disabled = i === 0;
    desce.disabled = i === provas.length - 1;
    sobe.setAttribute("aria-label", "Mover para cima");
    desce.setAttribute("aria-label", "Mover para baixo");
    sobe.addEventListener("click", () => mover(i, -1));
    desce.addEventListener("click", () => mover(i, 1));
    apaga.addEventListener("click", () => excluirProva(p));
    acoes.append(sobe, desce, apaga);

    linha.append(nome, tipo, acoes);
    box.appendChild(linha);
  });
}

function mover(i, delta) {
  const lista = provas.map((p) => ({ ...p }));
  const j = i + delta;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  salvarProvas(lista);
}

function excluirProva(p) {
  if (provas.length <= 1) { alert("O campeonato precisa de pelo menos uma prova."); return; }
  if (!confirm(`Excluir a prova "${p.label}"? Os pontos e resultados dela deixam de contar no ranking.`)) return;
  salvarProvas(provas.filter((x) => x.id !== p.id));
}

$("btn-add-prova").addEventListener("click", () => {
  const n = provas.length + 1;
  salvarProvas([...provas, { id: "p" + Date.now(), label: "WOD " + n, tipo: "tempo" }]);
});

// =====================================================
//  Lista de atletas (atualiza sem perder o foco dos campos)
// =====================================================
function render() {
  const grid = $("lista-admin");

  // Se as provas mudaram, refaz os cartões
  const chave = JSON.stringify(provas);
  if (chave !== chaveProvas) {
    chaveProvas = chave;
    cards.forEach((c) => c.root.remove());
    cards.clear();
  }

  const ranking = classificar(atletas, provas);
  const porId = new Map(ranking.map((a) => [a.id, a]));
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
    atualizarCard(c, porId.get(a.id));
    if (grid.children[i] !== c.root) grid.insertBefore(c.root, grid.children[i] || null);
  });

  ordenados.forEach((a) => {
    const c = cards.get(a.id);
    const ok = !filtroAdmin || norm(a.nome).includes(filtroAdmin) || norm(a.box).includes(filtroAdmin);
    c.root.hidden = !ok;
  });

  $("vazio").hidden = ordenados.length > 0;

  $("st-atletas").textContent = atletas.length;
  $("st-provas").textContent = `${provasLancadas(atletas, provas).length}/${provas.length}`;
  $("st-lider").textContent =
    ranking.length && ranking[0].temResultado ? String(ranking[0].nome).split(" ")[0] : "—";
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

  const provasBox = el("div", "provas-lista");
  const linhas = {};
  provas.forEach((p) => {
    const linha = el("div", "prova-linha");

    const cab = el("div", "pl-topo");
    const pnome = el("span", "pl-nome", p.label);
    const ptipo = el("span", "pl-tipo", TIPOS[p.tipo].nome);
    const pcol = el("span", "pl-col");
    cab.append(pnome, ptipo, pcol);

    const campoRes = el("label", "pl-campo");
    campoRes.appendChild(el("span", "", "Resultado"));
    const inRes = document.createElement("input");
    inRes.type = "text";
    inRes.inputMode = p.tipo === "tempo" ? "text" : "decimal";
    inRes.placeholder = TIPOS[p.tipo].placeholder;
    inRes.setAttribute("aria-label", `Resultado no ${p.label}`);
    inRes.addEventListener("input", () => inRes.classList.toggle("ok", inRes.value.trim() !== ""));
    inRes.addEventListener("change", () => salvarCampo(id, "resultados", p, inRes));
    campoRes.appendChild(inRes);

    const campoPts = el("label", "pl-campo");
    campoPts.appendChild(el("span", "", "Pontos"));
    const inPts = document.createElement("input");
    inPts.type = "text";
    inPts.inputMode = "decimal";
    inPts.placeholder = "0";
    inPts.setAttribute("aria-label", `Pontos no ${p.label}`);
    inPts.addEventListener("input", () => inPts.classList.toggle("ok", inPts.value.trim() !== ""));
    inPts.addEventListener("change", () => salvarCampo(id, "pontos", p, inPts));
    campoPts.appendChild(inPts);

    linha.append(cab, campoRes, campoPts);
    provasBox.appendChild(linha);
    linhas[p.id] = { inRes, inPts, pcol };
  });

  const acoes = el("div", "toolbar-btns");
  const editar = el("button", "btn btn-ghost", "Editar");
  editar.type = "button";
  editar.addEventListener("click", () => editarAtleta(id));
  const excluir = el("button", "btn-excluir", "Excluir atleta");
  excluir.type = "button";
  excluir.addEventListener("click", () => excluirAtleta(id));
  acoes.append(editar, excluir);

  root.append(topo, provasBox, acoes);
  return { root, nome, box, avatar, total, linhas };
}

function atualizarCard(c, a) {
  if (!a) return;
  c.nome.textContent = a.nome;
  c.avatar.textContent = iniciais(a.nome);
  c.box.textContent = a.box || "Sem box";
  c.total.textContent = `${fmt(a.total)} pts`;

  provas.forEach((p) => {
    const l = c.linhas[p.id];
    if (!l) return;
    const res = (a.resultados || {})[p.id];
    const pts = (a.pontos || {})[p.id];
    if (document.activeElement !== l.inRes) l.inRes.value = num(res) ? paraCampo(p.tipo, res) : "";
    if (document.activeElement !== l.inPts) l.inPts.value = num(pts) ? String(pts).replace(".", ",") : "";
    l.inRes.classList.toggle("ok", num(res));
    l.inPts.classList.toggle("ok", num(pts));
    const col = a.colocacao?.[p.id];
    l.pcol.textContent = col ? `${col}º` : "";
  });
}

// ---------- Lançar resultado / pontos ----------
async function salvarCampo(id, campo, prova, input) {
  const raw = input.value.trim();
  const ref = doc(db, "atletas", id);
  const caminho = `${campo}.${prova.id}`;

  const reverter = () => {
    const atual = (atletas.find((a) => a.id === id) || {})[campo]?.[prova.id];
    input.value = num(atual)
      ? campo === "resultados" ? paraCampo(prova.tipo, atual) : String(atual).replace(".", ",")
      : "";
    input.classList.toggle("ok", num(atual));
  };

  try {
    if (raw === "") {
      await updateDoc(ref, { [caminho]: deleteField() });
      return;
    }
    const v = campo === "resultados" ? lerResultado(prova.tipo, raw) : lerNumero(raw);
    if (!num(v) || (campo === "resultados" && v < 0)) {
      alert(
        campo === "resultados" && prova.tipo === "tempo"
          ? "Digite o tempo assim: 12:34 (minutos:segundos) ou 1:02:03."
          : "Digite um número (pode usar vírgula, ex.: 87,5)."
      );
      reverter();
      return;
    }
    await updateDoc(ref, { [caminho]: v });
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
      resultados: {},
      pontos: {},
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
  const cab = ["Posição", "Atleta", "Box"];
  provas.forEach((p) => cab.push(`${p.label} (resultado)`, `${p.label} (pontos)`));
  cab.push("Total de pontos");

  const linhas = [cab];
  classificar(atletas, provas).forEach((a) => {
    const l = [a.temResultado ? a.rank : "", a.nome, a.box || ""];
    provas.forEach((p) => {
      const res = (a.resultados || {})[p.id];
      const pts = (a.pontos || {})[p.id];
      l.push(num(res) ? fmtResultado(p.tipo, res) : "", num(pts) ? fmt(pts) : "");
    });
    l.push(fmt(a.total));
    linhas.push(l);
  });

  const csv = "\ufeff" + linhas.map((l) => l.map(esc).join(";")).join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "ranking-campeonato.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

$("btn-imprimir").addEventListener("click", () => window.print());
