import { EVENTO } from "./config.js";

// ---------- Tipos de prova ----------
export const TIPOS = {
  tempo:    { nome: "Tempo",       dica: "menor tempo vence",   placeholder: "mm:ss" },
  reps:     { nome: "Repetições",  dica: "mais repetições vence", placeholder: "reps" },
  calorias: { nome: "Calorias",    dica: "ergômetro: mais calorias vence", placeholder: "calorias" }
};

export function provasPadrao() {
  return EVENTO.provas.map((p) => ({ ...p }));
}

export function normalizarProvas(lista) {
  if (!Array.isArray(lista) || lista.length === 0) return provasPadrao();
  return lista
    .filter((p) => p && p.id)
    .map((p) => ({
      id: String(p.id),
      label: String(p.label || p.id),
      tipo: TIPOS[p.tipo] ? p.tipo : "tempo"
    }));
}

// ---------- Números ----------
export const arred = (n) => Math.round(n * 100) / 100;

export const fmt = (n) =>
  arred(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Aceita "87,5", "87.5", "-3", "10"
export function lerNumero(txt) {
  const t = String(txt).trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
  return Number(t);
}

// Aceita "12:34", "1:02:03", "12:34,5" ou só segundos ("95")
export function lerTempo(txt) {
  const t = String(txt).trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return NaN;
  const partes = t.split(":");
  if (partes.length > 3) return NaN;
  let total = 0;
  for (let i = 0; i < partes.length; i++) {
    const ultima = i === partes.length - 1;
    const padrao = ultima ? /^(\d+\.?\d*|\.\d+)$/ : /^\d+$/;
    if (!padrao.test(partes[i])) return NaN;
    total = total * 60 + Number(partes[i]);
  }
  return total;
}

export function fmtTempo(seg) {
  if (!Number.isFinite(seg)) return "";
  seg = arred(seg);
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = arred(seg - h * 3600 - m * 60);
  let sStr = String(s);
  if (s < 10) sStr = "0" + sStr;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sStr}` : `${m}:${sStr}`;
}

export function lerResultado(tipo, txt) {
  return tipo === "tempo" ? lerTempo(txt) : lerNumero(txt);
}

// Texto para mostrar no ranking
export function fmtResultado(tipo, v) {
  if (!Number.isFinite(v)) return "";
  if (tipo === "tempo") return fmtTempo(v);
  return `${fmt(v)} ${tipo === "reps" ? "reps" : "cal"}`;
}

// Texto para preencher o campo de edição
export function paraCampo(tipo, v) {
  if (!Number.isFinite(v)) return "";
  if (tipo === "tempo") return fmtTempo(v);
  return String(v).replace(".", ",");
}

// ---------- Ranking ----------
const num = (x) => Number.isFinite(x);

// Colocação em uma prova, pelo resultado: tempo = menor primeiro; reps e calorias = maior primeiro
export function colocacoes(atletas, prova) {
  const com = atletas.filter((a) => num((a.resultados || {})[prova.id]));
  const crescente = prova.tipo === "tempo";
  com.sort((x, y) =>
    crescente
      ? x.resultados[prova.id] - y.resultados[prova.id]
      : y.resultados[prova.id] - x.resultados[prova.id]
  );
  const mapa = new Map();
  let pos = 0, anterior = null;
  com.forEach((a, i) => {
    const v = a.resultados[prova.id];
    if (v !== anterior) { pos = i + 1; anterior = v; }
    mapa.set(a.id, pos);
  });
  return mapa;
}

export function totalDe(atleta, provas) {
  const p = atleta.pontos || {};
  return arred(provas.reduce((soma, pr) => soma + (num(p[pr.id]) ? p[pr.id] : 0), 0));
}

// Provas que já têm algum ponto ou resultado lançado
export function provasLancadas(atletas, provas) {
  return provas.filter((pr) =>
    atletas.some((a) => num((a.pontos || {})[pr.id]) || num((a.resultados || {})[pr.id]))
  );
}

// Ordena por pontos (maior primeiro); empate divide a mesma colocação
export function classificar(atletas, provas) {
  const mapas = {};
  provas.forEach((p) => { mapas[p.id] = colocacoes(atletas, p); });

  const lista = atletas.map((a) => ({
    ...a,
    total: totalDe(a, provas),
    colocacao: Object.fromEntries(provas.map((p) => [p.id, mapas[p.id].get(a.id)])),
    temResultado: provas.some(
      (p) => num((a.pontos || {})[p.id]) || num((a.resultados || {})[p.id])
    )
  }));

  lista.sort(
    (x, y) =>
      Number(y.temResultado) - Number(x.temResultado) ||
      y.total - x.total ||
      String(x.nome).localeCompare(String(y.nome), "pt-BR")
  );

  let rank = 0, anterior = null;
  lista.forEach((a, i) => {
    if (a.total !== anterior) { rank = i + 1; anterior = a.total; }
    a.rank = rank;
  });
  return lista;
}
