/** Convierte el nombre guardado en BD a una ruta que el navegador pueda pedir. */
export const imgUrl = (name) => (!name ? null : name.startsWith('/') ? name : `/img/${name}.webp`);

export const pesos = (cents) => Math.round(cents) / 100;

export function productDto(p, variants) {
  return {
    id: p.id,
    slug: p.slug,
    category: p.category_slug,
    categoryName: p.category_name,
    name: p.name,
    description: p.description,
    full: p.full_description,
    image: imgUrl(p.image),
    color: p.color,
    swatch: { code: p.swatch_code, tone: p.swatch_tone },
    featured: p.featured,
    sizes: variants.map((v) => ({
      id: v.id,
      label: v.label,
      serves: v.serves,
      price: pesos(v.price_cents),
      image: imgUrl(v.image),
    })),
  };
}

export function branchDto(b) {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    state: b.state,
    address: b.address,
    phones: b.phones,
    photo: imgUrl(b.photo),
    texture: imgUrl(b.texture),
  };
}

export function orderDto(o, items = []) {
  return {
    id: o.id,
    folio: o.folio,
    status: o.status,
    branch: o.branch_id ? { id: o.branch_id, name: o.branch_name, address: o.branch_address, phones: o.branch_phones } : undefined,
    customer: o.customer_name ? { name: o.customer_name, email: o.customer_email, phone: o.customer_phone } : undefined,
    pickupDate: o.pickup_date,
    notes: o.notes,
    total: pesos(o.total_cents),
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    items: items.map((i) => ({
      variantId: i.variant_id,
      product: i.product_name,
      size: i.variant_label,
      price: pesos(i.unit_price_cents),
      quantity: i.quantity,
      image: imgUrl(i.image),
    })),
  };
}
