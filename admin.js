import {
  collection, doc, onSnapshot, query, orderBy, runTransaction, setDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { EVENTO } from "./config.js";

const $ = (id) => document.getElementById(id);
let reservas = [];
let ocupacao = {};
let unsubs = [];

// Horário exibido: o definido no painel, senão o do config.js
function labelDe(id) {
  return ocupacao[id]?.label || EVENTO.horarios.find((h) => h.id === id)?.label || id;
}

// Horários existentes, em ordem de hora
function idsOrdenados() {
  return Object.keys(ocupacao).sort((a, b) => labelDe(a).localeCompare(labelDe(b)));
}

// Valida "6", "06:30", "7h", "0730" -> "06:30"
function normalizarHora(txt) {
  const m = String(txt || "").trim().match(/^(\d{1,2})[:hH]?(\d{2})?$/);
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
}

const estiloBtn =
  "background:transparent;color:inherit;border:1px solid #2a2a2e;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px;";
const estiloInput =
  "display:inline-block;width:auto;margin:0;padding:6px 8px;font-size:15px;";

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
    onSnapshot(collection(db, "horarios"), (snap) => {
      ocupacao = {};
      snap.forEach((d) => (ocupacao[d.id] = d.data()));
      render();
    })
  );

  unsubs.push(
    onSnapshot(
      query(collection(db, "reservas"), orderBy("criadoEm", "asc")),
      (snap) => {
        reservas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        $("msg-admin").textContent = "";
        render();
      },
      () => {
        $("msg-admin").textContent =
          "Sem permissão para ver as reservas. Confira se o seu e-mail está no arquivo firestore.rules.";
      }
    )
  );
});

