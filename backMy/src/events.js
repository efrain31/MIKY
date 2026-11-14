import { EventEmitter } from 'node:events';

/** Bus interno: los pedidos nuevos y cambios de inventario se avisan al panel por SSE. */
export const bus = new EventEmitter();
bus.setMaxListeners(200);

export const emit = (type, payload) => bus.emit('event', { type, payload, at: new Date().toISOString() });
