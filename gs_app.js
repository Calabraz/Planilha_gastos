// ==========================================================================
// APLICAÇÃO MULTI-PLANILHAS (ESTILO GOOGLE SHEETS) - JAVASCRIPT FRONTEND
// ==========================================================================

let appState = {
  currentView: 'dashboard', // 'dashboard' | 'spreadsheet'
  activeSpreadsheetId: null,
  spreadsheets: [],
  currentSheet: {
    id: null,
    title: 'Minha Planilha',
    inflows: [],
    expenses: [],
    summary: {
      totalInflows: 0,
      totalExpenses: 0,
      balance: 0,
      categoryTotals: {},
      categoryPercentages: {}
    }
  }
};

let pieChartInstance = null;

// Formatação Monetária Brasileira (BRL)
function formatCurrency(value) {
  const num = parseFloat(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formatação de Data DD/MM/AAAA
function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Formatação de Data Amigável para o Cartão da Planilha
function formatDateTimeShort(isoStr) {
  if (!isoStr) return 'Recente';
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (e) {
    return 'Recente';
  }
}

// Helper para cálculo local de métricas (modo offline no celular e sincronização)
function calculateSheetSummary(sheet) {
  const inflows = sheet.inflows || [];
  const expenses = sheet.expenses || [];

  const totalInflows = inflows.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
  const totalExpenses = expenses.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
  const balance = totalInflows - totalExpenses;

  const categoryTotals = {
    'Mercado': 0,
    'Aluguel': 0,
    'Lazer': 0,
    'Reserva de Emergência': 0,
    'Transporte': 0,
    'Saúde': 0,
    'Contas Fixas': 0,
    'Educação': 0,
    'Outros': 0
  };

  expenses.forEach(exp => {
    const cat = exp.category || 'Outros';
    if (categoryTotals.hasOwnProperty(cat)) {
      categoryTotals[cat] += (parseFloat(exp.amount) || 0);
    } else {
      categoryTotals.Outros += (parseFloat(exp.amount) || 0);
    }
  });

  const categoryPercentages = {};
  for (const cat in categoryTotals) {
    categoryPercentages[cat] = totalExpenses > 0 
      ? Number(((categoryTotals[cat] / totalExpenses) * 100).toFixed(1)) 
      : 0;
  }

  return {
    totalInflows,
    totalExpenses,
    balance,
    categoryTotals,
    categoryPercentages,
    expenseCount: expenses.length,
    inflowCount: inflows.length
  };
}

// Detecta se está conectado diretamente ao servidor Node.js local (porta 3000)
function isServerMode() {
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalHost && window.location.port === '3000';
}

// ==========================================================================
// PERSISTÊNCIA LOCAL (LOCALSTORAGE) COM MIGRAÇÃO INTELIGENTE
// ==========================================================================
function saveToLocalStorage() {
  try {
    const payload = {
      activeSpreadsheetId: appState.activeSpreadsheetId,
      spreadsheets: appState.spreadsheets.map(s => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        inflows: s.inflows || [],
        expenses: s.expenses || []
      }))
    };
    localStorage.setItem('planilha_multi_data', JSON.stringify(payload));
  } catch (e) {
    console.warn('Erro ao salvar no LocalStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const stored = localStorage.getItem('planilha_multi_data');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.spreadsheets && parsed.spreadsheets.length > 0) {
        appState.spreadsheets = parsed.spreadsheets.map(s => ({
          ...s,
          summary: calculateSheetSummary(s)
        }));
        appState.activeSpreadsheetId = parsed.activeSpreadsheetId || appState.spreadsheets[0].id;
        return;
      }
    }

    // Migração de formato antigo (planilha_offline_data)
    const legacy = localStorage.getItem('planilha_offline_data');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      const migratedSheet = {
        id: 'sheet_default',
        title: 'Gastos de Setembro 2026',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        inflows: parsedLegacy.inflows || [],
        expenses: parsedLegacy.expenses || []
      };
      migratedSheet.summary = calculateSheetSummary(migratedSheet);
      appState.spreadsheets = [migratedSheet];
      appState.activeSpreadsheetId = 'sheet_default';
      saveToLocalStorage();
      return;
    }

    // Primeira inicialização com dados de demonstração
    setupInitialDemoData();
  } catch (e) {
    console.error('Erro ao carregar dados do LocalStorage:', e);
    setupInitialDemoData();
  }
}

function setupInitialDemoData() {
  const initialSheet = {
    id: 'sheet_1',
    title: 'Gastos de Setembro 2026',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inflows: [
      { id: 'inf_1', date: new Date().toISOString().split('T')[0], source: 'Salário Mensal', amount: 3500 }
    ],
    expenses: [
      { id: 'exp_1', date: new Date().toISOString().split('T')[0], category: 'Aluguel', description: 'Aluguel do mês', amount: 1200 },
      { id: 'exp_2', date: new Date().toISOString().split('T')[0], category: 'Mercado', description: 'Compras da semana', amount: 650 },
      { id: 'exp_3', date: new Date().toISOString().split('T')[0], category: 'Lazer', description: 'Restaurante e cinema', amount: 200 },
      { id: 'exp_4', date: new Date().toISOString().split('T')[0], category: 'Reserva de Emergência', description: 'Poupança de segurança', amount: 500 }
    ]
  };
  initialSheet.summary = calculateSheetSummary(initialSheet);
  appState.spreadsheets = [initialSheet];
  appState.activeSpreadsheetId = initialSheet.id;
  saveToLocalStorage();
}

