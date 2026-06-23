"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, UploadCloud, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
//  ImageDrop · Zona de carga de imagen para el formulario de producto.
//
//  Este componente se encarga SOLO de la UI:
//    · seleccionar / arrastrar una foto,
//    · validar tipo y tamaño,
//    · mostrar preview,
//    · y avisarle al padre qué archivo eligió el admin.
//
//  La subida real a Supabase Storage la hace el PADRE a través de
//  `onUpload`. Cuando esa promesa resuelve, el padre le pasa de vuelta
//  la URL pública y este componente la muestra como preview definitiva.
//
//  Ver el hook `onUpload` más abajo — está pensado para que Claude lo
//  conecte con Supabase Storage.
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_PERMITIDOS = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const TAMANIO_MAX_MB = 4;
const TAMANIO_MAX_BYTES = TAMANIO_MAX_MB * 1024 * 1024;

interface ImageDropProps {
  /** URL que ya tiene el producto (al editar). Si viene, se muestra como preview. */
  urlActual?: string;
  /**
   * Lo llama el padre para subir el archivo a Supabase Storage.
   * Debe devolver la URL pública de la imagen ya guardada.
   *
   * ⚠️ TODO (Claude): implementar la subida real a Supabase Storage aquí.
   *   Ejemplo de implementación esperada:
   *     1. Generar un nombre único: `${sku || crypto.randomUUID()}.${ext}`
   *     2. supabase.storage.from("productos").upload(ruta, file, { upsert: true })
   *     3. getPublicUrl(ruta) → devolver esa URL.
   *   Mientras tanto, este componente funciona en "modo demo": devuelve un
   *   objectURL local para que se vea el preview, pero NO persiste nada.
   */
  onUpload: (file: File) => Promise<string>;
  /** Se llama cada vez que la URL de la imagen cambia (subida o quitada). */
  onChange: (url: string) => void;
}

export default function ImageDrop({ urlActual, onUpload, onChange }: ImageDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(urlActual);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validar = (file: File): string | null => {
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      return "Formato no permitido. Usá PNG, JPG o WebP.";
    }
    if (file.size > TAMANIO_MAX_BYTES) {
      return `La imagen pesa más de ${TAMANIO_MAX_MB} MB.`;
    }
    return null;
  };

  const manejarArchivo = useCallback(
    async (file: File | undefined) => {
      setError(null);
      if (!file) return;

      const errValidacion = validar(file);
      if (errValidacion) {
        setError(errValidacion);
        return;
      }

      // Preview inmediato (local) para feedback rápido mientras sube.
      const objectUrl = URL.createObjectURL(file);
      setPreview(objectUrl);
      setUploading(true);
      try {
        const urlFinal = await onUpload(file);
        // Reemplazamos el objectURL local por la URL definitiva que devolvió el padre.
        URL.revokeObjectURL(objectUrl);
        setPreview(urlFinal);
        onChange(urlFinal);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
        // En caso de error, volvemos a la imagen anterior si la había.
        setPreview(urlActual);
      } finally {
        setUploading(false);
      }
    },
    [onUpload, onChange, urlActual]
  );

  const quitar = () => {
    setPreview(undefined);
    setError(null);
    onChange("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void manejarArchivo(file);
  };

  // ─── Modo preview (ya hay imagen cargada) ───
  if (preview) {
    return (
      <div className="flex flex-col gap-2">
        <div className="adm-image-preview">
          {/* unoptimized: la URL puede ser objectURL temporal o pública de Storage */}
          <Image
            src={preview}
            alt="Preview del producto"
            fill
            unoptimized
            sizes="150px"
            className="object-cover"
          />
          {uploading && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white"
            >
              <span className="adm-spinner" /> Subiendo…
            </div>
          )}
          {!uploading && (
            <button
              type="button"
              onClick={quitar}
              className="adm-image-preview-remove"
              title="Quitar imagen"
              aria-label="Quitar imagen"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!uploading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-xs font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--adm-text-muted)" }}
          >
            Cambiar imagen
          </button>
        )}
        {/* input oculto para poder reemplazar */}
        <input
          ref={inputRef}
          type="file"
          accept={TIPOS_PERMITIDOS.join(",")}
          className="adm-dropzone-input"
          onChange={(e) => void manejarArchivo(e.target.files?.[0])}
        />
        {error && (
          <p
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--adm-red)" }}
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  // ─── Modo drop zone (sin imagen todavía) ───
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="adm-imagen-input"
        className={`adm-dropzone${dragging ? " is-dragging" : ""}${uploading ? " is-uploading" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className="adm-dropzone-icon">
          {uploading
            ? <span className="adm-spinner" />
            : <UploadCloud className="h-5 w-5" />}
        </span>
        <span className="adm-dropzone-title">
          {uploading ? "Subiendo…" : "Arrastrá la foto acá o hacé clic para examinar"}
        </span>
        <span className="adm-dropzone-hint">
          PNG, JPG o WebP · hasta {TAMANIO_MAX_MB} MB
        </span>
        <input
          id="adm-imagen-input"
          ref={inputRef}
          type="file"
          accept={TIPOS_PERMITIDOS.join(",")}
          className="adm-dropzone-input"
          onChange={(e) => void manejarArchivo(e.target.files?.[0])}
          disabled={uploading}
        />
      </label>
      {error && (
        <p
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--adm-red)" }}
        >
          <ImagePlus className="h-3.5 w-3.5" /> {error}
        </p>
      )}
    </div>
  );
}
