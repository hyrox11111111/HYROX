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
  nome: "Hyrox",
  local: "Praça Evolution Cross Training",
  data: "Domingo, 01/11/2026",
  capacidadePorHorario: 12,           // pessoas por horário (12 = 6 duplas)
  horarios: [
    // ATENÇÃO: os "id" precisam ser os mesmos do arquivo firestore.rules
    { id: "06h", label: "06:00" },
    { id: "07h", label: "07:00" },
    { id: "08h", label: "08:00" },
    { id: "09h", label: "09:00" }
  ]
};