// ---------- Lista ----------
function render() {
  const grid = $("lista-admin");
  grid.innerHTML = "";

  // Cartão para adicionar um novo horário
  const novo = document.createElement("section");
  novo.className = "card";
  novo.innerHTML = `<h2>Novo horário</h2>`;
  const linhaNovo = document.createElement("div");
  linhaNovo.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;";
  const inpNovo = document.createElement("input");
  inpNovo.type = "time";
  inpNovo.style.cssText = estiloInput;
  const btnAdd = document.createElement("button");
  btnAdd.textContent = "Adicionar horário";
  btnAdd.style.cssText = estiloBtn;
  btnAdd.addEventListener("click", () => adicionarHorario(inpNovo.value));
  linhaNovo.append(inpNovo, btnAdd);
  novo.appendChild(linhaNovo);
  const dica = document.createElement("p");
  dica.className = "muted small";
  dica.textContent = `Começa com ${EVENTO.capacidadePorHorario / 2} duplas. Ajuste depois no − / +.`;
  novo.appendChild(dica);
  grid.appendChild(novo);

  idsOrdenados().forEach((id) => {
    const label = labelDe(id);
    const lista = reservas.filter((r) => r.horario === id);
    const h = ocupacao[id];
    const cap = h?.capacidade ?? EVENTO.capacidadePorHorario;

    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `
      <h2>${label} <span class="contador">${h ? h.ocupadas : "—"}/${cap}</span></h2>`;

    if (h) {
      // Alterar o horário + salvar / apagar
      const editar = document.createElement("div");
      editar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:-4px 0 12px;";
      const inpHora = document.createElement("input");
      inpHora.type = "time";
      inpHora.value = label;
      inpHora.style.cssText = estiloInput;
      const salvar = document.createElement("button");
      salvar.textContent = "Salvar";
      salvar.style.cssText = estiloBtn;
      salvar.addEventListener("click", () => alterarHorario(id, inpHora.value));
      const apagar = document.createElement("button");
      apagar.textContent = "Apagar horário";
      apagar.style.cssText = estiloBtn + "color:#ff5a5a;";
      apagar.addEventListener("click", () => apagarHorario(id));
      editar.append(inpHora, salvar, apagar);
      card.appendChild(editar);

      // Controle de quantidade de duplas
      const ctrl = document.createElement("div");
      ctrl.style.cssText =
        "display:flex;align-items:center;gap:10px;margin:-4px 0 12px;font-size:14px;";
      const lbl = document.createElement("span");
      lbl.className = "muted";
      lbl.textContent = "Duplas:";
      const menos = document.createElement("button");
      const mais = document.createElement("button");
      const qtd = document.createElement("strong");
      qtd.textContent = cap / 2;
      qtd.style.cssText = "min-width:24px;text-align:center;font-size:18px;";
      [menos, mais].forEach((b) => {
        b.className = "btn-ghost";
        b.style.cssText =
          "width:34px;height:34px;padding:0;border-radius:8px;cursor:pointer;font-size:18px;background:transparent;color:inherit;border:1px solid #2a2a2e;";
      });
      menos.textContent = "−";
      mais.textContent = "+";
      menos.addEventListener("click", () => mudarCapacidade(id, cap - 2, h.ocupadas || 0));
      mais.addEventListener("click", () => mudarCapacidade(id, cap + 2, h.ocupadas || 0));
      ctrl.append(lbl, menos, qtd, mais);
      card.appendChild(ctrl);
    }

    if (lista.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "muted small";
      vazio.textContent = "Nenhuma dupla ainda.";
      card.appendChild(vazio);
    }

    lista.forEach((r, i) => {
      const linha = document.createElement("div");
      linha.className = "dupla";
      const info = document.createElement("div");
      const p1 = document.createElement("p");
      p1.textContent = `${i + 1}. ${r.atleta1}`;
      const p2 = document.createElement("p");
      p2.textContent = `    ${r.atleta2}`;
      p2.className = "muted";
      info.append(p1, p2);

      const acoes = document.createElement("div");
      acoes.style.cssText = "display:flex;flex-direction:column;gap:6px;align-items:flex-end;";

      // Mover a dupla para outro horário
      const mover = document.createElement("select");
      mover.className = "btn-excluir";
      mover.style.cssText = "color:inherit;background:#151517;";
      const opt0 = document.createElement("option");
      opt0.textContent = "Mover para…";
      opt0.value = "";
      mover.appendChild(opt0);
      idsOrdenados()
        .filter((outro) => outro !== id)
        .forEach((outro) => {
          const op = document.createElement("option");
          op.value = outro;
          op.textContent = labelDe(outro);
          mover.appendChild(op);
        });
      mover.addEventListener("change", () => {
        if (mover.value) moverDupla(r, mover.value);
        mover.value = "";
      });

      const del = document.createElement("button");
      del.className = "btn-excluir";
      del.textContent = "Excluir";
      del.addEventListener("click", () => excluir(r));

      acoes.append(mover, del);
      linha.append(info, acoes);
      card.appendChild(linha);
    });

    grid.appendChild(card);
  });
}

// Já existe outro horário com essa hora?
function horaRepetida(label, ignorarId) {
  return Object.keys(ocupacao).some((i) => i !== ignorarId && labelDe(i) === label);
}

// ---------- Adicionar horário ----------
async function adicionarHorario(valor) {
  const label = normalizarHora(valor);
  if (!label) return alert("Escolha um horário válido, por exemplo 10:00.");
  if (horaRepetida(label)) return alert(`Já existe o horário ${label}.`);
  try {
    await setDoc(doc(collection(db, "horarios")), {
      label,
      ocupadas: 0,
      capacidade: EVENTO.capacidadePorHorario
    });
  } catch (e) {
    console.error(e);
    alert("Não foi possível adicionar: " + (e.code || e.message));
  }
}

// ---------- Alterar o horário de um turno ----------
async function alterarHorario(id, valor) {
  const label = normalizarHora(valor);
  if (!label) return alert("Escolha um horário válido, por exemplo 06:30.");
  if (label === labelDe(id)) return;
  if (horaRepetida(label, id)) return alert(`Já existe o horário ${label}.`);
  try {
    await updateDoc(doc(db, "horarios", id), { label });
  } catch (e) {
    console.error(e);
    alert("Não foi possível salvar: " + (e.code || e.message));
  }
}

