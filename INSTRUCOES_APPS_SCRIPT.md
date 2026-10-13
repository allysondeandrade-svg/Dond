# Guia de Configuração: Dond + Google Apps Script (Drive & Sheets)

Este guia explica como configurar e atualizar o backend gratuito no **Google Apps Script** para salvar automaticamente os dados na sua planilha do **Google Sheets** e todas as fotos e vídeos em pastas organizadas no seu **Google Drive**.

---

## ⚠️ Onde estão as fotos que você tirou hoje? (Acesso Imediato)

Se você acabou de tirar fotos e não está conseguindo baixar pelo aplicativo, **suas fotos foram salvas com segurança diretamente no seu Google Drive**!
Para acessar agora mesmo e não perder o prazo da disputa:
1. Abra o [Google Drive](https://drive.google.com) conectado na mesma conta da planilha.
2. Procure pela pasta chamada **`DOND_DISPUTAS_MIDIAS`**.
3. Dentro dela, você verá a pasta com a data de hoje (ex: `2026-10-13_..._SemPlat_SemPed`).
4. Todas as fotos tiradas (`01_Etiqueta.jpg`, `02_Caixa.jpg`, `04_Avaria_1.jpg`, etc.) estarão salvas lá dentro, prontas para download ou envio na disputa!

---

## 1. Atualizar o Código no Google Apps Script (Importante!)

Para que o aplicativo volte a exibir e baixar as fotos automaticamente na tela sem nunca mais perder os links:

1. Abra a sua planilha do Google Sheets: **`Dond - Disputas e Devoluções`**.
2. No menu superior da planilha, clique em **Extensões** $\rightarrow$ **Apps Script**.
3. Apague todo o código existente no editor `Código.gs`.
4. Abra o arquivo [google_apps_script.js](file:///c:/Users/allys/OneDrive/Área%20de%20Trabalho/JBC%20ELETRO/APPS/Dond/google_apps_script.js), copie todo o seu conteúdo e cole no editor do Apps Script.
5. Clique no ícone de **Salvar** (`Ctrl + S` ou ícone de disquete).

---

## 2. Publicar a Atualização da Versão (Web App)

Como a Web App já estava implantada, para ativar as novidades sem precisar mudar a URL:
1. No canto superior direito do Apps Script, clique em **Implantar** $\rightarrow$ **Gerenciar implantações**.
2. Selecione a implantação ativa no menu à esquerda e clique no ícone de **Lápis** (Editar) no canto superior direito da janela.
3. No campo **Versão**, mude de "Versão atual" para **Nova versão**.
4. *(Opcional)* Em descrição, digite: `Correção de links de mídias e auto-recuperação`.
5. Garanta que:
   - **Executar como**: **Eu**
   - **Quem pode acessar**: **Qualquer pessoa**
6. Clique no botão azul **Implantar**.
7. Pronto! A sua URL continuará exatamente a mesma, mas agora o Google Apps Script gravará os links no Sheets e fará a auto-recuperação das fotos antigas.

---

## 3. Estrutura da Planilha
A aba **`Pedidos`** é gerenciada automaticamente com 8 colunas:
1. `ID`
2. `Data`
3. `Plataforma`
4. `Produto`
5. `Pedido`
6. `Disputa`
7. `Pasta Drive` (Link direto para a pasta no Google Drive)
8. `Midias JSON` (Links individuais para cada foto/vídeo)

---

## Como as fotos e vídeos ficam organizados no Google Drive?
- Uma pasta principal chamada **`DOND_DISPUTAS_MIDIAS`** é criada automaticamente na raiz do seu Google Drive.
- Para cada registro finalizado, é criada uma subpasta nomeada com a data e pedido (exemplo: `2026-10-13_Shopee_1911818181`).
- Dentro da pasta ficam os arquivos nomeados:
  - `01_Etiqueta.jpg`
  - `02_Caixa.jpg`
  - `03_Video_Abertura.mp4`
  - `04_Avaria_1.jpg`, `04_Avaria_2.jpg`...
