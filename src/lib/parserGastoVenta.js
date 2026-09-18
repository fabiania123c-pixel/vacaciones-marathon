import * as XLSX from 'xlsx'

const CATEGORIAS_VALIDAS = new Set([
  'Nomina', 'Beneficios Sociales', 'Bonos y Otras Remuneraciones', 'Comisiones', 'Indemnizaciones',
])

function periodoAFecha(periodoStr) {
  // '202608' -> '2026-08-01'
  if (!periodoStr || periodoStr.length !== 6) return null
  const y = periodoStr.slice(0, 4)
  const m = periodoStr.slice(4, 6)
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m)) return null
  return `${y}-${m}-01`
}

function fechaPagoAPeriodo(fechaPago) {
  // Fallback para filas con Período = '000000' — usamos la fecha de pago real,
  // que sí viene poblada, en vez de perder ese gasto del análisis mensual.
  if (!(fechaPago instanceof Date) || isNaN(fechaPago)) return null
  const y = fechaPago.getFullYear()
  const m = String(fechaPago.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

/**
 * Parsea el export "GASTO VENTA" (hoja "Consolidado 2025 - 2026").
 * Devuelve estructuras ya agregadas — nunca mandamos las ~150K filas crudas
 * a Supabase, se agregan aquí mismo en el navegador antes de subir.
 */
export async function parseGastoVentaFile(file) {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const sheetName = wb.SheetNames.find((n) => /consolidado/i.test(n)) || wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })

  if (rows.length === 0) {
    throw new Error('La hoja "Consolidado" está vacía o no tiene el formato esperado.')
  }

  // tiendaKey -> { nombre, tipo, provincia, pais, metraje }
  const tiendas = new Map()
  // `${tiendaKey}|${periodo}|${categoria}` -> importe acumulado
  const gastoPorCategoria = new Map()
  // `${tiendaKey}|${periodo}` -> { ventaValores: Set, personal: Set, gastoTotal }
  const resumen = new Map()

  let filasSinPeriodoRecuperadas = 0
  let importeRecuperado = 0
  let filasSinCategoria = 0

  for (const r of rows) {
    const nombreTienda = r['Tienda']
    if (!nombreTienda) continue

    if (!tiendas.has(nombreTienda)) {
      tiendas.set(nombreTienda, {
        nombre: nombreTienda,
        tipo: r['Tipo'] === 'ISLA' ? 'ISLA' : 'TIENDAS',
        provincia: r['Texto división de personal'] || null,
        pais: r['Agrupación de países'] || 'EC',
        metraje: typeof r['Metraje'] === 'number' ? r['Metraje'] : null,
      })
    }

    let periodoRaw = r['Período para nómina']
    let periodo = periodoAFecha(periodoRaw)
    if (!periodo || periodoRaw === '000000') {
      periodo = fechaPagoAPeriodo(r['Fecha de pago'])
      if (periodo) {
        filasSinPeriodoRecuperadas++
        importeRecuperado += (typeof r['Importe'] === 'number' ? r['Importe'] : 0)
      }
    }
    if (!periodo) continue // sin período derivable, se descarta (raro)

    const categoria = r['Rubro']
    if (!CATEGORIAS_VALIDAS.has(categoria)) { filasSinCategoria++; continue }

    const importe = typeof r['Importe'] === 'number' ? r['Importe'] : 0

    const catKey = `${nombreTienda}|${periodo}|${categoria}`
    gastoPorCategoria.set(catKey, (gastoPorCategoria.get(catKey) || 0) + importe)

    const resKey = `${nombreTienda}|${periodo}`
    if (!resumen.has(resKey)) {
      resumen.set(resKey, { tienda: nombreTienda, periodo, ventaValores: new Set(), personal: new Set(), gastoTotal: 0 })
    }
    const res = resumen.get(resKey)
    res.gastoTotal += importe
    res.personal.add(r['Número de personal'])
    const venta = r['Venta']
    if (typeof venta === 'number') res.ventaValores.add(venta)
  }

  const tiendasOut = Array.from(tiendas.values())
  const gastoOut = Array.from(gastoPorCategoria.entries()).map(([key, importe]) => {
    const [tienda, periodo, categoria] = key.split('|')
    return { tienda, periodo, categoria, importe: Math.round(importe * 100) / 100 }
  })

  let nTiendasSinVenta = 0
  const resumenOut = Array.from(resumen.values()).map((r) => {
    // Venta es constante por tienda+período en el export; si por algo hay
    // más de un valor, nos quedamos con el mayor (más completo) y seguimos.
    const venta = r.ventaValores.size > 0 ? Math.max(...r.ventaValores) : null
    if (venta === null) nTiendasSinVenta++
    return {
      tienda: r.tienda,
      periodo: r.periodo,
      gastoTotal: Math.round(r.gastoTotal * 100) / 100,
      venta,
      hc: r.personal.size,
      ratioPct: venta ? Math.round((r.gastoTotal / venta) * 1000) / 10 : null,
    }
  })

  return {
    sourceFile: file.name,
    tiendas: tiendasOut,
    gastoDetalle: gastoOut,
    resumen: resumenOut,
    stats: {
      nFilas: rows.length,
      nTiendas: tiendasOut.length,
      nTiendaPeriodoSinVenta: nTiendasSinVenta,
      filasSinPeriodoRecuperadas,
      importeRecuperado: Math.round(importeRecuperado * 100) / 100,
      filasSinCategoria,
    },
  }
}