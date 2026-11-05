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
  modalidade: "",              // texto pequeno acima do título (deixe "" para esconder)
  data: "",                    // ex.: "Sábado, 14/11/2026" (deixe "" para esconder)
  local: "",                   // ex.: "Box Central" (deixe "" para esconder)

  // Provas iniciais. Depois é só mexer no painel admin (seção "Provas"):
  // lá você adiciona, renomeia, reordena e escolhe o tipo de cada uma.
  // tipo: "tempo" (menor tempo vence) | "reps" (mais repetições vence) | "calorias" (mais calorias vence)
  provas: [
    { id: "w1",  label: "WOD 1",  tipo: "tempo" },
    { id: "w2",  label: "WOD 2",  tipo: "reps" },
    { id: "w3a", label: "WOD 3A", tipo: "tempo" },
    { id: "w3b", label: "WOD 3B", tipo: "calorias" }
  ]
};
