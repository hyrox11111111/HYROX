import { EVENTO } from "./config.js";

// Colocação -> pontos (1º = pontosPrimeiro, -pontosPorPosicao a cada posição)
export function pontosDe(pos) {
  if (!Number.isInteger(pos) || pos < 1) return 0;
  return Math.max(0, EVENTO.pontosPrimeiro - (pos - 1) * EVENTO.pontosPorPosicao);
}

export function totalDe(atleta) {
  const p = atleta.posicoes || {};
  return EVENTO.provas.reduce((soma, pr) => soma + pontosDe(p[pr.id]), 0);
}

// Provas que já têm pelo menos um resultado lançado
export function provasLancadas(atletas) {
  return EVENTO.provas.filter((pr) =>
    atletas.some((a) => Number.isInteger((a.posicoes || {})[pr.id]))
  );
}

// Ordena por pontos; empate mantém a mesma colocação
export function classificar(atletas) {
  const lista = atletas.map((a) => ({
    ...a,
    total: totalDe(a),
    temResultado: EVENTO.provas.some((pr) => Number.isInteger((a.posicoes || {})[pr.id]))
  }));
  lista.sort(
    (x, y) => y.total - x.total || String(x.nome).localeCompare(String(y.nome), "pt-BR")
  );
  let rank = 0, anterior = null;
  lista.forEach((a, i) => {
    if (a.total !== anterior) { rank = i + 1; anterior = a.total; }
    a.rank = rank;
  });
  return lista;
}
