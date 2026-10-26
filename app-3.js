import {
  collection, doc, onSnapshot, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";
import { EVENTO } from "./config.js";

// ---------- Elementos ----------
const $ = (id) => document.getElementById(id);
const elHorarios = $("horarios");
const form = $("form-reserva");
const inp1 = $("atleta1");
const inp2 = $("atleta2");
const btn = $("btn-reservar");
const resumo = $("resumo");
const erro = $("erro");

$("nome-evento").textContent = EVENTO.nome.toUpperCase();
$("local").textContent = EVENTO.local;
$("data-evento").textContent = EVENTO.data;

let selecionado = null;      // id do horário escolhido
let ocupacao = {};           // { "06h": { ocupadas, capacidade } }
let enviando = false;

// ---------- Vagas em tempo real ----------
// A página pública lê SOMENTE os contadores (coleção "horarios").
// Os nomes ficam na coleção "reservas", que só o admin consegue ler.
onSnapshot(
  collection(db, "horarios"),
  (snap) => {
    ocupacao = {};
    snap.forEach((d) => (ocupacao[d.id] = d.data()));
    renderHorarios();
  },
  () => {
    elHorarios.innerHTML = `<p class="erro">Não foi possível carregar os horários. Atualize a página.</p>`;
  }
);

// Horário exibido: o que o admin definiu no painel, senão o do config.js
function labelDe(id) {
  return ocupacao[id]?.label || EVENTO.horarios.find((h) => h.id === id)?.label || id;
}

function vagasDe(id) {
  const h = ocupacao[id];
  if (!h) return null;
  return Math.max(0, (h.capacidade ?? EVENTO.capacidadePorHorario) - (h.ocupadas ?? 0));
}

function renderHorarios() {
  elHorarios.innerHTML = "";
  EVENTO.horarios.forEach(({ id }) => {
    const label = labelDe(id);
    const vagas = vagasDe(id);
    const cap = ocupacao[id]?.capacidade ?? EVENTO.capacidadePorHorario;
    const esgotado = vagas === null || vagas < 2;
    if (esgotado && selecionado === id) selecionado = null;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (selecionado === id ? " selecionado" : "");
    b.disabled = esgotado;

    const pct = vagas === null ? 100 : ((cap - vagas) / cap) * 100;
    const duplas = Math.floor((vagas ?? 0) / 2);
    const textoVagas =
      vagas === null ? "Indisponível"
      : esgotado ? "Esgotado"
      : `${duplas} ${duplas === 1 ? "dupla restante" : "duplas restantes"}`;

    b.innerHTML = `
      <div class="hora">${label}</div>
      <div class="vagas">${textoVagas}</div>
      <div class="barra"><span style="width:${pct}%"></span></div>`;
    b.addEventListener("click", () => {
      selecionado = id;
      renderHorarios();
    });
    elHorarios.appendChild(b);
  });
  atualizarResumo();
}

// ---------- Formulário ----------
const limpar = (s) => s.replace(/\s+/g, " ").trim();

function atualizarResumo() {
  const n1 = limpar(inp1.value);
  const n2 = limpar(inp2.value);
  const label = selecionado ? labelDe(selecionado) : null;
  resumo.textContent = label
    ? `Horário escolhido: ${label}`
    : "Selecione um horário acima.";
  btn.disabled = enviando || !selecionado || n1.length < 3 || n2.length < 3;
}
inp1.addEventListener("input", atualizarResumo);
inp2.addEventListener("input", atualizarResumo);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  erro.textContent = "";

  const atleta1 = limpar(inp1.value);
  const atleta2 = limpar(inp2.value);
  if (!selecionado) return (erro.textContent = "Escolha um horário.");
  if (atleta1.length < 3 || atleta2.length < 3)
    return (erro.textContent = "Preencha o nome completo dos dois atletas.");
  if (atleta1.toLowerCase() === atleta2.toLowerCase())
    return (erro.textContent = "Os dois atletas precisam ser pessoas diferentes.");

  enviando = true;
  btn.disabled = true;
  btn.textContent = "Confirmando…";

  const horarioId = selecionado;
  const horarioRef = doc(db, "horarios", horarioId);
  const reservaRef = doc(collection(db, "reservas")); // id gerado

  try {
    // Transação: garante que duas duplas não peguem a última vaga ao mesmo tempo
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(horarioRef);
      if (!snap.exists()) throw new Error("HORARIO_INEXISTENTE");
      const { ocupadas = 0, capacidade } = snap.data();
      if (ocupadas + 2 > capacidade) throw new Error("LOTADO");

      tx.set(reservaRef, {
        horario: horarioId,
        atleta1,
        atleta2,
        criadoEm: serverTimestamp()
      });
      tx.update(horarioRef, {
        ocupadas: ocupadas + 2,
        ultimaReserva: reservaRef.id
      });
    });

    const label = labelDe(horarioId);
    $("conf-texto").innerHTML = "";
    const p = document.createElement("span");
    p.textContent = `${atleta1} & ${atleta2} — ${EVENTO.data}, às ${label}.`;
    $("conf-texto").appendChild(p);

    form.closest(".card").hidden = true;
    elHorarios.closest(".card").hidden = true;
    $("confirmacao").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    erro.textContent =
      err.message === "LOTADO"
        ? "Esse horário acabou de lotar. Escolha outro."
        : "Não foi possível confirmar. Tente novamente.";
  } finally {
    enviando = false;
    btn.textContent = "Confirmar presença";
    atualizarResumo();
  }
});

$("btn-nova").addEventListener("click", () => {
  form.reset();
  selecionado = null;
  $("confirmacao").hidden = true;
  form.closest(".card").hidden = false;
  elHorarios.closest(".card").hidden = false;
  renderHorarios();
});
