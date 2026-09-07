import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Ejecuta el código real de los helpers/hooks sin dependencias de navegador.
function cargar(ruta, globals = {}, dependencias = {}) {
  const source = readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, ...globals,
    require(name) {
      if (name in dependencias) return dependencias[name];
      throw new Error(`Dependencia no simulada: ${name}`);
    },
  });
  return exports;
}

const formato = cargar('src/lib/format.ts');
test('búsqueda optimizada conserva volumen exacto, acentos y cambios de consulta', () => {
  const producto = { nombre: 'Club de Nuit Intense', marca: 'Armaf', volumen_ml: 100, categoria: ['Árabe'] };
  assert.equal(formato.coincideBusqueda(producto, 'armaf club de nuit'), true);
  assert.equal(formato.coincideBusqueda(producto, '10 ml'), false);
  assert.equal(formato.coincideBusqueda(producto, '100 ml arabe'), true);
  assert.equal(formato.coincideBusqueda(producto, ''), true);
  assert.equal(formato.coincideBusqueda(producto, 'lattafa'), false);
});

test('checkout incluye indicaciones aunque sean el único dato de entrega', () => {
  const url = formato.buildWhatsAppCheckoutUrl([], '595000000000', { indicaciones: 'Portón azul' });
  const mensaje = new URL(url).searchParams.get('text');
  assert.match(mensaje, /DATOS DE ENTREGA/);
  assert.match(mensaje, /Indicaciones: Portón azul/);
});

function navegadorOverlay() {
  const tareas = [];
  const listeners = new Map();
  const entradas = [{ __NA: true, tree: 'router-preservado' }];
  let indice = 0;
  let limpieza;
  const document = { body: { style: { overflow: 'auto' } } };
  const window = {
    addEventListener: (nombre, fn) => listeners.set(nombre, fn),
    history: {
      get state() { return entradas[indice]; },
      pushState(state) { entradas.splice(++indice); entradas[indice] = state; },
      back() { tareas.push(() => { indice = Math.max(0, indice - 1); listeners.get('popstate')?.(); }); },
    },
  };
  const modulo = cargar('src/hooks/use-cerrar-con-atras.ts', {
    document, window, queueMicrotask: fn => tareas.push(fn),
  }, {
    react: {
      useRef: current => ({ current }),
      useEffect: fn => { const resultado = fn(); if (resultado) limpieza = resultado; },
    },
  });
  return {
    window, document,
    abrir(onClose) { modulo.useCerrarConAtras(true, onClose); return limpieza; },
    flush() {
      let vueltas = 0;
      while (tareas.length) {
        assert.ok(++vueltas < 100, 'el historial no debe entrar en bucle');
        tareas.shift()();
      }
    },
  };
}

test('Atrás cierra sólo checkout y mantiene bloqueado el scroll del carrito', () => {
  const n = navegadorOverlay();
  let carritoCerrado = 0;
  let pagoCerrado = 0;
  const quitarCart = n.abrir(() => carritoCerrado++);
  n.flush();
  const quitarPago = n.abrir(() => pagoCerrado++);
  n.flush();
  assert.equal(n.window.history.state.__NA, true);
  assert.equal(n.window.history.state.tree, 'router-preservado');
  n.window.history.back(); n.flush();
  assert.equal(pagoCerrado, 1);
  assert.equal(carritoCerrado, 0);
  assert.equal(n.document.body.style.overflow, 'hidden');
  quitarPago(); quitarCart(); n.flush();
  assert.equal(n.document.body.style.overflow, 'auto');
  assert.equal(n.window.history.state.majalisOverlay, undefined);
});

test('pasar de perfume a carrito no consume la entrada nueva de historial', () => {
  const n = navegadorOverlay();
  let cerrado = 0;
  const quitarPerfume = n.abrir(() => {}); n.flush();
  quitarPerfume();
  const quitarCart = n.abrir(() => cerrado++); n.flush();
  assert.equal(cerrado, 0);
  assert.equal(n.document.body.style.overflow, 'hidden');
  assert.match(n.window.history.state.majalisOverlay, /^majalis-/);
  n.window.history.back(); n.flush();
  assert.equal(cerrado, 1);
  quitarCart(); n.flush();
  assert.equal(n.document.body.style.overflow, 'auto');
});

test('montaje doble de StrictMode no deja estados o bloqueo huérfanos', () => {
  const n = navegadorOverlay();
  n.abrir(() => {})();
  const quitar = n.abrir(() => {}); n.flush();
  quitar(); n.flush();
  assert.equal(n.document.body.style.overflow, 'auto');
  assert.equal(n.window.history.state.majalisOverlay, undefined);
});

test('cursor se posiciona sin frames diferidos y se oculta con touch/movimiento reducido', () => {
  const listeners = new Map();
  const core = { style: {} }, halo = { style: {} };
  const refs = [core, halo];
  const reduced = { matches: false, addEventListener() {}, removeEventListener() {} };
  const fine = { ...reduced, matches: true };
  let cleanup;
  const window = {
    matchMedia: query => query.includes('reduced') ? reduced : fine,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: name => listeners.delete(name),
  };
  const modulo = cargar('src/components/ui/liquid-cursor.tsx', { window, Element: class {} }, {
    react: { useRef: () => ({ current: refs.shift() }), useEffect: fn => { cleanup = fn(); } },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
  });
  modulo.LiquidCursor();
  listeners.get('pointermove')({ clientX: 800, clientY: 300, pointerType: 'mouse' });
  assert.equal(core.style.transform, 'translate3d(796px, 296px, 0)');
  assert.equal(halo.style.transform, 'translate3d(780px, 280px, 0) scale(1)');
  assert.equal(halo.style.visibility, 'visible');
  listeners.get('pointermove')({ pointerType: 'touch' });
  assert.equal(halo.style.visibility, 'hidden');
  reduced.matches = true;
  listeners.get('pointermove')({ clientX: 100, clientY: 50, pointerType: 'mouse' });
  assert.equal(core.style.visibility, 'hidden');
  cleanup();
  assert.equal(listeners.size, 0);
});
