// Shared catalog and basket for the benchmark shop. Basket lives in localStorage as [{id, size}].
const PRODUCTS = {
  P1001: 'Blue Mug', P1002: 'Red Shoe', P1003: 'Green Hat', P1004: 'Grey Hoodie', P1005: 'Black Socks',
  P1006: 'White Mug', P1007: 'Yellow Scarf', P1008: 'Orange Cap',
};
const basket = () => JSON.parse(localStorage.getItem('jev2-basket') || '[]');
const addToBasket = (id, size) => { localStorage.setItem('jev2-basket', JSON.stringify([...basket(), {id, size}])); badge(); };
const badge = () => { const b = document.getElementById('badge'); if (b) b.textContent = `Basket (${basket().length})`; };
document.addEventListener('DOMContentLoaded', badge);
