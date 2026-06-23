"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  Lock, Eye, EyeOff, LogOut, Plus, Minus, Pencil, Trash2,
  Search, Star, Power, Tag, Boxes, X, ExternalLink,
  AlertTriangle, CheckCircle2, FlaskConical, Sun, Moon,
  BarChart2, RefreshCw, Zap, ShieldAlert, KeyRound, Save,
} from "lucide-react";
import { Perfume, Cupon } from "@/types/database";
import { formatGs, precioEfectivo } from "@/lib/format";
import {
  loginAction, logoutAction, guardarPerfumeAction, eliminarPerfumeAction,
  ajustarStockAction, togglePerfumeAction, ocultarTodosAction, mostrarTodosAction,
  guardarCuponAction, toggleCuponAction, eliminarCuponAction, resetearClicksAction,
  guardarProveedorAction, sincronizarProveedorAction,
  type PerfumeInput, type CuponInput, type DatosAdmin,
  type ConfigProveedor,
} from "./actions";

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface AdminClientProps {
  autenticado: boolean;
  datos: DatosAdmin;
}

type Pestaña = "stock" | "externo" | "demo" | "analitica" | "cupones";

interface Toast { tipo: "ok" | "error"; texto: string; }

// ─── Helper: detectar origen externo ────────────────────────────────────────
const esExterno = (p: Perfume) =>
  p.es_dropi === true || (p.sku != null && p.sku.startsWith("DROPI-"));

// ════════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ════════════════════════════════════════════════════════════════════════════
export default function AdminClient({ autenticado, datos }: AdminClientProps) {
  if (!autenticado) return <LoginView />;
  return <PanelView datos={datos} />;
}

// ════════════════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════════════════
function LoginView() {
  const [password, setPassword] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await loginAction(password);
      if (!res.ok) setError(res.error ?? "Error");
      else window.location.reload();
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={entrar} className="adm-card w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl"
            style={{ background: "#050505", color: "#d4af37" }}
          >
            <Lock className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold">Panel del Creador</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--adm-text-muted)" }}>
            Sultan Oud Elixir
          </p>
        </div>

        <label className="adm-label">Contraseña</label>
        <div className="relative">
          <input
            type={mostrar ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="adm-input pr-9"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: "var(--adm-text-muted)" }}
          >
            {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: "var(--adm-red)" }}>
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="adm-btn adm-btn-primary mt-5 w-full">
          {pending ? "Entrando…" : "Entrar"}
        </button>

        <a href="/" className="mt-4 block text-center text-xs" style={{ color: "var(--adm-text-muted)" }}>
          ← Volver a la tienda
        </a>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PANEL PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
