export function slugificar(nombre: string): string {
  let slug = nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → dash
    .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
    .slice(0, 80)

  return slug || "org"
}

export async function slugUnico(
  tx: { organizacion: { findFirst: Function } },
  nombre: string
): Promise<string> {
  const base = slugificar(nombre)
  if (!(await existeSlug(tx, base))) return base

  let n = 2
  while (true) {
    const sufijo = `-${n}`
    const candidato = base.slice(0, 80 - sufijo.length) + sufijo
    if (!(await existeSlug(tx, candidato))) return candidato
    n++
  }
}

async function existeSlug(tx: any, slug: string): Promise<boolean> {
  const found = await tx.organizacion.findFirst({
    where: { slug },
    select: { id: true },
  })
  return !!found
}
