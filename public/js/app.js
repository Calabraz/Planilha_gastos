// ==========================================================================
// APLICAÇÃO MULTI-PLANILHAS (ESTILO GOOGLE SHEETS) - JAVASCRIPT FRONTEND
// ==========================================================================

const STORAGE_KEY = 'planilha_multi_data';

let appState = {
  currentView: 'dashboard', // 'dashboard' | 'spreadsheet'
  activeSpreadsheetId: null,
  spreadsheets: [],
  currentSheet: null
};

let pieChartInstance = null;

// Categorias Oficiais Suportadas com Cores do Design System
const CATEGORIES_CONFIG = {
  'Mercado': { icon: '🛒', color: '#10b981', badgeClass: 'cat-Mercado' },
  'Aluguel': { icon: '🏠', color: '#6366f1', badgeClass: 'cat-Aluguel' },
  'Lazer': { icon: '🍿', color: '#ec4899', badgeClass: 'cat-Lazer' },
  'Reserva de Emergência': { icon: '🛡️', color: '#06b6d4', badgeClass: 'cat-Reserva' },
  'Transporte': { icon: '🚗', color: '#f59e0b', badgeClass: 'cat-Transporte' },
  'Saúde': { icon: '💊', color: '#ef4444', badgeClass: 'cat-Saúde' },
  'Contas Fixas': { icon: '⚡', color: '#8b5cf6', badgeClass: 'cat-Contas' },
  'Educação': { icon: '📚', color: '#3b82f6', badgeClass: 'cat-Educação' },
  'Outros': { icon: '📦', color: '#64748b', badgeClass: 'cat-Outros' }
};

// Nomes Oficiais dos Meses
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Helper para obter/inferir o período (mês e ano) específico de cada planilha
function getSheetPeriod(sheet) {
  if (!sheet) {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  }
  if (typeof sheet.selectedMonth === 'number' && typeof sheet.selectedYear === 'number') {
    return { month: sheet.selectedMonth, year: sheet.selectedYear };
  }
  if (typeof sheet.month === 'number' && typeof sheet.year === 'number') {
    return { month: sheet.month, year: sheet.year };
  }

  // Tenta inferir pelo título (ex: "Gastos de Setembro 2026")
  let inferredMonth = -1;
  let inferredYear = null;
  if (sheet.title) {
    MONTH_NAMES.forEach((m, idx) => {
      if (new RegExp(m, 'i').test(sheet.title)) {
        inferredMonth = idx;
      }
    });
    const yearMatch = sheet.title.match(/20\d{2}/);
    if (yearMatch) {
      inferredYear = parseInt(yearMatch[0], 10);
    }
  }

  const baseDate = sheet.createdAt ? new Date(sheet.createdAt) : new Date();
  const validBase = !isNaN(baseDate.getTime()) ? baseDate : new Date();
  const month = inferredMonth !== -1 ? inferredMonth : validBase.getMonth();
  const year = inferredYear !== null ? inferredYear : validBase.getFullYear();

  sheet.selectedMonth = month;
  sheet.selectedYear = year;
  return { month, year };
}

// Atualiza o texto do badge no cabeçalho com o período da planilha ativa
function updateSheetPeriodBadge(sheet) {
  const currentMonthEl = document.getElementById('currentDateText');
  if (!currentMonthEl) return;
  const period = getSheetPeriod(sheet);
  currentMonthEl.textContent = `${MONTH_NAMES[period.month]} / ${period.year}`;
}

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

// Helper para cálculo local de métricas e percentuais
function calculateSheetSummary(sheet) {
  const inflows = (sheet && sheet.inflows) || [];
  const expenses = (sheet && sheet.expenses) || [];

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
      categoryTotals['Outros'] += (parseFloat(exp.amount) || 0);
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

// Detecta se está conectado diretamente ao servidor Node.js local
function isServerMode() {
  const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalHost && (window.location.port === '3000' || window.location.port === '8080');
}

// ==========================================================================
// PERSISTÊNCIA LOCAL (LOCALSTORAGE) - TUDO ZERADO INICIALMENTE
// ==========================================================================
function saveToLocalStorage() {
  try {
    const payload = {
      activeSpreadsheetId: appState.activeSpreadsheetId,
      spreadsheets: appState.spreadsheets.map(s => {
        const period = getSheetPeriod(s);
        return {
          id: s.id,
          title: s.title,
          selectedMonth: period.month,
          selectedYear: period.year,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          inflows: s.inflows || [],
          expenses: s.expenses || []
        };
      })
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Erro ao salvar no LocalStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.spreadsheets)) {
        appState.spreadsheets = parsed.spreadsheets.map(s => {
          const period = getSheetPeriod(s);
          return {
            ...s,
            selectedMonth: period.month,
            selectedYear: period.year,
            summary: calculateSheetSummary(s)
          };
        });
        appState.activeSpreadsheetId = parsed.activeSpreadsheetId || (appState.spreadsheets[0] ? appState.spreadsheets[0].id : null);
        return;
      }
    }

    // Inicialização zerada padrão conforme solicitado pelo usuário
    appState.spreadsheets = [];
    appState.activeSpreadsheetId = null;
  } catch (e) {
    console.error('Erro ao carregar dados do LocalStorage:', e);
    appState.spreadsheets = [];
    appState.activeSpreadsheetId = null;
  }
}

