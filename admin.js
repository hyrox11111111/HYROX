import {
  collection, doc, onSnapshot, query, orderBy, runTransaction, getDoc, setDoc, updateDoc
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

  EVENTO.horarios.forEach(({ id }) => {
    const label = labelDe(id);
    const lista = reservas.filter((r) => r.horario === id);
    const h = ocupacao[id];
    const cap = h?.capacidade ?? EVENTO.capacidadePorHorario;

    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `
      <h2>${label} <span class="contador">${h ? h.ocupadas : "—"}/${cap}</span></h2>`;

    if (h) {
      // Botão para alterar o horário (ex.: 06:00 -> 06:30)
      const alterar = document.createElement("button");
      alterar.textContent = "Alterar horário";
      alterar.style.cssText =
        "background:transparent;color:inherit;border:1px solid #2a2a2e;border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px;margin:-6px 0 12px;";
      alterar.addEventListener("click", () => alterarHorario(id, label));
      card.appendChild(alterar);

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

    if (!h) {
      const aviso = document.createElement("p");
      aviso.className = "erro small";
      aviso.textContent = "Horário não criado. Clique em “Criar/verificar horários”.";
      card.appendChild(aviso);
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
      EVENTO.horarios
        .filter((o) => o.id !== id && ocupacao[o.id])
        .forEach((o) => {
          const op = document.createElement("option");
          op.value = o.id;
          op.textContent = labelDe(o.id);
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

// ---------- Alterar o horário de um turno ----------
async function alterarHorario(id, atual) {
  const novo = prompt(`Novo horário para ${atual} (formato HH:MM, ex.: 06:30):`, atual);
  if (novo === null) return;
  const m = novo.trim().match(/^(\d{1,2})[:hH]?(\d{2})?$/);
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) {
    alert("Horário inválido. Use o formato HH:MM, por exemplo 06:30.");
    return;
  }
  const label = `${m[1].padStart(2, "0")}:${m[2] || "00"}`;
  try {
    await updateDoc(doc(db, "horarios", id), { label });
  } catch (e) {
    console.error(e);
    alert("Não foi possível alterar: " + (e.code || e.message));
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

// ---------- Criar horários (rodar uma vez) ----------
$("btn-init").addEventListener("click", async () => {
  const criados = [];
  try {
    for (const { id } of EVENTO.horarios) {
      const ref = doc(db, "horarios", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, { ocupadas: 0, capacidade: EVENTO.capacidadePorHorario });
        criados.push(id);
      }
    }
    $("msg-admin").textContent = criados.length
      ? `Horários criados: ${criados.join(", ")}`
      : "Todos os horários já existem.";
  } catch (e) {
    console.error(e);
    $("msg-admin").textContent = "Erro ao criar horários: " + (e.code || e.message);
  }
});

// ---------- Exportar CSV (abre no Excel) ----------
$("btn-csv").addEventListener("click", () => {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Horário", "Atleta 1", "Atleta 2", "Data da reserva"]];
  EVENTO.horarios.forEach(({ id }) => {
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
