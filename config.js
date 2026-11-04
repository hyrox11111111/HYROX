// =====================================================
//  CONFIGURAÇÕES — edite somente este arquivo
// =====================================================

// 1) Cole aqui a configuração do seu projeto Firebase
//    (Console Firebase > Configurações do projeto > Seus apps > Web)
export const firebaseConfig = {
  apiKey: "AIzaSyCE2w_eCfkZvRImBzj9eSePmNekN4JK8UY",
  authDomain: "hyrox-749a6.firebaseapp.com",
  projectId: "hyrox-749a6",
  storageBucket: "hyrox-749a6.firebasestorage.app",
  messagingSenderId: "191560500597",
  appId: "1:191560500597:web:e2af1ecde64d11a7acff3c"
};

// 2) Dados do evento
export const EVENTO = {
  nome: "Campeonato",          // título grande da página
  modalidade: "Crossfit",      // texto pequeno acima do título
  data: "",                    // ex.: "Sábado, 14/11/2026" (deixe "" para esconder)
  local: "",                   // ex.: "Box Central" (deixe "" para esconder)

  // Provas, na ordem em que acontecem. O WOD 3 vale 2 provas (3A e 3B).
  provas: [
    { id: "w1",  label: "WOD 1" },
    { id: "w2",  label: "WOD 2" },
    { id: "w3a", label: "WOD 3A" },
    { id: "w3b", label: "WOD 3B" }
  ],

  // Pontuação: 1º = 100, 2º = 95, 3º = 90...
  pontosPrimeiro: 100,
  pontosPorPosicao: 5
};