// ==========================================================================
// INICIALIZAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupDates();
  setupChoiceCards();
  setupTabs();
  setupForms();
  setupSearch();
  setupDashboardSearch();
  setupModals();
  setupNavigation();
  setupExcelExport();
  fetchInitialData();
});

// Define datas padrão nos formulários
function setupDates() {
  const today = new Date().toISOString().split('T')[0];
  const expenseDateInput = document.getElementById('expenseDate');
  const inflowDateInput = document.getElementById('inflowDate');
  
  if (expenseDateInput) expenseDateInput.value = today;
  if (inflowDateInput) inflowDateInput.value = today;

  const currentMonthEl = document.getElementById('currentDateText');
  if (currentMonthEl) {
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const now = new Date();
    currentMonthEl.textContent = `${monthNames[now.getMonth()]} / ${now.getFullYear()}`;
  }
}

// ==========================================================================
// CARREGAR DADOS DA API OU LOCALSTORAGE (OFFLINE)
// ==========================================================================
async function fetchInitialData() {
  if (!isServerMode()) {
    console.log('Modo App Nativo APK / Offline ativo.');
    loadFromLocalStorage();
    renderDashboard();
    return;
  }

  try {
    const res = await fetch('/api/spreadsheets');
    const contentType = res.headers.get('content-type');
    if (!res.ok || !contentType || !contentType.includes('application/json')) {
      throw new Error('Servidor não retornou JSON');
    }
    const data = await res.json();
    appState.spreadsheets = data.spreadsheets || [];
    appState.activeSpreadsheetId = data.activeSpreadsheetId || (appState.spreadsheets[0] && appState.spreadsheets[0].id);

    // Carrega dados completos de cada planilha para cache local
    saveToLocalStorage();
    renderDashboard();
  } catch (err) {
    console.log('Servidor indisponível. Carregando dados locais...', err);
    loadFromLocalStorage();
    renderDashboard();
  }
}

// ==========================================================================
// NAVEGAÇÃO ENTRE TELAS (HUB DE PLANILHAS vs PLANILHA ABERTA)
// ==========================================================================
function setupNavigation() {
  const btnBack = document.getElementById('btnBackToDashboard');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      showDashboard();
    });
  }

  // Atalho para renomear clicando no título da planilha aberta
  const btnRenameHeader = document.getElementById('btnRenameHeader');
  const titleHeader = document.getElementById('currentSheetTitle');

  const openRenameForCurrent = () => {
    if (appState.currentSheet && appState.currentSheet.id) {
      openRenameModal(appState.currentSheet.id, appState.currentSheet.title);
    }
  };

  if (btnRenameHeader) btnRenameHeader.addEventListener('click', openRenameForCurrent);
  if (titleHeader) titleHeader.addEventListener('click', openRenameForCurrent);
}

function showDashboard() {
  appState.currentView = 'dashboard';
  document.getElementById('viewSpreadsheet').classList.add('hidden');
  document.getElementById('viewDashboard').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderDashboard();
}

async function openSpreadsheet(sheetId) {
  let sheet = appState.spreadsheets.find(s => s.id === sheetId);

  // Se estiver conectado ao servidor Node.js, busca os dados mais atualizados
  if (isServerMode()) {
    try {
      const res = await fetch(`/api/spreadsheets/${sheetId}`);
      if (res.ok) {
        const fullSheet = await res.json();
        sheet = fullSheet;
        // Atualiza no array de planilhas
        const idx = appState.spreadsheets.findIndex(s => s.id === sheetId);
        if (idx !== -1) appState.spreadsheets[idx] = fullSheet;
      }
    } catch (e) {
      console.warn('Erro ao obter planilha do servidor, usando versão local:', e);
    }
  }

  if (!sheet) {
    showToast('Planilha não encontrada.', 'error');
    return;
  }

  appState.currentView = 'spreadsheet';
  appState.activeSpreadsheetId = sheetId;
  appState.currentSheet = sheet;
  appState.currentSheet.summary = calculateSheetSummary(sheet);

  // Atualiza título no cabeçalho
  document.getElementById('currentSheetTitle').textContent = sheet.title;
  
  // Atualiza link de download do Excel
  const btnExcel = document.getElementById('btnDownloadExcel');
  if (btnExcel) {
    const safeName = sheet.title.replace(/[^a-zA-Z0-9_\-]/g, '_');
    btnExcel.href = `/api/spreadsheets/${sheetId}/export/excel`;
    btnExcel.download = `${safeName}.xlsx`;
  }

  // Alterna visualização
  document.getElementById('viewDashboard').classList.add('hidden');
  document.getElementById('viewSpreadsheet').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderUI();
}

