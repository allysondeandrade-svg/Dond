// Script NodeJS nativo para gerar SVG limpo com canal alpha transparente para Caixa e Avaria
const fs = require('fs');

// 1. Ícone da Caixa Isométrica (Escura com corte central e cantos arredondados do cartão)
const caixaSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <!-- Face Topo -->
  <polygon points="50,15 88,32 50,49 12,32" fill="#475569" stroke="#334155" stroke-width="1.5" />
  <!-- Linha de Abertura da Caixa -->
  <line x1="50" y1="15" x2="50" y2="49" stroke="#1e293b" stroke-width="2.5" stroke-linecap="round" />
  <!-- Face Esquerda -->
  <polygon points="12,32 50,49 50,85 12,68" fill="#334155" stroke="#1e293b" stroke-width="1.5" />
  <!-- Face Direita -->
  <polygon points="50,49 88,32 88,68 50,85" fill="#1e293b" stroke="#0f172a" stroke-width="1.5" />
</svg>`;

// 2. Ícone da Caneca com Rachadura (Avarias)
const avariaSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <!-- Alça da Caneca -->
  <path d="M 28 34 C 10 34 10 70 28 70" fill="none" stroke="#475569" stroke-width="8" stroke-linecap="round" />
  <!-- Corpo da Caneca -->
  <path d="M 32 20 L 78 20 C 82 20 85 55 83 80 C 82 86 78 88 74 88 L 36 88 C 32 88 28 86 27 80 C 25 55 28 20 32 20 Z" fill="#334155" />
  <!-- Borda Superior / Interior da Caneca -->
  <ellipse cx="55" cy="20" rx="23" ry="8" fill="#1e293b" stroke="#475569" stroke-width="2" />
  <!-- Rachadura Central -->
  <path d="M 58 24 L 54 36 L 62 48 L 51 60 L 58 72 L 44 82" fill="none" stroke="#0f172a" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" />
  <path d="M 58 72 L 64 78" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" />
</svg>`;

fs.writeFileSync('c:/Users/allys/OneDrive/Área de Trabalho/JBC ELETRO/APPS/Dond/caixa_icon.svg', caixaSvg);
fs.writeFileSync('c:/Users/allys/OneDrive/Área de Trabalho/JBC ELETRO/APPS/Dond/avaria_icon.svg', avariaSvg);
console.log('SVGs gerados com fundo 100% transparente!');
