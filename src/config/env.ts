/**
 * Centralizes env var access. All properties are lazy getters so that test
 * setup can set process.env BEFORE importing application modules.
 */

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function lazy(name: string, fallback?: string): string {
  const val = process.env[name];
  if (val) return val;
  if (fallback !== undefined) return fallback;
  throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
}

export const env = {
  get PORT() { return Number(optional('PORT', '3000')); },
  get MONGODB_URI() { return optional('MONGODB_URI', 'mongodb://127.0.0.1:27017/atlasX'); },
  get JWT_SECRET() { return lazy('JWT_SECRET'); },
  get JWT_EXPIRES_IN() { return optional('JWT_EXPIRES_IN', '8h'); },
  get UPLOAD_DIR() { return optional('UPLOAD_DIR', './uploads'); },
  get NODE_ENV() { return optional('NODE_ENV', 'development'); },
  get ALLOWED_ORIGINS() { return optional('ALLOWED_ORIGINS', 'http://localhost:5173,http://localhost:5174'); },

  // Efi Bank
  get EFI_CLIENT_ID() { return process.env.EFI_CLIENT_ID ?? ''; },
  get EFI_CLIENT_SECRET() { return process.env.EFI_CLIENT_SECRET ?? ''; },
  get EFI_SANDBOX() { return optional('EFI_SANDBOX', 'true') === 'true'; },
  get EFI_PIX_KEY() { return process.env.EFI_PIX_KEY ?? ''; },
  get EFI_CERT_PATH() { return optional('EFI_CERT_PATH', './certs/certificado.p12'); },
  get EFI_CERT_BASE64() { return process.env.EFI_CERT_BASE64 ?? ''; },
  get EFI_WEBHOOK_URL() { return process.env.EFI_WEBHOOK_URL ?? ''; },
  get EFI_WEBHOOK_SECRET() { return process.env.EFI_WEBHOOK_SECRET ?? ''; },
  get EFI_WEBHOOK_VALIDATE_MTLS() { return optional('EFI_WEBHOOK_VALIDATE_MTLS', 'false') === 'true'; },

  // Tiny ERP
  get TINY_TOKEN() { return process.env.TINY_TOKEN ?? ''; },
  get TINY_TIMEOUT() { return Number(optional('TINY_TIMEOUT', '15000')); },
  get TINY_WEBHOOK_SECRET() { return process.env.TINY_WEBHOOK_SECRET ?? ''; },

  get isProd() { return this.NODE_ENV === 'production'; },
  get isDev() { return this.NODE_ENV === 'development'; },
};
