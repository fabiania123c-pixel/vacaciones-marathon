import * as XLSX from 'xlsx'

function norm(s) {
  if (!s) return ''
  return s.toString().toUpperCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

const MESES = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
}

// Builds { normalizedName -> cedula } from a lookup sheet like "Hoja1"
// (col A = nombre, col C = cedula). Used to correct/complete cedulas —
// never trust a cedula column embedded in the main sheet, only this lookup.
function buildCedulaLookup(wb) {
  const sheetNames = wb.SheetNames.filter((n) => /hoja/i.test(n))
  const lookup = {}
  const lookupSorted = {}
  for (const sn of sheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null })
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      if (!row) continue
      const name = row[0]
      const ci = row[2]
      if (name && ci) {
        const key = norm(name)
        lookup[key] = String(ci)
        lookupSorted[key.split(' ').sort().join(' ')] = String(ci)
      }
    }
  }
  return { lookup, lookupSorted }
}

function getCedula(name, lookup, lookupSorted) {
  const key = norm(name)
  if (lookup[key]) return lookup[key]
  const tk = key.split(' ').sort().join(' ')
  if (lookupSorted[tk]) return lookupSorted[tk]
  return null
}

function parseCorteSheet(sheetName, ws, lookup, lookupSorted) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  let headerRowIdx = -1
  let headers = null
  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const row = rows[r]
    if (row && row.some((c) => norm(c) === 'NOMBRE Y APELLIDO')) {
      headerRowIdx = r
      headers = row
      break
    }
  }
  if (headerRowIdx === -1) return null

  const col = {}
  headers.forEach((h, i) => {
    const n = norm(h)
    if (n === 'NOMBRE Y APELLIDO' && col.nombre === undefined) col.nombre = i
    if (n === 'CARGO' && col.cargo === undefined) col.cargo = i
    if (n.includes('UNIDAD ORGANIZATIVA') && col.area === undefined) col.area = i
    if (n.includes('FECHA INGRESO') && col.fechaIngreso === undefined) col.fechaIngreso = i
  })

  let saldoCols = []
  headers.forEach((h, i) => { if (norm(h).includes('SALDO VACACIONES')) saldoCols.push(i) })
  col.saldoActual = saldoCols.length ? saldoCols[saldoCols.length - 1] : undefined
  const saldoLabel = saldoCols.length ? headers[col.saldoActual] : null

  headers.forEach((h, i) => {
    const n = norm(h)
    if (n.includes('DIAS TOMADOS') && col.diasTomados === undefined) col.diasTomados = i
    if (n.startsWith('TOTAL DIAS') && col.totalProgramado === undefined) col.totalProgramado = i
    if (n.startsWith('SALDO DIAS') && col.saldoProyectado === undefined) col.saldoProyectado = i
    if (n.startsWith('BP') && col.bp === undefined) col.bp = i
  })

  const blocks = []
  headers.forEach((h, i) => {
    if (norm(h) === 'DESDE' && norm(headers[i + 1]) === 'HASTA') blocks.push([i, i + 1, i + 2])
  })

  let corteDate = null
  if (saldoLabel) {
    const nl = norm(saldoLabel)
    for (const [mes, num] of Object.entries(MESES)) {
      if (nl.includes(mes.toUpperCase())) {
        const ym = nl.match(/(20\d{2})/)
        if (ym) corteDate = `${ym[1]}-${String(num).padStart(2, '0')}-01`
        break
      }
    }
  }

  const employees = {}
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    const name = row[col.nombre]
    if (!name) continue
    const key = norm(name)
    const saldo = (col.saldoActual !== undefined && typeof row[col.saldoActual] === 'number') ? row[col.saldoActual] : 0
    const tomados = (col.diasTomados !== undefined && typeof row[col.diasTomados] === 'number') ? row[col.diasTomados] : 0

    // Consolidate accidental duplicate rows (same person split across
    // multiple rows) — keep the row that actually has a populated saldo.
    if (!employees[key] || (saldo && !employees[key].saldo)) {
      employees[key] = {
        nombre: name.toString().trim(),
        cargo: col.cargo !== undefined ? row[col.cargo] : null,
        area: col.area !== undefined ? row[col.area] : null,
        bp: col.bp !== undefined ? row[col.bp] : null,
        cedula: getCedula(name, lookup, lookupSorted),
        fechaIngreso: col.fechaIngreso !== undefined ? row[col.fechaIngreso] : null,
        saldo,
        tomados,
        saldoProyectado: col.saldoProyectado !== undefined ? row[col.saldoProyectado] : null,
        diferencia: col.diferencia !== undefined ? row[col.diferencia] : null,
        schedule: [],
      }
    }
    blocks.forEach(([d, h, n]) => {
      const desde = row[d]
      const hasta = row[h]
      const dias = row[n]
      if (desde && hasta && desde instanceof Date && hasta instanceof Date && hasta >= desde) {
        employees[key].schedule.push({ desde, hasta, dias })
      }
    })
  }

  return { sheetName, corteDate, employees: Object.values(employees) }
}

function parseRatioBlock(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  let base = null, tomados = null, pctTomado = null, pctPendiente = null
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const v = norm(row[c])
      if (v.includes('RATIO DIA TOMADOS')) {
        base = rows[r + 1] ? rows[r + 1][c + 2] : null
        tomados = rows[r + 2] ? rows[r + 2][c + 2] : null
      }
      if (v.includes('RATIO DIAS PENDIENTES')) {
        pctPendiente = rows[r + 1] ? rows[r + 1][c + 2] : null
      }
    }
  }
  if (base && tomados) pctTomado = tomados / base
  return base ? { base, tomados, pctTomado, pctPendiente } : null
}

// Main entry point: reads a File, returns structured data ready for upload.
// Picks the most recent valid "corte" sheet (by parsed date, else last sheet).
export async function parseVacacionesFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const { lookup, lookupSorted } = buildCedulaLookup(wb)

  const cortes = []
  for (const sn of wb.SheetNames) {
    if (/hoja/i.test(sn)) continue
    const parsed = parseCorteSheet(sn, wb.Sheets[sn], lookup, lookupSorted)
    if (parsed && parsed.employees.length > 0) cortes.push(parsed)
  }
  if (cortes.length === 0) {
    throw new Error('No encontré ninguna hoja con la estructura esperada (columna "NOMBRE Y APELLIDO").')
  }

  cortes.sort((a, b) => {
    if (a.corteDate && b.corteDate) return a.corteDate.localeCompare(b.corteDate)
    return 0
  })
  const latest = cortes[cortes.length - 1]
  const ratio = parseRatioBlock(wb.Sheets[latest.sheetName])

  return {
    fechaCorte: latest.corteDate || new Date().toISOString().slice(0, 10),
    sourceFile: file.name,
    employees: latest.employees,
    ratio,
  }
}