// ==========================================================================
// RENDERIZAÇÃO DO HUB DE PLANILHAS (TELA INICIAL)
// ==========================================================================
function renderDashboard(filterTerm = '') {
  const grid = document.getElementById('spreadsheetsGrid');
  const emptyNotice = document.getElementById('emptySpreadsheetsNotice');
  if (!grid) return;

  const term = filterTerm.toLowerCase().trim();
  const list = appState.spreadsheets.filter(s => s.title.toLowerCase().includes(term));

  // 1. Calcula Métricas Consolidadas de Todas as Planilhas
  let totalConsolidatedInflows = 0;
  let totalConsolidatedExpenses = 0;

  appState.spreadsheets.forEach(s => {
    const sum = s.summary || calculateSheetSummary(s);
    totalConsolidatedInflows += sum.totalInflows;
    totalConsolidatedExpenses += sum.totalExpenses;
  });

  const consolidatedBalance = totalConsolidatedInflows - totalConsolidatedExpenses;

  document.getElementById('hubTotalSheets').textContent = appState.spreadsheets.length;
  document.getElementById('hubTotalInflows').textContent = formatCurrency(totalConsolidatedInflows);
  document.getElementById('hubTotalExpenses').textContent = formatCurrency(totalConsolidatedExpenses);
  
  const balanceEl = document.getElementById('hubTotalBalance');
  balanceEl.textContent = formatCurrency(consolidatedBalance);
  balanceEl.style.color = consolidatedBalance >= 0 ? '#10b981' : '#f43f5e';

  // 2. Renderiza Grade de Cartões
  if (list.length === 0) {
    grid.innerHTML = '';
    emptyNotice.style.display = 'block';
    return;
  }

  emptyNotice.style.display = 'none';

  grid.innerHTML = list.map(sheet => {
    const sum = sheet.summary || calculateSheetSummary(sheet);
    const balanceClass = sum.balance >= 0 ? 'positive' : 'negative';
    const balanceBadgeText = sum.balance >= 0 ? 'Saldo Positivo' : 'Em Déficit';

    return `
      <div class="sheet-card" onclick="openSpreadsheet('${sheet.id}')">
        <div>
          <div class="sheet-card-top">
            <div class="sheet-card-main">
              <div class="sheet-card-icon">📑</div>
              <div class="sheet-card-title-group">
                <h3 class="sheet-card-title" title="${escapeHtml(sheet.title)}">${escapeHtml(sheet.title)}</h3>
                <span class="sheet-card-date">Modificado em: ${formatDateTimeShort(sheet.updatedAt || sheet.createdAt)}</span>
              </div>
            </div>

            <!-- Botões de Ação no Cartão -->
            <div class="sheet-card-actions" onclick="event.stopPropagation();">
              <button class="btn-sheet-action btn-action-rename" onclick="openRenameModal('${sheet.id}', '${escapeHtml(sheet.title)}')" title="Renomear Planilha">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                </svg>
              </button>
              <button class="btn-sheet-action" onclick="duplicateSpreadsheet('${sheet.id}')" title="Duplicar Planilha">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              </button>
              <button class="btn-sheet-action btn-action-delete" onclick="deleteSpreadsheet('${sheet.id}')" title="Excluir Planilha">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Mini Resumo Financeiro da Planilha -->
          <div class="sheet-card-metrics" style="margin-top: 1rem;">
            <div class="sheet-mini-metric">
              <span class="sheet-mini-label">Entradas</span>
              <span class="sheet-mini-val val-inflow">+${formatCurrency(sum.totalInflows)}</span>
            </div>
            <div class="sheet-mini-metric">
              <span class="sheet-mini-label">Gastos</span>
              <span class="sheet-mini-val val-expense">-${formatCurrency(sum.totalExpenses)}</span>
            </div>
          </div>
        </div>

        <div class="sheet-card-footer">
          <span class="sheet-balance-badge ${balanceClass}">
            ${balanceBadgeText}: ${formatCurrency(sum.balance)}
          </span>
          <button class="btn-open-sheet">
            <span>Abrir</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================================================
// MODAIS: CRIAR & RENOMEAR PLANILHA
// ==========================================================================
function setupModals() {
  const modalNew = document.getElementById('modalNewSheet');
  const modalRename = document.getElementById('modalRenameSheet');
  
  // Abrir Modal de Nova Planilha
  const btnOpenNew = document.getElementById('btnOpenNewSheetModal');
  if (btnOpenNew) {
    btnOpenNew.addEventListener('click', () => {
      const input = document.getElementById('inputNewSheetTitle');
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const now = new Date();
      const nextMonthIdx = (now.getMonth() + 1) % 12;
      input.value = `Gastos de ${monthNames[nextMonthIdx]} ${now.getFullYear()}`;
      modalNew.style.display = 'flex';
      setTimeout(() => input.focus(), 100);
    });
  }

  // Fechar Modais
  document.getElementById('btnCloseNewSheetModal').addEventListener('click', () => modalNew.style.display = 'none');
  document.getElementById('btnCancelNewSheet').addEventListener('click', () => modalNew.style.display = 'none');
  document.getElementById('btnCloseRenameModal').addEventListener('click', () => modalRename.style.display = 'none');
  document.getElementById('btnCancelRename').addEventListener('click', () => modalRename.style.display = 'none');

  // Submissão: Criar Nova Planilha
  document.getElementById('formCreateSheet').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('inputNewSheetTitle').value.trim();
    if (!title) return;

    modalNew.style.display = 'none';
    await createSpreadsheet(title);
  });

  // Submissão: Renomear Planilha
  document.getElementById('formRenameSheet').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('inputRenameSheetId').value;
    const newTitle = document.getElementById('inputRenameSheetTitle').value.trim();
    if (!newTitle) return;

    modalRename.style.display = 'none';
    await renameSpreadsheet(id, newTitle);
  });
}

function openRenameModal(sheetId, currentTitle) {
  const modalRename = document.getElementById('modalRenameSheet');
  const inputId = document.getElementById('inputRenameSheetId');
  const inputTitle = document.getElementById('inputRenameSheetTitle');

  inputId.value = sheetId;
  inputTitle.value = currentTitle;
  modalRename.style.display = 'flex';
  setTimeout(() => inputTitle.focus(), 100);
}

// ==========================================================================
// AÇÕES CRUD DE PLANILHAS
// ==========================================================================
async function createSpreadsheet(title) {
  const newSheet = {
    id: 'sheet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inflows: [],
    expenses: []
  };
  newSheet.summary = calculateSheetSummary(newSheet);

  appState.spreadsheets.unshift(newSheet);
  appState.activeSpreadsheetId = newSheet.id;
  saveToLocalStorage();
  showToast(`Planilha "${title}" criada com sucesso!`, 'success');

  // Sincroniza com servidor Node.js se ativo
  if (isServerMode()) {
    try {
      await fetch('/api/spreadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      });
    } catch (err) {
      console.log('Sync offline:', err);
    }
  }

  // Abre diretamente a nova planilha
  openSpreadsheet(newSheet.id);
}

async function renameSpreadsheet(sheetId, newTitle) {
  const sheet = appState.spreadsheets.find(s => s.id === sheetId);
  if (!sheet) return;

  sheet.title = newTitle;
  sheet.updatedAt = new Date().toISOString();
  saveToLocalStorage();

  // Se for a planilha aberta atualmente, atualiza o título na tela
  if (appState.currentSheet && appState.currentSheet.id === sheetId) {
    appState.currentSheet.title = newTitle;
    document.getElementById('currentSheetTitle').textContent = newTitle;
  }

  renderDashboard();
  showToast(`Planilha renomeada para "${newTitle}"!`, 'success');

  // Sincroniza com servidor Node.js se ativo
  if (isServerMode()) {
    try {
      await fetch(`/api/spreadsheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
    } catch (err) {
      console.log('Sync offline:', err);
    }
  }
}

