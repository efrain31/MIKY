/* Ajustes compartidos por el sitio (inicio y página de menú). */

/* ---------- WhatsApp ----------
   Pon aquí el número de Miky con lada de país, sin espacios ni signos (ej. '5233XXXXXXXX').
   Mientras esté vacío, el botón abre WhatsApp con el mensaje listo para elegir el contacto. */
export const WHATSAPP = { number: '', message: 'Hola Miky, me gustaría hacer un pedido 🎂' };
export const whatsappUrl = () => `https://wa.me/${WHATSAPP.number}?text=${encodeURIComponent(WHATSAPP.message)}`;