// ==========================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupOrientationHandler();
  setupDates();
  setupChoiceCards();
  setupTabs();
  setupCurrencyMasks();
  setupForms();
  setupSearch();
  setupDashboardSearch();
  setupModals();
  setupPeriodModal();
  setupNavigation();
  setupExcelExport();
  fetchInitialData();
});

// Configuração de datas padrão nos inputs
function setupDates() {
  const today = new Date().toISOString().split('T')[0];
  const expenseDateInput = document.getElementById('expenseDate');
  const inflowDateInput = document.getElementById('inflowDate');
  
  if (expenseDateInput) expenseDateInput.value = today;
  if (inflowDateInput) inflowDateInput.value = today;

  if (appState.currentSheet) {
    updateSheetPeriodBadge(appState.currentSheet);
  }
}

// ==========================================================================
// CARREGAR DADOS DA API OU LOCALSTORAGE (OFFLINE FIRST)
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
      throw new Error('Servidor indisponível para JSON');
    }
    const data = await res.json();
    appState.spreadsheets = (data.spreadsheets || []).map(s => ({
      ...s,
      summary: calculateSheetSummary(s)
    }));
    appState.activeSpreadsheetId = data.activeSpreadsheetId || (appState.spreadsheets[0] && appState.spreadsheets[0].id);

    saveToLocalStorage();
    renderDashboard();
  } catch (err) {
    console.log('Servidor offline ou sem resposta, carregando dados locais...');
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

  // Renomear clicando no botão do cabeçalho da planilha aberta
  const btnRenameHeader = document.getElementById('btnRenameHeader');
  if (btnRenameHeader) {
    btnRenameHeader.addEventListener('click', () => {
      if (appState.currentSheet && appState.currentSheet.id) {
        openRenameModal(appState.currentSheet.id, appState.currentSheet.title);
      }
    });
  }

  // Excluir planilha a partir do cabeçalho da planilha aberta
  const btnDeleteHeader = document.getElementById('btnDeleteCurrentSheet');
  if (btnDeleteHeader) {
    btnDeleteHeader.addEventListener('click', () => {
      if (appState.currentSheet && appState.currentSheet.id) {
        deleteSpreadsheet(appState.currentSheet.id);
      }
    });
  }

  // Botão no aviso de estado vazio do hub
  const btnEmptyCreate = document.getElementById('btnEmptyCreateSheet');
  if (btnEmptyCreate) {
    btnEmptyCreate.addEventListener('click', () => {
      const btnNew = document.getElementById('btnOpenNewSheetModal');
      if (btnNew) btnNew.click();
    });
  }
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

  // Se estiver conectado ao servidor Node.js, tenta carregar dados atualizados
  if (isServerMode()) {
    try {
      const res = await fetch(`/api/spreadsheets/${sheetId}`);
      if (res.ok) {
        const fullSheet = await res.json();
        sheet = fullSheet;
        const idx = appState.spreadsheets.findIndex(s => s.id === sheetId);
        if (idx !== -1) appState.spreadsheets[idx] = fullSheet;
      }
    } catch (e) {}
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

  // Atualiza badge de período (mês e ano) da planilha
  updateSheetPeriodBadge(sheet);

  // Alterna as visualizações
  document.getElementById('viewDashboard').classList.add('hidden');
  document.getElementById('viewSpreadsheet').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  renderUI();
}

// ==========================================================================
// RENDERIZAÇÃO DO HUB DE PLANILHAS (TELA INICIAL DO MODELO GOOGLE SHEETS)
// ==========================================================================
function renderDashboard(filterTerm = '') {
  const grid = document.getElementById('spreadsheetsGrid');
  const emptyNotice = document.getElementById('emptySpreadsheetsNotice');
  if (!grid) return;

  const term = (filterTerm || '').toLowerCase().trim();
  const list = appState.spreadsheets.filter(s => s.title.toLowerCase().includes(term));

  // 1. Calcula as 2 Métricas do Hub (Planilhas Criadas e Valor Movimentado)
  let totalConsolidatedInflows = 0;
  let totalConsolidatedExpenses = 0;

  appState.spreadsheets.forEach(s => {
    const sum = s.summary || calculateSheetSummary(s);
    totalConsolidatedInflows += sum.totalInflows;
    totalConsolidatedExpenses += sum.totalExpenses;
  });

  const totalMoved = totalConsolidatedInflows + totalConsolidatedExpenses;

  const hubSheetsEl = document.getElementById('hubTotalSheets');
  const hubMovedEl = document.getElementById('hubTotalMoved');
  if (hubSheetsEl) hubSheetsEl.textContent = appState.spreadsheets.length;
  if (hubMovedEl) hubMovedEl.textContent = formatCurrency(totalMoved);

  // 2. Renderiza a grade de cartões ou aviso vazio
  if (list.length === 0) {
    grid.innerHTML = '';
    if (emptyNotice) emptyNotice.style.display = 'block';
    return;
  }

  if (emptyNotice) emptyNotice.style.display = 'none';

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

// Busca rápida de planilhas na tela inicial
function setupDashboardSearch() {
  const input = document.getElementById('dashboardSearchInput');
  if (!input) return;

  input.addEventListener('input', (e) => {
    renderDashboard(e.target.value);
  });
}

// ==========================================================================
// MODAIS: CRIAR & RENOMEAR PLANILHA
// ==========================================================================
function setupModals() {
  const modalNew = document.getElementById('modalNewSheet');
  const modalRename = document.getElementById('modalRenameSheet');
  
  // Abrir Modal de Nova Planilha
  const btnOpenNew = document.getElementById('btnOpenNewSheetModal');
  if (btnOpenNew && modalNew) {
    btnOpenNew.addEventListener('click', () => {
      const input = document.getElementById('inputNewSheetTitle');
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const now = new Date();
      input.value = `Gastos de ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
      modalNew.style.display = 'flex';
      setTimeout(() => input.focus(), 100);
    });
  }

  // Fechar Modais
  const closeNewModal = () => { if (modalNew) modalNew.style.display = 'none'; };
  const closeRenameModal = () => { if (modalRename) modalRename.style.display = 'none'; };

  const btnCloseNew = document.getElementById('btnCloseNewSheetModal');
  const btnCancelNew = document.getElementById('btnCancelNewSheet');
  if (btnCloseNew) btnCloseNew.addEventListener('click', closeNewModal);
  if (btnCancelNew) btnCancelNew.addEventListener('click', closeNewModal);

  const btnCloseRename = document.getElementById('btnCloseRenameModal');
  const btnCancelRename = document.getElementById('btnCancelRename');
  if (btnCloseRename) btnCloseRename.addEventListener('click', closeRenameModal);
  if (btnCancelRename) btnCancelRename.addEventListener('click', closeRenameModal);

  // Submissão: Criar Nova Planilha
  const formCreate = document.getElementById('formCreateSheet');
  if (formCreate) {
    formCreate.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('inputNewSheetTitle');
      const title = input.value.trim();
      if (!title) return;

      closeNewModal();
      await createSpreadsheet(title);
    });
  }

  // Submissão: Renomear Planilha
  const formRename = document.getElementById('formRenameSheet');
  if (formRename) {
    formRename.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('inputRenameSheetId').value;
      const newTitle = document.getElementById('inputRenameSheetTitle').value.trim();
      if (!newTitle) return;

      closeRenameModal();
      await renameSpreadsheet(id, newTitle);
    });
  }
}

function openRenameModal(sheetId, currentTitle) {
  const modalRename = document.getElementById('modalRenameSheet');
  const inputId = document.getElementById('inputRenameSheetId');
  const inputTitle = document.getElementById('inputRenameSheetTitle');

  if (!modalRename || !inputId || !inputTitle) return;

  inputId.value = sheetId;
  inputTitle.value = currentTitle;
  modalRename.style.display = 'flex';
  setTimeout(() => inputTitle.focus(), 100);
}

// ==========================================================================
// MODAL: ALTERAR MÊS E ANO INDIVIDUAL DA PLANILHA
// ==========================================================================
function setupPeriodModal() {
  const badgeBtn = document.getElementById('currentMonthBadge');
  const modal = document.getElementById('modalChangeSheetPeriod');
  const form = document.getElementById('formChangeSheetPeriod');
  const btnClose = document.getElementById('btnClosePeriodModal');
  const btnCancel = document.getElementById('btnCancelPeriod');
  const selectMonth = document.getElementById('selectSheetMonth');
  const selectYear = document.getElementById('selectSheetYear');

  if (!modal || !form || !selectMonth || !selectYear) return;

  // Popula anos no select de anos (de 2020 a 2035)
  selectYear.innerHTML = '';
  const currentYear = new Date().getFullYear();
  const startYear = Math.min(2020, currentYear - 3);
  const endYear = Math.max(2035, currentYear + 8);
  for (let y = startYear; y <= endYear; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    selectYear.appendChild(opt);
  }

  const openModal = () => {
    if (!appState.currentSheet) return;
    const period = getSheetPeriod(appState.currentSheet);
    selectMonth.value = String(period.month);
    selectYear.value = String(period.year);
    modal.style.display = 'flex';
  };

  const closeModal = () => {
    modal.style.display = 'none';
  };

  if (badgeBtn) badgeBtn.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!appState.currentSheet) return;

    const newMonth = parseInt(selectMonth.value, 10);
    const newYear = parseInt(selectYear.value, 10);

    appState.currentSheet.selectedMonth = newMonth;
    appState.currentSheet.selectedYear = newYear;
    appState.currentSheet.updatedAt = new Date().toISOString();

    const targetInList = appState.spreadsheets.find(s => s.id === appState.currentSheet.id);
    if (targetInList) {
      targetInList.selectedMonth = newMonth;
      targetInList.selectedYear = newYear;
      targetInList.updatedAt = appState.currentSheet.updatedAt;
    }

    saveToLocalStorage();
    updateSheetPeriodBadge(appState.currentSheet);
    closeModal();
    showToast(`Período definido para ${MONTH_NAMES[newMonth]} / ${newYear}!`, 'success');

    if (isServerMode()) {
      try {
        await fetch(`/api/spreadsheets/${appState.currentSheet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedMonth: newMonth,
            selectedYear: newYear
          })
        });
      } catch (err) {}
    }
  });
}