function PanelView({ datos }: { datos: DatosAdmin }) {
  const [pestaña, setPestaña] = useState<Pestaña>("stock");
  const [toast, setToast] = useState<Toast | null>(null);
  const [, startTransition] = useTransition();

  // Estado local optimista
  const [perfumes, setPerfumes] = useState<Perfume[]>(datos.perfumes);
  const [cupones, setCupones] = useState<Cupon[]>(datos.cupones);
  const [top5, setTop5] = useState(datos.top5);
  const [modalPerfume, setModalPerfume] = useState<PerfumeInput | null>(null);
  // Id del perfume cuyo stock se está mutando (para spinner en +/-)
  const [stockPending, setStockPending] = useState<string | null>(null);

  // Tema claro / oscuro persistido
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined")
      return localStorage.getItem("sultan-admin-theme") === "dark";
    return false;
  });
  useEffect(() => {
    localStorage.setItem("sultan-admin-theme", dark ? "dark" : "light");
  }, [dark]);

  const toast_ = (tipo: "ok" | "error", texto: string) => {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 3200);
  };

  // Segmentar perfumes
  const stock = perfumes.filter((p) => !esExterno(p) && !p.es_demo);
  const externo = perfumes.filter((p) => esExterno(p) && !p.es_demo);
  const demos = perfumes.filter((p) => p.es_demo);

  // KPIs
  const kpis = useMemo(() => ({
    stock: stock.length,
    externo: externo.length,
    demos: demos.length,
    bajoStock: stock.filter((p) => p.stock_disponible < 3).length,
    cuponesActivos: cupones.filter((c) => c.activo).length,
  }), [stock, externo, demos, cupones]);

  // ─── Handlers comunes ───
  const onStock = (id: string, delta: number) => {
    setStockPending(id);
    // Mutación optimista: el número cambia al instante en pantalla
    setPerfumes((prev) =>
      prev.map((p) => p.id === id
        ? { ...p, stock_disponible: Math.max(0, p.stock_disponible + delta) }
        : p
      )
    );
    startTransition(async () => {
      const res = await ajustarStockAction(id, delta);
      setStockPending(null);
      if (!res.ok) {
        // Revertir si falla
        setPerfumes((prev) =>
          prev.map((p) => p.id === id
            ? { ...p, stock_disponible: Math.max(0, p.stock_disponible - delta) }
            : p
          )
        );
        toast_("error", res.error ?? "Error al ajustar stock");
      }
    });
  };

  const onToggle = (id: string, campo: "activo" | "destacado", valor: boolean) => {
    setPerfumes((prev) => prev.map((p) => p.id === id ? { ...p, [campo]: valor } : p));
    startTransition(async () => {
      const res = await togglePerfumeAction(id, campo, valor);
      if (!res.ok) toast_("error", res.error ?? "Error");
    });
  };

  const onEliminar = (p: Perfume) => {
    if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción NO se puede deshacer.`)) return;
    setPerfumes((prev) => prev.filter((x) => x.id !== p.id));
    startTransition(async () => {
      const res = await eliminarPerfumeAction(p.id);
      if (res.ok) toast_("ok", "Perfume eliminado.");
      else toast_("error", res.error ?? "Error");
    });
  };

  const onGuardarPerfume = (input: PerfumeInput) => {
    startTransition(async () => {
      const res = await guardarPerfumeAction(input);
      if (res.ok) {
        toast_("ok", input.id ? "Perfume actualizado." : "Perfume creado.");
        setModalPerfume(null);
        window.location.reload();
      } else toast_("error", res.error ?? "Error al guardar");
    });
  };

  const onOcultarDemo = () => {
    const activos = demos.filter((p) => p.activo);
    if (activos.length === 0) { toast_("ok", "Todos los demos ya están ocultos."); return; }
    if (!confirm(`¿Ocultar los ${activos.length} perfumes de prueba de la tienda?`)) return;
    setPerfumes((prev) => prev.map((p) => p.es_demo ? { ...p, activo: false } : p));
    startTransition(async () => {
      const res = await ocultarTodosAction(activos.map((p) => p.id));
      if (res.ok) toast_("ok", "Perfumes de prueba ocultos.");
      else toast_("error", res.error ?? "Error");
    });
  };

  const onMostrarDemo = () => {
    const ocultos = demos.filter((p) => !p.activo);
    if (ocultos.length === 0) { toast_("ok", "Todos los demos ya están visibles."); return; }
    setPerfumes((prev) => prev.map((p) => p.es_demo ? { ...p, activo: true } : p));
    startTransition(async () => {
      const res = await mostrarTodosAction(ocultos.map((p) => p.id));
      if (res.ok) toast_("ok", "Perfumes de prueba restaurados.");
      else toast_("error", res.error ?? "Error");
    });
  };

  const onResetClicks = () => {
    if (!confirm("¿Resetear todos los contadores de vistas a 0? (Hacer al inicio del mes)")) return;
    setTop5([]);
    setPerfumes((prev) => prev.map((p) => ({ ...p, clicks_mensuales: 0 })));
    startTransition(async () => {
      const res = await resetearClicksAction();
      if (res.ok) toast_("ok", "Contadores reseteados.");
      else toast_("error", res.error ?? "Error");
    });
  };

  // Cupones
  const onGuardarCupon = (input: CuponInput) => {
    startTransition(async () => {
      const res = await guardarCuponAction(input);
      if (res.ok) { toast_("ok", "Cupón guardado."); window.location.reload(); }
      else toast_("error", res.error ?? "Error");
    });
  };
  const onToggleCupon = (id: string, activo: boolean) => {
    setCupones((prev) => prev.map((c) => c.id === id ? { ...c, activo } : c));
    startTransition(async () => {
      const res = await toggleCuponAction(id, activo);
      if (!res.ok) toast_("error", res.error ?? "Error");
    });
  };
  const onEliminarCupon = (c: Cupon) => {
    if (!confirm(`¿Eliminar el cupón ${c.codigo}?`)) return;
    setCupones((prev) => prev.filter((x) => x.id !== c.id));
    startTransition(async () => {
      const res = await eliminarCuponAction(c.id);
      if (res.ok) toast_("ok", "Cupón eliminado.");
      else toast_("error", res.error ?? "Error");
    });
  };

  return (
    <div className={`admin-root${dark ? " adm-dark" : ""} min-h-screen`}>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">

        {/* ── CABECERA ── */}
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold md:text-3xl" style={{ color: "var(--adm-text)" }}>
              Panel del Creador
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>
              Sultan Oud Elixir · Gestión de inventario
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDark((v) => !v)}
              className="adm-theme-toggle"
              title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <a href="/" target="_blank" className="adm-btn adm-btn-ghost adm-btn-sm">
              <ExternalLink className="h-4 w-4" /> Ver tienda
            </a>
            <form action={async () => { await logoutAction(); window.location.reload(); }}>
              <button type="submit" className="adm-btn adm-btn-ghost adm-btn-sm">
                <LogOut className="h-4 w-4" /> Salir
              </button>
            </form>
          </div>
        </header>

        {/* ── BANNER CONEXIÓN ── */}
        {!datos.configurado ? (
          <div className="adm-card mb-6 flex items-start gap-3 p-4 text-sm"
            style={{ borderColor: "var(--adm-red)", background: "var(--adm-red-bg)", color: "var(--adm-red)" }}>
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <strong>Sin conexión a Supabase.</strong> Configurá{" "}
              <code className="rounded px-1.5 py-0.5" style={{ background: "var(--adm-surface)" }}>SUPABASE_URL</code> y{" "}
              <code className="rounded px-1.5 py-0.5" style={{ background: "var(--adm-surface)" }}>SUPABASE_SERVICE_ROLE_KEY</code>{" "}
              en Vercel → Settings → Environment Variables. Mirá <code>explicacion.md</code>.
            </div>
          </div>
        ) : (
          <div className="adm-card mb-6 flex items-center gap-3 p-4 text-sm"
            style={{ borderColor: "var(--adm-green)", background: "var(--adm-green-bg)", color: "var(--adm-green)" }}>
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span><strong>Base de datos conectada.</strong> Cambios globales en tiempo real.</span>
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi icon={<Boxes className="h-5 w-5" />} label="Stock Local" value={kpis.stock} color="blue" />
          <Kpi icon={<FlaskConical className="h-5 w-5" />} label="Origen Externo" value={kpis.externo} color="amber" />
          <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Bajo stock (<3)" value={kpis.bajoStock} color={kpis.bajoStock > 0 ? "red" : "gray"} />
          <Kpi icon={<Tag className="h-5 w-5" />} label="Cupones activos" value={kpis.cuponesActivos} color="green" />
          <Kpi icon={<ShieldAlert className="h-5 w-5" />} label="Pruebas activas" value={demos.filter((p) => p.activo).length} color={demos.some((p) => p.activo) ? "amber" : "gray"} />
        </div>

        {/* ── PESTAÑAS ── */}
        <div className="mb-5 flex flex-wrap gap-2">
          {(
            [
              { id: "stock", icon: <Boxes className="h-4 w-4" />, label: "Mi Stock Local" },
              { id: "externo", icon: <FlaskConical className="h-4 w-4" />, label: "Origen Externo" },
              { id: "demo", icon: <ShieldAlert className="h-4 w-4" />, label: "Pruebas del Sistema" },
              { id: "analitica", icon: <BarChart2 className="h-4 w-4" />, label: "Analítica" },
              { id: "cupones", icon: <Tag className="h-4 w-4" />, label: "Cupones" },
            ] as { id: Pestaña; icon: React.ReactNode; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setPestaña(t.id)}
              className={`adm-tab${pestaña === t.id ? " adm-tab-active" : ""}`}
            >
              <span className="mr-1.5 inline-flex">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CONTENIDO ── */}
        {pestaña === "stock" && (
          <TablaStock
            perfumes={stock}
            titulo="Mi Stock Local"
            subtitulo="Productos físicos en el local de CDE. ⚡ Envío Inmediato automático para tus clientes."
            esExterno={false}
            onStock={onStock}
            onToggle={onToggle}
            onEliminar={onEliminar}
            onNuevo={() => setModalPerfume(perfumeVacio(false))}
            onEditar={(p) => setModalPerfume(toInput(p))}
            stockPending={stockPending}
            onOcultarTodos={() => {
              const act = stock.filter((p) => p.activo);
              if (!act.length) return;
              if (!confirm(`¿Ocultar los ${act.length} perfumes de stock local de la tienda?`)) return;
              setPerfumes((prev) => prev.map((p) => (!esExterno(p) && !p.es_demo ? { ...p, activo: false } : p)));
              startTransition(async () => { await ocultarTodosAction(act.map((p) => p.id)); });
            }}
          />
        )}
        {pestaña === "externo" && (
          <>
            <ProveedorConfig proveedor={datos.proveedor} toast={toast_} />
            <TablaStock
              perfumes={externo}
              titulo="Origen Externo — Pago Contra Entrega"
              subtitulo='Productos que se despachan desde depósito externo bajo modalidad "Pago Contra Entrega". El cliente solo ve "Sultan Oud Elixir".'
              esExterno={true}
              onStock={onStock}
              onToggle={onToggle}
              onEliminar={onEliminar}
              onNuevo={() => setModalPerfume(perfumeVacio(true))}
              onEditar={(p) => setModalPerfume(toInput(p))}
              stockPending={stockPending}
              onOcultarTodos={() => {
                const act = externo.filter((p) => p.activo);
                if (!act.length) return;
                if (!confirm(`¿Ocultar los ${act.length} productos externos de la tienda?`)) return;
                setPerfumes((prev) => prev.map((p) => (esExterno(p) && !p.es_demo ? { ...p, activo: false } : p)));
                startTransition(async () => { await ocultarTodosAction(act.map((p) => p.id)); });
              }}
            />
          </>
        )}
        {pestaña === "demo" && (
          <DemoView
            perfumes={demos}
            onOcultar={onOcultarDemo}
            onMostrar={onMostrarDemo}
            onToggle={onToggle}
            onEditar={(p) => setModalPerfume(toInput(p))}
            onEliminar={onEliminar}
          />
        )}
        {pestaña === "analitica" && (
          <AnaliticaView
            top5={top5}
            totalClicks={perfumes.reduce((a, p) => a + (p.clicks_mensuales ?? 0), 0)}
            onReset={onResetClicks}
          />
        )}
        {pestaña === "cupones" && (
          <CuponesView
            cupones={cupones}
            onGuardar={onGuardarCupon}
            onToggle={onToggleCupon}
            onEliminar={onEliminarCupon}
          />
        )}

        {/* ── MODAL PERFUME ── */}
        {modalPerfume && (
          <PerfumeForm
            inicial={modalPerfume}
            onCancel={() => setModalPerfume(null)}
            onGuardar={onGuardarPerfume}
          />
        )}

        {/* ── TOAST ── */}
        {toast && (
          <div
            className="adm-toast fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg"
            style={{
              background: toast.tipo === "ok" ? "var(--adm-green)" : "var(--adm-red)",
              color: "#fff",
              whiteSpace: "nowrap",
            }}
          >
            {toast.tipo === "ok"
              ? <CheckCircle2 className="h-4 w-4" />
              : <AlertTriangle className="h-4 w-4" />}
            {toast.texto}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  CONFIGURACIÓN DE PROVEEDORES (Dropi y similares)
//  Tarjeta destacada arriba de la pestaña "Origen Externo".
//  Permite guardar credenciales y forzar sincronización de stock.
// ════════════════════════════════════════════════════════════════════════════
function ProveedorConfig({
  proveedor,
  toast,
}: {
  proveedor: ConfigProveedor | null;
  toast: (tipo: "ok" | "error", texto: string) => void;
}) {
  // Hidratación segura de los campos (evita hydration mismatch)
  const inicial: ConfigProveedor | null = proveedor;

  const [form, setForm] = useState({
    proveedor: inicial?.proveedor ?? "Dropi Paraguay",
    api_url: inicial?.api_url ?? "",
    api_key: inicial?.api_key ? "••••••••••••" : "",
    sincronizar_diario: inicial?.sincronizar_diario ?? false,
  });
  const [guardando, setGuardando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [, startTransition] = useTransition();

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const ultimoSyncTexto = inicial?.ultimo_sync
    ? new Date(inicial.ultimo_sync).toLocaleString("es-PY", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Nunca";

  const onGuardar = (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    startTransition(async () => {
      const res = await guardarProveedorAction(form, inicial?.id);
      setGuardando(false);
      if (res.ok) {
        toast("ok", "Configuración del proveedor guardada.");
        window.location.reload();
      } else {
        toast("error", res.error ?? "Error al guardar");
      }
    });
  };

  const onSincronizar = () => {
    if (!inicial?.id) {
      toast("error", "Primero guardá la configuración.");
      return;
    }
    setSincronizando(true);
    startTransition(async () => {
      const res = await sincronizarProveedorAction(inicial.id);
      setSincronizando(false);
      if (res.ok) {
        toast("ok", res.detalle ?? "Sincronización completada.");
        window.location.reload();
      } else {
        toast("error", res.error ?? "Error al sincronizar");
      }
    });
  };

  return (
    <form onSubmit={onGuardar} className="adm-feature-card mb-6">
      <div className="mb-4 flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ color: "var(--adm-gold)", background: "var(--adm-blue-bg)" }}
        >
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold" style={{ color: "var(--adm-text)" }}>
            🔑 Configuración de APIs y Proveedores
          </h3>
          <p className="text-sm" style={{ color: "var(--adm-text-muted)" }}>
            Gestión de credenciales para sincronizar stock externo. Última sincronización:{" "}
            <strong style={{ color: "var(--adm-text-soft)" }}>{ultimoSyncTexto}</strong>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Proveedor */}
        <div>
          <label className="adm-label">Proveedor</label>
          <span className="adm-help">Ej: Dropi Paraguay · Quién provee el stock externo</span>
          <input
            value={form.proveedor}
            onChange={(e) => set("proveedor", e.target.value)}
            className="adm-input mt-1"
            placeholder="Dropi Paraguay"
          />
        </div>

        {/* URL */}
        <div>
          <label className="adm-label">URL Base de la API</label>
          <span className="adm-help">Endpoint raíz del proveedor. Ej: https://api.dropi.co</span>
          <input
            value={form.api_url}
            onChange={(e) => set("api_url", e.target.value)}
            className="adm-input mt-1"
            placeholder="https://api.dropi.co"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="adm-label">API Key / Token de Acceso</label>
          <span className="adm-help">
            {inicial?.api_key
              ? "Ya hay una clave guardada (se muestra oculta). Para cambiarla, escribí una nueva."
              : "Pegá el token secreto que te dio el proveedor"}
          </span>
          <input
            type="password"
            value={form.api_key}
            onChange={(e) => set("api_key", e.target.value)}
            className="adm-input mt-1 font-mono"
            placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
          />
        </div>

        {/* Toggle sincronización diaria */}
        <div className="flex items-center justify-between rounded-lg border p-3"
          style={{ borderColor: "var(--adm-border)", background: "var(--adm-surface-2)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--adm-text)" }}>
              Automatizar sincronización diaria
            </p>
            <p className="text-xs" style={{ color: "var(--adm-text-muted)" }}>
              El sistema actualizará el stock automáticamente cada día
            </p>
          </div>
          <button
            type="button"
            onClick={() => set("sincronizar_diario", !form.sincronizar_diario)}
            className={`adm-switch${form.sincronizar_diario ? " adm-switch-on" : ""}`}
            aria-label="Toggle sincronización diaria"
          />
        </div>
      </div>

      {/* Botones de acción */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={onSincronizar}
          disabled={sincronizando || !inicial?.id}
          className="adm-btn adm-btn-gold"
        >
          {sincronizando ? (
            <>
              <span className="adm-spinner" /> Sincronizando…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" /> 🔄 Sincronizar Stock Ahora
            </>
          )}
        </button>
        <button type="submit" disabled={guardando} className="adm-btn adm-btn-gold">
          {guardando ? (
            <>
              <span className="adm-spinner" /> Guardando…
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> 💾 Guardar Configuración
            </>
          )}
        </button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  TABLA DE STOCK (reutilizada para Stock Local y Origen Externo)
// ════════════════════════════════════════════════════════════════════════════
function TablaStock({
  perfumes, titulo, subtitulo, esExterno: esPestañaExterna,
  onStock, onToggle, onEliminar, onNuevo, onEditar, onOcultarTodos, stockPending,
}: {
  perfumes: Perfume[];
  titulo: string;
  subtitulo: string;
  esExterno: boolean;
  onStock: (id: string, delta: number) => void;
  onToggle: (id: string, c: "activo" | "destacado", v: boolean) => void;
  onEliminar: (p: Perfume) => void;
  onNuevo: () => void;
  onEditar: (p: Perfume) => void;
  onOcultarTodos: () => void;
  stockPending?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filtroMarca, setFiltroMarca] = useState("todas");

  const marcas = useMemo(
    () => Array.from(new Set(perfumes.map((p) => p.marca))).sort(),
    [perfumes]
  );
  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return perfumes.filter((p) => {
      const matchQ = !q
        || p.nombre.toLowerCase().includes(q)
        || p.marca.toLowerCase().includes(q)
        || (p.sku ?? "").toLowerCase().includes(q);
      return matchQ && (filtroMarca === "todas" || p.marca === filtroMarca);
    });
  }, [perfumes, query, filtroMarca]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold" style={{ color: "var(--adm-text)" }}>{titulo}</h2>
        <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>{subtitulo}</p>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--adm-text-muted)" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, marca o SKU…"
            className="adm-input adm-inputWithIcon"
          />
        </div>
        <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)} className="adm-select w-auto">
          <option value="todas">Todas las marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={onNuevo} className="adm-btn adm-btn-primary">
          <Plus className="h-4 w-4" /> Nuevo producto
        </button>
        <button onClick={onOcultarTodos} className="adm-btn adm-btn-ghost">
          <Power className="h-4 w-4" /> Ocultar todos
        </button>
      </div>

      <div className="adm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Marca</th>
                <th>Precio</th>
                <th>Stock</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center" style={{ color: "var(--adm-text-muted)" }}>
                    {perfumes.length === 0
                      ? `No hay productos en esta sección. Creá el primero con "Nuevo producto".`
                      : "No hay resultados para esa búsqueda."}
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-9 shrink-0 overflow-hidden rounded" style={{ background: "var(--adm-surface-2)" }}>
                          {p.url_imagen && (
                            <Image src={p.url_imagen} alt={p.nombre} fill sizes="36px" className="object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold" style={{ color: "var(--adm-text)" }}>{p.nombre}</p>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs" style={{ color: "var(--adm-text-muted)" }}>
                              {p.sku ?? "sin sku"} · {p.volumen_ml}ml
                            </p>
                            {!esPestañaExterna && (
                              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold"
                                style={{ background: "var(--adm-green-bg)", color: "var(--adm-green)" }}>
                                <Zap className="h-2.5 w-2.5" fill="currentColor" /> Express
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: "var(--adm-text-soft)" }}>{p.marca}</td>
                    <td>
                      <span className="font-semibold" style={{ color: "var(--adm-text)" }}>
                        {formatGs(precioEfectivo(p))}
                      </span>
                      {p.en_oferta && p.precio_descuento != null && (
                        <span className="block text-xs line-through" style={{ color: "var(--adm-text-muted)" }}>
                          {formatGs(p.precio_regular)}
                        </span>
                      )}
                    </td>
                    <td>
                      {esPestañaExterna ? (
                        <span className="font-bold" style={{ color: "var(--adm-text)" }}>{p.stock_disponible}</span>
                      ) : (
                        <div className="adm-stock-control">
                          <button
                            onClick={() => onStock(p.id, -1)}
                            className="adm-stock-btn adm-stock-btn-minus"
                            title="Vendido (-1)"
                            disabled={stockPending === p.id}
                          >
                            {stockPending === p.id
                              ? <span className="adm-spinner" style={{ width: "0.7em", height: "0.7em", borderWidth: "1.5px" }} />
                              : <Minus className="h-3.5 w-3.5" />}
                          </button>
                          <span className="adm-stock-value">{p.stock_disponible}</span>
                          <button
                            onClick={() => onStock(p.id, +1)}
                            className="adm-stock-btn adm-stock-btn-plus"
                            title="Reponer (+1)"
                            disabled={stockPending === p.id}
                          >
                            {stockPending === p.id
                              ? <span className="adm-spinner" style={{ width: "0.7em", height: "0.7em", borderWidth: "1.5px" }} />
                              : <Plus className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      )}
                    </td>
                    <td><EstadoBadge perfume={p} /></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          onClick={() => onToggle(p.id, "destacado", !p.destacado)}
                          title={p.destacado ? "Quitar destacado" : "Destacar"}
                          color={p.destacado ? "var(--adm-amber)" : "var(--adm-text-muted)"}
                          bg={p.destacado ? "var(--adm-amber-bg)" : ""}
                        >
                          <Star className="h-4 w-4" fill={p.destacado ? "currentColor" : "none"} />
                        </IconBtn>
                        <IconBtn
                          onClick={() => onToggle(p.id, "activo", !p.activo)}
                          title={p.activo ? "Ocultar de la tienda" : "Mostrar en tienda"}
                          color={p.activo ? "var(--adm-green)" : "var(--adm-text-muted)"}
                          bg={p.activo ? "var(--adm-green-bg)" : ""}
                        >
                          <Power className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn onClick={() => onEditar(p)} title="Editar" color="var(--adm-blue)" bg="var(--adm-blue-bg)">
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn onClick={() => onEliminar(p)} title="Eliminar" color="var(--adm-red)" bg="var(--adm-red-bg)">
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA: PRUEBAS DEL SISTEMA
// ════════════════════════════════════════════════════════════════════════════
function DemoView({
  perfumes, onOcultar, onMostrar, onToggle, onEditar, onEliminar,
}: {
  perfumes: Perfume[];
  onOcultar: () => void;
  onMostrar: () => void;
  onToggle: (id: string, c: "activo" | "destacado", v: boolean) => void;
  onEditar: (p: Perfume) => void;
  onEliminar: (p: Perfume) => void;
}) {
  const [query, setQuery] = useState("");
  const activos = perfumes.filter((p) => p.activo).length;
  const switchOn = activos === 0; // todos ocultos = switch "apagado" en tienda

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return perfumes;
    return perfumes.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [perfumes, query]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-bold" style={{ color: "var(--adm-text)" }}>Perfumes de Prueba del Sistema</h2>
        <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>
          Estos son los perfumes seed con los que arrancó la tienda. Podés <strong>editarlos</strong>, <strong>ocultarlos</strong> o <strong>borrarlos</strong> cuando tengas tus productos reales cargados.
        </p>
      </div>

      {/* Interruptor maestro */}
      <div className="adm-card mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="font-semibold" style={{ color: "var(--adm-text)" }}>Interruptor maestro</p>
          <p className="text-sm mt-0.5" style={{ color: "var(--adm-text-muted)" }}>
            {switchOn
              ? `Todos los perfumes de prueba están ocultos de la tienda. ✓`
              : `${activos} de ${perfumes.length} perfumes de prueba son visibles en la tienda.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onMostrar}
            className="adm-btn adm-btn-ghost adm-btn-sm"
          >
            Mostrar todos
          </button>
          <button
            onClick={onOcultar}
            className={`adm-switch${switchOn ? " adm-switch-on" : ""}`}
            title={switchOn ? "Activar perfumes demo en tienda" : "Ocultar todos los demos de la tienda"}
          />
        </div>
      </div>

      {/* Buscador de demos */}
      <div className="mb-4 relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--adm-text-muted)" }}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar demo por nombre o SKU…"
          className="adm-input adm-inputWithIcon"
        />
      </div>

      {/* Tabla de demos con acciones completas */}
      <div className="adm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Producto demo</th>
                <th>Marca</th>
                <th>Stock</th>
                <th>Estado</th>
                <th className="text-right">Visible</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center" style={{ color: "var(--adm-text-muted)" }}>
                    No hay demos que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded" style={{ background: "var(--adm-surface-2)" }}>
                          {p.url_imagen && (
                            <Image src={p.url_imagen} alt={p.nombre} fill sizes="32px" className="object-cover" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold" style={{ color: "var(--adm-text)" }}>{p.nombre}</p>
                          <p className="text-xs" style={{ color: "var(--adm-text-muted)" }}>{p.sku ?? "sin sku"} · {p.volumen_ml}ml</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: "var(--adm-text-soft)" }}>{p.marca}</td>
                    <td style={{ color: "var(--adm-text)" }}>{p.stock_disponible}</td>
                    <td><EstadoBadge perfume={p} /></td>
                    <td className="text-right">
                      <button
                        onClick={() => onToggle(p.id, "activo", !p.activo)}
                        className={`adm-switch${p.activo ? " adm-switch-on" : ""}`}
                        title={p.activo ? "Ocultar de la tienda" : "Mostrar en tienda"}
                      />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          onClick={() => onEditar(p)}
                          title="Editar"
                          color="var(--adm-blue)"
                          bg="var(--adm-blue-bg)"
                        >
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          onClick={() => onEliminar(p)}
                          title="Eliminar"
                          color="var(--adm-red)"
                          bg="var(--adm-red-bg)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA: ANALÍTICA
