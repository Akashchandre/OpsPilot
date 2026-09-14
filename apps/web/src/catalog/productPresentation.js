const imageBySku = Object.freeze({
  123: "/catalog-images/wooden-chair.jpg",
  "CHAIR-001": "/catalog-images/wooden-chair.jpg",
  "DEMO-DESK-001": "/catalog-images/office-desk.jpg",
  "DEMO-SHELF-001": "/catalog-images/bookshelf.jpg",
  "DEMO-CABINET-001": "/catalog-images/storage-cabinet.jpg",
  "DEMO-TABLE-001": "/catalog-images/side-table.jpg",
  "DEMO-DINING-001": "/catalog-images/dining-table.jpg",
  "DEMO-LOUNGE-001": "/catalog-images/lounge-chair.jpg",
  "DEMO-TVUNIT-001": "/catalog-images/tv-unit.jpg",
  "DEMO-COFFEE-001": "/catalog-images/coffee-table.jpg",
  "DEMO-SHOERACK-001": "/catalog-images/shoe-rack.jpg",
  "DEMO-STUDYCHAIR-001": "/catalog-images/study-chair.jpg",
});

export function formatPublicSku(sku) {
  return sku.replace(/^DEMO-/, "");
}

export function productImageForSku(sku) {
  return imageBySku[sku];
}