// ==========================================================================
// MODAL DE CONFIRMAÇÃO NATIVO MOBILE (SUBSTITUI O CONFIRM DO NAVEGADOR)
// ==========================================================================
function showConfirmDialog({ title = 'Confirmar Exclusão', message = 'Deseja realmente prosseguir?', confirmText = 'Excluir', isDanger = true }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmAction');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('btnConfirmOk');
    const cancelBtn = document.getElementById('btnConfirmCancel');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) {
      okBtn.textContent = confirmText;
      okBtn.className = isDanger ? 'btn-danger' : 'btn-primary';
    }

    modal.style.display = 'flex';

    function cleanup(result) {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }

    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ==========================================================================
// SISTEMA DE TEMA (MODO ESCURO PADRÃO E INTACTO / MODO CLARO OPCIONAL)
// ==========================================================================
const THEME_STORAGE_KEY = 'planilha_app_theme';

function initTheme() {
  // Modo escuro é o padrão absoluto e permanece intacto
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);

  const btnHub = document.getElementById('btnThemeToggleHub');
  const btnSheet = document.getElementById('btnThemeToggleSheet');

  if (btnHub) btnHub.addEventListener('click', toggleTheme);
  if (btnSheet) btnSheet.addEventListener('click', toggleTheme);
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  updateThemeButtons(theme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(newTheme);
  showToast(`Modo ${newTheme === 'light' ? 'Claro' : 'Escuro'} ativado!`, 'info');
}