// ════════════════════════════════════════════════════════════════════════════
function AnaliticaView({
  top5, totalClicks, onReset,
}: {
  top5: { id: string; nombre: string; clicks_mensuales: number }[];
  totalClicks: number;
  onReset: () => void;
}) {
  const max = top5.length > 0 ? top5[0].clicks_mensuales : 1;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--adm-text)" }}>Top 5 · Perfumes más buscados del mes</h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>
            Suma cuando un cliente abre el detalle de un perfume. Total del mes: <strong>{totalClicks} vistas</strong>.
          </p>
        </div>
        <button onClick={onReset} className="adm-btn adm-btn-ghost adm-btn-sm">
          <RefreshCw className="h-4 w-4" /> Resetear contadores
        </button>
      </div>

      {top5.length === 0 ? (
        <div className="adm-card flex flex-col items-center gap-3 p-12 text-center">
          <BarChart2 className="h-10 w-10 opacity-30" style={{ color: "var(--adm-text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--adm-text-muted)" }}>
            Todavía no hay datos de vistas este mes. Los contadores se incrementan cada vez que un cliente abre el detalle de un perfume.
          </p>
        </div>
      ) : (
        <div className="adm-card p-5 space-y-5">
          {top5.map((item, i) => (
            <div key={item.id} className="flex items-center gap-4">
              <span className="w-6 text-center text-base font-bold" style={{ color: "var(--adm-text-muted)" }}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate font-semibold" style={{ color: "var(--adm-text)" }}>{item.nombre}</p>
                <div className="adm-top-bar mt-1.5">
                  <div
                    className="adm-top-bar-fill"
                    style={{ width: `${Math.max(4, (item.clicks_mensuales / max) * 100)}%` }}
                  />
                </div>
              </div>
              <span className="font-bold tabular-nums" style={{ color: "var(--adm-primary)" }}>
                {item.clicks_mensuales} vistas
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PESTAÑA: CUPONES
// ════════════════════════════════════════════════════════════════════════════
function CuponesView({
  cupones, onGuardar, onToggle, onEliminar,
}: {
  cupones: Cupon[];
  onGuardar: (c: CuponInput) => void;
  onToggle: (id: string, activo: boolean) => void;
  onEliminar: (c: Cupon) => void;
}) {
  const [editando, setEditando] = useState<CuponInput | null>(null);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--adm-text)" }}>Gestión de Cupones</h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--adm-text-muted)" }}>
            Codes de descuento que el cliente puede ingresar en el checkout.
          </p>
        </div>
        <button
          onClick={() => setEditando({ codigo: "", porcentaje_descuento: 10, activo: true, limite_usos: 100, fecha_expiracion: null })}
          className="adm-btn adm-btn-primary"
        >
          <Plus className="h-4 w-4" /> Nuevo cupón
        </button>
      </div>
      <div className="adm-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descuento</th>
                <th>Usos</th>
                <th>Expira</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cupones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center" style={{ color: "var(--adm-text-muted)" }}>
                    No hay cupones. Creá el primero.
                  </td>
                </tr>
              ) : (
                cupones.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-mono font-semibold" style={{ color: "var(--adm-text)" }}>{c.codigo}</span>
                    </td>
                    <td>
                      <span className="adm-badge adm-badge-blue">{c.porcentaje_descuento}% OFF</span>
                    </td>
                    <td style={{ color: "var(--adm-text-soft)" }}>{c.usos_actuales} / {c.limite_usos}</td>
                    <td style={{ color: "var(--adm-text-muted)" }}>
                      {c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString("es-PY") : "—"}
                    </td>
                    <td>
                      {c.activo
                        ? <span className="adm-badge adm-badge-green">Activo</span>
                        : <span className="adm-badge adm-badge-gray">Inactivo</span>}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <IconBtn
                          onClick={() => onToggle(c.id, !c.activo)}
                          title={c.activo ? "Desactivar" : "Activar"}
                          color={c.activo ? "var(--adm-green)" : "var(--adm-text-muted)"}
                          bg={c.activo ? "var(--adm-green-bg)" : ""}
                        >
                          <Power className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn
                          onClick={() => setEditando({ id: c.id, codigo: c.codigo, porcentaje_descuento: c.porcentaje_descuento, activo: c.activo, limite_usos: c.limite_usos, fecha_expiracion: c.fecha_expiracion })}
                          title="Editar"
                          color="var(--adm-blue)"
                          bg="var(--adm-blue-bg)"
                        >
                          <Pencil className="h-4 w-4" />
                        </IconBtn>
                        <IconBtn onClick={() => onEliminar(c)} title="Eliminar" color="var(--adm-red)" bg="var(--adm-red-bg)">
                          <Trash2 className="h-4 w-4" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editando && (
        <CuponForm
          inicial={editando}
          onCancel={() => setEditando(null)}
          onGuardar={(c) => { onGuardar(c); setEditando(null); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  FORMULARIO DE PERFUME — con labels explicativos para el asistente
// ════════════════════════════════════════════════════════════════════════════
function PerfumeForm({
  inicial, onCancel, onGuardar,
}: {
  inicial: PerfumeInput;
  onCancel: () => void;
  onGuardar: (p: PerfumeInput) => void;
}) {
  const [form, setForm] = useState<PerfumeInput>(inicial);
  const [salida, setSalida] = useState(inicial.notas_olfativas.salida.join(", "));
  const [corazon, setCorazon] = useState(inicial.notas_olfativas.corazon.join(", "));
  const [fondo, setFondo] = useState(inicial.notas_olfativas.fondo.join(", "));
  const [categoria, setCategoria] = useState(inicial.categoria.join(", "));
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof PerfumeInput>(k: K, v: PerfumeInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parseList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    startTransition(async () => {
      await onGuardar({
        ...form,
        notas_olfativas: {
          salida: parseList(salida),
          corazon: parseList(corazon),
          fondo: parseList(fondo),
        },
        categoria: parseList(categoria),
      });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}>
      <form onSubmit={submit} className="my-8 w-full max-w-2xl rounded-xl shadow-2xl"
        style={{ background: "var(--adm-surface)" }}>

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b px-6 py-4"
          style={{ borderColor: "var(--adm-border)", background: "var(--adm-surface)" }}>
          <h2 className="text-lg font-bold" style={{ color: "var(--adm-text)" }}>
            {form.id ? "Editar producto" : "Nuevo producto"}
            {form.es_dropi && (
              <span className="adm-badge adm-badge-amber ml-2 align-middle">Origen Externo</span>
            )}
          </h2>
          <button type="button" onClick={onCancel} style={{ color: "var(--adm-text-muted)" }}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">

          {/* Nombre + Marca */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="adm-label">Nombre *</label>
              <span className="adm-help">Ej: Oud Mood · El nombre exacto del perfume</span>
              <input required value={form.nombre} onChange={(e) => set("nombre", e.target.value)}
                className="adm-input mt-1" placeholder="Oud Mood" />
            </div>
            <div>
              <label className="adm-label">Marca *</label>
              <span className="adm-help">Ej: Lattafa · La casa perfumista</span>
              <input required value={form.marca} onChange={(e) => set("marca", e.target.value)}
                className="adm-input mt-1" placeholder="Lattafa" />
            </div>
          </div>

          {/* Precios */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className="adm-label">Precio regular (Gs.) *</label>
              <span className="adm-help">Precio normal sin puntos. Ej: 250000</span>
              <input required type="number" value={form.precio_regular}
                onChange={(e) => set("precio_regular", Number(e.target.value))}
                className="adm-input mt-1" />
            </div>
            <div>
              <label className="adm-label">Precio oferta (Gs.)</label>
              <span className="adm-help">Precio rebajado. Dejar vacío si no está en promoción</span>
              <input type="number"
                value={form.precio_descuento ?? ""}
                onChange={(e) => set("precio_descuento", e.target.value === "" ? null : Number(e.target.value))}
                className="adm-input mt-1" placeholder="—" />
            </div>
            <div>
              <label className="adm-label">Stock *</label>
              <span className="adm-help">Cantidad física disponible en el local de CDE</span>
              <input type="number" value={form.stock_disponible}
                onChange={(e) => set("stock_disponible", Number(e.target.value))}
                className="adm-input mt-1" />
            </div>
            <div>
              <label className="adm-label">Volumen (ml) *</label>
              <span className="adm-help">Tamaño del frasco. Ej: 100 o 50</span>
              <input type="number" value={form.volumen_ml}
                onChange={(e) => set("volumen_ml", Number(e.target.value))}
                className="adm-input mt-1" />
            </div>
          </div>

          {/* Flags */}
          <div className="rounded-lg border p-4 space-y-3"
            style={{ borderColor: "var(--adm-border)", background: "var(--adm-surface-2)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--adm-text-muted)" }}>
              Opciones del producto
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CheckField
                label="En oferta"
                help="Marcar si tiene precio rebajado activo"
                checked={form.en_oferta}
                onChange={(v) => set("en_oferta", v)}
              />
              <CheckField
                label="Destacado"
                help="Aparece en la sección Favoritos del Sultan"
                checked={form.destacado}
                onChange={(v) => set("destacado", v)}
              />
              <CheckField
                label="Visible en la tienda"
                help="Desmarcar para ocultar temporalmente"
                checked={form.activo}
                onChange={(v) => set("activo", v)}
              />
              <CheckField
                label="Origen Externo"
                help="Marcar SOLO si se envía desde depósito externo bajo modalidad Contra Entrega (no lo tenés físicamente en CDE)"
                checked={form.es_dropi}
                onChange={(v) => set("es_dropi", v)}
              />
            </div>
          </div>

          {/* Imagen + SKU */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="adm-label">URL de imagen *</label>
              <span className="adm-help">Link directo a la foto del frasco (https://…)</span>
              <input required value={form.url_imagen}
                onChange={(e) => set("url_imagen", e.target.value)}
                className="adm-input mt-1" placeholder="https://…" />
            </div>
            <div>
              <label className="adm-label">SKU (Código interno)</label>
              <span className="adm-help">
                DEJAR VACÍO para que el sistema lo genere solo como: MARCA-NOMBRE-ML
              </span>
              <input
                value={form.sku ?? ""}
                onChange={(e) => set("sku", e.target.value || null)}
                className="adm-input mt-1 font-mono"
                placeholder="Se genera automático si lo dejás vacío"
              />
            </div>
          </div>

          {/* Categorías */}
          <div>
            <label className="adm-label">Categorías / familias olfativas</label>
            <span className="adm-help">Separadas por coma. Ej: Lattafa, Oud, Dulce</span>
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
              className="adm-input mt-1" placeholder="Lattafa, Oud, Dulce" />
          </div>

          {/* Descripción */}
          <div>
            <label className="adm-label">Descripción *</label>
            <span className="adm-help">Texto que verá el cliente al abrir el producto. Máx. 2-3 oraciones.</span>
            <textarea required value={form.descripcion}
              onChange={(e) => set("descripcion", e.target.value)}
              rows={3} className="adm-textarea mt-1"
              placeholder="Un bouquet amaderado de oud rosa que evoca los palacios de Arabia…" />
          </div>

          {/* Notas olfativas */}
          <div className="rounded-lg border p-4"
            style={{ borderColor: "var(--adm-border)", background: "var(--adm-surface-2)" }}>
            <p className="adm-label mb-1">Notas olfativas</p>
            <p className="adm-help mb-3">Ingredientes de cada capa, separados por coma. Si no sabés, podés buscar el perfume en Fragrantica.</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="adm-label">Salida</label>
                <span className="adm-help">Las primeras notas al oler</span>
                <input value={salida} onChange={(e) => setSalida(e.target.value)}
                  className="adm-input mt-1" placeholder="Azafrán, Rosa, Bergamota" />
              </div>
              <div>
                <label className="adm-label">Corazón</label>
                <span className="adm-help">El alma del perfume</span>
                <input value={corazon} onChange={(e) => setCorazon(e.target.value)}
                  className="adm-input mt-1" placeholder="Oud, Pachulí, Jazmín" />
              </div>
              <div>
                <label className="adm-label">Fondo</label>
                <span className="adm-help">El rastro que deja al final</span>
                <input value={fondo} onChange={(e) => setFondo(e.target.value)}
                  className="adm-input mt-1" placeholder="Ámbar, Almizcle, Vainilla" />
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-xl border-t px-6 py-4"
          style={{ borderColor: "var(--adm-border)", background: "var(--adm-surface)" }}>
          <button type="button" onClick={onCancel} className="adm-btn adm-btn-ghost">Cancelar</button>
          <button type="submit" disabled={pending} className="adm-btn adm-btn-primary">
            {pending ? "Guardando…" : "Guardar producto"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  FORMULARIO DE CUPÓN
// ════════════════════════════════════════════════════════════════════════════
function CuponForm({
  inicial, onCancel, onGuardar,
}: {
  inicial: CuponInput;
  onCancel: () => void;
  onGuardar: (c: CuponInput) => void;
}) {
  const [form, setForm] = useState<CuponInput>(inicial);
  const set = <K extends keyof CuponInput>(k: K, v: CuponInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}>
      <form
        onSubmit={(e) => { e.preventDefault(); onGuardar(form); }}
        className="w-full max-w-md rounded-xl p-6 shadow-2xl"
        style={{ background: "var(--adm-surface)" }}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: "var(--adm-text)" }}>
            {form.id ? "Editar cupón" : "Nuevo cupón"}
          </h2>
          <button type="button" onClick={onCancel} style={{ color: "var(--adm-text-muted)" }}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="adm-label">Código *</label>
            <span className="adm-help">Ej: SULTAN10 — Lo ingresa el cliente en el checkout</span>
            <input required value={form.codigo}
              onChange={(e) => set("codigo", e.target.value.toUpperCase())}
              className="adm-input mt-1 font-mono" placeholder="SULTAN10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="adm-label">% de descuento</label>
              <span className="adm-help">Ej: 10 = 10% de descuento</span>
              <input type="number" min={1} max={100} value={form.porcentaje_descuento}
                onChange={(e) => set("porcentaje_descuento", Number(e.target.value))}
                className="adm-input mt-1" />
            </div>
            <div>
              <label className="adm-label">Límite de usos</label>
              <span className="adm-help">Cuántas veces puede usarse en total</span>
              <input type="number" min={1} value={form.limite_usos}
                onChange={(e) => set("limite_usos", Number(e.target.value))}
                className="adm-input mt-1" />
            </div>
          </div>
          <CheckField
            label="Activo"
            help="Si está marcado, los clientes pueden usarlo"
            checked={form.activo}
            onChange={(v) => set("activo", v)}
          />
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="adm-btn adm-btn-ghost">Cancelar</button>
          <button type="submit" className="adm-btn adm-btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENTES ATÓMICOS
// ════════════════════════════════════════════════════════════════════════════

function Kpi({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "amber" | "red" | "green" | "gray";
}) {
  const colorVars = {
    blue:  { color: "var(--adm-blue)",  bg: "var(--adm-blue-bg)" },
    amber: { color: "var(--adm-amber)", bg: "var(--adm-amber-bg)" },
    red:   { color: "var(--adm-red)",   bg: "var(--adm-red-bg)" },
    green: { color: "var(--adm-green)", bg: "var(--adm-green-bg)" },
    gray:  { color: "var(--adm-gray)",  bg: "var(--adm-gray-bg)" },
  }[color];
  return (
    <div className="adm-kpi">
      <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ color: colorVars.color, background: colorVars.bg }}>
        {icon}
      </div>
      <p className="text-2xl font-bold leading-none" style={{ color: "var(--adm-text)" }}>{value}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--adm-text-muted)" }}>{label}</p>
    </div>
  );
}

function EstadoBadge({ perfume }: { perfume: Perfume }) {
  if (perfume.stock_disponible <= 0)
    return <span className="adm-badge adm-badge-red">Agotado</span>;
  if (!perfume.activo)
    return <span className="adm-badge adm-badge-gray">Oculto</span>;
  return <span className="adm-badge adm-badge-green">Visible</span>;
}

function IconBtn({
  children, onClick, title, color, bg,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  color: string;
  bg?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
      style={{ color, background: bg ?? "transparent" }}
    >
      {children}
    </button>
  );
}

function CheckField({
  label, help, checked, onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded"
        style={{ accentColor: "var(--adm-primary)" }}
      />
      <span>
        <span className="block text-sm font-semibold" style={{ color: "var(--adm-text)" }}>{label}</span>
        <span className="block text-xs" style={{ color: "var(--adm-text-muted)" }}>{help}</span>
      </span>
    </label>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function perfumeVacio(esExternoFlag: boolean): PerfumeInput {
  return {
    nombre: "",
    marca: "",
    precio_regular: 250000,
    precio_descuento: null,
    en_oferta: false,
    stock_disponible: 5,
    volumen_ml: 100,
    activo: true,
    url_imagen: "",
    descripcion: "",
    notas_olfativas: { salida: [], corazon: [], fondo: [] },
    categoria: [],
    sku: null, // vacío → auto-generado en el server
    destacado: false,
    es_dropi: esExternoFlag,
  };
}

function toInput(p: Perfume): PerfumeInput {
  return {
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    precio_regular: p.precio_regular,
    precio_descuento: p.precio_descuento,
    en_oferta: p.en_oferta,
    stock_disponible: p.stock_disponible,
    volumen_ml: p.volumen_ml,
    activo: p.activo,
    url_imagen: p.url_imagen,
    descripcion: p.descripcion,
    notas_olfativas: p.notas_olfativas,
    categoria: p.categoria,
    sku: p.sku,
    destacado: p.destacado,
    es_dropi: p.es_dropi === true || (p.sku?.startsWith("DROPI-") ?? false),
  };
}
