export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? ''
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