async function duplicateSpreadsheet(sheetId) {
  const original = appState.spreadsheets.find(s => s.id === sheetId);
  if (!original) return;

  const clone = {
    id: 'sheet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: `${original.title} (Cópia)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inflows: JSON.parse(JSON.stringify(original.inflows || [])),
    expenses: JSON.parse(JSON.stringify(original.expenses || []))
  };
  clone.summary = calculateSheetSummary(clone);

  appState.spreadsheets.unshift(clone);
  saveToLocalStorage();
  renderDashboard();
  showToast(`Cópia da planilha criada com sucesso!`, 'success');

  if (isServerMode()) {
    try {
      await fetch('/api/spreadsheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: clone.title })
      });
    } catch (err) {
      console.log('Sync offline:', err);
    }
  }
}

async function deleteSpreadsheet(sheetId) {
  const sheet = appState.spreadsheets.find(s => s.id === sheetId);
  if (!sheet) return;

  if (!confirm(`Deseja realmente excluir a planilha "${sheet.title}"?\nTodos os lançamentos dela serão removidos.`)) {
    return;
  }

  appState.spreadsheets = appState.spreadsheets.filter(s => s.id !== sheetId);

  // Se excluiu todas, cria uma vazia padrão
  if (appState.spreadsheets.length === 0) {
    setupInitialDemoData();
  }

  saveToLocalStorage();
  renderDashboard();
  showToast('Planilha removida com sucesso.', 'success');

  if (isServerMode()) {
    try {
      await fetch(`/api/spreadsheets/${sheetId}`, { method: 'DELETE' });
    } catch (err) {
      console.log(err);
    }
  }
}

// Busca rápida de planilhas na tela inicial
function setupDashboardSearch() {
  const input = document.getElementById('dashboardSearchInput');
  if (!input) return;

  input.addEventListener('input', (e) => {
    renderDashboard(e.target.value);
  });
}

