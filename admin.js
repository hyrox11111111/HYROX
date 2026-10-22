import {
  collection, doc, onSnapshot, query, orderBy, runTransaction, getDoc, setDoc
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

  EVENTO.horarios.forEach(({ id, label }) => {
    const lista = reservas.filter((r) => r.horario === id);
    const h = ocupacao[id];
    const cap = h?.capacidade ?? EVENTO.capacidadePorHorario;

    const card = document.createElement("section");
    card.className = "card";
    card.innerHTML = `
      <h2>${label} <span class="contador">${h ? h.ocupadas : "—"}/${cap}</span></h2>`;

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

      const del = document.createElement("button");
      del.className = "btn-excluir";
      del.textContent = "Excluir";
      del.addEventListener("click", () => excluir(r));

      linha.append(info, del);
      card.appendChild(linha);
    });

    grid.appendChild(card);
  });
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
});

// ---------- Exportar CSV (abre no Excel) ----------
$("btn-csv").addEventListener("click", () => {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const linhas = [["Horário", "Atleta 1", "Atleta 2", "Data da reserva"]];
  EVENTO.horarios.forEach(({ id, label }) => {
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