function updateThemeButtons(theme) {
  const isLight = (theme === 'light');
  const icon = isLight ? '☀️' : '🌙';
  const label = isLight ? 'Claro' : 'Escuro';

  document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
    const iconEl = btn.querySelector('.theme-toggle-icon');
    const labelEl = btn.querySelector('.theme-toggle-label');
    if (iconEl) iconEl.textContent = icon;
    if (labelEl) labelEl.textContent = label;
  });
}

// ==========================================================================
// TRATAMENTO INTELIGENTE DE ROTAÇÃO DE TELA (HORIZONTAL <-> VERTICAL)
// ==========================================================================
function setupOrientationHandler() {
  let resizeTimeout = null;

  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // 1. Redimensiona o gráfico Chart.js
      if (pieChartInstance) {
        pieChartInstance.resize();
      }

      // 2. Se a planilha estiver aberta, re-renderiza o painel com dimensões corretas
      if (appState.currentView === 'spreadsheet' && appState.currentSheet) {
        renderUI();
      } else if (appState.currentView === 'dashboard') {
        renderDashboard();
      }
    }, 150);
  }

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
}

// ==========================================================================
// AÇÕES CRUD DE PLANILHAS
// ==========================================================================
async function createSpreadsheet(title) {
  const period = getSheetPeriod({ title, createdAt: new Date().toISOString() });
  const newSheet = {
    id: 'sheet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: title,
    selectedMonth: period.month,
    selectedYear: period.year,
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
        body: JSON.stringify({
          title,
          selectedMonth: period.month,
          selectedYear: period.year
        })
      });
    } catch (err) {}
  }

  // Abre diretamente a nova planilha criada
  openSpreadsheet(newSheet.id);
}

