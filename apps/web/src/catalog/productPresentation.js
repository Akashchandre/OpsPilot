const imageBySku = Object.freeze({
  123: "/products/wooden-chair.jpg",
  "CHAIR-001": "/products/wooden-chair.jpg",
  "DEMO-DESK-001": "/products/office-desk.jpg",
  "DEMO-SHELF-001": "/products/bookshelf.jpg",
  "DEMO-CABINET-001": "/products/storage-cabinet.jpg",
  "DEMO-TABLE-001": "/products/side-table.jpg",
  "DEMO-DINING-001": "/products/dining-table.jpg",
  "DEMO-LOUNGE-001": "/products/lounge-chair.jpg",
  "DEMO-TVUNIT-001": "/products/tv-unit.jpg",
  "DEMO-COFFEE-001": "/products/coffee-table.jpg",
  "DEMO-SHOERACK-001": "/products/shoe-rack.jpg",
  "DEMO-STUDYCHAIR-001": "/products/study-chair.jpg",
});

export function formatPublicSku(sku) {
  return sku.replace(/^DEMO-/, "");
}

export function productImageForSku(sku) {
  return imageBySku[sku];
}