// ---------- Apagar horário (só se não tiver duplas) ----------
async function apagarHorario(id) {
  const qtd = reservas.filter((r) => r.horario === id).length;
  if (qtd > 0) {
    return alert(`O horário ${labelDe(id)} tem ${qtd} dupla(s). Mova ou exclua as duplas antes de apagar.`);
  }
  if (!confirm(`Apagar o horário ${labelDe(id)}?`)) return;
  try {
    await deleteDoc(doc(db, "horarios", id));
  } catch (e) {
    console.error(e);
    alert("Não foi possível apagar: " + (e.code || e.message));
  }
}

// ---------- Mover dupla para outro horário ----------
async function moverDupla(r, destinoId) {
  if (!confirm(`Mover ${r.atleta1} & ${r.atleta2} para ${labelDe(destinoId)}?`)) return;
  const origemRef = doc(db, "horarios", r.horario);
  const destinoRef = doc(db, "horarios", destinoId);
  const reservaRef = doc(db, "reservas", r.id);
  try {
    await runTransaction(db, async (tx) => {
      const o = await tx.get(origemRef);
      const d = await tx.get(destinoRef);
      if (!d.exists()) throw new Error("Horário de destino não existe.");
      const dOcup = d.data().ocupadas || 0;
      if (dOcup + 2 > d.data().capacidade) throw new Error("O horário de destino está lotado.");
      tx.update(reservaRef, { horario: destinoId });
      tx.update(destinoRef, { ocupadas: dOcup + 2 });
      if (o.exists()) tx.update(origemRef, { ocupadas: Math.max(0, (o.data().ocupadas || 0) - 2) });
    });
  } catch (e) {
    console.error(e);
    alert("Não foi possível mover: " + (e.code || e.message));
  }
}

// ---------- Mudar quantidade de duplas ----------
async function mudarCapacidade(id, novaCap, ocupadas) {
  if (novaCap < 2) return;
  if (novaCap < ocupadas) {
    alert(`Já existem ${ocupadas / 2} duplas agendadas nesse horário. Exclua alguma antes de diminuir.`);
    return;
  }
  try {
    await updateDoc(doc(db, "horarios", id), { capacidade: novaCap });
  } catch (e) {
    console.error(e);
    alert("Não foi possível alterar: " + (e.code || e.message));
  }
}

// ---------- Excluir (libera as 2 vagas) ----------
async function excluir(r) {
  if (!confirm(`Excluir a dupla ${r.atleta1} & ${r.atleta2}?`)) return;
  const horarioRef = doc(db, "horarios", r.horario);
  const reservaRef = doc(db, "reservas", r.id);
  try {
    await runTransaction(db, async (tx) => {
      const h = await tx.get(horarioRef);
      tx.delete(reservaRef);
      if (h.exists()) {
        tx.update(horarioRef, { ocupadas: Math.max(0, (h.data().ocupadas || 0) - 2) });
      }
    });
  } catch (e) {
    console.error(e);
    alert("Não foi possível excluir.");
  }
}

// ---------- Criar horários padrão (só quando não há nenhum) ----------
$("btn-init").addEventListener("click", async () => {
  if (Object.keys(ocupacao).length) {
    $("msg-admin").textContent = "Os horários já existem. Use “Novo horário” para adicionar mais.";
    return;
  }
  try {
    for (const { id, label } of EVENTO.horarios) {
      await setDoc(doc(db, "horarios", id), {
        label,
        ocupadas: 0,
        capacidade: EVENTO.capacidadePorHorario
      });
    }
    $("msg-admin").textContent = "Horários padrão criados.";
  } catch (e) {
    console.error(e);
    $("msg-admin").textContent = "Erro ao criar horários: " + (e.code || e.message);
  }
});

// ---------- Exportar CSV (abre no Excel) ----------
$("btn-csv").addEventListener("click", () => {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Horário", "Atleta 1", "Atleta 2", "Data da reserva"]];
  idsOrdenados().forEach((id) => {
    const label = labelDe(id);
    reservas
      .filter((r) => r.horario === id)
      .forEach((r) =>
        linhas.push([
          label,
          r.atleta1,
          r.atleta2,
          r.criadoEm?.toDate ? r.criadoEm.toDate().toLocaleString("pt-BR") : ""
        ])
      );
  });
  const csv = "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "hyrox-duplas.csv";
  a.click();
});

$("btn-imprimir").addEventListener("click", () => window.print());
