const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { generateExcelFile } = require('./generate-excel');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'finances.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Categorias Oficiais Suportadas
const VALID_CATEGORIES = [
  'Mercado',
  'Aluguel',
  'Lazer',
  'Reserva de Emergência',
  'Transporte',
  'Saúde',
  'Contas Fixas',
  'Educação',
  'Outros'
];

// Helper para ler dados com suporte a multi-planilhas
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initial = createDefaultData();
      saveData(initial);
      return initial;
    }
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!raw.spreadsheets || !Array.isArray(raw.spreadsheets)) {
      // Migração de formato antigo
      if (raw.expenses || raw.inflows) {
        const migrated = {
          activeSpreadsheetId: 'sheet_default',
          spreadsheets: [
            {
              id: 'sheet_default',
              title: 'Minha Planilha',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              inflows: raw.inflows || [],
              expenses: raw.expenses || []
            }
          ]
        };
        saveData(migrated);
        return migrated;
      }
      const initial = { activeSpreadsheetId: null, spreadsheets: [] };
      saveData(initial);
      return initial;
    }

    if (!raw.activeSpreadsheetId || !raw.spreadsheets.some(s => s.id === raw.activeSpreadsheetId)) {
      raw.activeSpreadsheetId = raw.spreadsheets.length > 0 ? raw.spreadsheets[0].id : null;
    }

    return raw;
  } catch (err) {
    console.error('Erro ao ler dados:', err);
    return createDefaultData();
  }
}

function createDefaultData() {
  const defaultSheet = {
    id: 'sheet_' + Date.now(),
    title: 'Minha Planilha',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inflows: [],
    expenses: []
  };
  return {
    activeSpreadsheetId: defaultSheet.id,
    spreadsheets: [defaultSheet]
  };
}

// Helper para salvar dados
function saveData(data) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    const active = getActiveSpreadsheet(data);
    if (active) {
      generateExcelFile(active).catch(err => console.error('Erro ao atualizar Excel:', err));
    }
    return true;
  } catch (err) {
    console.error('Erro ao salvar dados:', err);
    return false;
  }
}

// Helper para obter planilha ativa
function getActiveSpreadsheet(data) {
  if (!data.spreadsheets || data.spreadsheets.length === 0) {
    const def = createDefaultData();
    data.spreadsheets = def.spreadsheets;
    data.activeSpreadsheetId = def.activeSpreadsheetId;
  }
  return data.spreadsheets.find(s => s.id === data.activeSpreadsheetId) || data.spreadsheets[0];
}

// Helper para calcular métricas e percentuais
function calculateSummary(sheet) {
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

// ==========================================================================
// ROTAS DE GESTÃO DE MULTI-PLANILHAS
// ==========================================================================

// 1. Listar todas as planilhas e identificar a ativa
app.get('/api/spreadsheets', (req, res) => {
  const data = readData();
  const list = data.spreadsheets.map(s => ({
    id: s.id,
    title: s.title,
    selectedMonth: s.selectedMonth,
    selectedYear: s.selectedYear,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    summary: calculateSummary(s)
  }));

  res.json({
    activeSpreadsheetId: data.activeSpreadsheetId,
    spreadsheets: list
  });
});

// 2. Criar Nova Planilha
app.post('/api/spreadsheets', (req, res) => {
  const { title, selectedMonth, selectedYear } = req.body;
  const name = (title || '').trim() || 'Nova Planilha';
  const data = readData();

  const newSheet = {
    id: 'sheet_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    title: name,
    selectedMonth: typeof selectedMonth === 'number' ? selectedMonth : undefined,
    selectedYear: typeof selectedYear === 'number' ? selectedYear : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    inflows: [],
    expenses: []
  };

  data.spreadsheets.push(newSheet);
  data.activeSpreadsheetId = newSheet.id;
  saveData(data);

  res.status(201).json({
    success: true,
    spreadsheet: {
      ...newSheet,
      summary: calculateSummary(newSheet)
    }
  });
});

// 3. Obter Detalhes da Planilha (ou Ativar)
app.get('/api/spreadsheets/:id', (req, res) => {
  const { id } = req.params;
  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);

  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  data.activeSpreadsheetId = sheet.id;
  saveData(data);

  res.json({
    id: sheet.id,
    title: sheet.title,
    selectedMonth: sheet.selectedMonth,
    selectedYear: sheet.selectedYear,
    inflows: sheet.inflows || [],
    expenses: sheet.expenses || [],
    summary: calculateSummary(sheet)
  });
});

