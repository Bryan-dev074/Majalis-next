"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  Lock,
  Eye,
  EyeOff,
  LogOut,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Search,
  Star,
  Power,
  Tag,
  Boxes,
  Sparkles,
  X,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";
import { Perfume, Cupon } from "@/types/database";
import { formatGs, precioEfectivo } from "@/lib/format";
import {
  loginAction,
  logoutAction,
  guardarPerfumeAction,
  eliminarPerfumeAction,
  ajustarStockAction,
  togglePerfumeAction,
  ocultarTodosAction,
  guardarCuponAction,
  toggleCuponAction,
  eliminarCuponAction,
  type PerfumeInput,
  type CuponInput,
} from "./actions";

interface AdminClientProps {
  autenticado: boolean;
  datos: { perfumes: Perfume[]; cupones: Cupon[]; configurado: boolean };
}

type Pestaña = "stock" | "dropi" | "cupones";

interface Toast {
  tipo: "ok" | "error";
  texto: string;
}

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
      // Cookie seteada → recargamos para que el Server Component revalide la sesión
      else window.location.reload();
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={entrar} className="adm-card w-full max-w-sm p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#050505] text-[#d4af37]">
            <Lock className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold text-[#11151c]">Panel del Creador</h1>
          <p className="mt-1 text-sm text-[#6b7480]">Sultan Oud Elixir</p>
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
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6b7480] hover:text-[#11151c]"
          >
            {mostrar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[#d92d20]">
            <AlertTriangle className="h-4 w-4" /> {error}
          </p>
        )}

        <button type="submit" disabled={pending} className="adm-btn adm-btn-primary mt-5 w-full">
          {pending ? "Entrando…" : "Entrar"}
        </button>

        <a href="/" className="mt-4 block text-center text-xs text-[#6b7480] hover:text-[#11151c]">
          ← Volver a la tienda
        </a>
      </form>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  PANEL
// ════════════════════════════════════════════════════════════════════════════
function PanelView({ datos }: { datos: AdminClientProps["datos"] }) {
  const [pestaña, setPestaña] = useState<Pestaña>("stock");
  const [toast, setToast] = useState<Toast | null>(null);
  const [, startTransition] = useTransition();

  // Estado local optimista (se sincroniza al recargar del server)
  const [perfumes, setPerfumes] = useState<Perfume[]>(datos.perfumes);
  const [cupones, setCupones] = useState<Cupon[]>(datos.cupones);
  const [modalPerfume, setModalPerfume] = useState<PerfumeInput | null>(null);

  const mostrarToast = (tipo: "ok" | "error", texto: string) => {
    setToast({ tipo, texto });
    setTimeout(() => setToast(null), 3200);
  };

  // Separar stock local vs dropi
  const esDropi = (p: Perfume) =>
    p.es_dropi === true || (p.sku != null && p.sku.startsWith("DROPI-"));
  const stockLocal = perfumes.filter((p) => !esDropi(p));
  const dropi = perfumes.filter((p) => esDropi(p));

  // KPIs
  const kpis = useMemo(() => {
    const bajoStock = stockLocal.filter((p) => p.stock_disponible < 3).length;
    const cuponesActivos = cupones.filter((c) => c.activo).length;
    return {
      stockLocal: stockLocal.length,
      dropi: dropi.length,
      bajoStock,
      cuponesActivos,
    };
  }, [stockLocal, dropi, cupones]);

  // ───── Handlers de mutación ─────
  const onStock = (id: string, delta: number) => {
    setPerfumes((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, stock_disponible: Math.max(0, p.stock_disponible + delta) } : p
      )
    );
    startTransition(async () => {
      const res = await ajustarStockAction(id, delta);
      if (!res.ok) mostrarToast("error", res.error ?? "Error al ajustar stock");
    });
  };

  const onToggle = (
    id: string,
    campo: "activo" | "destacado",
    valor: boolean
  ) => {
    setPerfumes((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
    startTransition(async () => {
      const res = await togglePerfumeAction(id, campo, valor);
      if (!res.ok) mostrarToast("error", res.error ?? "Error");
    });
  };

  const onOcultarTodos = () => {
    if (stockLocal.length === 0) return;
    if (!confirm(`¿Ocultar los ${stockLocal.length} perfumes de tu stock de la tienda?`)) return;
    setPerfumes((prev) => prev.map((p) => (!esDropi(p) ? { ...p, activo: false } : p)));
    startTransition(async () => {
      const res = await ocultarTodosAction(stockLocal.map((p) => p.id));
      if (res.ok) mostrarToast("ok", "Perfumes ocultos de la tienda.");
      else mostrarToast("error", res.error ?? "Error");
    });
  };

  const onEliminar = (p: Perfume) => {
    if (!confirm(`¿Eliminar "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
    setPerfumes((prev) => prev.filter((x) => x.id !== p.id));
    startTransition(async () => {
      const res = await eliminarPerfumeAction(p.id);
      if (res.ok) mostrarToast("ok", "Perfume eliminado.");
      else mostrarToast("error", res.error ?? "Error");
    });
  };

  const onGuardarPerfume = (input: PerfumeInput) => {
    startTransition(async () => {
      const res = await guardarPerfumeAction(input);
      if (res.ok) {
        mostrarToast("ok", input.id ? "Perfume actualizado." : "Perfume creado.");
        setModalPerfume(null);
        window.location.reload(); // refresca datos del server
      } else {
        mostrarToast("error", res.error ?? "Error al guardar");
      }
    });
  };

  // Cupones
  const onGuardarCupon = (input: CuponInput) => {
    startTransition(async () => {
      const res = await guardarCuponAction(input);
      if (res.ok) {
        mostrarToast("ok", "Cupón guardado.");
        window.location.reload();
      } else mostrarToast("error", res.error ?? "Error");
    });
  };
  const onToggleCupon = (id: string, activo: boolean) => {
    setCupones((prev) => prev.map((c) => (c.id === id ? { ...c, activo } : c)));
    startTransition(async () => {
      const res = await toggleCuponAction(id, activo);
      if (!res.ok) mostrarToast("error", res.error ?? "Error");
    });
  };
  const onEliminarCupon = (c: Cupon) => {
    if (!confirm(`¿Eliminar el cupón ${c.codigo}?`)) return;
    setCupones((prev) => prev.filter((x) => x.id !== c.id));
    startTransition(async () => {
      const res = await eliminarCuponAction(c.id);
      if (res.ok) mostrarToast("ok", "Cupón eliminado.");
      else mostrarToast("error", res.error ?? "Error");
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      {/* Cabecera */}
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Panel del Creador</h1>
          <p className="mt-1 text-sm text-[#6b7480]">
            Sultan Oud Elixir · Gestión de inventario
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/" target="_blank" className="adm-btn adm-btn-ghost adm-btn-sm">
            <ExternalLink className="h-4 w-4" /> Ver tienda
          </a>
          <form
            action={async () => {
              await logoutAction();
              window.location.reload();
            }}
          >
            <button type="submit" className="adm-btn adm-btn-ghost adm-btn-sm">
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </form>
        </div>
      </header>

      {/* Estado de conexión */}
      {!datos.configurado ? (
        <div className="adm-card mb-6 flex items-start gap-3 border-[#fdd9d5] bg-[#fef0ef] p-4 text-sm text-[#d92d20]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <strong>Sin conexión a la base de datos.</strong> Faltan{" "}
            <code className="rounded bg-white px-1.5 py-0.5">SUPABASE_URL</code> y{" "}
            <code className="rounded bg-white px-1.5 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
            en el servidor. Mirá <code>explicacion.md</code>.
          </div>
        </div>
      ) : (
        <div className="adm-card mb-6 flex items-center gap-3 border-[#e3f7ec] bg-[#f0faf3] p-4 text-sm text-[#12a150]">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>
            <strong>Base de datos conectada.</strong> Cambios globales en tiempo real.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Boxes className="h-5 w-5" />} label="Stock Local" value={kpis.stockLocal} color="blue" />
        <Kpi icon={<FlaskConical className="h-5 w-5" />} label="Catálogo Dropi" value={kpis.dropi} color="amber" />
        <Kpi icon={<AlertTriangle className="h-5 w-5" />} label="Bajo stock (<3)" value={kpis.bajoStock} color={kpis.bajoStock > 0 ? "red" : "gray"} />
        <Kpi icon={<Tag className="h-5 w-5" />} label="Cupones activos" value={kpis.cuponesActivos} color="green" />
      </div>

      {/* Pestañas */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setPestaña("stock")} className={`adm-tab ${pestaña === "stock" ? "adm-tab-active" : ""}`}>
          <Boxes className="mr-1.5 inline h-4 w-4" /> Mi Stock Local
        </button>
        <button onClick={() => setPestaña("dropi")} className={`adm-tab ${pestaña === "dropi" ? "adm-tab-active" : ""}`}>
          <FlaskConical className="mr-1.5 inline h-4 w-4" /> Catálogo Dropi
        </button>
        <button onClick={() => setPestaña("cupones")} className={`adm-tab ${pestaña === "cupones" ? "adm-tab-active" : ""}`}>
          <Tag className="mr-1.5 inline h-4 w-4" /> Cupones
        </button>
      </div>

      {/* Contenido */}
      {pestaña === "stock" && (
        <StockLocalView
          perfumes={stockLocal}
          onStock={onStock}
          onToggle={onToggle}
          onEliminar={onEliminar}
          onOcultarTodos={onOcultarTodos}
          onNuevo={() => setModalPerfume(perfumeVacio(false))}
          onEditar={(p) => setModalPerfume(toInput(p))}
        />
      )}
      {pestaña === "dropi" && (
        <DropiView
          perfumes={dropi}
          onNuevo={() => setModalPerfume(perfumeVacio(true))}
          onEditar={(p) => setModalPerfume(toInput(p))}
          onEliminar={onEliminar}
          onToggle={onToggle}
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

      {/* Modal de perfume */}
      {modalPerfume && (
        <PerfumeForm
          inicial={modalPerfume}
          onCancel={() => setModalPerfume(null)}
          onGuardar={onGuardarPerfume}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`adm-toast fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.tipo === "ok" ? "bg-[#12a150] text-white" : "bg-[#d92d20] text-white"
          }`}
        >
          {toast.tipo === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.texto}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  COMPONENTES UI compartidos
// ════════════════════════════════════════════════════════════════════════════

function Kpi({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "amber" | "red" | "green" | "gray";
}) {
  const colorMap = {
    blue: "text-[#0b5fff] bg-[#e8efff]",
    amber: "text-[#b54708] bg-[#fef0c7]",
    red: "text-[#d92d20] bg-[#fee9e7]",
    green: "text-[#12a150] bg-[#e3f7ec]",
    gray: "text-[#6b7280] bg-[#eef0f3]",
  }[color];
  return (
    <div className="adm-card p-4">
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${colorMap}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-xs text-[#6b7480]">{label}</p>
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

// ─── Stock Local ────────────────────────────────────────────────────────────
function StockLocalView({
  perfumes,
  onStock,
  onToggle,
  onEliminar,
  onOcultarTodos,
  onNuevo,
  onEditar,
}: {
  perfumes: Perfume[];
  onStock: (id: string, delta: number) => void;
  onToggle: (id: string, c: "activo" | "destacado", v: boolean) => void;
  onEliminar: (p: Perfume) => void;
  onOcultarTodos: () => void;
  onNuevo: () => void;
  onEditar: (p: Perfume) => void;
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
      const matchQ =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.marca.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q);
      const matchM = filtroMarca === "todas" || p.marca === filtroMarca;
      return matchQ && matchM;
    });
  }, [perfumes, query, filtroMarca]);

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7480]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, marca o SKU…"
            className="adm-input pl-9"
          />
        </div>
        <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)} className="adm-select w-auto">
          <option value="todas">Todas las marcas</option>
          {marcas.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button onClick={onNuevo} className="adm-btn adm-btn-primary">
          <Plus className="h-4 w-4" /> Nuevo perfume
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
                <th>Perfume</th>
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
                  <td colSpan={6} className="py-10 text-center text-[#6b7480]">
                    No hay perfumes. Creá el primero con &quot;Nuevo perfume&quot;.
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-9 shrink-0 overflow-hidden rounded bg-[#eef0f3]">
                          {p.url_imagen && (
                            <Image src={p.url_imagen} alt={p.nombre} fill sizes="36px" className="object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{p.nombre}</p>
                          <p className="text-xs text-[#6b7480]">
                            {p.sku ?? "sin sku"} · {p.volumen_ml}ml
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[#444b55]">{p.marca}</td>
                    <td>
                      <div className="flex flex-col">
                        <span className="font-semibold">{formatGs(precioEfectivo(p))}</span>
                        {p.en_oferta && p.precio_descuento != null && (
                          <span className="text-xs text-[#6b7480] line-through">
                            {formatGs(p.precio_regular)}
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Control express de stock */}
                    <td>
                      <div className="adm-stock-control">
                        <button
                          onClick={() => onStock(p.id, -1)}
                          className="adm-stock-btn adm-stock-btn-minus"
                          title="Vendido (-1)"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="adm-stock-value">{p.stock_disponible}</span>
                        <button
                          onClick={() => onStock(p.id, +1)}
                          className="adm-stock-btn adm-stock-btn-plus"
                          title="Reponer (+1)"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    <td><EstadoBadge perfume={p} /></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onToggle(p.id, "destacado", !p.destacado)}
                          title={p.destacado ? "Quitar destacado" : "Destacar"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            p.destacado ? "text-[#b54708] hover:bg-[#fef0c7]" : "text-[#6b7480] hover:bg-[#eef0f3]"
                          }`}
                        >
                          <Star className="h-4 w-4" fill={p.destacado ? "currentColor" : "none"} />
                        </button>
                        <button
                          onClick={() => onToggle(p.id, "activo", !p.activo)}
                          title={p.activo ? "Ocultar de la tienda" : "Mostrar en tienda"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            p.activo ? "text-[#12a150] hover:bg-[#e3f7ec]" : "text-[#6b7480] hover:bg-[#eef0f3]"
                          }`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onEditar(p)}
                          title="Editar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#0b5fff] hover:bg-[#e8efff]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onEliminar(p)}
                          title="Eliminar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#d92d20] hover:bg-[#fee9e7]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

// ─── Catálogo Dropi ─────────────────────────────────────────────────────────
function DropiView({
  perfumes,
  onNuevo,
  onEditar,
  onEliminar,
  onToggle,
}: {
  perfumes: Perfume[];
  onNuevo: () => void;
  onEditar: (p: Perfume) => void;
  onEliminar: (p: Perfume) => void;
  onToggle: (id: string, c: "activo" | "destacado", v: boolean) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2 text-sm text-[#6b7480]">
          <Sparkles className="mt-0.5 h-4 w-4 text-[#b54708]" />
          <span>
            Perfumes importados vía API de Dropi (envío más largo, precios diferentes).
            Más adelante se sincronizarán automáticamente.
          </span>
        </div>
        <button onClick={onNuevo} className="adm-btn adm-btn-primary">
          <Plus className="h-4 w-4" /> Agregar Dropi
        </button>
      </div>

      {perfumes.length === 0 ? (
        <div className="adm-card flex flex-col items-center gap-3 p-12 text-center">
          <FlaskConical className="h-10 w-10 text-[#b54708] opacity-50" />
          <p className="text-sm text-[#6b7480]">
            Todavía no hay perfumes de Dropi.
            <br />
            Cuando conectes la API o agregues uno manualmente, aparecerá acá.
          </p>
        </div>
      ) : (
        <div className="adm-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Perfume</th>
                  <th>Marca</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th>Estado</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {perfumes.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-9 shrink-0 overflow-hidden rounded bg-[#eef0f3]">
                          {p.url_imagen && (
                            <Image src={p.url_imagen} alt={p.nombre} fill sizes="36px" className="object-cover" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{p.nombre}</p>
                          <p className="text-xs text-[#6b7480]">{p.sku ?? "DROPI-?"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap text-[#444b55]">{p.marca}</td>
                    <td className="font-semibold">{formatGs(precioEfectivo(p))}</td>
                    <td className="adm-stock-value">{p.stock_disponible}</td>
                    <td><EstadoBadge perfume={p} /></td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onToggle(p.id, "activo", !p.activo)}
                          title={p.activo ? "Ocultar" : "Mostrar"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            p.activo ? "text-[#12a150] hover:bg-[#e3f7ec]" : "text-[#6b7480] hover:bg-[#eef0f3]"
                          }`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onEditar(p)}
                          title="Editar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#0b5fff] hover:bg-[#e8efff]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onEliminar(p)}
                          title="Eliminar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#d92d20] hover:bg-[#fee9e7]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cupones ────────────────────────────────────────────────────────────────
function CuponesView({
  cupones,
  onGuardar,
  onToggle,
  onEliminar,
}: {
  cupones: Cupon[];
  onGuardar: (c: CuponInput) => void;
  onToggle: (id: string, activo: boolean) => void;
  onEliminar: (c: Cupon) => void;
}) {
  const [editando, setEditando] = useState<CuponInput | null>(null);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[#6b7480]">Gestiona los códigos de descuento del checkout.</p>
        <button
          onClick={() =>
            setEditando({
              codigo: "",
              porcentaje_descuento: 10,
              activo: true,
              limite_usos: 100,
              fecha_expiracion: null,
            })
          }
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
                  <td colSpan={6} className="py-10 text-center text-[#6b7480]">
                    No hay cupones. Creá el primero.
                  </td>
                </tr>
              ) : (
                cupones.map((c) => (
                  <tr key={c.id}>
                    <td><span className="font-mono font-semibold">{c.codigo}</span></td>
                    <td><span className="adm-badge adm-badge-blue">{c.porcentaje_descuento}% OFF</span></td>
                    <td className="text-[#444b55]">{c.usos_actuales} / {c.limite_usos}</td>
                    <td className="text-[#6b7480]">
                      {c.fecha_expiracion ? new Date(c.fecha_expiracion).toLocaleDateString("es-PY") : "—"}
                    </td>
                    <td>
                      {c.activo ? (
                        <span className="adm-badge adm-badge-green">Activo</span>
                      ) : (
                        <span className="adm-badge adm-badge-gray">Inactivo</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onToggle(c.id, !c.activo)}
                          title={c.activo ? "Desactivar" : "Activar"}
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                            c.activo ? "text-[#12a150] hover:bg-[#e3f7ec]" : "text-[#6b7480] hover:bg-[#eef0f3]"
                          }`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() =>
                            setEditando({
                              id: c.id,
                              codigo: c.codigo,
                              porcentaje_descuento: c.porcentaje_descuento,
                              activo: c.activo,
                              limite_usos: c.limite_usos,
                              fecha_expiracion: c.fecha_expiracion,
                            })
                          }
                          title="Editar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#0b5fff] hover:bg-[#e8efff]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => onEliminar(c)}
                          title="Eliminar"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#d92d20] hover:bg-[#fee9e7]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
          onGuardar={(c) => {
            onGuardar(c);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  FORMULARIO DE PERFUME (con notas olfativas como inputs)
// ════════════════════════════════════════════════════════════════════════════
function PerfumeForm({
  inicial,
  onCancel,
  onGuardar,
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
    const parseNotas = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    startTransition(async () => {
      await onGuardar({
        ...form,
        notas_olfativas: {
          salida: parseNotas(salida),
          corazon: parseNotas(corazon),
          fondo: parseNotas(fondo),
        },
        categoria: categoria.split(",").map((x) => x.trim()).filter(Boolean),
      });
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-2xl rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between rounded-t-xl border-b border-[#e2e6eb] bg-white px-6 py-4">
          <h2 className="text-lg font-bold">
            {form.id ? "Editar perfume" : "Nuevo perfume"}
            {form.es_dropi && (
              <span className="adm-badge adm-badge-amber ml-2 align-middle">Dropi</span>
            )}
          </h2>
          <button type="button" onClick={onCancel} className="text-[#6b7480] hover:text-[#11151c]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Fila 1 */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="adm-label">Nombre *</label>
              <input required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} className="adm-input" placeholder="Oud Mood" />
            </div>
            <div>
              <label className="adm-label">Marca *</label>
              <input required value={form.marca} onChange={(e) => set("marca", e.target.value)} className="adm-input" placeholder="Lattafa" />
            </div>
          </div>

          {/* Fila 2 — precios */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <label className="adm-label">Precio regular (Gs.) *</label>
              <input required type="number" value={form.precio_regular} onChange={(e) => set("precio_regular", Number(e.target.value))} className="adm-input" />
            </div>
            <div>
              <label className="adm-label">Precio oferta</label>
              <input
                type="number"
                value={form.precio_descuento ?? ""}
                onChange={(e) => set("precio_descuento", e.target.value === "" ? null : Number(e.target.value))}
                className="adm-input"
                placeholder="—"
              />
            </div>
            <div>
              <label className="adm-label">Stock</label>
              <input type="number" value={form.stock_disponible} onChange={(e) => set("stock_disponible", Number(e.target.value))} className="adm-input" />
            </div>
            <div>
              <label className="adm-label">Volumen (ml)</label>
              <input type="number" value={form.volumen_ml} onChange={(e) => set("volumen_ml", Number(e.target.value))} className="adm-input" />
            </div>
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-5">
            <Check label="En oferta" checked={form.en_oferta} onChange={(v) => set("en_oferta", v)} />
            <Check label="Destacado" checked={form.destacado} onChange={(v) => set("destacado", v)} />
            <Check label="Visible en tienda" checked={form.activo} onChange={(v) => set("activo", v)} />
            <Check label="Es de Dropi" checked={form.es_dropi} onChange={(v) => set("es_dropi", v)} />
          </div>

          {/* Imagen + SKU */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="adm-label">URL de imagen *</label>
              <input required value={form.url_imagen} onChange={(e) => set("url_imagen", e.target.value)} className="adm-input" placeholder="https://…" />
            </div>
            <div>
              <label className="adm-label">SKU</label>
              <input value={form.sku ?? ""} onChange={(e) => set("sku", e.target.value || null)} className="adm-input" placeholder="LTTF-OUDMOOD" />
            </div>
          </div>

          <div>
            <label className="adm-label">Categorías / familias (separadas por coma)</label>
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} className="adm-input" placeholder="Lattafa, Oud, Dulce" />
          </div>

          <div>
            <label className="adm-label">Descripción *</label>
            <textarea required value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} rows={3} className="adm-textarea" placeholder="Un bouquet amaderado de oud rosa…" />
          </div>

          {/* Notas olfativas */}
          <div className="rounded-lg border border-[#e2e6eb] bg-[#fafbfc] p-4">
            <p className="adm-label mb-3">Notas olfativas (separadas por coma)</p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="adm-label">Salida</label>
                <input value={salida} onChange={(e) => setSalida(e.target.value)} className="adm-input" placeholder="Azafrán, Rosa" />
              </div>
              <div>
                <label className="adm-label">Corazón</label>
                <input value={corazon} onChange={(e) => setCorazon(e.target.value)} className="adm-input" placeholder="Oud, Pachulí" />
              </div>
              <div>
                <label className="adm-label">Fondo</label>
                <input value={fondo} onChange={(e) => setFondo(e.target.value)} className="adm-input" placeholder="Ámbar, Almizcle" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-b-xl border-t border-[#e2e6eb] bg-white px-6 py-4">
          <button type="button" onClick={onCancel} className="adm-btn adm-btn-ghost">Cancelar</button>
          <button type="submit" disabled={pending} className="adm-btn adm-btn-primary">
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CuponForm({
  inicial,
  onCancel,
  onGuardar,
}: {
  inicial: CuponInput;
  onCancel: () => void;
  onGuardar: (c: CuponInput) => void;
}) {
  const [form, setForm] = useState<CuponInput>(inicial);
  const set = <K extends keyof CuponInput>(k: K, v: CuponInput[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onGuardar(form);
        }}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{form.id ? "Editar cupón" : "Nuevo cupón"}</h2>
          <button type="button" onClick={onCancel} className="text-[#6b7480]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="adm-label">Código *</label>
            <input required value={form.codigo} onChange={(e) => set("codigo", e.target.value.toUpperCase())} className="adm-input font-mono" placeholder="SULTAN10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="adm-label">% descuento</label>
              <input type="number" min={1} max={100} value={form.porcentaje_descuento} onChange={(e) => set("porcentaje_descuento", Number(e.target.value))} className="adm-input" />
            </div>
            <div>
              <label className="adm-label">Límite de usos</label>
              <input type="number" min={1} value={form.limite_usos} onChange={(e) => set("limite_usos", Number(e.target.value))} className="adm-input" />
            </div>
          </div>
          <Check label="Activo" checked={form.activo} onChange={(v) => set("activo", v)} />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="adm-btn adm-btn-ghost">Cancelar</button>
          <button type="submit" className="adm-btn adm-btn-primary">Guardar</button>
        </div>
      </form>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#444b55]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-[#c9d0d8] text-[#0b5fff] focus:ring-[#0b5fff]"
      />
      {label}
    </label>
  );
}

function perfumeVacio(esDropi: boolean): PerfumeInput {
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
    sku: esDropi ? "DROPI-" : "",
    destacado: false,
    es_dropi: esDropi,
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