async function renameSpreadsheet(sheetId, newTitle) {
  const sheet = appState.spreadsheets.find(s => s.id === sheetId);
  if (!sheet) return;

  sheet.title = newTitle;
  sheet.updatedAt = new Date().toISOString();
  saveToLocalStorage();

  // Se for a planilha aberta atualmente, atualiza o título no cabeçalho
  if (appState.currentSheet && appState.currentSheet.id === sheetId) {
    appState.currentSheet.title = newTitle;
    document.getElementById('currentSheetTitle').textContent = newTitle;
  }

  renderDashboard();
  showToast(`Planilha renomeada para "${newTitle}"!`, 'success');

  if (isServerMode()) {
    try {
      await fetch(`/api/spreadsheets/${sheetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });
    } catch (err) {}
  }
}

async function deleteSpreadsheet(sheetId) {
  const sheet = appState.spreadsheets.find(s => s.id === sheetId);
  if (!sheet) return;

  const confirmed = await showConfirmDialog({
    title: 'Excluir Planilha',
    message: `Deseja realmente excluir a planilha "${sheet.title}"? Todos os lançamentos dela serão removidos permanentemente.`,
    confirmText: 'Excluir Planilha',
    isDanger: true
  });

  if (!confirmed) return;

  appState.spreadsheets = appState.spreadsheets.filter(s => s.id !== sheetId);

  // Se a planilha deletada for a atualmente aberta, volta para a tela inicial
  const wasActive = (appState.currentSheet && appState.currentSheet.id === sheetId);
  if (wasActive) {
    appState.currentSheet = null;
    appState.activeSpreadsheetId = appState.spreadsheets.length > 0 ? appState.spreadsheets[0].id : null;
    showDashboard();
  }

  saveToLocalStorage();
  renderDashboard();
  showToast('Planilha removida com sucesso.', 'success');

  if (isServerMode()) {
    try {
      await fetch(`/api/spreadsheets/${sheetId}`, { method: 'DELETE' });
    } catch (err) {}
  }
}

// ==========================================================================
// RENDERIZAÇÃO DA PLANILHA ABERTA (HUD COMPLETA COM 3 KPIS, GRÁFICO E TABELAS)
// ==========================================================================
function renderUI() {
  if (!appState.currentSheet) return;

  appState.currentSheet.summary = calculateSheetSummary(appState.currentSheet);
  updateSheetPeriodBadge(appState.currentSheet);
  const summary = appState.currentSheet.summary;

  // 1. Renderiza os 3 Cards de Indicadores (KPIs)
  renderKPIs(summary);

  // 2. Renderiza o Gráfico de Pizza e a Lista de Porcentagens
  renderChart(summary);

  // 3. Renderiza as Tabelas de Lançamentos
  renderTables();
}

function renderKPIs(summary) {
  const inflowsEl = document.getElementById('kpiTotalInflows');
  const inflowsCountEl = document.getElementById('inflowsCount');
  const expensesEl = document.getElementById('kpiTotalExpenses');
  const expensesCountEl = document.getElementById('expensesCount');
  const balanceEl = document.getElementById('kpiBalance');
  const balanceStatusBadge = document.getElementById('balanceStatusBadge');

  if (inflowsEl) inflowsEl.textContent = formatCurrency(summary.totalInflows);
  if (inflowsCountEl) inflowsCountEl.textContent = `${summary.inflowCount} entrada(s) cadastrada(s)`;

  if (expensesEl) expensesEl.textContent = formatCurrency(summary.totalExpenses);
  if (expensesCountEl) expensesCountEl.textContent = `${summary.expenseCount} despesa(s) registrada(s)`;

  if (balanceEl) balanceEl.textContent = formatCurrency(summary.balance);
  
  if (balanceStatusBadge) {
    if (summary.balance >= 0) {
      balanceStatusBadge.className = 'status-indicator positive';
      balanceStatusBadge.textContent = 'Balanço Positivo';
    } else {
      balanceStatusBadge.className = 'status-indicator negative';
      balanceStatusBadge.textContent = 'Em Déficit';
    }
  }
}

// Renderização do Gráfico Doughnut e Breakdown de Categorias
function renderChart(summary) {
  const ctx = document.getElementById('pieChartExpenses');
  const emptyNotice = document.getElementById('emptyChartMessage');
  const statsContainer = document.getElementById('categoryStatsContainer');
  if (!ctx) return;

  const categories = Object.keys(CATEGORIES_CONFIG);
  const values = categories.map(cat => summary.categoryTotals[cat] || 0);
  const colors = categories.map(cat => CATEGORIES_CONFIG[cat].color);

  const hasExpenses = summary.totalExpenses > 0;

  if (!hasExpenses) {
    if (emptyNotice) emptyNotice.style.display = 'block';
    ctx.style.display = 'none';
    if (pieChartInstance) {
      pieChartInstance.destroy();
      pieChartInstance = null;
    }
  } else {
    if (emptyNotice) emptyNotice.style.display = 'none';
    ctx.style.display = 'block';

    if (pieChartInstance) {
      pieChartInstance.destroy();
    }

    pieChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categories,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderColor: '#0b0f19',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const val = context.parsed || 0;
                const pct = summary.categoryPercentages[label] || 0;
                return ` ${label}: ${formatCurrency(val)} (${pct}%)`;
              }
            }
          }
        },
        cutout: '68%'
      }
    });
  }

  // Lista de Porcentagens de Categorias Abaixo do Gráfico
  if (statsContainer) {
    statsContainer.innerHTML = categories.map(cat => {
      const val = summary.categoryTotals[cat] || 0;
      const pct = summary.categoryPercentages[cat] || 0;
      const config = CATEGORIES_CONFIG[cat];

      return `
        <div class="category-stat-item">
          <div class="category-stat-left">
            <span class="category-stat-color" style="background-color: ${config.color};"></span>
            <span class="category-stat-name">${config.icon} ${cat}</span>
          </div>
          <div class="category-stat-right">
            <span class="category-stat-value">${formatCurrency(val)}</span>
            <span class="category-stat-percent">${pct}%</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

// Renderização das Tabelas de Gastos e Entradas
function renderTables() {
  const current = appState.currentSheet;
  if (!current) return;

  renderExpensesTable(current.expenses || []);
  renderInflowsTable(current.inflows || []);
}

function renderExpensesTable(expensesList) {
  const tbody = document.getElementById('expensesTableBody');
  const emptyNotice = document.getElementById('emptyExpensesNotice');
  const countBadge = document.getElementById('tableExpensesCount');

  if (countBadge) countBadge.textContent = expensesList.length;
  if (!tbody) return;

  if (expensesList.length === 0) {
    tbody.innerHTML = '';
    if (emptyNotice) emptyNotice.style.display = 'block';
    return;
  }

  if (emptyNotice) emptyNotice.style.display = 'none';

  // Ordena por data decrescente
  const sorted = [...expensesList].sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = sorted.map(exp => {
    const config = CATEGORIES_CONFIG[exp.category] || CATEGORIES_CONFIG['Outros'];

    return `
      <tr>
        <td>${formatDate(exp.date)}</td>
        <td>
          <span class="category-pill ${config.badgeClass}">
            ${config.icon} ${escapeHtml(exp.category)}
          </span>
        </td>
        <td>${escapeHtml(exp.description || '-')}</td>
        <td class="text-right amount-expense">-${formatCurrency(exp.amount)}</td>
        <td class="text-center">
          <button class="btn-delete-row" onclick="deleteExpense('${exp.id}')" title="Excluir Gasto">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderInflowsTable(inflowsList) {
  const tbody = document.getElementById('inflowsTableBody');
  const emptyNotice = document.getElementById('emptyInflowsNotice');
  const countBadge = document.getElementById('tableInflowsCount');

  if (countBadge) countBadge.textContent = inflowsList.length;
  if (!tbody) return;

  if (inflowsList.length === 0) {
    tbody.innerHTML = '';
    if (emptyNotice) emptyNotice.style.display = 'block';
    return;
  }

  if (emptyNotice) emptyNotice.style.display = 'none';

  const sorted = [...inflowsList].sort((a, b) => new Date(b.date) - new Date(a.date));

  tbody.innerHTML = sorted.map(inf => {
    return `
      <tr>
        <td>${formatDate(inf.date)}</td>
        <td><strong>${escapeHtml(inf.source)}</strong></td>
        <td class="text-right amount-inflow">+${formatCurrency(inf.amount)}</td>
        <td class="text-center">
          <button class="btn-delete-row" onclick="deleteInflow('${inf.id}')" title="Excluir Entrada">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
// CAIXINHAS DE ESCOLHA DE CATEGORIA (AS 9 CATEGORIAS OFICIAIS)
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
  // Alternância das abas de formulário
  const tabExpenseBtn = document.getElementById('tabExpenseBtn');
  const tabInflowBtn = document.getElementById('tabInflowBtn');
  const formExpense = document.getElementById('formExpense');
  const formInflow = document.getElementById('formInflow');

  if (tabExpenseBtn && tabInflowBtn && formExpense && formInflow) {
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
  }

  // Alternância das abas de tabelas
  const btnShowExpenses = document.getElementById('btnShowExpensesTable');
  const btnShowInflows = document.getElementById('btnShowInflowsTable');
  const expensesContainer = document.getElementById('expensesTableContainer');
  const inflowsContainer = document.getElementById('inflowsTableContainer');

  if (btnShowExpenses && btnShowInflows && expensesContainer && inflowsContainer) {
    btnShowExpenses.addEventListener('click', () => {
      btnShowExpenses.classList.add('active');
      btnShowInflows.classList.remove('active');
      expensesContainer.classList.remove('hidden');
      inflowsContainer.classList.add('hidden');
    });

    btnShowInflows.addEventListener('click', () => {
      btnShowInflows.classList.add('active');
      btnShowExpenses.classList.remove('active');
      inflowsContainer.classList.remove('hidden');
      expensesContainer.classList.add('hidden');
    });
  }
}

// ==========================================================================
// MÁSCARA AUTOMÁTICA DE MOEDA (COMEÇA DOS CENTAVOS: 9 -> 0,09 / 24896 -> 248,96)
// APLICADA SOMENTE NOS VALORES (COM TECLADO PADRÃO NORMAL)
// ==========================================================================
function parseCurrencyInput(val) {
  if (!val) return 0;
  const digits = val.toString().replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

function attachCurrencyMask(inputEl) {
  if (!inputEl) return;

  inputEl.addEventListener('input', (e) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      e.target.value = '';
      return;
    }

    // Limita a 11 dígitos para evitar overflow numérico
    const limitedDigits = rawDigits.slice(0, 11);
    const cents = parseInt(limitedDigits, 10);

    if (cents === 0) {
      e.target.value = '';
      return;
    }

    // Formata a partir dos centavos (ex: 9 vira 0,09 / 24896 vira 248,96 / 28900 vira 289,00)
    const formatted = (cents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    e.target.value = formatted;
  });

  inputEl.addEventListener('blur', (e) => {
    if (e.target.value) {
      const cents = parseInt(e.target.value.replace(/\D/g, ''), 10);
      if (cents && cents > 0) {
        e.target.value = (cents / 100).toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      } else {
        e.target.value = '';
      }
    }
  });
}

function setupCurrencyMasks() {
  // Mexe SOMENTE nos campos de valor (sem alterar descrições ou nomes)
  attachCurrencyMask(document.getElementById('expenseAmount'));
  attachCurrencyMask(document.getElementById('inflowAmount'));
}

// ==========================================================================
// SUBMISSÃO DE FORMULÁRIOS (NOVO GASTO & NOVA ENTRADA)
// ==========================================================================
function setupForms() {
  // Formulário de Gasto
  const formExpense = document.getElementById('formExpense');
  if (formExpense) {
    formExpense.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!appState.currentSheet) return;

      const selectedRadio = document.querySelector('input[name="expenseCategory"]:checked');
      const category = selectedRadio ? selectedRadio.value : 'Outros';
      const amount = parseCurrencyInput(document.getElementById('expenseAmount').value);
      const date = document.getElementById('expenseDate').value;
      const description = document.getElementById('expenseDesc').value.trim();

      if (isNaN(amount) || amount <= 0) {
        showToast('Informe um valor válido maior que zero.', 'error');
        return;
      }
      if (!date) {
        showToast('Selecione uma data.', 'error');
        return;
      }

      const newExpense = {
        id: 'exp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        category,
        amount,
        date,
        description
      };

      appState.currentSheet.expenses.unshift(newExpense);
      appState.currentSheet.updatedAt = new Date().toISOString();
      saveToLocalStorage();
      renderUI();

      // Limpa inputs
      document.getElementById('expenseAmount').value = '';
      document.getElementById('expenseDesc').value = '';
      showToast(`Gasto de ${formatCurrency(amount)} salvo com sucesso!`, 'success');

      if (isServerMode()) {
        try {
          await fetch(`/api/spreadsheets/${appState.currentSheet.id}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newExpense)
          });
        } catch (err) {}
      }
    });
  }

  // Formulário de Entrada
  const formInflow = document.getElementById('formInflow');
  if (formInflow) {
    formInflow.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!appState.currentSheet) return;

      const source = document.getElementById('inflowSource').value.trim();
      const amount = parseCurrencyInput(document.getElementById('inflowAmount').value);
      const date = document.getElementById('inflowDate').value;

      if (!source) {
        showToast('Informe a origem da entrada.', 'error');
        return;
      }
      if (isNaN(amount) || amount <= 0) {
        showToast('Informe um valor válido maior que zero.', 'error');
        return;
      }
      if (!date) {
        showToast('Selecione uma data.', 'error');
        return;
      }

      const newInflow = {
        id: 'inf_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        source,
        amount,
        date
      };

      appState.currentSheet.inflows.unshift(newInflow);
      appState.currentSheet.updatedAt = new Date().toISOString();
      saveToLocalStorage();
      renderUI();

      document.getElementById('inflowSource').value = '';
      document.getElementById('inflowAmount').value = '';
      showToast(`Entrada de ${formatCurrency(amount)} adicionada com sucesso!`, 'success');

      if (isServerMode()) {
        try {
          await fetch(`/api/spreadsheets/${appState.currentSheet.id}/inflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newInflow)
          });
        } catch (err) {}
      }
    });
  }
}

// ==========================================================================
// EXCLUSÃO DE ITENS (GASTOS E ENTRADAS)
// ==========================================================================
async function deleteExpense(expenseId) {
  if (!appState.currentSheet) return;

  const exp = appState.currentSheet.expenses.find(e => e.id === expenseId);
  if (!exp) return;

  const confirmed = await showConfirmDialog({
    title: 'Excluir Gasto',
    message: `Deseja realmente excluir o gasto de ${formatCurrency(exp.amount)} (${exp.category})?`,
    confirmText: 'Excluir Gasto',
    isDanger: true
  });

  if (!confirmed) return;

  appState.currentSheet.expenses = appState.currentSheet.expenses.filter(e => e.id !== expenseId);
  appState.currentSheet.updatedAt = new Date().toISOString();
  saveToLocalStorage();
  renderUI();
  showToast('Gasto removido com sucesso.', 'success');

  if (isServerMode()) {
    try {
      await fetch(`/api/spreadsheets/${appState.currentSheet.id}/expenses/${expenseId}`, {
        method: 'DELETE'
      });
    } catch (err) {}
  }
}

async function deleteInflow(inflowId) {
  if (!appState.currentSheet) return;

  const inf = appState.currentSheet.inflows.find(i => i.id === inflowId);
  if (!inf) return;

  const confirmed = await showConfirmDialog({
    title: 'Excluir Entrada',
    message: `Deseja realmente excluir a entrada de ${formatCurrency(inf.amount)} (${inf.source})?`,
    confirmText: 'Excluir Entrada',
    isDanger: true
  });

  if (!confirmed) return;

  appState.currentSheet.inflows = appState.currentSheet.inflows.filter(i => i.id !== inflowId);
  appState.currentSheet.updatedAt = new Date().toISOString();
  saveToLocalStorage();
  renderUI();
  showToast('Entrada removida com sucesso.', 'success');

  if (isServerMode()) {
    try {
      await fetch(`/api/spreadsheets/${appState.currentSheet.id}/inflows/${inflowId}`, {
        method: 'DELETE'
      });
    } catch (err) {}
  }
}

// ==========================================================================
// EXPORTAÇÃO PARA EXCEL (.XLSX) - COMPLETA & OFFLINE COM EXCELJS
// ==========================================================================
function setupExcelExport() {
  const btnExcel = document.getElementById('btnDownloadExcel');
  if (!btnExcel) return;

  btnExcel.addEventListener('click', async (e) => {
    // No modo offline / celular APK, gera via ExcelJS
    if (!isServerMode() || typeof ExcelJS !== 'undefined') {
      e.preventDefault();
      await generateExcelClientSide();
    }
  });
}

async function generateExcelClientSide() {
  if (typeof ExcelJS === 'undefined') {
    showToast('Gerador de Excel carregando, tente em alguns instantes...', 'info');
    return;
  }
  showToast('Gerando planilha Excel formatada...', 'info');
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

    const sum = sheet.summary || calculateSheetSummary(sheet);
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
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

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