// ==========================================================================
// CAIXINHAS DE ESCOLHA DE CATEGORIA (Mercado, Aluguel, Lazer, Outros)
// ==========================================================================
function setupChoiceCards() {
  const cards = document.querySelectorAll('.choice-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });
}

// ==========================================================================
// ABAS DE FORMULÁRIO E TABELAS
// ==========================================================================
function setupTabs() {
  const tabExpenseBtn = document.getElementById('tabExpenseBtn');
  const tabInflowBtn = document.getElementById('tabInflowBtn');
  const formExpense = document.getElementById('formExpense');
  const formInflow = document.getElementById('formInflow');

  tabExpenseBtn.addEventListener('click', () => {
    tabExpenseBtn.classList.add('active');
    tabInflowBtn.classList.remove('active');
    formExpense.classList.remove('hidden-form');
    formExpense.classList.add('active-form');
    formInflow.classList.add('hidden-form');
    formInflow.classList.remove('active-form');
  });

  tabInflowBtn.addEventListener('click', () => {
    tabInflowBtn.classList.add('active');
    tabExpenseBtn.classList.remove('active');
    formInflow.classList.remove('hidden-form');
    formInflow.classList.add('active-form');
    formExpense.classList.add('hidden-form');
    formExpense.classList.remove('active-form');
  });

  const btnShowExpenses = document.getElementById('btnShowExpensesTable');
  const btnShowInflows = document.getElementById('btnShowInflowsTable');
  const expensesTableContainer = document.getElementById('expensesTableContainer');
  const inflowsTableContainer = document.getElementById('inflowsTableContainer');

  btnShowExpenses.addEventListener('click', () => {
    btnShowExpenses.classList.add('active');
    btnShowInflows.classList.remove('active');
    expensesTableContainer.classList.remove('hidden');
    inflowsTableContainer.classList.add('hidden');
  });

  btnShowInflows.addEventListener('click', () => {
    btnShowInflows.classList.add('active');
    btnShowExpenses.classList.remove('active');
    inflowsTableContainer.classList.remove('hidden');
    expensesTableContainer.classList.add('hidden');
  });
}

// ==========================================================================
// RENDERIZAÇÃO GERAL DA PLANILHA ABERTA
// ==========================================================================
function renderUI() {
  renderKPIs();
  renderPieChart();
  renderExpensesTable();
  renderInflowsTable();
}

// Renderiza Cards de Indicadores da Planilha Ativa
function renderKPIs() {
  const { totalInflows, totalExpenses, balance } = appState.currentSheet.summary;

  document.getElementById('kpiTotalInflows').textContent = formatCurrency(totalInflows);
  document.getElementById('kpiTotalExpenses').textContent = formatCurrency(totalExpenses);
  
  const kpiBalance = document.getElementById('kpiBalance');
  kpiBalance.textContent = formatCurrency(balance);

  const balanceStatusBadge = document.getElementById('balanceStatusBadge');
  if (balance >= 0) {
    balanceStatusBadge.textContent = 'Balanço Positivo';
    balanceStatusBadge.className = 'status-indicator positive';
  } else {
    balanceStatusBadge.textContent = 'No Vermelho (Déficit)';
    balanceStatusBadge.className = 'status-indicator negative';
  }

  const inflows = appState.currentSheet.inflows || [];
  const expenses = appState.currentSheet.expenses || [];

  document.getElementById('inflowsCount').textContent = `${inflows.length} entrada(s) registrada(s)`;
  document.getElementById('expensesCount').textContent = `${expenses.length} despesa(s) registrada(s)`;
  document.getElementById('tableExpensesCount').textContent = expenses.length;
  document.getElementById('tableInflowsCount').textContent = inflows.length;
}

// ==========================================================================
// GRÁFICO DE PIZZA (PORCENTAGEM POR CATEGORIA: Mercado, Aluguel, Lazer...)
// ==========================================================================
function renderPieChart() {
  const canvas = document.getElementById('pieChartExpenses');
  const emptyNotice = document.getElementById('emptyChartMessage');
  const statsContainer = document.getElementById('categoryStatsContainer');
  
  const { totalExpenses, categoryTotals, categoryPercentages } = appState.currentSheet.summary;

  if (totalExpenses <= 0) {
    canvas.style.display = 'none';
    emptyNotice.style.display = 'block';
    statsContainer.innerHTML = '';
    return;
  }

  canvas.style.display = 'block';
  emptyNotice.style.display = 'none';

  const categoryConfig = {
    'Mercado':               { label: 'Mercado',            icon: '🛒', color: '#10b981', border: '#059669' },
    'Aluguel':               { label: 'Aluguel',            icon: '🏠', color: '#6366f1', border: '#4f46e5' },
    'Lazer':                 { label: 'Lazer',              icon: '🍿', color: '#ec4899', border: '#db2777' },
    'Reserva de Emergência': { label: 'Reserva Emergência', icon: '🛡️', color: '#0284c7', border: '#0369a1' },
    'Transporte':            { label: 'Transporte',         icon: '🚗', color: '#8b5cf6', border: '#7c3aed' },
    'Saúde':                 { label: 'Saúde',              icon: '💊', color: '#14b8a6', border: '#0d9488' },
    'Contas Fixas':          { label: 'Contas Fixas',       icon: '⚡', color: '#f97316', border: '#ea580c' },
    'Educação':              { label: 'Educação',           icon: '📚', color: '#06b6d4', border: '#0891b2' },
    'Outros':                { label: 'Outros',             icon: '📦', color: '#f59e0b', border: '#d97706' }
  };

  const labels = [];
  const dataValues = [];
  const backgroundColors = [];
  const borderColors = [];

  for (const cat in categoryTotals) {
    if (categoryTotals[cat] > 0) {
      const cfg = categoryConfig[cat] || categoryConfig.Outros;
      labels.push(cfg.label || cat);
      dataValues.push(categoryTotals[cat]);
      backgroundColors.push(cfg.color);
      borderColors.push(cfg.border);
    }
  }

  if (pieChartInstance) {
    pieChartInstance.data.labels = labels;
    pieChartInstance.data.datasets[0].data = dataValues;
    pieChartInstance.data.datasets[0].backgroundColor = backgroundColors;
    pieChartInstance.data.datasets[0].borderColor = borderColors;
    pieChartInstance.update();
  } else {
    const ctx = canvas.getContext('2d');
    pieChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 2,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#f8fafc',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            boxPadding: 6,
            callbacks: {
              label: function(context) {
                const val = context.raw;
                const pct = ((val / totalExpenses) * 100).toFixed(1);
                return ` ${formatCurrency(val)} (${pct}%)`;
              }
            }
          }
        },
        animation: {
          animateScale: true,
          animateRotate: true
        }
      }
    });
  }

  // Estatísticas abaixo do gráfico
  let html = '';
  const allCategories = [
    'Mercado', 'Aluguel', 'Lazer', 'Reserva de Emergência',
    'Transporte', 'Saúde', 'Contas Fixas', 'Educação', 'Outros'
  ];

  const displayCategories = allCategories.filter(c => (categoryTotals[c] || 0) > 0);
  if (displayCategories.length < 4) {
    allCategories.forEach(c => {
      if (!displayCategories.includes(c) && displayCategories.length < 5) {
        displayCategories.push(c);
      }
    });
  }

  displayCategories.forEach(cat => {
    const total = categoryTotals[cat] || 0;
    const pct = categoryPercentages[cat] || 0;
    const cfg = categoryConfig[cat] || categoryConfig.Outros;

    html += `
      <div class="cat-stat-item">
        <div class="cat-stat-left">
          <span class="cat-color-dot" style="background-color: ${cfg.color};"></span>
          <span class="cat-stat-name">${cfg.icon} ${cfg.label}</span>
        </div>
        <div class="cat-stat-right">
          <span class="cat-stat-val">${formatCurrency(total)}</span>
          <span class="cat-stat-pct" style="color: ${cfg.color}; background: ${cfg.color}18;">${pct}%</span>
        </div>
      </div>
    `;
  });
  statsContainer.innerHTML = html;
}