// 4. Renomear / Alterar Período da Planilha
app.put('/api/spreadsheets/:id', (req, res) => {
  const { id } = req.params;
  const { title, selectedMonth, selectedYear } = req.body;

  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);

  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  if (title && title.trim()) {
    sheet.title = title.trim();
  }
  if (typeof selectedMonth === 'number') {
    sheet.selectedMonth = selectedMonth;
  }
  if (typeof selectedYear === 'number') {
    sheet.selectedYear = selectedYear;
  }
  sheet.updatedAt = new Date().toISOString();
  saveData(data);

  res.json({
    success: true,
    spreadsheet: {
      ...sheet,
      summary: calculateSummary(sheet)
    }
  });
});

// 5. Excluir Planilha
app.delete('/api/spreadsheets/:id', (req, res) => {
  const { id } = req.params;
  const data = readData();

  const initialLength = data.spreadsheets.length;
  data.spreadsheets = data.spreadsheets.filter(s => s.id !== id);

  if (data.spreadsheets.length === initialLength) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  if (data.spreadsheets.length === 0) {
    const def = createDefaultData();
    data.spreadsheets = def.spreadsheets;
    data.activeSpreadsheetId = def.activeSpreadsheetId;
  } else if (data.activeSpreadsheetId === id) {
    data.activeSpreadsheetId = data.spreadsheets[0].id;
  }

  saveData(data);

  res.json({
    success: true,
    message: 'Planilha excluída com sucesso.',
    activeSpreadsheetId: data.activeSpreadsheetId,
    activeSpreadsheet: getActiveSpreadsheet(data)
  });
});

// 6. Adicionar Gasto em Planilha Específica
app.post('/api/spreadsheets/:id/expenses', (req, res) => {
  const { id } = req.params;
  const { date, category, description, amount } = req.body;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'O valor do gasto deve ser maior que zero.' });
  }

  const finalCategory = (category && VALID_CATEGORIES.includes(category)) ? category : 'Outros';

  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);
  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  const newExpense = {
    id: 'exp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    date: date || new Date().toISOString().split('T')[0],
    category: finalCategory,
    description: (description || '').trim(),
    amount: parsedAmount
  };

  sheet.expenses = sheet.expenses || [];
  sheet.expenses.unshift(newExpense);
  sheet.updatedAt = new Date().toISOString();
  saveData(data);

  res.status(201).json({
    success: true,
    expense: newExpense,
    summary: calculateSummary(sheet)
  });
});

// 7. Excluir Gasto em Planilha Específica
app.delete('/api/spreadsheets/:id/expenses/:expenseId', (req, res) => {
  const { id, expenseId } = req.params;
  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);
  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  const initialLength = (sheet.expenses || []).length;
  sheet.expenses = (sheet.expenses || []).filter(e => e.id !== expenseId);

  if (sheet.expenses.length === initialLength) {
    return res.status(404).json({ error: 'Gasto não encontrado.' });
  }

  sheet.updatedAt = new Date().toISOString();
  saveData(data);

  res.json({
    success: true,
    message: 'Gasto removido com sucesso.',
    summary: calculateSummary(sheet)
  });
});

// 8. Adicionar Entrada em Planilha Específica
app.post('/api/spreadsheets/:id/inflows', (req, res) => {
  const { id } = req.params;
  const { date, source, amount } = req.body;

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'O valor da entrada deve ser maior que zero.' });
  }

  if (!source || !source.trim()) {
    return res.status(400).json({ error: 'Informe a fonte ou descrição da entrada de dinheiro.' });
  }

  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);
  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  const newInflow = {
    id: 'inf_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    date: date || new Date().toISOString().split('T')[0],
    source: source.trim(),
    amount: parsedAmount
  };

  sheet.inflows = sheet.inflows || [];
  sheet.inflows.unshift(newInflow);
  sheet.updatedAt = new Date().toISOString();
  saveData(data);

  res.status(201).json({
    success: true,
    inflow: newInflow,
    summary: calculateSummary(sheet)
  });
});

// 9. Excluir Entrada em Planilha Específica
app.delete('/api/spreadsheets/:id/inflows/:inflowId', (req, res) => {
  const { id, inflowId } = req.params;
  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);
  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  const initialLength = (sheet.inflows || []).length;
  sheet.inflows = (sheet.inflows || []).filter(i => i.id !== inflowId);

  if (sheet.inflows.length === initialLength) {
    return res.status(404).json({ error: 'Entrada não encontrada.' });
  }

  sheet.updatedAt = new Date().toISOString();
  saveData(data);

  res.json({
    success: true,
    message: 'Entrada removida com sucesso.',
    summary: calculateSummary(sheet)
  });
});

// 10. Zerar Planilha Específica
app.post('/api/spreadsheets/:id/clear', (req, res) => {
  const { id } = req.params;
  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);
  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  sheet.expenses = [];
  sheet.inflows = [];
  sheet.updatedAt = new Date().toISOString();
  saveData(data);

  res.json({
    success: true,
    message: 'Planilha zerada com sucesso.',
    summary: calculateSummary(sheet)
  });
});

