# Planilha de Gastos Mensais 💰📊

Sistema completo e moderno para controle financeiro e despesas mensais, desenvolvido com **Node.js**, **Express**, **ExcelJS** e interface web rica e interativa.

---

## 🚀 Funcionalidades Principais

1. **Caixas de Escolha Rápidas de Categorias**:
   - 🛒 **Mercado**: Despesas com alimentação, compras e mantimentos.
   - 🏠 **Aluguel**: Moradia, condomínio e contas residenciais.
   - 🍿 **Lazer**: Cinema, passeios, viagens e restaurantes.
   - 📦 **Outros**: Demais despesas avulsas.

2. **Campo de Descrição Opcional**:
   - Espaço para especificar notas sobre cada gasto (ex: *"Compras da semana no Carrefour"*, *"Cinema com amigos"*).

3. **Gestão de Entradas de Dinheiro (Receitas)**:
   - Registro de salários, freelances, rendimentos ou Pix recebidos.
   - Cálculo automático do **Saldo Atual Líquido** (`Total de Entradas - Total de Saídas`).

4. **Gráfico de Pizza Dinâmico (Porcentagens)**:
   - Visualização interativa da distribuição percentual dos seus gastos em cada categoria.
   - Detalhes com valor em R$ e porcentagem (%) em tempo real.

5. **Planilha Excel Nativa (.xlsx)**:
   - Arquivo `Planilha_Gastos_Mensais.xlsx` gerado com formatação em Real (R$), cabeçalhos estilizados e fórmulas automáticas de soma (`SOMA`, `SOMASE`).
   - Botão de download direto no topo da tela.

6. **Persistência de Dados**:
   - Seus registros ficam salvos em `data/finances.json`. Nenhuma informação é perdida ao fechar o navegador.

---

## 🏁 Como Executar

### Opção 1: Atalho de 2 Cliques (Recomendado)
Dê um duplo clique no arquivo **`iniciar.bat`**. O servidor será iniciado e o navegador abrirá automaticamente em `http://localhost:3000`.

### Opção 2: Pelo Terminal / Linha de Comando
```bash
# Na pasta c:\Users\Pedro\IdeaProjects\Planilha
npm install
npm start
```
Acesse `http://localhost:3000` no seu navegador.

---

## 📁 Estrutura do Projeto

```
c:/Users/Pedro/IdeaProjects/Planilha/
├── iniciar.bat                 # Atalho para executar e abrir o navegador
├── package.json                # Dependências (express, exceljs, cors)
├── server.js                   # Servidor web e API REST
├── generate-excel.js           # Gerador de planilha Excel (.xlsx)
├── Planilha_Gastos_Mensais.xlsx# Arquivo Excel pronto gerado
├── data/
│   └── finances.json           # Banco de dados local em JSON
├── public/
│   ├── index.html              # Interface do usuário
│   ├── css/
│   │   └── style.css           # Estilos visuais com tema Dark & Glassmorphism
│   └── js/
│       └── app.js              # Lógica de interface e gráfico de pizza
└── README.md                   # Esta documentação
```