// ==========================================================================
// TABELA DE GASTOS
// ==========================================================================
function renderExpensesTable(filtered = null) {
  const tbody = document.getElementById('expensesTableBody');
  const emptyNotice = document.getElementById('emptyExpensesNotice');
  const list = filtered || (appState.currentSheet && appState.currentSheet.expenses) || [];

  if (list.length === 0) {
    tbody.innerHTML = '';
    emptyNotice.style.display = 'block';
    return;
  }

  emptyNotice.style.display = 'none';

  const categoryIcons = {
    'Mercado': '🛒',
    'Aluguel': '🏠',
    'Lazer': '🍿',
    'Reserva de Emergência': '🛡️',
    'Transporte': '🚗',
    'Saúde': '💊',
    'Contas Fixas': '⚡',
    'Educação': '📚',
    'Outros': '📦'
  };

  tbody.innerHTML = list.map(exp => {
    const icon = categoryIcons[exp.category] || '📦';
    const catClass = (exp.category || 'Outros').toLowerCase().replace(/\s+/g, '-');
    const descText = exp.description ? escapeHtml(exp.description) : '<span class="text-muted-desc">Sem descrição</span>';

    return `
      <tr id="row_${exp.id}">
        <td><strong>${formatDate(exp.date)}</strong></td>
        <td>
          <span class="badge-cat badge-cat-${catClass}">
            <span class="badge-icon">${icon}</span>
            <span>${escapeHtml(exp.category)}</span>
          </span>
        </td>
        <td class="col-desc">${descText}</td>
        <td class="text-right val-expense">-${formatCurrency(exp.amount)}</td>
        <td class="text-center">
          <button class="btn-delete" onclick="deleteExpense('${exp.id}')" title="Excluir Gasto">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// TABELA DE ENTRADAS DE DINHEIRO
// ==========================================================================
function renderInflowsTable(filtered = null) {
  const tbody = document.getElementById('inflowsTableBody');
  const emptyNotice = document.getElementById('emptyInflowsNotice');
  const list = filtered || (appState.currentSheet && appState.currentSheet.inflows) || [];

  if (list.length === 0) {
    tbody.innerHTML = '';
    emptyNotice.style.display = 'block';
    return;
  }

  emptyNotice.style.display = 'none';

  tbody.innerHTML = list.map(inf => {
    return `
      <tr id="row_${inf.id}">
        <td><strong>${formatDate(inf.date)}</strong></td>
        <td><strong>${escapeHtml(inf.source)}</strong></td>
        <td class="text-right val-inflow">+${formatCurrency(inf.amount)}</td>
        <td class="text-center">
          <button class="btn-delete" onclick="deleteInflow('${inf.id}')" title="Excluir Entrada">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================================================
// SUBMISSÃO DOS FORMULÁRIOS
// ==========================================================================
function setupForms() {
  // Submissão do Gasto
  const formExpense = document.getElementById('formExpense');
  formExpense.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!appState.currentSheet || !appState.currentSheet.id) {
      showToast('Nenhuma planilha selecionada.', 'error');
      return;
    }

    const selectedRadio = document.querySelector('input[name="expenseCategory"]:checked');
    const category = selectedRadio ? selectedRadio.value : 'Mercado';
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;
    const description = document.getElementById('expenseDesc').value;

    if (!amount || amount <= 0) {
      showToast('Por favor, informe um valor válido para o gasto.', 'error');
      return;
    }

    const newExpense = {
      id: 'exp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      date: date || new Date().toISOString().split('T')[0],
      category,
      description: (description || '').trim(),
      amount: amount
    };

    // Salva localmente (funciona no APK e offline com 100% de confiabilidade)
    appState.currentSheet.expenses = appState.currentSheet.expenses || [];
    appState.currentSheet.expenses.unshift(newExpense);
    appState.currentSheet.updatedAt = new Date().toISOString();
    appState.currentSheet.summary = calculateSheetSummary(appState.currentSheet);

    // Atualiza também na lista principal de planilhas
    const idx = appState.spreadsheets.findIndex(s => s.id === appState.currentSheet.id);
    if (idx !== -1) {
      appState.spreadsheets[idx] = appState.currentSheet;
    }

    saveToLocalStorage();
    renderUI();

    // Limpa campos
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDesc').value = '';
    showToast(`Gasto em ${category} salvo com sucesso!`, 'success');

    // Sincroniza em segundo plano se houver servidor Node.js
    if (isServerMode()) {
      fetch(`/api/spreadsheets/${appState.currentSheet.id}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExpense)
      }).catch(err => console.log('Sync offline:', err));
    }
  });

  // Submissão da Entrada de Dinheiro
  const formInflow = document.getElementById('formInflow');
  formInflow.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!appState.currentSheet || !appState.currentSheet.id) {
      showToast('Nenhuma planilha selecionada.', 'error');
      return;
    }

    const source = document.getElementById('inflowSource').value;
    const amount = parseFloat(document.getElementById('inflowAmount').value);
    const date = document.getElementById('inflowDate').value;

    if (!source.trim()) {
      showToast('Informe a origem/fonte da entrada.', 'error');
      return;
    }

    if (!amount || amount <= 0) {
      showToast('Por favor, informe um valor válido para a entrada.', 'error');
      return;
    }

    const newInflow = {
      id: 'inf_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      date: date || new Date().toISOString().split('T')[0],
      source: source.trim(),
      amount: amount
    };

    appState.currentSheet.inflows = appState.currentSheet.inflows || [];
    appState.currentSheet.inflows.unshift(newInflow);
    appState.currentSheet.updatedAt = new Date().toISOString();
    appState.currentSheet.summary = calculateSheetSummary(appState.currentSheet);

    const idx = appState.spreadsheets.findIndex(s => s.id === appState.currentSheet.id);
    if (idx !== -1) {
      appState.spreadsheets[idx] = appState.currentSheet;
    }

    saveToLocalStorage();
    renderUI();

    // Limpa campos
    document.getElementById('inflowSource').value = '';
    document.getElementById('inflowAmount').value = '';
    showToast('Entrada de dinheiro registrada com sucesso!', 'success');

    // Sincroniza em segundo plano se houver servidor Node.js
    if (isServerMode()) {
      fetch(`/api/spreadsheets/${appState.currentSheet.id}/inflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newInflow)
      }).catch(err => console.log('Sync offline:', err));
    }
  });
}

