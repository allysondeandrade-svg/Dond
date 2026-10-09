# Guia de Configuração: Dond + Google Apps Script (Drive & Sheets)

Este guia explica como configurar o backend gratuito no **Google Apps Script** para salvar automaticamente os dados na sua planilha do **Google Sheets** e todas as fotos e vídeos em pastas organizadas no seu **Google Drive**.

---

## 1. Criar a Planilha no Google Sheets

1. Acesse [Google Sheets (Planilhas Google)](https://sheets.new) e crie uma nova planilha.
2. Nomeie a planilha como: **`Dond - Disputas e Devoluções`**.
3. *(Opcional)* O script cria as abas automaticamente se não existirem, mas a estrutura será:
   - **`Pedidos`**: Onde são registrados os envios (Data, Plataforma, Produto, Pedido, Disputa, Links do Drive).
   - **`Config_Produtos`**: Lista de produtos cadastrados.
   - **`Config_Plataformas`**: Lista de plataformas (Shopee, Mercado Livre, Amazon, etc.).

---

## 2. Instalar o Código no Google Apps Script

1. No menu superior da sua planilha, clique em **Extensões** $\rightarrow$ **Apps Script**.
2. Apague qualquer código existente no editor `Código.gs`.
3. Abra o arquivo [google_apps_script.js](file:///c:/Users/allys/OneDrive/Área%20de%20Trabalho/JBC%20ELETRO/APPS/Dond/google_apps_script.js) e copie todo o seu conteúdo.
4. Cole o código no editor do Apps Script.
5. Clique no ícone de **Salvar** (ícone de disquete ou `Ctrl + S`).

---

## 3. Publicar como Aplicativo da Web (Web App)

1. No canto superior direito do Apps Script, clique no botão azul **Implantar** $\rightarrow$ **Nova implantação**.
2. Na janela que abrir, clique na engrenagem ao lado de "Selecione o tipo" e escolha **App da Web**.
3. Preencha as opções exatamente assim:
   - **Descrição**: `Dond API v1`
   - **Executar como**: **Eu** (`seu-email@gmail.com`)
   - **Quem pode acessar**: **Qualquer pessoa** *(Importante: isso permite que seu app envie as fotos sem exigir login complexo)*.
4. Clique em **Implantar**.
5. O Google solicitará **Autorizar acesso**:
   - Escolha sua conta do Google.
   - Clique em **Avançado** (Advanced) $\rightarrow$ **Acessar Dond (não seguro)**.
   - Clique em **Permitir**.
6. Copie a **URL do app da Web** gerada (exemplo: `https://script.google.com/macros/s/AKfycbx.../exec`).

---

## 4. Conectar a URL no Aplicativo Dond

1. Abra o aplicativo **Dond** no navegador ou celular.
2. Clique no ícone de **Engrenagem** (Configurações) no canto superior direito.
3. Abra o menu **URL do Google Apps Script**.
4. Cole a URL copiada no passo anterior e clique em **Salvar URL**.
5. Pronto! Agora todos os cadastros de produtos, plataformas e registros de devoluções com fotos e vídeos serão salvos automaticamente no seu Google Drive e Sheets.

---

## Como as fotos e vídeos ficam organizados no Google Drive?
- Uma pasta principal chamada **`DOND_DISPUTAS_MIDIAS`** é criada automaticamente na raiz do seu Google Drive.
- Para cada registro finalizado, é criada uma subpasta nomeada com a data e pedido (exemplo: `2026-10-08_Shopee_1911818181`).
- Dentro da pasta ficam os arquivos nomeados:
  - `01_Etiqueta.jpg`
  - `02_Caixa.jpg`
  - `03_Video_Abertura.mp4`
  - `04_Avaria_1.jpg`, `04_Avaria_2.jpg`...
