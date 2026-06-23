import { google, type sheets_v4 } from "googleapis";

/**
 * Conexión a la Google Sheet de precios (lectura/escritura).
 * SOLO se usa en el servidor (API Routes / Server Actions). Nunca en el cliente.
 *
 * Autenticación: Cuenta de Servicio (Service Account) de Google Cloud.
 *  1. En Google Cloud → APIs & Services → habilitar "Google Sheets API".
 *  2. Crear una Service Account y descargar su JSON de credenciales.
 *  3. Compartir la planilla con el email de la Service Account (rol Editor).
 *  4. Cargar en las env vars del servidor:
 *       GOOGLE_SERVICE_ACCOUNT_EMAIL = client_email del JSON
 *       GOOGLE_PRIVATE_KEY           = private_key del JSON (con los \n literales)
 */

/** ID de la planilla de precios (se puede sobreescribir por env var). */
export const GOOGLE_SHEET_ID =
  process.env.GOOGLE_SHEET_ID ?? "1nyRu64ZE7Cg4v93Z8s_5wFulm7-YbsOAVXeh3Kuk1-Q";

/** ¿Están cargadas las credenciales de Google en este entorno? */
export function googleSheetsConfigurado(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
  );
}

/**
 * Devuelve un cliente autenticado de la Sheets API v4.
 * Lanza un error claro si faltan credenciales.
 */
export async function getSheetsClient(): Promise<sheets_v4.Sheets> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY en el servidor"
    );
  }

  // En las env vars (Vercel/.env) los saltos de línea de la clave llegan
  // como "\n" literales: hay que devolverlos a saltos reales.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await auth.authorize();

  return google.sheets({ version: "v4", auth });
}
