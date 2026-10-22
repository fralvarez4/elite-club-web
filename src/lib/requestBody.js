// Limita bytes durante la lectura, incluso sin Content-Length o si es falso.
export async function readJsonBody(request, ErrorType, limit = 16384) {
  const declared = request.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    throw new ErrorType(413, 'Solicitud demasiado extensa.')
  }
  const reader = request.body?.getReader()
  if (!reader) throw new ErrorType(400, 'Se requiere un cuerpo JSON.')
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel()
        throw new ErrorType(413, 'Solicitud demasiado extensa.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  try { return JSON.parse(await new Blob(chunks).text()) }
  catch { throw new ErrorType(400, 'JSON inválido.') }
}
