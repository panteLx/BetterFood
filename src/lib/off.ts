export type ProductLookupResult = {
  found: boolean;
  name?: string;
  categoryTags?: string[];
};

export async function lookupProductByBarcode(barcode: string): Promise<ProductLookupResult> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    { headers: { "User-Agent": "food-tracker-poc/1.0" } },
  );

  if (!res.ok) return { found: false };

  const data = await res.json();
  if (data.status !== 1 || !data.product) return { found: false };

  const product = data.product;
  const name: string | undefined = product.product_name_de || product.product_name;
  const tags: string[] = product.categories_tags ?? [];

  return {
    found: Boolean(name),
    name,
    categoryTags: tags,
  };
}