// ==========================================================================
// EXCLUSÕES (GASTOS E ENTRADAS)
// ==========================================================================
async function deleteExpense(id) {
  if (!confirm('Deseja realmente remover este gasto?')) return;

  appState.currentSheet.expenses = appState.currentSheet.expenses.filter(e => e.id !== id);
  appState.currentSheet.updatedAt = new Date().toISOString();
  appState.currentSheet.summary = calculateSheetSummary(appState.currentSheet);

  const idx = appState.spreadsheets.findIndex(s => s.id === appState.currentSheet.id);
  if (idx !== -1) appState.spreadsheets[idx] = appState.currentSheet;

  saveToLocalStorage();
  renderUI();
  showToast('Gasto excluído com sucesso.', 'success');

  if (isServerMode()) {
    fetch(`/api/spreadsheets/${appState.currentSheet.id}/expenses/${id}`, { method: 'DELETE' }).catch(err => console.log(err));
  }
}

async function deleteInflow(id) {
  if (!confirm('Deseja realmente remover esta entrada de dinheiro?')) return;

  appState.currentSheet.inflows = appState.currentSheet.inflows.filter(i => i.id !== id);
  appState.currentSheet.updatedAt = new Date().toISOString();
  appState.currentSheet.summary = calculateSheetSummary(appState.currentSheet);

  const idx = appState.spreadsheets.findIndex(s => s.id === appState.currentSheet.id);
  if (idx !== -1) appState.spreadsheets[idx] = appState.currentSheet;

  saveToLocalStorage();
  renderUI();
  showToast('Entrada excluída com sucesso.', 'success');

  if (isServerMode()) {
    fetch(`/api/spreadsheets/${appState.currentSheet.id}/inflows/${id}`, { method: 'DELETE' }).catch(err => console.log(err));
  }
}

// ==========================================================================
// EXPORTAÇÃO EXCEL DIRETO NO APARELHO (OFFLINE/APK)
// ==========================================================================
function setupExcelExport() {
  const btn = document.getElementById('btnDownloadExcel');
  if (!btn) return;

  btn.addEventListener('click', async (e) => {
    if (!isServerMode() || typeof ExcelJS !== 'undefined') {
      e.preventDefault();
      await generateExcelClientSide();
    }
  });
}

