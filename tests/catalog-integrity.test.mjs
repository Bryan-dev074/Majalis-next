import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";

const archivo = new URL("../src/lib/catalog-integrity.ts", import.meta.url);
const js = ts.transpileModule(readFileSync(archivo, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
vm.runInNewContext(js, { exports, require: createRequire(import.meta.url) });
const { actualizarProductoVerificado, protegerCatalogoConFichas, fusionarFichaFresca, fichaComprable } = exports;
const anterior = { id: "p", nombre: "Kaaf", marca: "Ahmed", activo: true,
  stock_disponible: 2, precio_regular: 100000, precio_descuento: null,
  en_oferta: false, porcentaje_descuento: 0, descripcion: "", notas_olfativas: undefined };
const lista = [anterior];

assert.equal(actualizarProductoVerificado(lista, { ...anterior, descripcion: "Ficha ampliada" }), lista,
  "cargar notas/descripción no debe invalidar el catálogo");
const fresca = { ...anterior, stock_disponible: 1, precio_regular: 120000, descripcion: "Notas frescas" };
const fusionada = fusionarFichaFresca(anterior, fresca);
assert.equal(fusionada.precio_regular, 120000);
assert.equal(fusionada.stock_disponible, 1);
const corregida = actualizarProductoVerificado(lista, fresca);
assert.equal(corregida[0].precio_regular, 120000);
assert.equal(corregida[0].descripcion, "", "el listado sigue siendo compacto");
const agotada = { ...anterior, activo: false, stock_disponible: 0 };
assert.equal(actualizarProductoVerificado(lista, agotada).length, 0, "404 debe retirar producto y carrito");
assert.equal(protegerCatalogoConFichas(lista, new Map([["p", { perfume: agotada, verificadoEn: 0 }]]), 359000).length, 0,
  "SWR a los 359 s no debe resucitar una baja verificada");
assert.equal(protegerCatalogoConFichas(lista, new Map([["p", { perfume: fresca, verificadoEn: 0 }]]), 599999)[0].precio_regular, 120000);
assert.equal(protegerCatalogoConFichas(lista, new Map([["p", { perfume: fresca, verificadoEn: 0 }]]), 600000), lista,
  "el override vence a los diez minutos");
assert.equal(fichaComprable(anterior, false, true, null), false, "abrir cache visual nunca habilita compra");
assert.equal(fichaComprable(anterior, false, false, "Error"), false, "error no confirma stock");
assert.equal(fichaComprable(anterior, true, false, null), true);
assert.equal(fichaComprable(agotada, true, false, null), false);
console.log("OK: ficha fresca, no rerender por notas, 404, protección SWR y compra pendiente/error/agotada");
