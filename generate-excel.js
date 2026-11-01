const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function generateExcelFile(spreadsheetInput = null, outputPath = null) {
  let targetData = null;
  let customOutputPath = outputPath;

  if (typeof spreadsheetInput === 'string') {
    customOutputPath = spreadsheetInput;
  } else if (spreadsheetInput && typeof spreadsheetInput === 'object') {
    targetData = spreadsheetInput;
  }

  if (!targetData) {
    const dataPath = path.join(__dirname, 'data', 'finances.json');
    if (fs.existsSync(dataPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        if (raw.spreadsheets && Array.isArray(raw.spreadsheets) && raw.spreadsheets.length > 0) {
          const active = raw.spreadsheets.find(s => s.id === raw.activeSpreadsheetId) || raw.spreadsheets[0];
          targetData = active;
        } else {
          targetData = raw;
        }
      } catch (e) {
        console.error('Erro ao ler finances.json:', e);
      }
    }
  }

  const finances = {
    title: (targetData && targetData.title) ? targetData.title.toUpperCase() : 'BALANÇO FINANCEIRO MENSAL',
    inflows: (targetData && targetData.inflows) || [],
    expenses: (targetData && targetData.expenses) || []
  };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Controle Financeiro';
  workbook.lastModifiedBy = 'Pedro';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ----------------------------------------------------
  // 1. ABA: RESUMO GERAL
  // ----------------------------------------------------
  const summarySheet = workbook.addWorksheet('Resumo Geral', {
    views: [{ showGridLines: true }]
  });

  summarySheet.columns = [
    { width: 5 },
    { width: 28 },
    { width: 22 },
    { width: 16 },
    { width: 5 }
  ];

  // Título
  summarySheet.mergeCells('B2:D2');
  const titleCell = summarySheet.getCell('B2');
  titleCell.value = finances.title;
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }
  };
  summarySheet.getRow(2).height = 36;

  // Cabeçalho dos Indicadores
  summarySheet.getCell('B4').value = 'INDICADOR';
  summarySheet.getCell('C4').value = 'VALOR TOTAL (R$)';
  summarySheet.getCell('D4').value = 'STATUS';

  ['B4', 'C4', 'D4'].forEach(cell => {
    const c = summarySheet.getCell(cell);
    c.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  summarySheet.getRow(4).height = 24;

  // Linhas de Métricas
  const metrics = [
    { name: 'Total de Entradas (Receitas)', formula: "SUM('Entradas de Dinheiro'!D5:D200)", color: 'FF10B981', status: 'Recebido' },
    { name: 'Total de Gastos (Saídas)', formula: "SUM('Gastos Mensais'!E5:E200)", color: 'FFEF4444', status: 'Gasto' },
    { name: 'Saldo Atual (Líquido)', formula: 'C5-C6', color: 'FF3B82F6', status: 'Disponível' }
  ];

  metrics.forEach((m, idx) => {
    const row = 5 + idx;
    summarySheet.getCell(`B${row}`).value = m.name;
    summarySheet.getCell(`B${row}`).font = { name: 'Segoe UI', size: 11, bold: true };
    summarySheet.getCell(`B${row}`).alignment = { vertical: 'middle' };

    summarySheet.getCell(`C${row}`).value = { formula: m.formula };
    summarySheet.getCell(`C${row}`).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: m.color } };
    summarySheet.getCell(`C${row}`).numFmt = '"R$ "#,##0.00';
    summarySheet.getCell(`C${row}`).alignment = { horizontal: 'right', vertical: 'middle' };

    summarySheet.getCell(`D${row}`).value = m.status;
    summarySheet.getCell(`D${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getCell(`D${row}`).font = { name: 'Segoe UI', size: 10 };

    summarySheet.getRow(row).height = 24;
  });

  // Seção Gastos por Categoria
  summarySheet.mergeCells('B9:D9');
  const catTitle = summarySheet.getCell('B9');
  catTitle.value = 'DISTRIBUIÇÃO DOS GASTOS POR CATEGORIA';
  catTitle.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  catTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
  catTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getRow(9).height = 26;

  summarySheet.getCell('B10').value = 'CATEGORIA';
  summarySheet.getCell('C10').value = 'TOTAL GASTO (R$)';
  summarySheet.getCell('D10').value = '% DO TOTAL';
  ['B10', 'C10', 'D10'].forEach(cell => {
    const c = summarySheet.getCell(cell);
    c.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF64748B' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const categories = [
    { name: 'Mercado', icon: '🛒 Mercado' },
    { name: 'Aluguel', icon: '🏠 Aluguel' },
    { name: 'Lazer', icon: '🍿 Lazer' },
    { name: 'Reserva de Emergência', icon: '🛡️ Reserva de Emergência' },
    { name: 'Transporte', icon: '🚗 Transporte' },
    { name: 'Saúde', icon: '💊 Saúde' },
    { name: 'Contas Fixas', icon: '⚡ Contas Fixas' },
    { name: 'Educação', icon: '📚 Educação' },
    { name: 'Outros', icon: '📦 Outros' }
  ];

  categories.forEach((cat, idx) => {
    const row = 11 + idx;
    summarySheet.getCell(`B${row}`).value = cat.icon;
    summarySheet.getCell(`B${row}`).font = { name: 'Segoe UI', size: 11 };
    summarySheet.getCell(`B${row}`).alignment = { vertical: 'middle' };

    summarySheet.getCell(`C${row}`).value = {
      formula: `SUMIF('Gastos Mensais'!C5:C200, "${cat.name}", 'Gastos Mensais'!E5:E200)`
    };
    summarySheet.getCell(`C${row}`).font = { name: 'Segoe UI', size: 11, bold: true };
    summarySheet.getCell(`C${row}`).numFmt = '"R$ "#,##0.00';
    summarySheet.getCell(`C${row}`).alignment = { horizontal: 'right', vertical: 'middle' };

    summarySheet.getCell(`D${row}`).value = {
      formula: `IF($C$6>0, C${row}/$C$6, 0)`
    };
    summarySheet.getCell(`D${row}`).numFmt = '0.0%';
    summarySheet.getCell(`D${row}`).alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.getRow(row).height = 22;
  });

  // ----------------------------------------------------
  // 2. ABA: ENTRADAS DE DINHEIRO
  // ----------------------------------------------------
  const inflowsSheet = workbook.addWorksheet('Entradas de Dinheiro', {
    views: [{ showGridLines: true }]
  });

  inflowsSheet.columns = [
    { width: 5 },
    { width: 16 },
    { width: 34 },
    { width: 20 },
    { width: 5 }
  ];

  inflowsSheet.mergeCells('B2:D2');
  const infTitle = inflowsSheet.getCell('B2');
  infTitle.value = 'ENTRADAS DE DINHEIRO (RECEITAS)';
  infTitle.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  infTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
  infTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  inflowsSheet.getRow(2).height = 32;

  inflowsSheet.getCell('B4').value = 'DATA';
  inflowsSheet.getCell('C4').value = 'FONTE / DESCRIÇÃO';
  inflowsSheet.getCell('D4').value = 'VALOR (R$)';
  ['B4', 'C4', 'D4'].forEach(cell => {
    const c = inflowsSheet.getCell(cell);
    c.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  inflowsSheet.getRow(4).height = 24;

  let infRow = 5;
  finances.inflows.forEach(inf => {
    inflowsSheet.getCell(`B${infRow}`).value = inf.date;
    inflowsSheet.getCell(`B${infRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

    inflowsSheet.getCell(`C${infRow}`).value = inf.source;
    inflowsSheet.getCell(`C${infRow}`).alignment = { vertical: 'middle' };

    inflowsSheet.getCell(`D${infRow}`).value = parseFloat(inf.amount) || 0;
    inflowsSheet.getCell(`D${infRow}`).numFmt = '"R$ "#,##0.00';
    inflowsSheet.getCell(`D${infRow}`).font = { bold: true, color: { argb: 'FF047857' } };
    inflowsSheet.getCell(`D${infRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    inflowsSheet.getRow(infRow).height = 22;
    infRow++;
  });

  // Linha Total Entradas
  inflowsSheet.getCell(`B${infRow}`).value = 'TOTAL';
  inflowsSheet.getCell(`B${infRow}`).font = { bold: true };
  inflowsSheet.getCell(`D${infRow}`).value = { formula: `SUM(D5:D${infRow - 1})` };
  inflowsSheet.getCell(`D${infRow}`).font = { bold: true, size: 12, color: { argb: 'FF047857' } };
  inflowsSheet.getCell(`D${infRow}`).numFmt = '"R$ "#,##0.00';
  inflowsSheet.getCell(`D${infRow}`).alignment = { horizontal: 'right' };
  inflowsSheet.getRow(infRow).height = 26;

  // ----------------------------------------------------
  // 3. ABA: GASTOS MENSAIS
  // ----------------------------------------------------
  const expensesSheet = workbook.addWorksheet('Gastos Mensais', {
    views: [{ showGridLines: true }]
  });

  expensesSheet.columns = [
    { width: 5 },
    { width: 14 },
    { width: 18 },
    { width: 38 },
    { width: 20 },
    { width: 5 }
  ];

  expensesSheet.mergeCells('B2:E2');
  const expTitle = expensesSheet.getCell('B2');
  expTitle.value = 'REGISTRO DE GASTOS MENSAIS';
  expTitle.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  expTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
  expTitle.alignment = { horizontal: 'center', vertical: 'middle' };
  expensesSheet.getRow(2).height = 32;

  expensesSheet.getCell('B4').value = 'DATA';
  expensesSheet.getCell('C4').value = 'CATEGORIA';
  expensesSheet.getCell('D4').value = 'DESCRIÇÃO (OPCIONAL)';
  expensesSheet.getCell('E4').value = 'VALOR (R$)';
  ['B4', 'C4', 'D4', 'E4'].forEach(cell => {
    const c = expensesSheet.getCell(cell);
    c.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  expensesSheet.getRow(4).height = 24;

  let expRow = 5;
  finances.expenses.forEach(exp => {
    expensesSheet.getCell(`B${expRow}`).value = exp.date;
    expensesSheet.getCell(`B${expRow}`).alignment = { horizontal: 'center', vertical: 'middle' };

    expensesSheet.getCell(`C${expRow}`).value = exp.category;
    expensesSheet.getCell(`C${expRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
    expensesSheet.getCell(`C${expRow}`).font = { bold: true };

    expensesSheet.getCell(`D${expRow}`).value = exp.description || '-';
    expensesSheet.getCell(`D${expRow}`).alignment = { vertical: 'middle' };

    expensesSheet.getCell(`E${expRow}`).value = parseFloat(exp.amount) || 0;
    expensesSheet.getCell(`E${expRow}`).numFmt = '"R$ "#,##0.00';
    expensesSheet.getCell(`E${expRow}`).font = { bold: true, color: { argb: 'FFDC2626' } };
    expensesSheet.getCell(`E${expRow}`).alignment = { horizontal: 'right', vertical: 'middle' };

    expensesSheet.getRow(expRow).height = 22;
    expRow++;
  });

  // Linha Total Gastos
  expensesSheet.getCell(`B${expRow}`).value = 'TOTAL';
  expensesSheet.getCell(`B${expRow}`).font = { bold: true };
  expensesSheet.getCell(`E${expRow}`).value = { formula: `SUM(E5:E${expRow - 1})` };
  expensesSheet.getCell(`E${expRow}`).font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
  expensesSheet.getCell(`E${expRow}`).numFmt = '"R$ "#,##0.00';
  expensesSheet.getCell(`E${expRow}`).alignment = { horizontal: 'right' };
  expensesSheet.getRow(expRow).height = 26;

  const finalPath = customOutputPath || outputPath || path.join(__dirname, 'Planilha_Gastos_Mensais.xlsx');
  await workbook.xlsx.writeFile(finalPath);
  console.log(`Planilha Excel criada com sucesso em: ${finalPath}`);
  return finalPath;
}

if (require.main === module) {
  generateExcelFile().catch(console.error);
}

module.exports = { generateExcelFile };