async function generateExcelClientSide() {
  if (typeof ExcelJS === 'undefined') {
    showToast('Gerador de Excel carregando...', 'info');
    return;
  }
  showToast('Gerando planilha Excel...', 'info');
  try {
    const sheet = appState.currentSheet;
    const sheetTitle = (sheet && sheet.title) || 'Minha Planilha';
    const safeName = sheetTitle.replace(/[^a-zA-Z0-9_\-]/g, '_');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Controle Financeiro';
    workbook.created = new Date();

    // 1. Resumo Geral
    const summarySheet = workbook.addWorksheet('Resumo Geral');
    summarySheet.columns = [{ width: 5 }, { width: 30 }, { width: 22 }, { width: 16 }];
    summarySheet.mergeCells('B2:D2');
    const tCell = summarySheet.getCell('B2');
    tCell.value = sheetTitle.toUpperCase();
    tCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tCell.alignment = { horizontal: 'center' };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    summarySheet.getCell('B4').value = 'INDICADOR';
    summarySheet.getCell('C4').value = 'VALOR TOTAL (R$)';
    summarySheet.getCell('D4').value = 'STATUS';
    ['B4','C4','D4'].forEach(c => {
      summarySheet.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summarySheet.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    });

    const sum = sheet.summary;
    const metrics = [
      { name: 'Total de Entradas (Receitas)', val: sum.totalInflows, color: 'FF10B981', status: 'Recebido' },
      { name: 'Total de Gastos (Saídas)', val: sum.totalExpenses, color: 'FFEF4444', status: 'Gasto' },
      { name: 'Saldo Atual (Líquido)', val: sum.balance, color: 'FF3B82F6', status: sum.balance >= 0 ? 'Positivo' : 'Déficit' }
    ];
    metrics.forEach((m, idx) => {
      const r = 5 + idx;
      summarySheet.getCell(`B${r}`).value = m.name;
      summarySheet.getCell(`C${r}`).value = m.val;
      summarySheet.getCell(`C${r}`).numFmt = '"R$ "#,##0.00';
      summarySheet.getCell(`C${r}`).font = { bold: true, color: { argb: m.color } };
      summarySheet.getCell(`D${r}`).value = m.status;
    });

    // 2. Entradas
    const inflowsSheet = workbook.addWorksheet('Entradas de Dinheiro');
    inflowsSheet.columns = [{ width: 5 }, { width: 14 }, { width: 35 }, { width: 20 }];
    inflowsSheet.mergeCells('B2:D2');
    const infT = inflowsSheet.getCell('B2');
    infT.value = 'ENTRADAS DE DINHEIRO';
    infT.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    infT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };

    inflowsSheet.getCell('B4').value = 'DATA';
    inflowsSheet.getCell('C4').value = 'FONTE';
    inflowsSheet.getCell('D4').value = 'VALOR (R$)';
    ['B4','C4','D4'].forEach(c => {
      inflowsSheet.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      inflowsSheet.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    });

    let iRow = 5;
    (sheet.inflows || []).forEach(inf => {
      inflowsSheet.getCell(`B${iRow}`).value = inf.date;
      inflowsSheet.getCell(`C${iRow}`).value = inf.source;
      inflowsSheet.getCell(`D${iRow}`).value = parseFloat(inf.amount) || 0;
      inflowsSheet.getCell(`D${iRow}`).numFmt = '"R$ "#,##0.00';
      iRow++;
    });

    // 3. Gastos
    const expSheet = workbook.addWorksheet('Gastos Mensais');
    expSheet.columns = [{ width: 5 }, { width: 14 }, { width: 22 }, { width: 35 }, { width: 20 }];
    expSheet.mergeCells('B2:E2');
    const expT = expSheet.getCell('B2');
    expT.value = 'REGISTRO DE GASTOS';
    expT.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    expT.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };

    expSheet.getCell('B4').value = 'DATA';
    expSheet.getCell('C4').value = 'CATEGORIA';
    expSheet.getCell('D4').value = 'DESCRIÇÃO';
    expSheet.getCell('E4').value = 'VALOR (R$)';
    ['B4','C4','D4','E4'].forEach(c => {
      expSheet.getCell(c).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      expSheet.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    });

    let eRow = 5;
    (sheet.expenses || []).forEach(exp => {
      expSheet.getCell(`B${eRow}`).value = exp.date;
      expSheet.getCell(`C${eRow}`).value = exp.category;
      expSheet.getCell(`D${eRow}`).value = exp.description || '-';
      expSheet.getCell(`E${eRow}`).value = parseFloat(exp.amount) || 0;
      expSheet.getCell(`E${eRow}`).numFmt = '"R$ "#,##0.00';
      eRow++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Planilha_${safeName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Planilha "${sheetTitle}" exportada com sucesso!`, 'success');
  } catch (err) {
    console.error('Erro ao gerar Excel client-side:', err);
    showToast('Falha ao exportar Excel.', 'error');
  }
}

// ==========================================================================
// FILTRO DE BUSCA DENTRO DA PLANILHA ABERTA
// ==========================================================================
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const expenses = (appState.currentSheet && appState.currentSheet.expenses) || [];
    const inflows = (appState.currentSheet && appState.currentSheet.inflows) || [];

    const filteredExpenses = expenses.filter(exp => {
      const catMatch = exp.category.toLowerCase().includes(term);
      const descMatch = (exp.description || '').toLowerCase().includes(term);
      return catMatch || descMatch;
    });
    renderExpensesTable(filteredExpenses);

    const filteredInflows = inflows.filter(inf => {
      return inf.source.toLowerCase().includes(term);
    });
    renderInflowsTable(filteredInflows);
  });
}

// ==========================================================================
// TOAST NOTIFICATIONS & UTILITÁRIOS
// ==========================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}