// 11. Exportar Planilha Específica para Excel (.xlsx)
app.get('/api/spreadsheets/:id/export/excel', async (req, res) => {
  const { id } = req.params;
  const data = readData();
  const sheet = data.spreadsheets.find(s => s.id === id);
  if (!sheet) {
    return res.status(404).json({ error: 'Planilha não encontrada.' });
  }

  try {
    const excelPath = await generateExcelFile(sheet);
    const safeTitle = (sheet.title || 'Planilha').replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.download(excelPath, `${safeTitle}.xlsx`);
  } catch (err) {
    console.error('Falha ao exportar Excel:', err);
    res.status(500).json({ error: 'Falha ao gerar arquivo Excel.' });
  }
});

// ==========================================================================
// ROTAS DE COMPATIBILIDADE LEGADA (Operam na planilha ativa)
// ==========================================================================
app.get('/api/data', (req, res) => {
  const data = readData();
  const active = getActiveSpreadsheet(data);
  res.json({
    id: active.id,
    title: active.title,
    inflows: active.inflows || [],
    expenses: active.expenses || [],
    summary: calculateSummary(active)
  });
});

app.post('/api/expenses', (req, res) => {
  const data = readData();
  const active = getActiveSpreadsheet(data);
  req.params = { id: active.id };
  // Redireciona internamente
  const { date, category, description, amount } = req.body;
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'O valor do gasto deve ser maior que zero.' });
  }
  const finalCategory = (category && VALID_CATEGORIES.includes(category)) ? category : 'Outros';
  const newExpense = {
    id: 'exp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    date: date || new Date().toISOString().split('T')[0],
    category: finalCategory,
    description: (description || '').trim(),
    amount: parsedAmount
  };
  active.expenses = active.expenses || [];
  active.expenses.unshift(newExpense);
  active.updatedAt = new Date().toISOString();
  saveData(data);
  res.status(201).json({ success: true, expense: newExpense, summary: calculateSummary(active) });
});

app.delete('/api/expenses/:id', (req, res) => {
  const data = readData();
  const active = getActiveSpreadsheet(data);
  const initialLength = (active.expenses || []).length;
  active.expenses = (active.expenses || []).filter(e => e.id !== req.params.id);
  if (active.expenses.length === initialLength) {
    return res.status(404).json({ error: 'Gasto não encontrado.' });
  }
  active.updatedAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true, message: 'Gasto removido com sucesso.', summary: calculateSummary(active) });
});

app.post('/api/inflows', (req, res) => {
  const data = readData();
  const active = getActiveSpreadsheet(data);
  const { date, source, amount } = req.body;
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'O valor da entrada deve ser maior que zero.' });
  }
  if (!source || !source.trim()) {
    return res.status(400).json({ error: 'Informe a fonte da entrada.' });
  }
  const newInflow = {
    id: 'inf_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    date: date || new Date().toISOString().split('T')[0],
    source: source.trim(),
    amount: parsedAmount
  };
  active.inflows = active.inflows || [];
  active.inflows.unshift(newInflow);
  active.updatedAt = new Date().toISOString();
  saveData(data);
  res.status(201).json({ success: true, inflow: newInflow, summary: calculateSummary(active) });
});

app.delete('/api/inflows/:id', (req, res) => {
  const data = readData();
  const active = getActiveSpreadsheet(data);
  const initialLength = (active.inflows || []).length;
  active.inflows = (active.inflows || []).filter(i => i.id !== req.params.id);
  if (active.inflows.length === initialLength) {
    return res.status(404).json({ error: 'Entrada não encontrada.' });
  }
  active.updatedAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true, message: 'Entrada removida com sucesso.', summary: calculateSummary(active) });
});

app.post('/api/clear', (req, res) => {
  const data = readData();
  const active = getActiveSpreadsheet(data);
  active.inflows = [];
  active.expenses = [];
  active.updatedAt = new Date().toISOString();
  saveData(data);
  res.json({ success: true, message: 'Planilha zerada com sucesso.', summary: calculateSummary(active) });
});

app.get('/api/export/excel', async (req, res) => {
  try {
    const data = readData();
    const active = getActiveSpreadsheet(data);
    const excelPath = await generateExcelFile(active);
    const safeTitle = (active.title || 'Planilha_Gastos').replace(/[^a-zA-Z0-9_\-]/g, '_');
    res.download(excelPath, `${safeTitle}.xlsx`);
  } catch (err) {
    console.error('Falha ao exportar Excel:', err);
    res.status(500).json({ error: 'Falha ao gerar arquivo Excel.' });
  }
});

// Inicia o servidor com segurança no localhost
app.listen(PORT, '127.0.0.1', () => {
  console.log(`================================================`);
  console.log(` Planilha Multi-Gastos rodando com sucesso!`);
  console.log(` Acesso Seguro Local: http://localhost:${PORT}`);
  console.log(`================================================`);
});
